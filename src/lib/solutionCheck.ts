import platform from "@platform-impl";
import type { SolutionCheckResult } from "../ai/schemas";
import { getState, repo } from "../store/store";
import type { AnswerRecord, Question } from "../types";
import { evaluateAnswer } from "./attempts";
import { gradeLocally, hasAnswer } from "./grading";
import { clip } from "./resultPractice";

/**
 * „Lösung stimmt nicht?“: Claude prüft die hinterlegte Lösung einer Aufgabe.
 * Ist sie falsch, wird sie nach Bestätigung im Test korrigiert und die Antwort
 * neu bewertet.
 */

/** Antwort der lernenden Person als Text für Claude. */
export function answerForCheck(q: Question, rec?: AnswerRecord): string {
  const r = rec?.response ?? {};
  switch (q.type) {
    case "single_choice":
    case "multiple_choice":
      return r.selected?.length ? r.selected.map((i) => `${i}) ${q.options[i] ?? "?"}`).join("; ") : "";
    case "numeric":
      return r.number?.trim() ? `${r.number.trim()}${q.unit ? ` ${q.unit}` : ""}` : "";
    case "short_answer":
    case "free_text":
      return [r.text?.trim() ? clip(r.text, 2000) : "", r.image ? "(Foto einer handschriftlichen Lösung)" : ""]
        .filter(Boolean)
        .join(" ");
  }
}

/** Claude die Lösung einer Frage prüfen lassen – mit dem Material des Tests. */
export function checkQuestionSolution(opts: {
  testId: string;
  question: Question;
  record?: AnswerRecord;
  request: string;
  signal?: AbortSignal;
}): Promise<SolutionCheckResult> {
  const { tests, subjects, materials } = getState();
  const test = tests.find((t) => t.id === opts.testId);
  if (!test) return Promise.reject(new Error("Diesen Test gibt es nicht mehr."));
  return platform.checkSolution({
    subjectName: subjects.find((s) => s.id === test.subjectId)?.name ?? "",
    question: opts.question,
    answer: answerForCheck(opts.question, opts.record),
    feedback: opts.record?.feedback ?? "",
    request: opts.request,
    materials: materials.filter((m) => test.materialIds.includes(m.id)),
    signal: opts.signal,
  });
}

const SOLUTION_FIELDS = ["type", "correctOptions", "numericAnswer", "numericTolerance", "unit", "acceptedAnswers", "modelSolution", "explanation"] as const;

/** Ändert die Korrektur an der Lösung tatsächlich etwas? */
export function solutionChanged(a: Question, b: Question): boolean {
  return SOLUTION_FIELDS.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

/**
 * Die Frage mit Claudes korrigierter Lösung. Aufgabenstellung und
 * Antwortmöglichkeiten bleiben, damit die gegebene Antwort weiter passt.
 * `null`, wenn die Lösung stimmt oder die Korrektur nichts Brauchbares ändert.
 */
export function correctedQuestion(q: Question, check: SolutionCheckResult, now = Date.now()): Question | null {
  if (!check.solution_wrong) return null;
  const next: Question = { ...q, solutionFix: { at: now, reason: check.reason.trim() } };
  if (check.model_solution.trim()) next.modelSolution = check.model_solution.trim();
  if (check.explanation.trim()) next.explanation = check.explanation.trim();
  switch (q.type) {
    case "single_choice":
    case "multiple_choice": {
      const options = [...new Set(check.correct_options)]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < q.options.length)
        .sort((a, b) => a - b);
      if (options.length > 0) {
        next.correctOptions = options;
        // Mehrere richtige Antworten gehen nur bei Mehrfachauswahl
        if (options.length > 1) next.type = "multiple_choice";
      }
      break;
    }
    case "numeric":
      if (check.numeric_answer !== null && Number.isFinite(check.numeric_answer)) {
        next.numericAnswer = check.numeric_answer;
        next.numericTolerance =
          check.numeric_tolerance !== null && Number.isFinite(check.numeric_tolerance) && check.numeric_tolerance !== 0
            ? Math.abs(check.numeric_tolerance)
            : null;
        next.unit = check.unit?.trim() || null;
      }
      break;
    case "short_answer": {
      const accepted = check.accepted_answers.map((a) => a.trim()).filter(Boolean);
      if (accepted.length > 0) next.acceptedAnswers = [...new Set(accepted)];
      break;
    }
    case "free_text":
      break;
  }
  return solutionChanged(q, next) ? next : null;
}

