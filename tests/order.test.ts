import { describe, expect, it } from "vitest";
import { orderQuestions } from "../src/ai/normalize";
import { MATERIAL_NOTE_SYSTEM_PROMPT, buildStudyNoteInstruction, buildTaskInstruction } from "../src/ai/prompts";
import type { Difficulty, GenerationSettings } from "../src/types";

const q = (id: string, topic: string, difficulty: Difficulty) => ({ id, topic, difficulty });
const ids = (qs: { id: string }[]) => qs.map((x) => x.id).join(" ");

describe("Roter Faden bei neuen Aufgaben", () => {
  it("gruppiert nach Themen (erstes Vorkommen) und sortiert je Thema von leicht nach schwer", () => {
    const out = orderQuestions([
      q("a1", "Bilanz", "hard"),
      q("b1", "GuV", "easy"),
      q("a2", "Bilanz", "easy"),
      q("c1", "Skonto", "medium"),
      q("a3", "bilanz ", "medium"),
      q("b2", "GuV", "easy"),
    ]);
    expect(ids(out)).toBe("a2 a3 a1 b1 b2 c1");
  });

  it("folgt der vorgegebenen Themenliste (Lernplan); unbekannte Themen danach", () => {
    const out = orderQuestions(
      [q("x", "Extra", "easy"), q("s", "Skonto", "easy"), q("b", "Bilanz", "hard"), q("g", "GuV", "medium")],
      ["Bilanz", "GuV", "Skonto"],
    );
    expect(ids(out)).toBe("b g s x");
  });

  it("Aufgaben aus späteren Teilen landen bei ihrem Thema", () => {
    const part1 = [q("1", "A", "easy"), q("2", "A", "medium"), q("3", "B", "easy")];
    const part2 = [q("4", "A", "hard"), q("5", "B", "medium"), q("6", "A", "easy")];
    expect(ids(orderQuestions([...part1, ...part2]))).toBe("1 6 2 4 3 5");
  });
});

describe("Prompts: Reihenfolge", () => {
  const settings: GenerationSettings = {
    mode: "generated",
    questionCount: 10,
    difficulty: "mixed",
    allowedTypes: ["free_text"],
    focus: "",
    exactFormat: "original",
  };

  it("neue Aufgaben: roter Faden, mit Themenliste in deren Reihenfolge", () => {
    expect(buildTaskInstruction(settings)).toContain("innerhalb eines Themas von leicht nach schwer");
    expect(buildTaskInstruction(settings, { hasMaterials: false })).toContain("Reihenfolge wie ein roter Faden");
    expect(buildTaskInstruction({ ...settings, topicNames: ["A", "B"] })).toContain("in der Reihenfolge der Themenliste");
  });

  it("Originalaufgaben bleiben in der Reihenfolge des Materials", () => {
    const exact = buildTaskInstruction({ ...settings, mode: "exact" });
    expect(exact).toContain("gleiche Reihenfolge");
    expect(exact).not.toContain("leicht nach schwer");
  });

  it("Lernzettel aus Material: Lernreihenfolge statt Dateireihenfolge", () => {
    expect(MATERIAL_NOTE_SYSTEM_PROMPT).toContain("nicht einfach in der Reihenfolge der Dateien");
    expect(MATERIAL_NOTE_SYSTEM_PROMPT).toContain("wie die Themen zusammenhängen");
  });

  it("Lernzettel im Lernplan kennt seinen Platz", () => {
    const text = buildStudyNoteInstruction({
      subjectName: "ReWe",
      topic: { name: "Skonto", description: "", sources: "" },
      planTopics: ["Bilanz", "GuV", "Skonto", "Abschreibungen"],
      minutes: 60,
      focus: "",
      hasMaterials: false,
    });
    expect(text).toContain("Dieses Thema ist Nr. 3.");
    expect(text).toContain("nimmst du nicht vorweg");
  });
});
