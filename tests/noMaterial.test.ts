import { describe, expect, it } from "vitest";
import {
  GENERATION_SYSTEM_PROMPT,
  buildStudyNoteInstruction,
  buildTaskInstruction,
  buildTopicInstruction,
  cleanStudyNote,
  generationSystemPrompt,
} from "../src/ai/prompts";
import type { GenerationSettings } from "../src/types";

const settings: GenerationSettings = {
  mode: "generated",
  questionCount: 6,
  difficulty: "medium",
  allowedTypes: ["single_choice", "numeric"],
  focus: "Übungstest zum Thema „Kettenregel“",
  exactFormat: "original",
  topicNames: ["Kettenregel"],
};

describe("Tests ohne Material", () => {
  it("nutzt einen eigenen Systemprompt ohne Materialrollen", () => {
    expect(generationSystemPrompt(true)).toBe(GENERATION_SYSTEM_PROMPT);
    const prompt = generationSystemPrompt(false);
    expect(prompt).toContain("kein Lernmaterial");
    expect(prompt).not.toContain("Rolle beschriftet");
    expect(prompt).toContain("single_choice");
  });

  it("verlangt Aufgaben aus dem Fachwissen zum Fach", () => {
    const text = buildTaskInstruction(settings, { hasMaterials: false, subjectName: "Analysis 1" });
    expect(text).toContain("OHNE MATERIAL");
    expect(text).toContain("Fach: „Analysis 1“");
    expect(text).toContain("genau 6 Aufgaben");
    expect(text).toContain('"source" ist immer null');
    expect(text).toContain("„Kettenregel“");
    expect(text).not.toContain("aus dem Material");
  });

  it("bleibt mit Material unverändert", () => {
    expect(buildTaskInstruction(settings)).toBe(buildTaskInstruction(settings, { hasMaterials: true, subjectName: "X" }));
    expect(buildTaskInstruction(settings)).toContain("Modus: NEUE AUFGABEN.\n");
  });
});

describe("Themen ohne Material", () => {
  const base = {
    subjectName: "Makroökonomie",
    examDateLabel: "Montag, 7. Dezember 2026",
    daysUntilExam: 25,
    availableMinutes: 1200,
    focus: "Uni, 3. Semester",
    hasMaterials: false,
  };

  it("lässt Claude die typischen Prüfungsthemen des Fachs vorschlagen", () => {
    const text = buildTopicInstruction(base);
    expect(text).toContain("Fach: „Makroökonomie“");
    expect(text).toContain("aus deinem Fachwissen");
    expect(text).toContain("Lass sources leer");
    expect(text).toContain("Hinweise des Lernenden: Uni, 3. Semester");
    expect(text).not.toContain("Erstelle die Themenliste aus dem Material");
  });

  it("ergänzt vorgegebene Themen ohne Verweis aufs Material", () => {
    const text = buildTopicInstruction({ ...base, givenTopics: ["IS-LM-Modell"] });
    expect(text).toContain("1. IS-LM-Modell");
    expect(text).toContain("anhand deines Fachwissens");
    expect(text).not.toContain("nicht im Material");
  });
});

describe("Lernzettel", () => {
  const params = {
    subjectName: "Analysis 1",
    topic: { name: "Kettenregel", description: "Verkettete Funktionen ableiten", sources: "Skript S. 40–44" },
    planTopics: ["Grenzwerte", "Ableitungsregeln", "Kettenregel"],
    minutes: 75,
    focus: "",
  };

  it("stützt sich auf das Material und nennt Fundstellen", () => {
    const text = buildStudyNoteInstruction({ ...params, hasMaterials: true });
    expect(text).toContain("Thema des Lernzettels: „Kettenregel“");
    expect(text).toContain("ca. 75 Minuten");
    expect(text).toContain("3. Kettenregel");
    expect(text).toContain("Skript S. 40–44");
    expect(text).toContain("Stütze dich auf das Material");
  });

  it("schreibt ohne Material aus dem Fachwissen", () => {
    const text = buildStudyNoteInstruction({ ...params, topic: { ...params.topic, sources: "" }, hasMaterials: false });
    expect(text).toContain("kein Material");
    expect(text).not.toContain("Stütze dich auf das Material");
    expect(text).not.toContain("Fundstelle");
  });

  it("entfernt Titelzeile und Code-Umrahmung", () => {
    expect(cleanStudyNote("# Kettenregel\n\n## Worum geht's\nText")).toBe("## Worum geht's\nText");
    expect(cleanStudyNote("```markdown\n## Das Wichtigste\n$f'(x)$\n```")).toBe("## Das Wichtigste\n$f'(x)$");
    expect(cleanStudyNote("  ## A\nB  ")).toBe("## A\nB");
  });
});
