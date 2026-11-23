import { describe, expect, it } from "vitest";
import { coerceExamAnalysis } from "../src/ai/coerce";
import { EXAM_ANALYSIS_SYSTEM_PROMPT, buildExamAnalysisInstruction } from "../src/ai/prompts";
import { ExamAnalysisSchema } from "../src/ai/schemas";
import { practiceKey, practicePlan, scorePercent, toExamAnalysis } from "../src/lib/examAnalysis";
import { splitMaterials, usedLabel } from "../src/lib/materialNames";
import { parentPath, routeExists } from "../src/lib/navigation";
import type { ExamAnalysis, Material } from "../src/types";

const raw = {
  title: "Klausur Brüche",
  points_achieved: "38",
  points_max: 60,
  grade: "3",
  summary: "Gut, aber Kürzen fehlerhaft.",
  strengths: ["Addition", ""],
  weaknesses: [
    { topic: "Einheiten", priority: "low", problem: "Einheit fehlt", advice: "", tasks: ["Aufgabe 5"], points_lost: 1 },
    { topic: "Kürzen", priority: "high", problem: "Aus Summen gekürzt", advice: "Nur Faktoren", tasks: ["Aufgabe 2a", "Aufgabe 2b"], points_lost: 8 },
    { topic: "", priority: "high", problem: "ohne Thema" },
    { name: "Textaufgaben", priority: "wichtig", description: "Ansatz fehlt" },
  ],
  error_patterns: [{ kind: "careless", description: "Vorzeichen" }, { kind: "unbekannt", description: "anderes" }, { kind: "form", description: "" }],
  tasks: [
    { label: "Aufgabe 1", topic: "Addition", points_achieved: 10, points_max: 10, status: "correct", mistake: "", correction: "ok", error_kinds: [] },
    { label: "Aufgabe 2a", topic: "Kürzen", points_achieved: 1, points_max: 5, status: "partial", mistake: "Aus der Summe gekürzt.", correction: "ausklammern", error_kinds: ["understanding", "understanding", "quatsch"] },
    { task: "Aufgabe 4", status: "nicht da" },
    { label: "" },
  ],
};

describe("Klausur-Analyse einlesen", () => {
  const g = coerceExamAnalysis(raw);

  it("liest Punkte, Note und Texte tolerant", () => {
    expect(g.points_achieved).toBe(38);
    expect(g.points_max).toBe(60);
    expect(g.grade).toBe("3");
    expect(g.strengths).toEqual(["Addition"]);
  });

  it("sortiert Schwachstellen nach Priorität und verwirft leere", () => {
    expect(g.weaknesses.map((w) => `${w.topic}/${w.priority}`)).toEqual(["Kürzen/high", "Textaufgaben/medium", "Einheiten/low"]);
    expect(g.weaknesses.find((w) => w.topic === "Textaufgaben")?.problem).toBe("Ansatz fehlt");
  });

  it("Fehlerarten und Status nur aus der erlaubten Liste", () => {
    expect(g.error_patterns).toEqual([
      { kind: "careless", description: "Vorzeichen" },
      { kind: "other", description: "anderes" },
    ]);
    expect(g.tasks.map((t) => t.label)).toEqual(["Aufgabe 1", "Aufgabe 2a", "Aufgabe 4"]);
    expect(g.tasks[1].error_kinds).toEqual(["understanding"]);
    expect(g.tasks[2].status).toBe("unknown");
  });

  it("passt zum JSON-Schema der Web-Version", () => {
    expect(ExamAnalysisSchema.safeParse(g).success).toBe(true);
  });

  it("leere Antwort ergibt leere Analyse", () => {
    const empty = coerceExamAnalysis(null);
    expect(empty.tasks).toEqual([]);
    expect(empty.weaknesses).toEqual([]);
  });
});

function analysis(over: Partial<ExamAnalysis> = {}): ExamAnalysis {
  const g = coerceExamAnalysis(raw);
  return {
    ...toExamAnalysis(g, { id: "a1", subjectId: "s1", materialIds: ["m1"], remarks: " Note 3 ", model: "x", createdAt: 0, fallbackTitle: "Klausur vom 1.1." }),
    ...over,
  };
}

describe("Gespeicherte Analyse", () => {
  it("übernimmt alles und kürzt Hinweise", () => {
    const a = analysis();
    expect(a.title).toBe("Klausur Brüche");
    expect(a.remarks).toBe("Note 3");
    expect(a.weaknesses[0].topic).toBe("Kürzen");
    expect(a.tasks[1].errorKinds).toEqual(["understanding"]);
    expect(scorePercent(a)).toBe(63);
    expect(scorePercent({ pointsAchieved: 5, pointsMax: null })).toBeNull();
  });

  it("Ersatztitel, wenn Claude keinen liefert", () => {
    const g = coerceExamAnalysis({ ...raw, title: "" });
    expect(toExamAnalysis(g, { id: "x", subjectId: "s", materialIds: [], remarks: "", model: "", createdAt: 0, fallbackTitle: "Klausur vom 1.1." }).title).toBe("Klausur vom 1.1.");
  });
});

