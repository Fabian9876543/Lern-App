import platform from "@platform-impl";
import { repo } from "../store/store";
import type { AnswerRecord, AnswerResponse, Attempt, AttemptMode, Question, Test } from "../types";
import { gradeLocally, hasAnswer } from "./grading";
import { newId } from "./ids";

export function startAttempt(
  test: Test,
  opts: { mode: AttemptMode; questionIds?: string[]; shuffle: boolean; label?: string },
): string {
  let ids = opts.questionIds ?? test.questions.map((q) => q.id);
  if (opts.shuffle) ids = shuffle(ids);
  const attempt: Attempt = {
    id: newId(),
    testId: test.id,
    subjectId: test.subjectId,
    mode: opts.mode,
    questionIds: ids,
    answers: {},
    currentIndex: 0,
    status: "in_progress",
    startedAt: Date.now(),
    finishedAt: null,
    label: opts.label ?? (opts.mode === "exam" ? "Prüfungsmodus" : "Übungsmodus"),
  };
  repo.addAttempt(attempt);
  return attempt.id;
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function canUseAi(): boolean {
  return platform.aiStatus().state === "ready";
}

/**
 * Bewertet eine Antwort: zuerst lokal (Auswahl, Zahl, exakte Kurzantwort),
 * sonst per KI. Ist keine KI verfügbar, bleibt das Urteil offen (Selbstbewertung).
 */
export async function evaluateAnswer(
  question: Question,
  response: AnswerResponse,
  extra: Pick<AnswerRecord, "usedHint"> = {},
  signal?: AbortSignal,
): Promise<AnswerRecord> {
  const base = { response, checked: true, maxScore: question.points, usedHint: extra.usedHint };
  if (!hasAnswer(question, response)) {
    return { ...base, score: 0, verdict: "wrong", gradedBy: "auto", feedback: "Keine Antwort abgegeben." };
  }
  const local = gradeLocally(question, response);
  if (local) return { ...base, ...local, gradedBy: "auto" };
  if (!canUseAi()) {
    return { ...base, score: 0, verdict: null };
  }
  const ai = await platform.gradeWithAi(question, response, signal);
  return { ...base, score: ai.score, verdict: ai.verdict, feedback: ai.feedback, gradedBy: "ai" };
}

export function selfGrade(record: AnswerRecord, verdict: "correct" | "partial" | "wrong"): AnswerRecord {
  const score = verdict === "correct" ? record.maxScore : verdict === "partial" ? record.maxScore / 2 : 0;
  return { ...record, checked: true, verdict, score, gradedBy: "self" };
}

export function attemptQuestions(attempt: Attempt, test: Test): Question[] {
  const byId = new Map(test.questions.map((q) => [q.id, q]));
  return attempt.questionIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);
}

export interface AttemptSummary {
  score: number;
  max: number;
  percent: number;
  correct: number;
  partial: number;
  wrong: number;
  open: number;
  byTopic: { topic: string; score: number; max: number }[];
}

export function summarize(attempt: Attempt, test: Test): AttemptSummary {
  const questions = attemptQuestions(attempt, test);
  const topics = new Map<string, { score: number; max: number }>();
  let score = 0;
  let max = 0;
  let correct = 0;
  let partial = 0;
  let wrong = 0;
  let open = 0;
  for (const q of questions) {
    const rec = attempt.answers[q.id];
    const s = rec?.checked && rec.verdict ? rec.score : 0;
    max += q.points;
    score += s;
    if (!rec?.checked || !rec.verdict) open++;
    else if (rec.verdict === "correct") correct++;
    else if (rec.verdict === "partial") partial++;
    else wrong++;
    const t = topics.get(q.topic) ?? { score: 0, max: 0 };
    t.score += s;
    t.max += q.points;
    topics.set(q.topic, t);
  }
  return {
    score,
    max,
    percent: max > 0 ? Math.round((score / max) * 100) : 0,
    correct,
    partial,
    wrong,
    open,
    byTopic: [...topics.entries()]
      .map(([topic, v]) => ({ topic, ...v }))
      .sort((a, b) => a.score / a.max - b.score / b.max),
  };
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "< 1 Min.";
  if (minutes < 60) return `${minutes} Min.`;
  return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
