import platform from "@platform-impl";
import { TYPE_LABELS } from "../ai/prompts";
import { getState, repo } from "../store/store";
import type { AnswerRecord, Attempt, ExamAnalysis, Question, Test } from "../types";
import { attemptQuestions, summarize } from "./attempts";
import { runJob, toExamAnalysis } from "./examAnalysis";
import { newId } from "./ids";
import { answerText, clip, correctText, points } from "./resultPractice";

/**
 * Schriftliche Auswertung eines Testergebnisses durch Claude: Gesamteindruck,
 * was gut lief, Schwachstellen mit Übungstipps und wiederkehrende Fehler.
 * Wird wie eine Klausur-Analyse gespeichert (mit `attemptId`).
 */

/** Obergrenze für den Text an Claude – bei sehr langen Tests wird stärker gekürzt. */
const MAX_TRANSCRIPT = 90_000;

const VERDICT_TEXT = { correct: "richtig", partial: "teilweise richtig", wrong: "falsch" } as const;

function optionsText(q: Question): string {
  if (q.type !== "single_choice" && q.type !== "multiple_choice") return "";
  return `Antwortmöglichkeiten: ${q.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${clip(o, 120)}`).join("; ")}`;
}

function questionBlock(q: Question, index: number, rec: AnswerRecord | undefined, scale: number): string {
  const n = (max: number) => Math.max(60, Math.round(max * scale));
  const score = rec?.checked && rec.verdict ? rec.score : 0;
  const head = `Frage ${index + 1} – Thema: ${q.topic} – ${TYPE_LABELS[q.type]} – ${points(q.points)} ${q.points === 1 ? "Punkt" : "Punkte"}${q.source ? ` – Quelle: ${q.source}` : ""}`;
  if (rec?.verdict === "correct") {
    return `${head}\nrichtig (${points(score)} von ${points(q.points)}): ${clip(q.prompt, n(160))}`;
  }
  const answer = answerText(q, rec);
  const verdict = rec?.checked && rec.verdict ? VERDICT_TEXT[rec.verdict] : answer ? "nicht bewertet" : "nicht beantwortet";
  return [
    head,
    `Aufgabe: ${clip(q.prompt, n(600))}`,
    optionsText(q),
    `Antwort: ${answer ? clip(answer, n(500)) : "keine Antwort"}`,
    `Richtige Lösung: ${q.type === "free_text" ? clip(q.modelSolution, n(500)) : correctText(q)}`,
    `Bewertung: ${verdict} – ${points(score)} von ${points(q.points)} Punkten${rec?.usedHint ? " – mit Tipp" : ""}`,
    rec?.feedback ? `Rückmeldung: ${clip(rec.feedback, n(500))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Der Testdurchlauf als Text für Claude. */
export function resultTranscript(attempt: Attempt, test: Test): string {
  const questions = attemptQuestions(attempt, test);
  const s = summarize(attempt, test);
  const head = [
    `Test „${test.title}“ (${attempt.mode === "exam" ? "Prüfungsmodus" : "Übungsmodus"})`,
    `Ergebnis: ${points(s.score)} von ${points(s.max)} Punkten (${s.percent} %) – ${s.correct} richtig, ${s.partial} teilweise, ${s.wrong} falsch${s.open ? `, ${s.open} offen oder unbeantwortet` : ""}`,
  ].join("\n");
  for (const scale of [1, 0.6, 0.35, 0.2]) {
    const text = [head, ...questions.map((q, i) => questionBlock(q, i, attempt.answers[q.id], scale))].join("\n\n");
    if (text.length <= MAX_TRANSCRIPT || scale === 0.2) return text;
  }
  return head;
}

/** Die neueste Auswertung zu einem Durchlauf. */
export function resultAnalysisOf(analyses: ExamAnalysis[], attemptId: string): ExamAnalysis | undefined {
  return analyses.filter((a) => a.attemptId === attemptId).sort((a, b) => b.createdAt - a.createdAt)[0];
}

export const resultAnalysisKey = (attemptId: string) => `analysis:attempt:${attemptId}`;

/** Ergebnis von Claude auswerten lassen; eine ältere Auswertung zum selben Durchlauf wird ersetzt. */
export function startResultAnalysis(attemptId: string): void {
  runJob(resultAnalysisKey(attemptId), async (job, report) => {
    const { attempts, tests, subjects } = getState();
    const attempt = attempts.find((a) => a.id === attemptId);
    const test = attempt && tests.find((t) => t.id === attempt.testId);
    if (!attempt || !test) throw new Error("Dieses Ergebnis gibt es nicht mehr.");
    const { analysis, model } = await platform.analyzeResult({
      subjectName: subjects.find((s) => s.id === test.subjectId)?.name ?? "",
      transcript: resultTranscript(attempt, test),
      signal: job.controller.signal,
      onProgress: report,
    });
    const s = summarize(attempt, test);
    const saved: ExamAnalysis = {
      ...toExamAnalysis(analysis, {
        id: newId(),
        subjectId: test.subjectId,
        materialIds: [],
        remarks: "",
        model,
        createdAt: Date.now(),
        fallbackTitle: "",
      }),
      title: `Auswertung: ${test.title}`,
      attemptId,
      // Punkte stehen fest – nicht von Claude übernehmen
      pointsAchieved: s.score,
      pointsMax: s.max,
      grade: null,
    };
    const older = getState().analyses.filter((a) => a.attemptId === attemptId);
    repo.saveAnalysis(saved);
    older.forEach((a) => repo.deleteAnalysis(a.id));
    return saved.id;
  });
}