/** Antwort eines anderen Durchlaufs neu bewerten – nur, wenn das ohne Claude geht. */
export function regradeLocally(q: Question, rec: AnswerRecord): AnswerRecord | null {
  if (!rec.checked || rec.gradedBy === "self" || !hasAnswer(q, rec.response)) return null;
  const local = gradeLocally(q, rec.response);
  if (!local || (local.verdict === rec.verdict && local.score === rec.score)) return null;
  return { ...rec, ...local, maxScore: q.points, feedback: undefined, gradedBy: "auto" };
}

export interface SolutionFixOutcome {
  /** Bewertung dieses Durchlaufs vorher und nachher (fehlt, wenn es keine Antwort gab). */
  before?: AnswerRecord;
  after?: AnswerRecord;
  /** Neue Bewertung fehlgeschlagen – die Antwort ist dann selbst zu bewerten. */
  error?: string;
  /** In wie vielen anderen Durchläufen dieses Tests sich die Bewertung geändert hat. */
  others: number;
}

/**
 * Korrektur übernehmen: Lösung im Test ändern, die Antwort dieses Durchlaufs
 * neu bewerten (bei Freitext mit Claude) und andere Durchläufe des Tests
 * lokal nachziehen.
 */
export async function applySolutionFix(opts: {
  testId: string;
  questionId: string;
  check: SolutionCheckResult;
  attemptId?: string;
}): Promise<SolutionFixOutcome> {
  const test = getState().tests.find((t) => t.id === opts.testId);
  const current = test?.questions.find((q) => q.id === opts.questionId);
  if (!test || !current) throw new Error("Diese Frage gibt es nicht mehr.");
  const corrected = correctedQuestion(current, opts.check);
  if (!corrected) throw new Error("Die Korrektur ändert an der Lösung nichts.");
  repo.updateTest(test.id, { questions: test.questions.map((q) => (q.id === corrected.id ? corrected : q)) });

  let others = 0;
  for (const a of getState().attempts) {
    if (a.testId !== test.id || a.id === opts.attemptId || !a.answers[corrected.id]) continue;
    const next = regradeLocally(corrected, a.answers[corrected.id]);
    if (!next) continue;
    repo.updateAttempt(a.id, (x) => ({ ...x, answers: { ...x.answers, [corrected.id]: next } }));
    others++;
  }

  const attempt = opts.attemptId ? getState().attempts.find((a) => a.id === opts.attemptId) : undefined;
  const before = attempt?.answers[corrected.id];
  if (!attempt || !before || !hasAnswer(corrected, before.response)) return { others };
  const write = (rec: AnswerRecord) =>
    repo.updateAttempt(attempt.id, (x) => ({ ...x, answers: { ...x.answers, [corrected.id]: rec } }));
  try {
    // Ohne Abbruch: Die Lösung ist schon geändert, die Bewertung soll auch beim Weiterklicken noch nachziehen.
    const after = await evaluateAnswer(corrected, before.response, { usedHint: before.usedHint });
    write(after);
    return { before, after, others };
  } catch (e) {
    const after: AnswerRecord = { ...before, checked: true, score: 0, maxScore: corrected.points, verdict: null, feedback: undefined, gradedBy: undefined };
    write(after);
    return { before, after, error: platform.describeError(e), others };
  }
}
