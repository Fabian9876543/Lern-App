import { describe, expect, it } from "vitest";
import { coerceSolutionCheck } from "../src/ai/coerce";
import { buildSolutionCheckTask, storedSolutionText } from "../src/ai/prompts";
import type { SolutionCheckResult } from "../src/ai/schemas";
import { answerForCheck, correctedQuestion, regradeLocally, solutionChanged } from "../src/lib/solutionCheck";
import { q, rec } from "./fixtures/result";

const none: SolutionCheckResult = {
  solution_wrong: true,
  reason: "Richtig ist 500 Stück.",
  correct_options: [],
  numeric_answer: null,
  numeric_tolerance: null,
  unit: null,
  accepted_answers: [],
  model_solution: "",
  explanation: "",
};

const numeric = q("n", "Bestellmenge", 5, { type: "numeric", numericAnswer: 400, numericTolerance: 1, unit: "Stück", modelSolution: "x = 400 Stück" });
const choice = q("c", "Kaufvertrag", 2, { type: "single_choice", options: ["Angebot", "Annahme", "Anfrage"], correctOptions: [2], modelSolution: "Anfrage" });
const short = q("s", "Begriffe", 1, { type: "short_answer", acceptedAnswers: ["Vorsteuer"], modelSolution: "Vorsteuer" });

describe("Lösung stimmt nicht? – Korrektur übernehmen", () => {
  it("Zahlenfrage: neues Ergebnis, Toleranz, Einheit und Musterlösung", () => {
    const fixed = correctedQuestion(numeric, { ...none, numeric_answer: 500, numeric_tolerance: -0.5, unit: "Stück", model_solution: "x = 500 Stück" }, 42)!;
    expect(fixed).toMatchObject({ id: "n", type: "numeric", numericAnswer: 500, numericTolerance: 0.5, unit: "Stück", modelSolution: "x = 500 Stück" });
    expect(fixed.solutionFix).toEqual({ at: 42, reason: "Richtig ist 500 Stück." });
    // Aufgabe, Thema, Punkte bleiben
    expect(fixed).toMatchObject({ prompt: numeric.prompt, topic: "Bestellmenge", points: 5 });
  });

  it("Auswahlfrage: andere richtige Antwort, Antwortmöglichkeiten bleiben", () => {
    const fixed = correctedQuestion(choice, { ...none, correct_options: [0], model_solution: "Angebot" })!;
    expect(fixed.correctOptions).toEqual([0]);
    expect(fixed.options).toEqual(["Angebot", "Annahme", "Anfrage"]);
    expect(fixed.type).toBe("single_choice");
  });

  it("Auswahlfrage: mehrere richtige → Mehrfachauswahl, ungültige Indizes fallen weg", () => {
    const fixed = correctedQuestion(choice, { ...none, correct_options: [1, 0, 0, 7, -1] })!;
    expect(fixed.correctOptions).toEqual([0, 1]);
    expect(fixed.type).toBe("multiple_choice");
  });

  it("Kurzantwort: akzeptierte Varianten werden ersetzt", () => {
    const fixed = correctedQuestion(short, { ...none, accepted_answers: [" Umsatzsteuer ", "USt", "USt"] })!;
    expect(fixed.acceptedAnswers).toEqual(["Umsatzsteuer", "USt"]);
  });

  it("Freitext: neue Musterlösung und Erklärung", () => {
    const free = q("f", "Kalkulation", 4);
    const fixed = correctedQuestion(free, { ...none, model_solution: "Selbstkosten 1.250 €", explanation: "Gemeinkosten auf die Einzelkosten." })!;
    expect(fixed).toMatchObject({ modelSolution: "Selbstkosten 1.250 €", explanation: "Gemeinkosten auf die Einzelkosten." });
  });

  it("nichts Brauchbares: Lösung stimmt, oder die Korrektur ändert nichts", () => {
    expect(correctedQuestion(numeric, { ...none, solution_wrong: false, numeric_answer: 500 })).toBeNull();
    expect(correctedQuestion(numeric, none)).toBeNull();
    expect(correctedQuestion(choice, { ...none, correct_options: [2], model_solution: "Anfrage" })).toBeNull();
    expect(correctedQuestion(q("f", "x", 1), { ...none, model_solution: "Lösung f" })).toBeNull();
  });

  it("erkennt Änderungen an der Lösung", () => {
    expect(solutionChanged(numeric, { ...numeric })).toBe(false);
    expect(solutionChanged(numeric, { ...numeric, numericTolerance: null })).toBe(true);
    expect(solutionChanged(numeric, { ...numeric, prompt: "anders" })).toBe(false);
  });
});

