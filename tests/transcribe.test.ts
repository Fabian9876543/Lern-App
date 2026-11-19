import { describe, expect, it } from "vitest";
import { splitTranscript, transcribePrompt } from "../src/ai/prompts";
import { assembleTranscript, chooseForTranscription, inBatches, type Segment } from "../src/lib/transcribe";

describe("Abschreiben planen", () => {
  it("schreibt die bildreichsten Materialien ab, bis der Rest in eine Anfrage passt", () => {
    const items = [
      { id: "skript", images: 0 },
      { id: "fotos", images: 4 },
      { id: "scan", images: 30 },
      { id: "blatt", images: 2 },
    ];
    expect(chooseForTranscription(items, 20)).toEqual(["scan"]);
    expect(chooseForTranscription(items, 3)).toEqual(["scan", "fotos"]);
    expect(chooseForTranscription(items, 40)).toEqual([]);
  });

  it("teilt in Portionen", () => {
    expect(inBatches([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it("setzt Textseiten und abgeschriebene Seiten in Seitenreihenfolge zusammen", () => {
    const img = new Blob(["x"]);
    const segs: Segment[] = [
      { kind: "text", text: "Aufgabe 1", page: 1 },
      { kind: "image", image: img, page: 2 },
      { kind: "image", image: img, page: 3 },
    ];
    expect(assembleTranscript(segs, ["Aufgabe 2 (Handschrift)", ""])).toBe(
      "--- Seite 1 ---\nAufgabe 1\n\n--- Seite 2 ---\nAufgabe 2 (Handschrift)\n\n--- Seite 3 ---\n[nicht lesbar]",
    );
    expect(assembleTranscript([{ kind: "image", image: img }], ["Foto-Text"])).toBe("Foto-Text");
  });
});

describe("Abschrift aufteilen", () => {
  it("liest die Markierungen pro Bild", () => {
    const text = "=== Bild 1 ===\nSeite A\n\n=== Bild 2 ===\n| Soll | Haben |\n\n===  Bild 3  ===\n[leere Seite]";
    expect(splitTranscript(text, 3)).toEqual(["Seite A", "| Soll | Haben |", "[leere Seite]"]);
  });

  it("verträgt fehlende Markierungen", () => {
    expect(splitTranscript("Nur ein Text", 1)).toEqual(["Nur ein Text"]);
    expect(splitTranscript("=== Bild 2 ===\nB", 2)).toEqual(["", "B"]);
  });

  it("nennt Seitenzahlen und das Format im Prompt", () => {
    const p = transcribePrompt("Scan Kapitel 3.pdf", [4, 5]);
    expect(p).toContain("„Scan Kapitel 3.pdf“");
    expect(p).toContain("sind 2 Bilder (Seite 4, 5 des Dokuments)");
    expect(p).toContain("=== Bild k ===");
  });
});
