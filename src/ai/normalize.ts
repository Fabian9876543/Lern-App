import type { Question } from "../types";
import type { GeneratedQuestion } from "./schemas";

/**
 * Wandelt die KI-Ausgabe in das interne Fragenformat um und repariert
 * inkonsistente Fragen (z. B. Auswahlfrage ohne gültige richtige Option),
 * indem sie in Freitext-Fragen umgewandelt werden.
 */
export function normalizeQuestions(
  generated: GeneratedQuestion[],
  opts: { forceAiSolutions: boolean; makeId: () => string },
): Question[] {
  return generated
    .filter((g) => g.prompt.trim() !== "")
    .map((g) => {
      const q: Question = {
        id: opts.makeId(),
        type: g.type,
        prompt: g.prompt.trim(),
        options: g.options.map((o) => o.trim()).filter((o) => o !== ""),
        correctOptions: [...new Set(g.correct_options)].sort((a, b) => a - b),
        numericAnswer: g.numeric_answer,
        numericTolerance: g.numeric_tolerance !== null ? Math.abs(g.numeric_tolerance) : null,
        unit: g.unit?.trim() || null,
        acceptedAnswers: g.accepted_answers.map((a) => a.trim()).filter((a) => a !== ""),
        modelSolution: g.model_solution.trim(),
        explanation: g.explanation.trim(),
        hint: g.hint?.trim() || null,
        topic: g.topic.trim() || "Allgemein",
        difficulty: g.difficulty,
        points: clampPoints(g.points),
        source: g.source?.trim() || null,
        solutionFromMaterial: opts.forceAiSolutions ? false : g.solution_from_material,
      };
      return repair(q);
    });
}

function clampPoints(p: number): number {
  if (!Number.isFinite(p)) return 1;
  return Math.min(10, Math.max(1, Math.round(p)));
}

function repair(q: Question): Question {
  if (q.type === "single_choice" || q.type === "multiple_choice") {
    q.correctOptions = q.correctOptions.filter((i) => i >= 0 && i < q.options.length);
    const valid = q.options.length >= 2 && q.correctOptions.length >= 1;
    if (!valid) return toFreeText(q);
    if (q.type === "single_choice" && q.correctOptions.length > 1) q.type = "multiple_choice";
  } else {
    q.options = [];
    q.correctOptions = [];
  }
  if (q.type === "numeric" && (q.numericAnswer === null || !Number.isFinite(q.numericAnswer))) {
    return toFreeText(q);
  }
  if (q.type === "short_answer" && q.acceptedAnswers.length === 0) {
    return toFreeText(q);
  }
  if (q.type !== "numeric") {
    q.numericAnswer = null;
    q.numericTolerance = null;
  }
  if (!q.modelSolution) {
    q.modelSolution = describeCorrectAnswer(q) || "–";
  }
  return q;
}

function toFreeText(q: Question): Question {
  const solution = q.modelSolution || describeCorrectAnswer(q);
  return {
    ...q,
    type: "free_text",
    options: [],
    correctOptions: [],
    numericAnswer: null,
    numericTolerance: null,
    modelSolution: solution || "–",
  };
}

export function describeCorrectAnswer(q: Question): string {
  switch (q.type) {
    case "single_choice":
    case "multiple_choice":
      return q.correctOptions.map((i) => q.options[i]).filter(Boolean).join("; ");
    case "numeric":
      return q.numericAnswer !== null ? `${formatNumber(q.numericAnswer)}${q.unit ? " " + q.unit : ""}` : "";
    case "short_answer":
      return q.acceptedAnswers.join(" / ");
    case "free_text":
      return q.modelSolution;
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 10 });
}

/** Zählt, wie viele Fragen eine noch unvollständige JSON-Antwort schon enthält. */
export function countQuestions(partialJson: string): number {
  return partialJson.split('"prompt"').length - 1;
}
