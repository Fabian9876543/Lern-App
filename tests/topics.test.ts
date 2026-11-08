import { describe, expect, it } from "vitest";
import { coerceTopicAnalysis } from "../src/ai/coerce";
import { buildTaskInstruction, buildTopicInstruction } from "../src/ai/prompts";
import { manualTopics, parseTopicLines, toPlanTopics } from "../src/ai/topics";

let n = 0;
const makeId = () => `t${++n}`;

describe("Themen aus Claudes Antwort", () => {
  it("löst Voraussetzungen über die Namen auf und begrenzt den Zeitbedarf", () => {
    const analysis = coerceTopicAnalysis({
      title: "Klausur Analysis",
      topics: [
        { name: "Grenzwerte", estimated_minutes: 45, importance: "high", prerequisites: [] },
        { name: "Ableitungen", estimated_minutes: "2000", prerequisites: ["grenzwerte", "Unbekannt"] },
        { name: "Ableitungen" },
        "Integrale",
      ],
    });
    const topics = toPlanTopics(analysis.topics, makeId);
    expect(topics.map((t) => t.name)).toEqual(["Grenzwerte", "Ableitungen", "Integrale"]);
    expect(topics[1].estimatedMinutes).toBe(600);
    expect(topics[1].prerequisites).toEqual([topics[0].id]);
    expect(topics[1].importance).toBe("medium");
    expect(topics[2].estimatedMinutes).toBe(60);
  });
});

describe("Manuelle Themen", () => {
  it("liest eine Zeile pro Thema, mit optionaler Beschreibung und Aufzählungszeichen", () => {
    const lines = parseTopicLines("1. Grenzwerte\n- Ableitungen – Regeln, Kettenregel\n\n• Integrale  ");
    expect(lines).toEqual(["Grenzwerte", "Ableitungen – Regeln, Kettenregel", "Integrale"]);
    const topics = manualTopics(lines, makeId);
    expect(topics[1]).toMatchObject({ name: "Ableitungen", description: "Regeln, Kettenregel", estimatedMinutes: 60 });
  });
});

describe("Prompts für den Lernplan", () => {
  it("übergibt vorgegebene Themen wörtlich", () => {
    const text = buildTopicInstruction({
      examDateLabel: "Montag, 7. Dezember 2026",
      daysUntilExam: 29,
      availableMinutes: 1800,
      focus: "",
      givenTopics: ["Grenzwerte", "Integrale"],
      hasMaterials: true,
    });
    expect(text).toContain("in 29 Tagen");
    expect(text).toContain("30 Stunden");
    expect(text).toContain("1. Grenzwerte\n2. Integrale");
    expect(text).toContain("füge keine hinzu");
  });

  it("verlangt bei Plan-Tests die exakten Themennamen", () => {
    const text = buildTaskInstruction({
      mode: "generated",
      questionCount: 5,
      difficulty: "mixed",
      allowedTypes: ["single_choice"],
      focus: "",
      exactFormat: "original",
      topicNames: ["Grenzwerte", "Integrale"],
    });
    expect(text).toContain("„Grenzwerte“, „Integrale“");
  });
});
