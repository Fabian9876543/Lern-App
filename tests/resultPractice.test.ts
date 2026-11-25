import { describe, expect, it } from "vitest";
import { mistakesOf, resultPracticePlan, suggestedCount, weakTopics } from "../src/lib/resultPractice";
import type { AnswerRecord, Attempt, Question, Test } from "../src/types";

const q = (id: string, topic: string, points: number, extra: Partial<Question> = {}): Question => ({
  id,
  type: "free_text",
  prompt: `Aufgabe ${id}`,
  options: [],
  correctOptions: [],
  numericAnswer: null,
  numericTolerance: null,
  unit: null,
  acceptedAnswers: [],
  modelSolution: `Lösung ${id}`,
  explanation: "",
  hint: null,
  topic,
  difficulty: "medium",
  points,
  source: null,
  solutionFromMaterial: true,
  ...extra,
});

const rec = (verdict: AnswerRecord["verdict"], score: number, maxScore: number, extra: Partial<AnswerRecord> = {}): AnswerRecord => ({
  response: { text: "meine Antwort" },
  checked: verdict !== null,
  score,
  maxScore,
  verdict,
  ...extra,
});

const test: Test = {
  id: "t1",
  subjectId: "s1",
  title: "Kalkulation & Beschaffung",
  mode: "exact",
  materialIds: ["m1"],
  settings: { mode: "exact", questionCount: null, difficulty: "mixed", allowedTypes: ["free_text", "numeric"], focus: "", exactFormat: "original" },
  questions: [
    q("1", "Zuschlagskalkulation", 6, { source: "Blatt 2, Aufgabe 1" }),
    q("2", "Zuschlagskalkulation", 4),
    q("3", "Bestellmenge", 5, { type: "numeric", numericAnswer: 400, unit: "Stück" }),
    q("4", "Kaufvertrag", 2, { type: "single_choice", options: ["Angebot", "Annahme", "Anfrage"], correctOptions: [0] }),
    q("5", "Kaufvertrag", 3),
  ],
  notes: "",
  createdAt: 1,
  model: "x",
};

const attempt: Attempt = {
  id: "a1",
  testId: "t1",
  subjectId: "s1",
  mode: "exam",
  status: "finished",
  startedAt: 1,
  finishedAt: 2,
  currentIndex: 0,
  label: "Prüfungsmodus",
  questionIds: test.questions.map((x) => x.id),
  answers: {
    "1": rec("partial", 2, 6, { feedback: "Gemeinkostenzuschlag auf die falsche Basis gerechnet." }),
    "2": rec("correct", 4, 4),
    "3": rec("wrong", 0, 5, { response: { number: "250" } }),
    "4": rec("wrong", 0, 2, { response: { selected: [2] } }),
    // 5: nicht beantwortet
  },
} as Attempt;

describe("Neuer Test zu den Fehlern", () => {
  it("findet alle nicht (ganz) richtigen Fragen, auch unbeantwortete", () => {
    expect(mistakesOf(attempt, test).map((m) => [m.question.id, m.lost])).toEqual([
      ["1", 4],
      ["3", 5],
      ["4", 2],
      ["5", 3],
    ]);
  });

  it("Themen nach verlorenen Punkten", () => {
    const topics = weakTopics(attempt, test);
    expect(topics.map((t) => [t.topic, t.lost, t.mistakes])).toEqual([
      // gleich viele Punkte verloren: das Thema mit mehr Fehlern zuerst
      ["Kaufvertrag", 5, 2],
      ["Bestellmenge", 5, 1],
      ["Zuschlagskalkulation", 4, 1],
    ]);
    expect(topics[2]).toMatchObject({ score: 6, max: 10 });
  });

  it("schlägt etwa so viele Fragen wie Fehler vor", () => {
    expect(suggestedCount(1)).toBe(5);
    expect(suggestedCount(5)).toBe(5);
    expect(suggestedCount(8)).toBe(10);
    expect(suggestedCount(20)).toBe(20);
    expect(suggestedCount(35)).toBe(20);
  });

  it("Auftrag an Claude: neue Aufgaben zu genau diesen Fehlern", () => {
    const { title, settings } = resultPracticePlan(attempt, test, 10);
    expect(title).toBe("Übung: Fehler aus „Kalkulation & Beschaffung“");
    expect(settings).toMatchObject({ mode: "generated", questionCount: 10, difficulty: "mixed", allowedTypes: ["free_text", "numeric"] });
    expect(settings.topicNames).toEqual(["Kaufvertrag", "Bestellmenge", "Zuschlagskalkulation"]);
    const f = settings.focus;
    expect(f).toContain("Ergebnis: 6 von 20 Punkten, 30 %");
    expect(f).toContain("nicht mit denselben Fragen");
    expect(f).toContain("- Kaufvertrag: 0 von 5 Punkten, 2 Fehler");
    // Einzelne Fehler mit Antwort, richtiger Lösung und Rückmeldung
    expect(f).toContain("Zuschlagskalkulation (Blatt 2, Aufgabe 1): „Aufgabe 1“ – 4 von 6 Punkten verloren – Antwort: meine Antwort");
    expect(f).toContain("Rückmeldung: Gemeinkostenzuschlag auf die falsche Basis gerechnet.");
    expect(f).toContain("Antwort: 250 Stück – richtig: 400 Stück");
    expect(f).toContain("Antwort: Anfrage – richtig: Angebot");
    expect(f).toContain("„Aufgabe 5“ – 3 von 3 Punkten verloren – nicht beantwortet");
    // Richtige Fragen tauchen nicht auf
    expect(f).not.toContain("„Aufgabe 2“");
    // Die teuersten Fehler zuerst
    expect(f.indexOf("„Aufgabe 3“")).toBeLessThan(f.indexOf("„Aufgabe 1“"));
  });

  it("nur die Fragen dieses Durchlaufs (z. B. „Fehler wiederholen“)", () => {
    const repeat = { ...attempt, questionIds: ["3", "4"], answers: { "3": rec("correct", 5, 5), "4": rec("wrong", 0, 2, { response: { selected: [1] } }) } } as Attempt;
    expect(mistakesOf(repeat, test).map((m) => m.question.id)).toEqual(["4"]);
    expect(resultPracticePlan(repeat, test, 5).settings.topicNames).toEqual(["Kaufvertrag"]);
  });

  it("lange Texte werden gekürzt, sehr viele Fehler zusammengefasst", () => {
    const many: Test = { ...test, questions: Array.from({ length: 30 }, (_, i) => q(`x${i}`, "Recht", 1, { prompt: "Lang ".repeat(200) })) };
    const a = { ...attempt, testId: many.id, questionIds: many.questions.map((x) => x.id), answers: {} } as Attempt;
    const { settings } = resultPracticePlan(a, many, 20);
    expect(settings.focus).toContain("… und 10 weitere");
    expect(settings.focus.length).toBeLessThan(9000);
  });
});
