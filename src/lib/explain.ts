import platform from "@platform-impl";
import { useSyncExternalStore } from "react";
import { getState, repo } from "../store/store";
import type { MarkAnchor, MarkLevel, Material, NoteMark, StudyNote } from "../types";
import { newId } from "./ids";
import { MAX_MARK_MESSAGES, sameAnchor } from "./noteMarks";
import { planMaterials } from "./plans";

/**
 * Markierte Stellen im Lernzettel erklären lassen. Wie beim Schreiben eines
 * Lernzettels läuft das außerhalb der Seite weiter: Man kann das Fenster
 * schließen oder woanders hin, die Erklärung wird trotzdem gespeichert.
 */

function noteOf(noteId: string): StudyNote | undefined {
  return getState().notes.find((n) => n.id === noteId);
}

function markOf(markId: string): NoteMark | undefined {
  return getState().marks.find((m) => m.id === markId);
}

/** Markierte Stellen eines Lernzettels. */
export function marksOf(marks: NoteMark[], noteId: string): NoteMark[] {
  return marks.filter((m) => m.noteId === noteId);
}

/** Material, aus dem der Lernzettel stammt (bei Lernplan-Zetteln: das Material des Plans). */
export function noteMaterials(note: StudyNote): Material[] {
  const { materials, plans } = getState();
  if (note.planId) {
    const plan = plans.find((p) => p.id === note.planId);
    return plan ? planMaterials(plan) : [];
  }
  return (note.materialIds ?? []).map((id) => materials.find((m) => m.id === id)).filter((m): m is Material => !!m);
}

/** Legt eine Markierung an (oder liefert die vorhandene für dieselbe Stelle) und lässt sie erklären. */
export function addMark(noteId: string, input: { quote: string; anchor: MarkAnchor; level: MarkLevel }): string | null {
  const note = noteOf(noteId);
  if (!note) return null;
  const existing = marksOf(getState().marks, noteId).find((m) => sameAnchor(m.anchor, input.anchor));
  if (existing) {
    if (existing.level !== input.level) repo.updateMark(existing.id, (m) => ({ ...m, level: input.level }));
    return existing.id;
  }
  const mark: NoteMark = { id: newId(), noteId, subjectId: note.subjectId, ...input, messages: [], createdAt: Date.now() };
  repo.saveMark(mark);
  startExplain(mark.id);
  return mark.id;
}

export function removeMark(markId: string): void {
  cancelExplain(markId);
  repo.deleteMark(markId);
}

/** Nachfrage zu einer Stelle stellen. */
export function askFollowUp(markId: string, question: string): void {
  const text = question.trim();
  const mark = markOf(markId);
  if (!text || !mark || mark.messages.length >= MAX_MARK_MESSAGES) return;
  repo.updateMark(markId, (m) => ({ ...m, messages: [...m.messages, { role: "user", content: text, at: Date.now() }] }));
  startExplain(markId);
}

/** Braucht die Stelle (noch) eine Antwort von Claude? */
export function needsAnswer(mark: NoteMark): boolean {
  const last = mark.messages[mark.messages.length - 1];
  return !last || last.role === "user";
}

// ---------- Laufende Erklärungen ----------

export interface ExplainJob {
  text: string;
  controller: AbortController;
  done: boolean;
  error?: string;
}

const jobs = new Map<string, ExplainJob>();
const listeners = new Set<() => void>();
let version = 0;
let scheduled = false;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function notifySoon() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    notify();
  }, 150);
}

export function useExplainJob(markId: string): ExplainJob | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return jobs.get(markId);
}

export function isExplaining(markId: string): boolean {
  return jobs.get(markId)?.done === false;
}

export function startExplain(markId: string): void {
  if (isExplaining(markId)) return;
  const mark = markOf(markId);
  const note = mark && noteOf(mark.noteId);
  if (!note || !mark || !needsAnswer(mark)) return;
  const job: ExplainJob = { text: "", controller: new AbortController(), done: false };
  jobs.set(markId, job);
  notify();
  const subjectName = getState().subjects.find((s) => s.id === note.subjectId)?.name ?? "";
  platform
    .explainPassage({
      subjectName,
      noteTitle: note.topicName,
      noteContent: note.content,
      quote: mark.quote,
      level: mark.level,
      materials: noteMaterials(note),
      history: mark.messages.map((m) => ({ role: m.role, content: m.content })),
      signal: job.controller.signal,
      onText: (t) => {
        job.text = t;
        notifySoon();
      },
    })
    .then((result) => {
      repo.updateMark(markId, (m) => ({
        ...m,
        messages: [
          ...m.messages,
          {
            role: "assistant",
            content: result.content,
            at: Date.now(),
            model: result.model,
            ...(result.basis ? { basis: result.basis } : {}),
            ...(result.links ? { links: result.links } : {}),
          },
        ],
      }));
      jobs.delete(markId);
    })
    .catch((e) => {
      if (job.controller.signal.aborted) jobs.delete(markId);
      else job.error = platform.describeError(e);
    })
    .finally(() => {
      job.done = true;
      notify();
    });
}

export function cancelExplain(markId: string): void {
  jobs.get(markId)?.controller.abort();
  jobs.delete(markId);
  notify();
}

/** Fehler einer abgeschlossenen Erklärung vergessen (z. B. vor „Erneut versuchen“). */
export function clearExplainError(markId: string): void {
  if (jobs.get(markId)?.done) {
    jobs.delete(markId);
    notify();
  }
}
