import type { GenerationSettings } from "../types";
import { coerceGeneratedTest } from "./coerce";
import { parseListReply } from "./partialJson";
import type { GeneratedQuestion } from "./schemas";

/**
 * Viele Aufgaben in mehreren Teilen: Eine einzelne Antwort von Claude hat eine
 * Längen- und Zeitgrenze. Sollen z. B. alle Aufgaben aus vielen Übungsblättern
 * übernommen werden, würde die Antwort mittendrin abbrechen. Deshalb holt die
 * App die Aufgaben portionsweise ab: Jede Anfrage enthält dasselbe Material und
 * dazu die Liste der schon übernommenen Aufgaben; Claude macht mit der nächsten
 * weiter. Abgeschnittene Antworten werden trotzdem genutzt (alle vollständigen
 * Aufgaben bleiben erhalten).
 */

/** Höchstens so viele Aufgaben pro Antwort. */
export const QUESTIONS_PER_PART = 25;
/** Höchstens so viele Anfragen für einen Test. */
export const MAX_PARTS = 12;
/** So viel Platz (Bytes) bekommt die Fortsetzungs-Anweisung im Prompt höchstens. */
export const CONTINUATION_RESERVE = 12_000;

export interface PartReply {
  text: string;
  /** Die Antwort wurde wegen der Längen- oder Zeitgrenze abgeschnitten. */
  truncated: boolean;
}

export interface PartsResult {
  title: string;
  notes: string;
  questions: GeneratedQuestion[];
  /** So viele Anfragen waren nötig. */
  parts: number;
  /** Nicht alle Aufgaben konnten abgeholt werden. */
  incomplete: boolean;
  /** Warum ein späterer Teil fehlgeschlagen ist (z. B. Nutzungslimit) */
  stopReason?: string;
}

export class PartsError extends Error {}

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

