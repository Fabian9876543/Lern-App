import { describe, expect, it } from "vitest";
import { MATERIAL_NOTE_SYSTEM_PROMPT, buildMaterialNoteInstruction, splitNoteTitle } from "../src/ai/prompts";

describe("Lernzettel aus Material", () => {
  it("fasst ohne Schwerpunkt den ganzen Stoff zusammen", () => {
    const text = buildMaterialNoteInstruction({ subjectName: "Rechnungswesen", focus: " ", length: "normal" });
    expect(text).toContain("Fach: „Rechnungswesen“");
    expect(text).toContain("Fasse den gesamten Stoff des Materials zusammen.");
    expect(text).toContain("800 bis 1500 Wörter");
  });

  it("beschränkt sich mit Schwerpunkt auf das Thema und richtet sich nach dem Umfang", () => {
    const kurz = buildMaterialNoteInstruction({ subjectName: "ReWe", focus: "Abschreibungen", length: "kurz" });
    expect(kurz).toContain("Schwerpunkt: Abschreibungen.");
    expect(kurz).toContain("Spickzettel");
    expect(buildMaterialNoteInstruction({ subjectName: "ReWe", focus: "", length: "ausfuehrlich" })).toContain("3000 Wörter");
  });

  it("verlangt Titel, Fundstellen und Selbstcheck", () => {
    expect(MATERIAL_NOTE_SYSTEM_PROMPT).toContain("Erste Zeile: „# “");
    expect(MATERIAL_NOTE_SYSTEM_PROMPT).toContain("Fundstelle");
    expect(MATERIAL_NOTE_SYSTEM_PROMPT).toContain("## Lösungen zum Selbstcheck");
  });

  it("trennt den Titel ab", () => {
    expect(splitNoteTitle("# **Abschreibungen**\n\n## Überblick\nText")).toEqual({ title: "Abschreibungen", body: "## Überblick\nText" });
    expect(splitNoteTitle("```markdown\n# Bilanz\n## Überblick\n```")).toEqual({ title: "Bilanz", body: "## Überblick" });
    expect(splitNoteTitle("## Überblick\nText")).toEqual({ title: null, body: "## Überblick\nText" });
  });
});
