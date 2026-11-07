import { describe, expect, it } from "vitest";
import { gradeLocally, hasAnswer, normalizeText, parseNumber } from "../src/lib/grading";
import type { Question } from "../src/types";

function q(partial: Partial<Question>): Question {
  return {
    id: "q1",
    type: "free_text",
    prompt: "Frage",
    options: [],
    correctOptions: [],
    numericAnswer: null,
    numericTolerance: null,
    unit: null,
    acceptedAnswers: [],
    modelSolution: "Lösung",
    explanation: "",
    hint: null,
    topic: "Thema",
    difficulty: "medium",
    points: 2,
    source: null,
    solutionFromMaterial: true,
    ...partial,
  };
}

describe("parseNumber", () => {
  it.each([
    ["3,5", 3.5],
    ["3.5", 3.5],
    ["-2", -2],
    ["−2,25", -2.25],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["12 m/s", 12],
    ["2.5e3", 2500],
    ["1,2·10^3", 1200],
    ["4*10^-2", 0.04],
    ["3/4", 0.75],
  ])("liest %s als %d", (input, expected) => {
    expect(parseNumber(input)).toBeCloseTo(expected);
  });

  it("gibt null bei ungültiger Eingabe zurück", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1/0")).toBeNull();
  });
});

describe("gradeLocally", () => {
  it("bewertet Single Choice", () => {
    const question = q({ type: "single_choice", options: ["a", "b", "c"], correctOptions: [1] });
    expect(gradeLocally(question, { selected: [1] })).toEqual({ score: 2, verdict: "correct" });
    expect(gradeLocally(question, { selected: [0] })).toEqual({ score: 0, verdict: "wrong" });
  });

  it("gibt bei Multiple Choice Teilpunkte", () => {
    const question = q({ type: "multiple_choice", options: ["a", "b", "c", "d"], correctOptions: [0, 2], points: 4 });
    expect(gradeLocally(question, { selected: [0, 2] })).toEqual({ score: 4, verdict: "correct" });
    expect(gradeLocally(question, { selected: [0] })).toEqual({ score: 2, verdict: "partial" });
    expect(gradeLocally(question, { selected: [0, 1] })).toEqual({ score: 0, verdict: "wrong" });
    expect(gradeLocally(question, { selected: [1, 3] })).toEqual({ score: 0, verdict: "wrong" });
  });

  it("bewertet Zahlen mit Toleranz", () => {
    const question = q({ type: "numeric", numericAnswer: 9.81, numericTolerance: 0.01 });
    expect(gradeLocally(question, { number: "9,81" })?.verdict).toBe("correct");
    expect(gradeLocally(question, { number: "9,8" })?.verdict).toBe("correct");
    expect(gradeLocally(question, { number: "9,7" })?.verdict).toBe("wrong");
    expect(gradeLocally(question, { number: "x" })?.verdict).toBe("wrong");
  });

  it("verlangt ohne Toleranz (fast) exakte Zahlen", () => {
    const question = q({ type: "numeric", numericAnswer: 0.3, numericTolerance: null });
    expect(gradeLocally(question, { number: String(0.1 + 0.2) })?.verdict).toBe("correct");
    expect(gradeLocally(question, { number: "0,31" })?.verdict).toBe("wrong");
  });

  it("erkennt Kurzantworten tolerant, sonst KI", () => {
    const question = q({ type: "short_answer", acceptedAnswers: ["Mitochondrium", "Mitochondrien"] });
    expect(gradeLocally(question, { text: " mitochondrium. " })?.verdict).toBe("correct");
    expect(gradeLocally(question, { text: "Zellkern" })).toBeNull();
  });

  it("überlässt Freitext der KI", () => {
    expect(gradeLocally(q({}), { text: "irgendwas" })).toBeNull();
  });
});

describe("hasAnswer / normalizeText", () => {
  it("erkennt leere Antworten", () => {
    expect(hasAnswer(q({}), { text: "  " })).toBe(false);
    expect(hasAnswer(q({}), { image: "data:image/jpeg;base64,AAA" })).toBe(true);
    expect(hasAnswer(q({ type: "single_choice" }), { selected: [] })).toBe(false);
  });

  it("normalisiert Umlaute", () => {
    expect(normalizeText("Größe")).toBe(normalizeText("groesse"));
  });
});

import { guessRole } from "../src/lib/files";

describe("guessRole", () => {
  it.each([
    ["Blatt1_Aufgaben.pdf", "tasks"],
    ["Blatt1_Loesungen.pdf", "solutions"],
    ["Übungsblatt 3 Lösung.pdf", "solutions"],
    ["Klausur_mit_Lösungen.pdf", "tasks_with_solutions"],
    ["Altklausur inkl. Lösung.pdf", "tasks_with_solutions"],
    ["Skript_Kapitel1.pdf", "reference"],
  ])("%s → %s", (name, role) => {
    expect(guessRole(name)).toBe(role);
  });
});
