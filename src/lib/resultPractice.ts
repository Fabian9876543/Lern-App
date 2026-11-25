import platform from "@platform-impl";
import { TYPE_LABELS } from "../ai/prompts";
import { getState, repo } from "../store/store";
import type { AnswerRecord, Attempt, GenerationSettings, Question, QuestionType, Test } from "../types";
import { attemptQuestions } from "./attempts";
import { runJob } from "./examAnalysis";
import { newId } from "./ids";
import { splitTest } from "./testParts";

/**
 * Nach einem Test gezielt weiterüben: Claude erstellt einen neuen Test mit neuen
 * Aufgaben zu genau dem, was im Durchlauf nicht saß (Themen, Fehler, Rückmeldungen).
 */

export interface Mistake {
  question: Question;
  record?: AnswerRecord;
  /** Verlorene Punkte */
  lost: number;
}

export interface WeakTopic {
  topic: string;
  score: number;
  max: number;
  lost: number;
  mistakes: number;
}

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[];
export const PRACTICE_COUNTS = [5, 10, 15, 20];
/** So viele Fehler werden Claude einzeln beschrieben (die mit den meisten verlorenen Punkten). */
const MAX_LISTED = 20;

const scoreOf = (rec?: AnswerRecord) => (rec?.checked && rec.verdict ? rec.score : 0);

/** Fragen, die nicht (ganz) richtig waren – auch unbeantwortete und noch nicht bewertete. */
export function mistakesOf(attempt: Attempt, test: Test): Mistake[] {
  return attemptQuestions(attempt, test)
    .filter((q) => attempt.answers[q.id]?.verdict !== "correct")
    .map((q) => ({ question: q, record: attempt.answers[q.id], lost: Math.max(0, q.points - scoreOf(attempt.answers[q.id])) }));
}

/** Themen mit Fehlern, die mit den meisten verlorenen Punkten zuerst. */
export function weakTopics(attempt: Attempt, test: Test): WeakTopic[] {
  const topics = new Map<string, WeakTopic>();
  for (const q of attemptQuestions(attempt, test)) {
    const rec = attempt.answers[q.id];
    const t = topics.get(q.topic) ?? { topic: q.topic, score: 0, max: 0, lost: 0, mistakes: 0 };
    t.score += scoreOf(rec);
    t.max += q.points;
    if (rec?.verdict !== "correct") {
      t.mistakes++;
      t.lost += Math.max(0, q.points - scoreOf(rec));
    }
    topics.set(q.topic, t);
  }
  return [...topics.values()]
    .filter((t) => t.mistakes > 0)
    .sort((a, b) => b.lost - a.lost || a.score / (a.max || 1) - b.score / (b.max || 1) || b.mistakes - a.mistakes);
}