describe("Gezielt üben", () => {
  const a = analysis();

  it("eine Schwachstelle: 5 neue Aufgaben mit Problem und Fehlern aus der Klausur", () => {
    const { title, settings } = practicePlan(a, { kind: "weakness", topic: "Kürzen" });
    expect(title).toBe("Übung: Kürzen");
    expect(settings).toMatchObject({ mode: "generated", questionCount: 5, topicNames: ["Kürzen"], difficulty: "mixed" });
    expect(settings.focus).toContain("Gezielte Übung zum Thema „Kürzen“");
    expect(settings.focus).toContain("Was nicht sitzt: Aus Summen gekürzt");
    expect(settings.focus).toContain("Fehler in der Klausur: Aufgabe 2a: Aus der Summe gekürzt.");
  });

  it("eine Aufgabe: 4 ähnliche Aufgaben", () => {
    const { title, settings } = practicePlan(a, { kind: "task", label: "Aufgabe 2a" });
    expect(title).toBe("Übung wie Aufgabe 2a");
    expect(settings.questionCount).toBe(4);
    expect(settings.topicNames).toEqual(["Kürzen"]);
    expect(settings.focus).toContain("Dort lief schief: Aus der Summe gekürzt.");
  });

  it("alle Schwachstellen: 3 je Schwachstelle (6–15), Priorität und Fehlerarten", () => {
    const { settings } = practicePlan(a, { kind: "all" });
    expect(settings.questionCount).toBe(9);
    expect(settings.topicNames).toEqual(a.weaknesses.map((w) => w.topic));
    expect(settings.focus).toContain("- Kürzen (Priorität hoch): Aus Summen gekürzt – in der Klausur: Aufgabe 2a, Aufgabe 2b");
    expect(settings.focus).toContain("Wiederkehrende Fehler: Flüchtigkeit: Vorzeichen; Sonstiges: anderes");
    expect(practicePlan(analysis({ weaknesses: a.weaknesses.slice(0, 1) }), { kind: "all" }).settings.questionCount).toBe(6);
  });

  it("ohne Schwachstellen: Themen der Aufgaben mit Fehlern", () => {
    const { settings } = practicePlan(analysis({ weaknesses: [] }), { kind: "all" });
    expect(settings.topicNames).toEqual(["Kürzen"]);
  });

  it("eindeutige Schlüssel für laufende Aufträge", () => {
    expect(new Set([practiceKey({ kind: "all" }), practiceKey({ kind: "weakness", topic: "A" }), practiceKey({ kind: "task", label: "A" })]).size).toBe(3);
  });
});

describe("Material und Navigation", () => {
  const m = (id: string): Material => ({ id, subjectId: "s1", name: id, kind: "image", mimeType: "image/png", role: "tasks", size: 1, createdAt: 0 });

  it("ausgewertete Klausur gilt als verwendet", () => {
    const a = analysis({ materialIds: ["m1"] });
    const { fresh, used } = splitMaterials([m("m1"), m("m2")], [], [], [a]);
    expect(fresh.map((x) => x.id)).toEqual(["m2"]);
    expect(usedLabel(used[0])).toBe("ausgewertet in „Klausur Brüche“");
  });

  it("Zurück von der Analyse führt zum Fach", () => {
    const data = { subjects: [{ id: "s1", name: "M", color: "", createdAt: 0 }], tests: [], attempts: [], plans: [], notes: [], analyses: [analysis()] };
    expect(parentPath("/analysis/a1", data)).toBe("/subject/s1");
    expect(parentPath("/subject/s1/new-analysis", data)).toBe("/subject/s1");
    expect(routeExists("/analysis/a1", data)).toBe(true);
    expect(routeExists("/analysis/weg", data)).toBe(false);
  });
});

describe("Prompt", () => {
  it("Korrektur als wichtigste Quelle, keine erfundenen Punkte, Hinweise der Person", () => {
    expect(EXAM_ANALYSIS_SYSTEM_PROMPT).toContain("Die Korrektur ist die wichtigste Quelle");
    expect(EXAM_ANALYSIS_SYSTEM_PROMPT).toContain("erfinde keine Zahlen");
    expect(buildExamAnalysisInstruction({ subjectName: "Mathe", remarks: " Note 4 " })).toContain("Hinweise des Lernenden zur Arbeit: Note 4");
  });
});
