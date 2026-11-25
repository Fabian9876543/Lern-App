import type { AnswerRecord, Attempt, Question, Test } from "../../src/types";

/** Beispiel-Testdurchlauf für die Tests zu Ergebnis-Auswertung und Übung. */

export const q = (id: string, topic: string, points: number, extra: Partial<Question> = {}): Question => ({
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

export const rec = (verdict: AnswerRecord["verdict"], score: number, maxScore: number, extra: Partial<AnswerRecord> = {}): AnswerRecord => ({
  response: { text: "meine Antwort" },
  checked: verdict !== null,
  score,
  maxScore,
  verdict,
  ...extra,
});

export const test: Test = {
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

export const attempt: Attempt = {
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
