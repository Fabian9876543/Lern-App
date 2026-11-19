import { useSyncExternalStore } from "react";
import { getState, repo } from "../store/store";
import { formatBytes, guessRole, prepareFile } from "./files";
import { existingFolderPaths, pathOf, planUpload, shortReason, unsupportedReason, type PickedFile } from "./folders";
import { newId } from "./ids";
import { autoNameMaterial } from "./materialNaming";

/**
 * Hochladen von Dateien und ganzen Ordnern mit vollständigem Bericht: welche
 * Dateien nicht hochgeladen wurden und warum. Fortschritt und Bericht liegen
 * außerhalb der Seite – sie bleiben sichtbar, wenn man zwischendurch woanders
 * hinschaut, und das Hochladen läuft weiter.
 */

export interface UploadProblem {
  path: string;
  reason: string;
}

export interface UploadReport {
  /** Alle ausgewählten Dateien. */
  total: number;
  added: number;
  /** Schon vorhanden (Ordner erneut hochgeladen). */
  duplicates: number;
  problems: UploadProblem[];
  /** Ausgelassene System- und versteckte Dateien. */
  systemFiles: string[];
  fromFolder: boolean;
}

export interface UploadState {
  progress: { done: number; total: number } | null;
  report: UploadReport | null;
}

/** Ab dieser Größe wird vor dem Hochladen eines Ordners nachgefragt. */
export const CONFIRM_FILES = 25;
export const CONFIRM_BYTES = 100 * 1024 * 1024;

const EMPTY: UploadState = { progress: null, report: null };
const states = new Map<string, UploadState>();
const listeners = new Set<() => void>();
const chains = new Map<string, Promise<void>>();

function set(subjectId: string, patch: Partial<UploadState>) {
  states.set(subjectId, { ...(states.get(subjectId) ?? EMPTY), ...patch });
  listeners.forEach((l) => l());
}

export function useUploadState(subjectId: string): UploadState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => states.get(subjectId) ?? EMPTY,
  );
}

export function dismissUploadReport(subjectId: string): void {
  set(subjectId, { report: null });
}

/** Ob ein Bericht angezeigt werden soll – bei einzelnen Dateien nur, wenn etwas nicht geklappt hat. */
export function reportWorthShowing(r: UploadReport): boolean {
  return r.fromFolder || r.problems.length > 0 || r.systemFiles.length > 0 || r.duplicates > 0;
}

/**
 * Lädt die Dateien nacheinander hoch. Mehrere Aufträge für dasselbe Fach
 * laufen hintereinander. `confirmLarge` fragt bei großen Ordnern nach.
 */
export function uploadFiles(
  subjectId: string,
  items: PickedFile[],
  opts: { confirmLarge: (message: string) => Promise<boolean>; onAdded?: (ids: string[]) => void },
): Promise<void> {
  const run = async () => {
    const existing = existingFolderPaths(getState().materials.filter((m) => m.subjectId === subjectId));
    const plan = planUpload(items, existing);
    const report: UploadReport = {
      total: items.length,
      added: 0,
      duplicates: plan.duplicates.length,
      problems: plan.unsupported.map((u) => ({ path: u.name, reason: unsupportedReason(u.hint) })),
      systemFiles: plan.junk,
      fromFolder: items.some((i) => !!i.folder),
    };

    const roots = [...new Set(plan.accepted.map((i) => i.folder?.split("/")[0]).filter((f): f is string => !!f))];
    const bytes = plan.accepted.reduce((sum, i) => sum + i.file.size, 0);
    if (roots.length && (plan.accepted.length > CONFIRM_FILES || bytes > CONFIRM_BYTES)) {
      const ok = await opts.confirmLarge(
        `${roots.map((r) => `„${r}“`).join(", ")} ${roots.length === 1 ? "enthält" : "enthalten"} ${plan.accepted.length} lesbare Dateien (${formatBytes(bytes)}). Alle hochladen?`,
      );
      if (!ok) return;
    }

    set(subjectId, { progress: { done: 0, total: plan.accepted.length }, report: null });
    const added: string[] = [];
    for (const item of plan.accepted) {
      const { file, folder } = item;
      try {
        const { blob, text, ...prepared } = await prepareFile(file);
        const id = newId();
        await repo.addMaterial(
          {
            id,
            subjectId,
            role: guessRole(file.name, folder),
            createdAt: Date.now(),
            fileName: file.name,
            ...(folder ? { folder } : {}),
            ...prepared,
          },
          { blob, text },
        );
        added.push(id);
        const material = repo.getMaterial(id);
        if (material) autoNameMaterial(material, { blob, text });
      } catch (e) {
        report.problems.push({ path: pathOf(item), reason: shortReason(e instanceof Error ? e.message : String(e), file.name) });
      } finally {
        const p = states.get(subjectId)?.progress;
        set(subjectId, { progress: p ? { ...p, done: p.done + 1 } : null });
      }
    }
    report.added = added.length;
    const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    report.problems.sort((a, b) => collator.compare(a.path, b.path));
    set(subjectId, { progress: null, report });
    if (added.length) opts.onAdded?.(added);
  };
  const next = (chains.get(subjectId) ?? Promise.resolve()).then(run, run);
  chains.set(subjectId, next.catch(() => {}));
  return next;
}
