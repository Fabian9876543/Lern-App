import { describe, expect, it } from "vitest";
import { coerceGeneratedTest, coerceGrading } from "../src/ai/coerce";
import { normalizeQuestions } from "../src/ai/normalize";

describe("coerceGeneratedTest", () => {
  it("füllt fehlende Felder mit Standardwerten", () => {
    const t = coerceGeneratedTest({
      title: "Test",
      questions: [{ type: "numeric", prompt: "Wie viel ist 1+1?", numeric_answer: "2", points: "3" }],
    });
    expect(t.notes).toBe("");
    expect(t.questions[0]).toMatchObject({
      type: "numeric",
      numeric_answer: 2,
      points: 3,
      options: [],
      topic: "Allgemein",
      difficulty: "medium",
      hint: null,
    });
  });

  it("verwirft Einträge ohne Aufgabenstellung und unbekannte Typen werden Freitext", () => {
    const t = coerceGeneratedTest({ questions: [{ prompt: "" }, null, { type: "essay", prompt: "Erkläre X." }] });
    expect(t.questions).toHaveLength(1);
    expect(t.questions[0].type).toBe("free_text");
  });

  it("akzeptiert auch ein reines Fragen-Array", () => {
    expect(coerceGeneratedTest([{ prompt: "A?" }]).questions).toHaveLength(1);
  });

  it("liefert zusammen mit normalizeQuestions gültige Fragen", () => {
    const t = coerceGeneratedTest({
      questions: [{ type: "single_choice", prompt: "Welche?", options: ["a", "b"], correct_options: ["1"] }],
    });
    const [q] = normalizeQuestions(t.questions, { forceAiSolutions: true, makeId: () => "x" });
    expect(q.type).toBe("single_choice");
    expect(q.correctOptions).toEqual([1]);
    expect(q.modelSolution).toBe("b");
  });
});

describe("coerceGrading", () => {
  it("liest Bewertungen tolerant", () => {
    expect(coerceGrading({ verdict: "partial", score: "1,5", feedback: " ok " })).toEqual({
      verdict: "partial",
      score: 1.5,
      feedback: "ok",
    });
    expect(coerceGrading({ verdict: "correct" })).toBeNull();
    expect(coerceGrading("nein")).toBeNull();
  });
});
