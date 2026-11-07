import { describe, expect, it } from "vitest";
import { normalizeQuestions } from "../src/ai/normalize";
import { buildTaskInstruction } from "../src/ai/prompts";
import type { GeneratedQuestion } from "../src/ai/schemas";

let counter = 0;
const opts = { forceAiSolutions: false, makeId: () => `id-${++counter}` };

function g(partial: Partial<GeneratedQuestion>): GeneratedQuestion {
  return {
    type: "free_text",
    prompt: "Aufgabe",
    options: [],
    correct_options: [],
    numeric_answer: null,
    numeric_tolerance: null,
    unit: null,
    accepted_answers: [],
    model_solution: "Lösung",
    explanation: "Erklärung",
    hint: null,
    topic: "Thema",
    difficulty: "medium",
    points: 3,
    source: null,
    solution_from_material: true,
    ...partial,
  };
}

describe("normalizeQuestions", () => {
  it("übernimmt gültige Auswahlfragen", () => {
    const [q] = normalizeQuestions([g({ type: "single_choice", options: ["A", "B"], correct_options: [1] })], opts);
    expect(q.type).toBe("single_choice");
    expect(q.correctOptions).toEqual([1]);
  });

  it("macht aus Single Choice mit mehreren richtigen Multiple Choice", () => {
    const [q] = normalizeQuestions([g({ type: "single_choice", options: ["A", "B", "C"], correct_options: [0, 2] })], opts);
    expect(q.type).toBe("multiple_choice");
  });

  it("wandelt ungültige Fragen in Freitext um", () => {
    const result = normalizeQuestions(
      [
        g({ type: "single_choice", options: ["A", "B"], correct_options: [5] }),
        g({ type: "numeric", numeric_answer: null }),
        g({ type: "short_answer", accepted_answers: [] }),
      ],
      opts,
    );
    expect(result.map((q) => q.type)).toEqual(["free_text", "free_text", "free_text"]);
  });

  it("begrenzt Punkte und entfernt leere Fragen", () => {
    const result = normalizeQuestions([g({ points: 99 }), g({ prompt: "  " }), g({ points: 0 })], opts);
    expect(result.map((q) => q.points)).toEqual([10, 1]);
  });

  it("markiert generierte Lösungen als KI-Lösungen", () => {
    const [q] = normalizeQuestions([g({ solution_from_material: true })], { ...opts, forceAiSolutions: true });
    expect(q.solutionFromMaterial).toBe(false);
  });
});

describe("buildTaskInstruction", () => {
  const base = {
    questionCount: 12,
    difficulty: "hard" as const,
    allowedTypes: ["numeric" as const, "free_text" as const],
    focus: "Integrale",
    exactFormat: "original" as const,
  };

  it("beschreibt den Originalmodus", () => {
    const text = buildTaskInstruction({ ...base, mode: "exact" });
    expect(text).toContain("ORIGINALAUFGABEN");
    expect(text).toContain("wortgetreu");
    expect(text).toContain("Integrale");
  });

  it("beschreibt den Generierungsmodus", () => {
    const text = buildTaskInstruction({ ...base, mode: "generated" });
    expect(text).toContain("NEUE AUFGABEN");
    expect(text).toContain("genau 12");
    expect(text).toContain("schwer");
    expect(text).toContain("numeric");
    expect(text).not.toContain("single_choice");
  });
});
