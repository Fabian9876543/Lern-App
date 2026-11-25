import type { MaterialKind, MaterialRole } from "../types";
import { ModuleLoadError, loadModule } from "./lazyImport";

export const ROLE_LABELS: Record<MaterialRole, string> = {
  tasks: "Aufgaben",
  solutions: "Lösungen",
  tasks_with_solutions: "Aufgaben + Lösungen",
  reference: "Lernmaterial / Referenz",
};

export const ACCEPTED_FILE_TYPES =
  "application/pdf,image/*,text/plain,text/markdown,text/csv,.md,.txt,.csv,.tex," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,.xlsx,.xlsm," +
  "application/vnd.ms-excel,.xls,application/msword,.doc," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

const API_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tex)$/i;
const XLSX_EXTENSIONS = /\.(xlsx|xlsm)$/i;
const XLS_EXTENSION = /\.xls$/i;
const WORD_EXTENSIONS = /\.(docx?|docm|dot|dotx)$/i;
/** Formate, die wir nicht lesen, mit einem Tipp, wie es trotzdem geht. */
const CONVERT_HINTS: [RegExp, string][] = [
  [/\.(ods|numbers)$/i, "Tabellen bitte als .xlsx speichern"],
  [/\.(odt|pages|rtf)$/i, "Dokumente bitte als PDF exportieren"],
  [/\.(pptx?|odp|key)$/i, "Präsentationen bitte als PDF exportieren"],
];

/** ZIP (.xlsx, .docx) bzw. alter Office-Container (.xls, .doc) – am Dateianfang erkennbar. */
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** Excel- und Word-Dateien werden beim Hochladen in Markdown umgewandelt und so gespeichert. */
export const MARKDOWN_MIME = "text/markdown";

type MaterialLike = { kind: MaterialKind; mimeType: string; name: string; fileName?: string; originalName?: string };

/** Inhalt ist Markdown (Tabellen, Überschriften) und wird in der Vorschau entsprechend angezeigt. */
export function isMarkdownMaterial(m: MaterialLike): boolean {
  return m.kind === "text" && m.mimeType === MARKDOWN_MIME;
}

/** Aus einer Excel-Datei entstanden (für das Symbol in der Liste). */
export function isSpreadsheet(m: MaterialLike): boolean {
  return isMarkdownMaterial(m) && /\.(xlsx|xlsm|xls)$/i.test(m.fileName ?? m.originalName ?? m.name);
}

/** Ob die App diese Datei lesen kann (PDF, Bild, Text, Excel). */
export function isSupportedFile(name: string, type: string): boolean {
  return (
    type === "application/pdf" ||
    /\.pdf$/i.test(name) ||
    type.startsWith("image/") ||
    /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(name) ||
    type.startsWith("text/") ||
    TEXT_EXTENSIONS.test(name) ||
    XLSX_EXTENSIONS.test(name) ||
    XLS_EXTENSION.test(name) ||
    WORD_EXTENSIONS.test(name)
  );
}

/** Kurzer Tipp für ein nicht unterstütztes Format, z. B. „Word-Dokumente bitte als PDF exportieren“. */
export function conversionHint(name: string): string | null {
  return CONVERT_HINTS.find(([re]) => re.test(name))?.[1] ?? null;
}

/** Die API akzeptiert Bilder bis ca. 5 MB; größere Bilder werden verkleinert. */
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_EDGE = 2000;

export interface PreparedFile {
  name: string;
  kind: MaterialKind;
  mimeType: string;
  blob?: Blob;
  text?: string;
  size: number;
}

export class UnsupportedFileError extends Error {}

/** Rolle, die ein Name (Datei oder Ordner) nahelegt – oder null, wenn er nichts verrät. */
function roleSignal(name: string): MaterialRole | null {
  const n = name.toLowerCase();
  const combined = /(mit|inkl|und|with|and|\+)[\s_.-]*(lösung|loesung|losung|solution|musterl|lsg)/.test(n);
  if (combined) return "tasks_with_solutions";
  if (/(lösung|loesung|losung|solution|musterl|lsg)/.test(n)) return "solutions";
  if (/(aufgabe|übung|uebung|blatt|exercise|klausur|exam|test)/.test(n)) return "tasks";
  if (/(skript|script|folien|slides|vorlesung|lecture|mitschrift|notizen|zusammenfassung|buch|kapitel)/.test(n)) return "reference";
  return null;
}

/**
 * Schlägt die Rolle anhand des Dateinamens vor; verrät der nichts, zählt der
 * nächstgelegene Ordner (z. B. „Lösungen/Scan 3.pdf“ → Lösungen).
 */
export function guessRole(fileName: string, folder?: string): MaterialRole {
  const own = roleSignal(fileName);
  if (own) return own;
  const segments = (folder ?? "").split("/").filter(Boolean).reverse();
  for (const segment of segments) {
    const fromFolder = roleSignal(segment);
    if (fromFolder) return fromFolder;
  }
  return "reference";
}

/**
 * Liest die Datei einmal komplett. So fallen Dateien sofort auf, die der Browser
 * nicht lesen kann – etwa OneDrive- oder iCloud-Dateien, die nur online liegen –,
 * statt später als leere Datei gespeichert zu sein.
 */
const READ_TIMEOUT_MS = 120_000;

