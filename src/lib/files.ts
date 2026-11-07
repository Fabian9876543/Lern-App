import type { MaterialKind, MaterialRole } from "../types";

export const ROLE_LABELS: Record<MaterialRole, string> = {
  tasks: "Aufgaben",
  solutions: "Lösungen",
  tasks_with_solutions: "Aufgaben + Lösungen",
  reference: "Lernmaterial / Referenz",
};

export const ACCEPTED_FILE_TYPES =
  "application/pdf,image/*,text/plain,text/markdown,text/csv,.md,.txt,.csv,.tex";

const API_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tex)$/i;

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

export function guessRole(fileName: string): MaterialRole {
  const n = fileName.toLowerCase();
  const hasSolution = /(lösung|loesung|losung|solution|musterl|lsg)/.test(n);
  const hasTask = /(aufgabe|übung|uebung|blatt|exercise|klausur|exam|test)/.test(n);
  const combined = /(mit|inkl|und|with|and|\+)[\s_.-]*(lösung|loesung|losung|solution|musterl|lsg)/.test(n);
  if (combined) return "tasks_with_solutions";
  if (hasSolution) return "solutions";
  if (hasTask) return "tasks";
  return "reference";
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  const type = file.type;
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return { name: file.name, kind: "pdf", mimeType: "application/pdf", blob: file, size: file.size };
  }
  if (type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)) {
    const blob = await normalizeImage(file);
    return { name: file.name, kind: "image", mimeType: blob.type, blob, size: blob.size };
  }
  if (type.startsWith("text/") || TEXT_EXTENSIONS.test(file.name)) {
    const text = await file.text();
    return { name: file.name, kind: "text", mimeType: "text/plain", text, size: text.length };
  }
  throw new UnsupportedFileError(
    `„${file.name}“ wird nicht unterstützt. Erlaubt sind PDF, Bilder und Textdateien (Word/PowerPoint bitte als PDF exportieren).`,
  );
}

/**
 * Bringt ein Bild in ein Format, das die API akzeptiert (JPEG/PNG/WebP/GIF),
 * und verkleinert sehr große Bilder (z. B. Handyfotos).
 */
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
