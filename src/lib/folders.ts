import type { Material } from "../types";
import { conversionHint, isSupportedFile } from "./files";

/**
 * Ganze Ordner hochladen: Dateien aus dem Ordner-Auswahlfeld oder per Drag and
 * drop einsammeln (mit Unterordnern), Systemdateien aussortieren und Material
 * nach Ordnern gruppieren.
 */

export interface PickedFile {
  file: File;
  /** Ordnerpfad relativ zum ausgewählten Ordner, inklusive seines Namens – z. B. „Analysis 1/Übungsblätter“. */
  folder?: string;
}

/** Höchstens so viele Dateien werden aus einem Ordner eingesammelt. */
export const MAX_FOLDER_FILES = 1000;

/** Ordner eines relativen Pfads („Analysis 1/Übungen/Blatt 1.pdf“ → „Analysis 1/Übungen“). */
export function folderOf(relativePath: string): string | undefined {
  const parts = relativePath.replace(/^\/+/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : undefined;
}

/** Versteckte Dateien und Systemdateien, die nie Lernmaterial sind (.DS_Store, ~$-Sperrdateien, __MACOSX …). */
export function isJunkPath(path: string): boolean {
  const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? "";
  if (parts.slice(0, -1).some((p) => p.startsWith(".") || p === "__MACOSX")) return true;
  return name.startsWith(".") || name.startsWith("~$") || /^(thumbs\.db|desktop\.ini|icon\r?)$/i.test(name);
}

/** Dateien aus einem Auswahlfeld (bei Ordnern mit webkitRelativePath). */
export function pickedFromInput(files: File[]): PickedFile[] {
  return files.map((file) => ({ file, folder: folderOf(file.webkitRelativePath || file.name) }));
}

/** Das Nötigste von FileSystemEntry (Drag and drop), damit es sich auch testen lässt. */
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?(ok: (f: File) => void, err?: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (entries: EntryLike[]) => void, err?: (e: unknown) => void): void };
}

/** Sammelt Dateien aus gezogenen Einträgen ein, Unterordner eingeschlossen. */
export async function collectEntries(entries: EntryLike[], maxFiles = MAX_FOLDER_FILES): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  async function walk(entry: EntryLike): Promise<void> {
    if (out.length >= maxFiles) return;
    if (entry.isFile && entry.file) {
      if (isJunkPath(entry.fullPath)) return;
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      out.push({ file, folder: folderOf(entry.fullPath) });
    } else if (entry.isDirectory && entry.createReader) {
      if (isJunkPath(`${entry.fullPath}/x`)) return;
      const reader = entry.createReader();
      // readEntries liefert die Einträge in Portionen – so lange lesen, bis nichts mehr kommt.
      for (;;) {
        const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const e of batch) await walk(e);
      }
    }
  }
  for (const e of entries) await walk(e);
  return out;
}

/**
 * Dateien aus einem Drop – auch ganze Ordner. Muss direkt im drop-Ereignis
 * aufgerufen werden: danach gibt der Browser die Einträge nicht mehr heraus.
 */
export function pickedFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() as EntryLike | null | undefined)
    .filter((e): e is EntryLike => !!e);
  if (entries.length === 0) return Promise.resolve(Array.from(dt.files).map((file) => ({ file })));
  return collectEntries(entries);
}

export interface UploadPlan {
  accepted: PickedFile[];
  unsupported: { name: string; hint: string | null }[];
  /** Ausgelassene System- und versteckte Dateien. */
  junk: number;
}

/** Trennt lesbare Dateien von Systemdateien und nicht unterstützten Formaten; sortiert nach Ordner und Name. */
export function planUpload(items: PickedFile[]): UploadPlan {
  const plan: UploadPlan = { accepted: [], unsupported: [], junk: 0 };
  for (const item of items) {
    const path = item.folder ? `${item.folder}/${item.file.name}` : item.file.name;
    if (isJunkPath(path)) plan.junk++;
    else if (isSupportedFile(item.file.name, item.file.type)) plan.accepted.push(item);
    else plan.unsupported.push({ name: path, hint: conversionHint(item.file.name) });
  }
  const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
  plan.accepted.sort((a, b) => collator.compare(a.folder ?? "", b.folder ?? "") || collator.compare(a.file.name, b.file.name));
  return plan;
}

/** Ein Satz über übersprungene Dateien, z. B. für 2 Word-Dateien und eine .xls-Datei. */
export function describeSkipped(unsupported: UploadPlan["unsupported"]): string | null {
  if (unsupported.length === 0) return null;
  const hints = [...new Set(unsupported.map((u) => u.hint).filter((h): h is string => !!h))];
  const names = unsupported.slice(0, 3).map((u) => `„${u.name.split("/").pop()}“`);
  const more = unsupported.length > 3 ? ` und ${unsupported.length - 3} weitere` : "";
  const count = unsupported.length === 1 ? "1 Datei" : `${unsupported.length} Dateien`;
  return `${count} übersprungen, weil die App das Format nicht lesen kann: ${names.join(", ")}${more}.${
    hints.length ? ` Tipp: ${hints.join("; ")}.` : ""
  }`;
}

export interface FolderGroup {
  /** null = Dateien ohne Ordner. */
  folder: string | null;
  items: Material[];
}

/** Gruppiert Material nach Ordner: zuerst einzelne Dateien, dann die Ordner in natürlicher Reihenfolge. */
export function groupByFolder(materials: Material[]): FolderGroup[] {
  const loose: Material[] = [];
  const byFolder = new Map<string, Material[]>();
  for (const m of materials) {
    if (!m.folder) loose.push(m);
    else byFolder.set(m.folder, [...(byFolder.get(m.folder) ?? []), m]);
  }
  const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
  const groups: FolderGroup[] = loose.length ? [{ folder: null, items: loose }] : [];
  for (const folder of [...byFolder.keys()].sort(collator.compare)) groups.push({ folder, items: byFolder.get(folder)! });
  return groups;
}

/** Anzeige eines Ordnerpfads: „Analysis 1 › Übungsblätter“. */
export function formatFolder(folder: string): string {
  return folder.split("/").join(" › ");
}
