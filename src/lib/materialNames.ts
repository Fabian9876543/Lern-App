import type { Material, MaterialKind, Test } from "../types";

/**
 * Dateinamen-Logik ohne KI: Erkennen nichtssagender Namen (Handyfotos, Scans,
 * „Dokument (1)“ …), Aufräumen vorgeschlagener Namen und Ersatznamen, wenn
 * Claude nicht verfügbar ist.
 */

/** Wörter, die in Dateinamen nichts über den Inhalt aussagen. */
const GENERIC_WORDS = new Set([
  "img", "image", "images", "bild", "bilder", "foto", "fotos", "photo", "photos", "pic", "picture", "pxl", "dsc", "dscn",
  "dscf", "mvimg", "vid", "cam", "camera", "kamera", "screenshot", "screenshots", "bildschirmfoto", "screen", "scan",
  "scans", "scanned", "camscanner", "adobe", "lens", "office", "microsoft", "genius", "dokument", "dokumente",
  "document", "documents", "doc", "docs", "datei", "file", "files", "untitled", "unbenannt", "unnamed", "neu", "new",
  "neues", "kopie", "copy", "download", "downloads", "attachment", "anhang", "whatsapp", "signal", "telegram", "wp",
  "pdf", "jpg", "jpeg", "png", "heic", "webp", "txt", "page", "seite", "at", "um", "vom", "am", "pm", "eingefügter",
  "eingefuegter", "text", "notiz", "note", "upload", "export", "output", "print", "druck", "material", "edited", "bearbeitet",
]);

const MONTHS = /^(jan|feb|mar|mär|apr|mai|may|jun|jul|aug|sep|sept|okt|oct|nov|dez|dec)[a-zä]*$/;

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, "");
}

/** true, wenn der Name nichts über den Inhalt verrät (z. B. „IMG_20261112_1405.jpg“, „Scan 3.pdf“). */
export function isMeaninglessName(fileName: string): boolean {
  const base = stripExtension(fileName).toLowerCase().normalize("NFC");
  // Hash- oder UUID-artige Namen
  if (/^[0-9a-f]{8,}(-[0-9a-f]{4,})*$/.test(base.replace(/[\s_]/g, ""))) return true;
  const words = base.split(/[^a-zäöüß]+/).filter((w) => w.length >= 2);
  const meaningful = words.filter((w) => !GENERIC_WORDS.has(w) && !MONTHS.test(w));
  return meaningful.length === 0;
}

/** Säubert einen von Claude vorgeschlagenen Namen. */
export function cleanSuggestedName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/^["'„“”‚‘’»«\s]+|["'„“”‚‘’»«\s]+$/g, "")
    .replace(/\.(pdf|jpe?g|png|webp|gif|txt|md)$/i, "")
    .replace(/[\\*?<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70)
    .trim();
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Ersatzname ohne KI: erste sinnvolle Zeile des Textes oder Art und Datum. */
export function fallbackName(kind: MaterialKind, text: string | undefined, createdAt: number): string {
  const line = (text ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => (l.match(/[a-zA-ZäöüÄÖÜß]/g) ?? []).length >= 4);
  if (line) return cleanSuggestedName(line.length > 60 ? `${line.slice(0, 57).trim()} …` : line);
  if (kind === "image") return `Foto vom ${formatDate(createdAt)}`;
  if (kind === "pdf") return `Scan vom ${formatDate(createdAt)}`;
  return `Text vom ${formatDate(createdAt)}`;
}

// ---------- Neu oder schon verwendet ----------

/** Tests (ohne Lernplan-Tests), die dieses Material verwenden. */
export function testsUsingMaterial(materialId: string, tests: Test[]): Test[] {
  return tests.filter((t) => !t.planId && t.materialIds.includes(materialId));
}

/**
 * Teilt die Materialien eines Fachs auf: „neu“ (noch in keinem Test verwendet)
 * und „verwendet“ (gehört bereits zu einem Test).
 */
export function splitMaterials(
  materials: Material[],
  tests: Test[],
): { fresh: Material[]; used: { material: Material; tests: Test[] }[] } {
  const fresh: Material[] = [];
  const used: { material: Material; tests: Test[] }[] = [];
  for (const m of materials) {
    const usedBy = testsUsingMaterial(m.id, tests);
    if (usedBy.length) used.push({ material: m, tests: usedBy });
    else fresh.push(m);
  }
  used.sort((a, b) => b.material.createdAt - a.material.createdAt);
  return { fresh, used };
}
