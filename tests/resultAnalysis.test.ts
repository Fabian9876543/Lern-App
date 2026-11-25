import { describe, expect, it } from "vitest";
import { RESULT_ANALYSIS_SYSTEM_PROMPT, buildResultAnalysisInstruction } from "../src/ai/prompts";
import { resultAnalysisOf, resultTranscript } from "../src/lib/resultAnalysis";
import { resultPracticePlan } from "../src/lib/resultPractice";
import type { Attempt, ExamAnalysis, Test } from "../src/types";
import { attempt, q, rec, test } from "./fixtures/result";

const analysis: ExamAnalysis = {
  id: "an1",
  subjectId: "s1",
  title: "Auswertung: Kalkulation & Beschaffung",
  attemptId: "a1",
  materialIds: [],
  remarks: "",
  pointsAchieved: 6,
  pointsMax: 20,
  grade: null,
  summary: "Bei der Bestellmenge fehlt die Formel.",
  strengths: ["Einzelkosten sicher"],
  weaknesses: [
    { topic: "Andler-Formel", priority: "high", problem: "Formel falsch umgestellt", advice: "Formel dreimal herleiten", tasks: ["Frage 3"], pointsLost: 5 },
  ],
  errorPatterns: [{ kind: "terminology", description: "Angebot und Anfrage verwechselt" }],
  tasks: [],
  notes: "",
  model: "x",
  createdAt: 5,
};

describe("Testergebnis von Claude auswerten lassen", () => {
  const text = resultTranscript(attempt, test);

  it("Kopf mit Ergebnis und Modus", () => {
    expect(text).toMatch(/^Test „Kalkulation & Beschaffung“ \(Prüfungsmodus\)\nErgebnis: 6 von 20 Punkten \(30 %\) – 1 richtig, 1 teilweise, 2 falsch, 1 offen oder unbeantwortet/);
  });

  it("Fehler ausführlich: Aufgabe, Antwort, Lösung, Bewertung, Rückmeldung", () => {
    expect(text).toContain(
      "Frage 1 – Thema: Zuschlagskalkulation – Freitext / Rechenweg – 6 Punkte – Quelle: Blatt 2, Aufgabe 1\nAufgabe: Aufgabe 1\nAntwort: meine Antwort\nRichtige Lösung: Lösung 1\nBewertung: teilweise richtig – 2 von 6 Punkten\nRückmeldung: Gemeinkostenzuschlag auf die falsche Basis gerechnet.",
    );
    expect(text).toContain("Antwortmöglichkeiten: A) Angebot; B) Annahme; C) Anfrage\nAntwort: Anfrage\nRichtige Lösung: Angebot\nBewertung: falsch – 0 von 2 Punkten");
    expect(text).toContain("Antwort: 250 Stück\nRichtige Lösung: 400 Stück");
    expect(text).toContain("Frage 5 – Thema: Kaufvertrag");
    expect(text).toContain("Antwort: keine Antwort\nRichtige Lösung: Lösung 5\nBewertung: nicht beantwortet – 0 von 3 Punkten");
  });

  it("richtige Fragen nur kurz", () => {
    expect(text).toContain("Frage 2 – Thema: Zuschlagskalkulation – Freitext / Rechenweg – 4 Punkte\nrichtig (4 von 4): Aufgabe 2");
    expect(text).not.toContain("Richtige Lösung: Lösung 2");
  });

  it("sehr lange Tests werden gekürzt", () => {
    const long: Test = { ...test, questions: Array.from({ length: 60 }, (_, i) => q(`l${i}`, "Recht", 2, { prompt: "Sachverhalt ".repeat(120), modelSolution: "Lösung ".repeat(150) })) };
    const a = { ...attempt, questionIds: long.questions.map((x) => x.id), answers: Object.fromEntries(long.questions.map((x) => [x.id, rec("wrong", 0, 2, { feedback: "Begründung fehlt ".repeat(60) })])) } as Attempt;
    const t = resultTranscript(a, long);
    expect(t.length).toBeLessThanOrEqual(90_000);
    expect(t).toContain("Frage 60 – Thema: Recht");
  });

  it("Auftrag an Claude", () => {
    expect(RESULT_ANALYSIS_SYSTEM_PROMPT).toContain("Mustern über mehrere Fragen");
    expect(RESULT_ANALYSIS_SYSTEM_PROMPT).toContain("incomplete");
    const instruction = buildResultAnalysisInstruction({ subjectName: "BWL", transcript: text });
    expect(instruction).toContain("Fach: „BWL“");
    expect(instruction).toContain(`<test>\n${text}\n</test>`);
  });

  it("neueste Auswertung zum Durchlauf", () => {
    const older = { ...analysis, id: "alt", createdAt: 1 };
    const other = { ...analysis, id: "fremd", attemptId: "a2", createdAt: 9 };
    expect(resultAnalysisOf([older, analysis, other], "a1")?.id).toBe("an1");
    expect(resultAnalysisOf([other], "a1")).toBeUndefined();
  });

  it("neuer Test zu den Fehlern nutzt die Auswertung", () => {
    const { settings } = resultPracticePlan(attempt, test, 10, analysis);
    expect(settings.focus).toContain("Auswertung von Claude zu diesem Test");
    expect(settings.focus).toContain("- Schwachstelle Andler-Formel (Priorität hoch): Formel falsch umgestellt – so üben: Formel dreimal herleiten");
    expect(settings.focus).toContain("Wiederkehrende Fehler: Fachbegriffe: Angebot und Anfrage verwechselt");
    expect(resultPracticePlan(attempt, test, 10).settings.focus).not.toContain("Auswertung von Claude");
  });
});