describe("Andere Durchläufe lokal neu bewerten", () => {
  const fixed = { ...numeric, numericAnswer: 500, numericTolerance: null };

  it("Zahl und Auswahl werden ohne Claude neu bewertet", () => {
    const r = regradeLocally(fixed, rec("wrong", 0, 5, { response: { number: "500" }, gradedBy: "auto" }))!;
    expect(r).toMatchObject({ verdict: "correct", score: 5, gradedBy: "auto", feedback: undefined });
    expect(regradeLocally(fixed, rec("correct", 5, 5, { response: { number: "400" }, gradedBy: "auto" }))).toMatchObject({ verdict: "wrong", score: 0 });
  });

  it("unverändert, selbst bewertet, ungeprüft oder Freitext: nichts tun", () => {
    expect(regradeLocally(fixed, rec("correct", 5, 5, { response: { number: "500" }, gradedBy: "auto" }))).toBeNull();
    expect(regradeLocally(fixed, rec("correct", 5, 5, { response: { number: "400" }, gradedBy: "self" }))).toBeNull();
    expect(regradeLocally(fixed, { ...rec(null, 0, 5, { response: { number: "400" } }), checked: false })).toBeNull();
    expect(regradeLocally(q("f", "x", 2), rec("wrong", 0, 2, { gradedBy: "ai" }))).toBeNull();
  });
});

describe("Auftrag an Claude", () => {
  it("hinterlegte Lösung je Aufgabenformat", () => {
    expect(storedSolutionText(numeric)).toContain("Ergebnis: 400 Stück");
    expect(storedSolutionText(numeric)).toContain("Toleranz: ± 1");
    expect(storedSolutionText(choice)).toContain("Als richtig markiert: 2) Anfrage");
    expect(storedSolutionText(short)).toContain("Akzeptierte Antworten: Vorsteuer");
  });

  it("Aufgabe, Antwortmöglichkeiten, Antwort, Rückmeldung und Einwand", () => {
    const task = buildSolutionCheckTask({
      subjectName: "BWL",
      question: { ...choice, source: "Blatt 1, Aufgabe 3" },
      answer: answerForCheck(choice, rec("wrong", 0, 2, { response: { selected: [0] } })),
      feedback: "Leider falsch.",
      request: "Der erste Schritt ist das Angebot, nicht die Anfrage.",
    });
    expect(task).toContain("Fach: „BWL“");
    expect(task).toContain("Single Choice – 2 Punkte – Quelle: Blatt 1, Aufgabe 3");
    expect(task).toContain("0) Angebot\n1) Annahme\n2) Anfrage");
    expect(task).toContain("Antwort der lernenden Person: 0) Angebot");
    expect(task).toContain("Rückmeldung zur Bewertung: Leider falsch.");
    expect(task).toContain("Was laut der lernenden Person falsch ist: Der erste Schritt ist das Angebot");
  });

  it("ohne Einwand und ohne Antwort", () => {
    const task = buildSolutionCheckTask({ subjectName: "", question: numeric, answer: "", feedback: "", request: " " });
    expect(task).toContain("Antwort der lernenden Person: keine");
    expect(task).toContain("ohne genauer zu sagen, was");
    expect(task).not.toContain("Fach:");
  });

  it("Foto einer Lösung wird erwähnt", () => {
    expect(answerForCheck(q("f", "x", 1), rec("wrong", 0, 1, { response: { image: "data:image/png;base64,xx" } }))).toBe(
      "(Foto einer handschriftlichen Lösung)",
    );
  });
});

describe("Antwort von Claude einlesen (claude.ai-Version)", () => {
  it("tolerant bei Typen und fehlenden Feldern", () => {
    expect(coerceSolutionCheck({ solution_wrong: "true", reason: " Falsch. ", numeric_answer: "500,5", correct_options: ["1"] })).toEqual({
      solution_wrong: true,
      reason: "Falsch.",
      correct_options: [1],
      numeric_answer: 500.5,
      numeric_tolerance: null,
      unit: null,
      accepted_answers: [],
      model_solution: "",
      explanation: "",
    });
    expect(coerceSolutionCheck(null).solution_wrong).toBe(false);
  });
});