/** Vorschlag für die Anzahl der Fragen: etwa so viele wie Fehler (5 bis 20). */
export function suggestedCount(mistakes: number): number {
  return PRACTICE_COUNTS.find((c) => c >= mistakes) ?? PRACTICE_COUNTS[PRACTICE_COUNTS.length - 1];
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

const points = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function answerText(q: Question, rec?: AnswerRecord): string {
  const r = rec?.response ?? {};
  switch (q.type) {
    case "single_choice":
    case "multiple_choice":
      return r.selected?.length ? r.selected.map((i) => q.options[i] ?? "?").map((o) => clip(o, 80)).join("; ") : "";
    case "numeric":
      return r.number?.trim() ? `${r.number.trim()}${q.unit ? ` ${q.unit}` : ""}` : "";
    case "short_answer":
    case "free_text":
      return [r.text?.trim() ? clip(r.text, 160) : "", r.image ? "(Foto der Lösung)" : ""].filter(Boolean).join(" ");
  }
}

function correctText(q: Question): string {
  switch (q.type) {
    case "single_choice":
    case "multiple_choice":
      return q.correctOptions.map((i) => clip(q.options[i] ?? "?", 80)).join("; ");
    case "numeric":
      return q.numericAnswer === null ? clip(q.modelSolution, 120) : `${points(q.numericAnswer)}${q.unit ? ` ${q.unit}` : ""}`;
    case "short_answer":
      return q.acceptedAnswers[0] ?? clip(q.modelSolution, 120);
    case "free_text":
      return clip(q.modelSolution, 160);
  }
}

function describeMistake({ question: q, record, lost }: Mistake): string {
  const answer = answerText(q, record);
  const parts = [
    `- ${q.topic}${q.source ? ` (${q.source})` : ""}: „${clip(q.prompt, 220)}“`,
    `${points(lost)} von ${points(q.points)} Punkten verloren`,
    answer ? `Antwort: ${answer}` : "nicht beantwortet",
    `richtig: ${correctText(q)}`,
    record?.feedback ? `Rückmeldung: ${clip(record.feedback, 220)}` : "",
  ];
  return parts.filter(Boolean).join(" – ");
}

/** Titel und Einstellungen für den neuen Test zu den Fehlern eines Durchlaufs. */
export function resultPracticePlan(attempt: Attempt, test: Test, count: number): { title: string; settings: GenerationSettings } {
  const questions = attemptQuestions(attempt, test);
  const max = questions.reduce((sum, q) => sum + q.points, 0);
  const score = questions.reduce((sum, q) => sum + scoreOf(attempt.answers[q.id]), 0);
  const topics = weakTopics(attempt, test);
  const mistakes = mistakesOf(attempt, test).sort((a, b) => b.lost - a.lost);
  const listed = mistakes.slice(0, MAX_LISTED);

  const focus = [
    `Neuer Übungstest zu den Fehlern aus dem Test „${test.title}“ (Ergebnis: ${points(score)} von ${points(max)} Punkten${max ? `, ${Math.round((score / max) * 100)} %` : ""}).`,
    "Übe gezielt, was dort nicht saß – mit neuen Aufgaben (andere Zahlen, Situationen und Fragestellungen), nicht mit denselben Fragen.",
    "Themen mit verlorenen Punkten (die meisten zuerst):",
    ...topics.map((t) => `- ${t.topic}: ${points(t.score)} von ${points(t.max)} Punkten, ${t.mistakes} Fehler`),
    "Die Fehler im Einzelnen:",
    ...listed.map(describeMistake),
    mistakes.length > listed.length ? `… und ${mistakes.length - listed.length} weitere mit weniger verlorenen Punkten.` : "",
    "Verteile die Aufgaben nach den verlorenen Punkten (mehr zu Themen mit vielen Fehlern). Beginne etwas leichter und steigere bis zum Niveau des ursprünglichen Tests. Bau die Aufgaben so, dass genau diese Fehler wieder auffallen würden, und geh in Erklärung und Tipp darauf ein.",
  ];

  return {
    title: `Übung: Fehler aus „${test.title}“`,
    settings: {
      mode: "generated",
      questionCount: count,
      difficulty: "mixed",
      allowedTypes: test.settings.allowedTypes?.length ? test.settings.allowedTypes : ALL_TYPES,
      exactFormat: test.settings.exactFormat ?? "original",
      topicNames: topics.length ? topics.map((t) => t.topic) : undefined,
      focus: focus.filter(Boolean).join("\n"),
    },
  };
}

export const resultPracticeKey = (attemptId: string) => `practice:attempt:${attemptId}`;

/** Neuen Test zu den Fehlern erstellen; fertig: `resultId` ist der (erste) neue Test. */
export function startResultPractice(attemptId: string, count: number): void {
  runJob(resultPracticeKey(attemptId), async (job, report) => {
    const { attempts, tests, materials, subjects } = getState();
    const attempt = attempts.find((a) => a.id === attemptId);
    const test = attempt && tests.find((t) => t.id === attempt.testId);
    if (!attempt || !test) throw new Error("Dieses Ergebnis gibt es nicht mehr.");
    const { title, settings } = resultPracticePlan(attempt, test, count);
    const generated = await platform.generateTest({
      subjectId: test.subjectId,
      subjectName: subjects.find((s) => s.id === test.subjectId)?.name ?? "",
      // Dasselbe Material wie der ursprüngliche Test (gelöschte Dateien fallen weg)
      materials: materials.filter((m) => test.materialIds.includes(m.id)),
      settings,
      signal: job.controller.signal,
      onProgress: report,
    });
    const parts = splitTest({ ...generated, title, fromAttemptId: attempt.id }, newId);
    parts.forEach((t) => repo.addTest(t));
    return parts[0].id;
  });
}
