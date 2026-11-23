import platform from "@platform-impl";
import { useSyncExternalStore } from "react";
import { getState, repo } from "../store/store";
import type { NoteLength, StudyNote } from "../types";
import { newId } from "./ids";

/**
 * Lernzettel direkt aus Material (ohne Lernplan). Das Schreiben läuft außerhalb
 * der Seiten: Man kann zwischendurch woanders hin, der Zettel wird trotzdem
 * fertig und gespeichert, und beim Zurückkommen ist der Fortschritt wieder da.
 */

export interface MaterialNoteRequest {
  subjectId: string;
  materialIds: string[];
  focus: string;
  length: NoteLength;
  /** Bestehenden Lernzettel neu schreiben (Titel bleibt). */
  replaceId?: string;
}

function defaultTitle(req: MaterialNoteRequest, materialNames: string[], subjectName: string): string {
  if (req.focus.trim()) return req.focus.trim().slice(0, 80);
  if (materialNames.length === 1) return materialNames[0].replace(/\.[a-z0-9]{1,5}$/i, "");
  return `Lernzettel ${subjectName}`.trim();
}

export async function createMaterialNote(
  req: MaterialNoteRequest,
  opts: { signal?: AbortSignal; onText?: (text: string) => void } = {},
): Promise<StudyNote> {
  const { materials, subjects } = getState();
  const chosen = materials.filter((m) => req.materialIds.includes(m.id));
  if (chosen.length === 0) throw new Error("Das ausgewählte Material gibt es nicht mehr.");
  const subjectName = subjects.find((s) => s.id === req.subjectId)?.name ?? "";
  const result = await platform.createMaterialNote({
    subjectName,
    focus: req.focus,
    length: req.length,
    materials: chosen,
    signal: opts.signal,
    onText: opts.onText,
  });
  const previous = req.replaceId ? getState().notes.find((n) => n.id === req.replaceId) : undefined;
  const note: StudyNote = {
    id: previous?.id ?? newId(),
    subjectId: req.subjectId,
    topicName: previous?.topicName ?? result.title ?? defaultTitle(req, chosen.map((m) => m.name), subjectName),
    content: result.content,
    fromMaterial: true,
    model: result.model,
    createdAt: Date.now(),
    materialIds: chosen.map((m) => m.id),
    focus: req.focus.trim(),
    length: req.length,
  };
  repo.saveNote(note);
  return note;
}

// ---------- Laufende Aufträge ----------

export interface NoteJob {
  text: string;
  controller: AbortController;
  done: boolean;
  error?: string;
  noteId?: string;
}

const jobs = new Map<string, NoteJob>();
const listeners = new Set<() => void>();
let version = 0;
let scheduled = false;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** Beim Schreiben höchstens ein paar Mal pro Sekunde neu zeichnen. */
function notifySoon() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    notify();
  }, 200);
}

export function useNoteJob(key: string): NoteJob | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return jobs.get(key);
}

export function startMaterialNote(key: string, req: MaterialNoteRequest): void {
  if (jobs.get(key)?.done === false) return;
  const job: NoteJob = { text: "", controller: new AbortController(), done: false };
  jobs.set(key, job);
  notify();
  createMaterialNote(req, {
    signal: job.controller.signal,
    onText: (t) => {
      job.text = t;
      notifySoon();
    },
  })
    .then((note) => {
      job.noteId = note.id;
    })
    .catch((e) => {
      if (!job.controller.signal.aborted) job.error = platform.describeError(e);
    })
    .finally(() => {
      job.done = true;
      notify();
    });
}

export function cancelNoteJob(key: string): void {
  jobs.get(key)?.controller.abort();
  jobs.delete(key);
  notify();
}

export function clearNoteJob(key: string): void {
  jobs.delete(key);
  notify();
}
