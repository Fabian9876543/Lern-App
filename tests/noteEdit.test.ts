import { describe, expect, it } from "vitest";
import { coerceNoteFix } from "../src/ai/coerce";
import { NOTE_FIX_SYSTEM_PROMPT, buildNoteFixTask } from "../src/ai/prompts";
import { applyFix, clearDraft, findInSource, loadDraft, saveDraft } from "../src/lib/noteEdit";

const SOURCE = `## Überblick
Abschreibungen verteilen die **Anschaffungskosten** auf die Nutzungsdauer (Skript S. 14).

## Formel
$$\\text{AfA} = \\frac{A}{n}$$

- Der Restbuchwert sinkt um $a$ pro Jahr.
- Der Restbuchwert sinkt um $a$ pro Jahr.`;

describe("Stelle im Markdown wiederfinden", () => {
  it("wörtlich", () => {
    const at = findInSource(SOURCE, "auf die Nutzungsdauer")!;
    expect(SOURCE.slice(at.start, at.end)).toBe("auf die Nutzungsdauer");
  });

  it("über Formatierung hinweg (fett, Satzzeichen)", () => {
    const at = findInSource(SOURCE, "verteilen die Anschaffungskosten auf")!;
    expect(SOURCE.slice(at.start, at.end)).toBe("verteilen die **Anschaffungskosten** auf");
  });

  it("über Zeilen und Listenzeichen hinweg, mit Formeln", () => {
    const at = findInSource(SOURCE, "Skript S. 14). Formel")!;
    expect(SOURCE.slice(at.start, at.end)).toContain("Skript S. 14).\n\n## Formel");
    const tex = findInSource(SOURCE, "$$\\text{AfA} = \\frac{A}{n}$$")!;
    expect(SOURCE.slice(tex.start, tex.end)).toBe("$$\\text{AfA} = \\frac{A}{n}$$");
  });

  it("null, wenn es die Stelle nicht gibt", () => {
    expect(findInSource(SOURCE, "Degressive Abschreibung")).toBeNull();
    expect(findInSource(SOURCE, "   ")).toBeNull();
  });
});

describe("Korrektur einsetzen", () => {
  it("ersetzt den Ausschnitt", () => {
    const out = applyFix(SOURCE, "(Skript S. 14)", "(Skript S. 16)")!;
    expect(out).toContain("Nutzungsdauer (Skript S. 16).");
    expect(out).not.toContain("S. 14");
  });

  it("bei mehrfachem Vorkommen die Stelle nahe der Markierung", () => {
    const second = SOURCE.lastIndexOf("- Der Restbuchwert");
    const out = applyFix(SOURCE, "- Der Restbuchwert sinkt um $a$ pro Jahr.", "- Der Restbuchwert sinkt jedes Jahr um $a$.", second)!;
    expect(out.endsWith("- Der Restbuchwert sinkt jedes Jahr um $a$.")).toBe(true);
    expect(out).toContain("- Der Restbuchwert sinkt um $a$ pro Jahr.\n- Der Restbuchwert sinkt jedes Jahr um $a$.");
  });

  it("Leerraum darf abweichen", () => {
    const out = applyFix(SOURCE, "verteilen  die\n**Anschaffungskosten**", "verteilen die **Kosten**")!;
    expect(out).toContain("verteilen die **Kosten** auf");
  });

  it("null, wenn der Ausschnitt nicht vorkommt oder leer ist", () => {
    expect(applyFix(SOURCE, "gibt es nicht", "x")).toBeNull();
    expect(applyFix(SOURCE, "  ", "x")).toBeNull();
  });
});

describe("Entwurf", () => {
  it("speichert und löscht (auch ohne localStorage)", () => {
    expect(loadDraft("n1")).toBeNull();
    saveDraft("n1", "Neu");
    expect(loadDraft("n1")).toBe("Neu");
    clearDraft("n1");
    expect(loadDraft("n1")).toBeNull();
  });
});

describe("Korrekturvorschlag von Claude", () => {
  it("Prompt: so wenig wie möglich ändern, Ausschnitt zeichengenau", () => {
    expect(NOTE_FIX_SYSTEM_PROMPT).toContain("Ändere so wenig wie möglich");
    expect(NOTE_FIX_SYSTEM_PROMPT).toContain("Zeichen für Zeichen kopiert");
    const task = buildNoteFixTask({
      subjectName: "ReWe",
      noteTitle: "AfA",
      noteContent: SOURCE,
      quote: "Skript S. 14",
      request: "Es ist S. 16",
      history: [{ role: "assistant", content: "Erklärung" }],
    });
    expect(task).toContain("<markiert>\nSkript S. 14\n</markiert>");
    expect(task).toContain("Was laut der lernenden Person falsch ist: Es ist S. 16");
    expect(task).toContain("Claude: Erklärung");
  });

  it("liest die Antwort tolerant", () => {
    expect(coerceNoteFix({ old: "a", replacement: "b", reason: " weil " })).toEqual({ old: "a", new: "b", reason: "weil" });
    expect(coerceNoteFix(null)).toEqual({ old: "", new: "", reason: "" });
  });
});