function snippet(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Liste der schon vorhandenen Aufgaben: die letzten ausführlich, ältere nur mit Quelle – höchstens `budget` Bytes. */
export function doneList(done: GeneratedQuestion[], budget: number): string {
  const label = (q: GeneratedQuestion) => q.source?.trim() || q.topic.trim() || "ohne Quelle";
  const full: string[] = [];
  let used = 0;
  let k = done.length - 1;
  for (; k >= 0 && full.length < 60; k--) {
    const line = `- ${label(done[k])}: „${snippet(done[k].prompt, 90)}“`;
    if (used + bytes(line) + 1 > budget * 0.7) break;
    full.unshift(line);
    used += bytes(line) + 1;
  }
  const short: string[] = [];
  for (; k >= 0; k--) {
    const item = snippet(label(done[k]), 50);
    if (used + bytes(item) + 2 > budget - 120) break;
    short.unshift(item);
    used += bytes(item) + 2;
  }
  const lines: string[] = [];
  if (k >= 0) lines.push(`(… ${k + 1} frühere Aufgaben vom Anfang des Materials)`);
  if (short.length) lines.push(`Davor: ${short.join("; ")}`);
  return [...lines, ...full].join("\n");
}

/** Anweisung für einen Teil – kommt hinter die eigentliche Aufgabenstellung. */
export function partInstruction(
  settings: Pick<GenerationSettings, "mode" | "questionCount">,
  done: GeneratedQuestion[],
  part: number,
): string {
  if (settings.mode === "exact") {
    const limit = `Umfang dieser Antwort: Übernimm höchstens ${QUESTIONS_PER_PART} Aufgaben (Teilaufgaben zählen einzeln). Gibt es weitere, hör nach der ${QUESTIONS_PER_PART}. auf und setze im JSON-Objekt zusätzlich "more": true – die App fragt den Rest danach ab. Sind alle Aufgaben übernommen, setze "more": false.`;
    if (part === 1) return limit;
    const header = `FORTSETZUNG (Teil ${part}): In den vorigen Teilen hast du schon ${done.length} Aufgaben übernommen. Die zuletzt übernommenen (Quelle: Anfang der Aufgabenstellung):`;
    const footer = `Mach mit der nächsten Aufgabe im Material weiter, die oben noch nicht vorkommt – in derselben Reihenfolge wie im Material. Wiederhole keine schon übernommene Aufgabe. "title" und "notes" dürfen diesmal leer bleiben. Gibt es keine weiteren Aufgaben, antworte mit "questions": [] und "more": false.`;
    const list = doneList(done, CONTINUATION_RESERVE - bytes(header + footer + limit) - 16);
    return `${header}\n${list}\n\n${footer}\n${limit}`;
  }
  const total = settings.questionCount ?? 10;
  const want = Math.min(QUESTIONS_PER_PART, total - done.length);
  if (part === 1) {
    return want < total
      ? `Umfang dieser Antwort: Erstelle zunächst nur ${want} der ${total} Aufgaben – die App fragt die übrigen danach ab.`
      : "";
  }
  const header = `FORTSETZUNG (Teil ${part}): Du hast schon ${done.length} der ${total} Aufgaben erstellt (Thema: Anfang der Aufgabenstellung):`;
  const footer = `Erstelle jetzt ${want} weitere Aufgaben, die sich von diesen deutlich unterscheiden (andere Fragestellungen, andere Zahlen), im selben JSON-Format. "title" und "notes" dürfen diesmal leer bleiben.`;
  const list = doneList(done, CONTINUATION_RESERVE - bytes(header + footer) - 16);
  return `${header}\n${list}\n\n${footer}`;
}

/** Hinweis im Test, wenn nicht alle Aufgaben abgeholt werden konnten (sonst leer). */
export function partsNote(result: Pick<PartsResult, "incomplete" | "questions" | "stopReason">): string {
  if (!result.incomplete || result.questions.length === 0) return "";
  const last = result.questions[result.questions.length - 1];
  const where = last.source ? ` (zuletzt: ${last.source})` : "";
  const why = result.stopReason ? ` Grund: ${result.stopReason}` : "";
  return `Hinweis der App: Es waren sehr viele Aufgaben – nicht alle konnten übernommen werden${where}.${why} Für den Rest erstelle einen weiteren Test und trag unter „Nur bestimmte Aufgaben“ ein, ab wo es weitergehen soll.`;
}

const keyOf = (q: GeneratedQuestion) =>
  `${(q.source ?? "").toLowerCase().replace(/\s+/g, " ").trim()}|${q.prompt.toLowerCase().replace(/\s+/g, " ").trim()}`;

/**
 * Holt die Aufgaben in so vielen Teilen wie nötig ab. `ask` schickt eine
 * Anfrage mit der zusätzlichen Anweisung und liefert die rohe Antwort.
 */
export async function generateInParts(
  settings: Pick<GenerationSettings, "mode" | "questionCount">,
  ask: (instruction: string, state: { part: number; done: number }) => Promise<PartReply>,
  opts: { signal?: AbortSignal; describeError?: (e: unknown) => string } = {},
): Promise<PartsResult> {
  const target = settings.mode === "generated" ? (settings.questionCount ?? 10) : Infinity;
  const questions: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  const notes: string[] = [];
  let title = "";
  let incomplete = false;
  let stopReason: string | undefined;
  let part = 0;

  while (true) {
    part++;
    const before = questions.length;
    let reply: PartReply;
    try {
      reply = await ask(partInstruction(settings, questions, part), { part, done: before });
    } catch (e) {
      // Schlägt ein späterer Teil fehl (z. B. Nutzungslimit), bleiben die schon übernommenen Aufgaben erhalten.
      if (part === 1 || before === 0 || opts.signal?.aborted) throw e;
      incomplete = true;
      stopReason = opts.describeError?.(e);
      break;
    }
    const parsed = parseListReply(reply.text, "questions");
    const test = coerceGeneratedTest({ ...parsed.fields, questions: parsed.items });

    if (part === 1 && !parsed.complete && test.questions.length === 0) {
      throw new PartsError(
        reply.truncated
          ? "Die Antwort von Claude war unvollständig. Bitte erneut versuchen."
          : "Die Antwort von Claude konnte nicht gelesen werden. Bitte erneut versuchen.",
      );
    }
    title ||= test.title;
    if (test.notes) notes.push(test.notes);
    for (const q of test.questions) {
      const key = keyOf(q);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(q);
    }
    const added = questions.length - before;

    if (questions.length >= target) break;
    const more =
      settings.mode === "exact"
        ? reply.truncated || parsed.fields.more === true || (!parsed.complete && parsed.fields.more !== false)
        : // Neue Aufgaben: weiter, solange noch welche fehlen und Claude welche liefert
          reply.truncated || !parsed.complete || before + Math.min(QUESTIONS_PER_PART, target - before) < target;
    if (!more) break;
    if (added === 0 || part >= MAX_PARTS) {
      incomplete = true;
      break;
    }
  }

  return {
    title,
    notes: notes.join("\n\n"),
    questions: Number.isFinite(target) ? questions.slice(0, target) : questions,
    parts: part,
    incomplete,
    stopReason,
  };
}
