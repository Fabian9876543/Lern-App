import { describe, expect, it } from "vitest";
import * as p from "../src/ai/prompts";

describe("Buchungssätze übersichtlich", () => {
  it("die Regel steht in allen Prompts, die Text für Lernende schreiben", () => {
    for (const prompt of [
      p.GENERATION_SYSTEM_PROMPT,
      p.GENERATION_SYSTEM_PROMPT_NO_MATERIAL,
      p.STUDY_NOTE_SYSTEM_PROMPT,
      p.MATERIAL_NOTE_SYSTEM_PROMPT,
      p.explainSystemPrompt({ webSearch: false }),
    ]) {
      expect(prompt).toContain(p.ACCOUNTING_RULES);
    }
    expect(p.GRADING_SYSTEM_PROMPT).toContain("Kontonummer mit Kontonamen");
    expect(p.ACCOUNTING_RULES).toContain("| Konto | Soll | Haben |\n|---|---:|---:|");
    expect(p.ACCOUNTING_RULES).toContain("11.900,00 €");
  });
});