async function readableCopy(file: File, type: string): Promise<Blob> {
  let bytes: ArrayBuffer;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), READ_TIMEOUT_MS);
    });
    try {
      bytes = await Promise.race([file.arrayBuffer(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    throw new UnsupportedFileError(
      `„${file.name}“ konnte nicht gelesen werden. Liegt die Datei nur in der Cloud (z. B. OneDrive oder iCloud)? Dann bitte zuerst auf das Gerät laden.`,
    );
  }
  if (bytes.byteLength === 0) throw new UnsupportedFileError(`„${file.name}“ ist leer.`);
  return new Blob([bytes], { type });
}

/**
 * Office-Dateien: Inhalt als Text bzw. Markdown speichern. Die Leser werden erst
 * bei Bedarf geladen. Welches Format vorliegt, entscheidet der Dateianfang –
 * nicht die Endung (manche .xls-Dateien sind in Wahrheit .xlsx und umgekehrt).
 */
async function prepareOfficeFile(file: File): Promise<PreparedFile> {
  const bytes = new Uint8Array(await (await readableCopy(file, file.type)).arrayBuffer());
  const word = WORD_EXTENSIONS.test(file.name);
  const zip = isZip(bytes);
  try {
    if (word) {
      if (zip) {
        const { docxToMarkdown } = await loadModule(() => import("./docx"), "Der Word-Leser");
        const text = docxToMarkdown(bytes, file.name);
        return { name: file.name, kind: "text", mimeType: MARKDOWN_MIME, text, size: text.length };
      }
      if (new TextDecoder().decode(bytes.subarray(0, 5)) === "{\\rtf") {
        throw new UnsupportedFileError(`„${file.name}“ ist ein RTF-Dokument – bitte in Word als PDF speichern.`);
      }
      const { docToText } = await loadModule(() => import("./doc"), "Der Word-Leser");
      const text = docToText(bytes, file.name);
      return { name: file.name, kind: "text", mimeType: "text/plain", text, size: text.length };
    }
    if (zip) {
      const { xlsxToMarkdown } = await loadModule(() => import("./xlsx"), "Der Excel-Leser");
      const text = xlsxToMarkdown(bytes, file.name);
      return { name: file.name, kind: "text", mimeType: MARKDOWN_MIME, text, size: text.length };
    }
    const { xlsToMarkdown } = await loadModule(() => import("./xls"), "Der Excel-Leser");
    const text = xlsToMarkdown(bytes, file.name);
    return { name: file.name, kind: "text", mimeType: MARKDOWN_MIME, text, size: text.length };
  } catch (e) {
    // Lesefehler der Office-Leser (beschädigt, Passwort, zu alt …) verständlich weitergeben
    if (e instanceof UnsupportedFileError || e instanceof ModuleLoadError) throw e;
    if (e instanceof Error && /^„/.test(e.message)) throw new UnsupportedFileError(e.message);
    throw new UnsupportedFileError(`„${file.name}“ konnte nicht gelesen werden.`);
  }
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  const type = file.type;
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const blob = await readableCopy(file, "application/pdf");
    return { name: file.name, kind: "pdf", mimeType: "application/pdf", blob, size: blob.size };
  }
  if (type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)) {
    await readableCopy(file, type);
    const blob = await normalizeImage(file);
    return { name: file.name, kind: "image", mimeType: blob.type, blob, size: blob.size };
  }
  if (XLSX_EXTENSIONS.test(file.name) || XLS_EXTENSION.test(file.name) || WORD_EXTENSIONS.test(file.name)) {
    return prepareOfficeFile(file);
  }
  if (type.startsWith("text/") || TEXT_EXTENSIONS.test(file.name)) {
    const text = await file.text();
    return { name: file.name, kind: "text", mimeType: "text/plain", text, size: text.length };
  }
  const hint = conversionHint(file.name);
  throw new UnsupportedFileError(
    hint
      ? `„${file.name}“ kann die App nicht lesen – ${hint}.`
      : `„${file.name}“ wird nicht unterstützt. Erlaubt sind PDF, Bilder, Excel (.xlsx) und Textdateien.`,
  );
}

/**
 * Bringt ein Bild in ein Format, das die API akzeptiert (JPEG/PNG/WebP/GIF),
 * und verkleinert sehr große Bilder (z. B. Handyfotos).
 */
/** Bild oder PDF – was sich im Test als Lösung anhängen lässt (Ordner und andere Dateien nicht). */
export function isAnswerFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf" || /\.(pdf|heic|heif)$/i.test(file.name);
}

export async function normalizeImage(file: Blob, maxEdge = MAX_IMAGE_EDGE, maxBytes = MAX_IMAGE_BYTES): Promise<Blob> {
  if (API_IMAGE_TYPES.has(file.type) && file.size <= maxBytes && file.type !== "image/gif") {
    const dims = await imageSize(file).catch(() => null);
    if (dims && Math.max(dims.width, dims.height) <= maxEdge) return file;
  }
  if (file.type === "image/gif" && file.size <= maxBytes) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnsupportedFileError(
      "Das Bild konnte nicht gelesen werden. Bitte als JPEG oder PNG speichern und erneut hochladen.",
    );
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild-Konvertierung fehlgeschlagen"))), "image/jpeg", 0.85),
  );
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBase64(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("Ungültiges Bildformat");
  return { mediaType: match[1], data: match[2] };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Startet einen Download im Browser (nur Web-Version; in claude.ai blockiert). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
