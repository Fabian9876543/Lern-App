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
      // Systemdateien kommen mit – der Upload-Bericht zählt sie als ausgelassen.
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      out.push({ file, folder: folderOf(entry.fullPath) });
    } else if (entry.isDirectory && entry.createReader) {
      if (isJunkPath(`${entry.fullPath}/x`)) return; // versteckte Ordner wie .git gar nicht erst durchsuchen
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
  /** Ausgelassene System- und versteckte Dateien (Pfade). */
  junk: string[];
  /** Dateien aus Ordnern, die schon als Material vorhanden sind (Pfade). */
  duplicates: string[];
}

export function pathOf(item: PickedFile): string {
  return item.folder ? `${item.folder}/${item.file.name}` : item.file.name;
}

/** Pfade („Ordner/Datei“) des Materials, das aus Ordnern hochgeladen wurde. */
export function existingFolderPaths(materials: Material[]): Set<string> {
  return new Set(materials.filter((m) => m.folder).map((m) => `${m.folder}/${m.fileName ?? m.originalName ?? m.name}`));
}

/**
 * Trennt lesbare Dateien von Systemdateien, nicht unterstützten Formaten und
 * Dateien, die aus demselben Ordner schon hochgeladen wurden (so lässt sich ein
 * Ordner einfach noch einmal hochladen); sortiert nach Ordner und Name.
 */
export function planUpload(items: PickedFile[], existing: Set<string> = new Set()): UploadPlan {
  const plan: UploadPlan = { accepted: [], unsupported: [], junk: [], duplicates: [] };
  for (const item of items) {
    const path = pathOf(item);
    if (isJunkPath(path)) plan.junk.push(path);
    else if (item.folder && existing.has(path)) plan.duplicates.push(path);
    else if (isSupportedFile(item.file.name, item.file.type)) plan.accepted.push(item);
    else plan.unsupported.push({ name: path, hint: conversionHint(item.file.name) });
  }
  const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
  plan.accepted.sort((a, b) => collator.compare(a.folder ?? "", b.folder ?? "") || collator.compare(a.file.name, b.file.name));
  return plan;
}

/** Grund für ein nicht unterstütztes Format, z. B. „Format nicht lesbar – Word-Dokumente bitte als PDF exportieren“. */
export function unsupportedReason(hint: string | null): string {
  return hint ? `Format nicht lesbar – ${hint}` : "Dieses Format kann die App nicht lesen";
}

/** Fehlermeldung ohne den vorangestellten Dateinamen (der steht im Bericht schon davor). */
export function shortReason(message: string, fileName: string): string {
  let r = message.trim();
  const prefix = `„${fileName}“`;
  if (r.startsWith(prefix)) r = r.slice(prefix.length).replace(/^[\s:–-]+/, "");
  return r ? r[0].toUpperCase() + r.slice(1) : "Unbekannter Fehler";
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
