import { describe, expect, it } from "vitest";
import { coerceMaterialName } from "../src/ai/coerce";
import { cleanSuggestedName, fallbackName, isMeaninglessName, splitMaterials } from "../src/lib/materialNames";
import type { Material, Test } from "../src/types";

describe("isMeaninglessName", () => {
  it.each([
    "IMG_20261112_140512.jpg",
    "PXL_20261112_140512123.jpg",
    "Scan 3.pdf",
    "Scan_2026-11-12.pdf",
    "Dokument (1).pdf",
    "document.pdf",
    "Screenshot 2026-11-12 at 14.05.33.png",
    "Bildschirmfoto 2026-11-12 um 14.05.33.png",
    "WhatsApp Image 2026-11-12 at 14.05.33.jpeg",
    "CamScanner 12-11-2026 14.05.pdf",
    "image.png",
    "Foto 12. Nov. 2026.jpg",
    "123.pdf",
    "3f2a9c1e-77b0-4c1d-9a55-2c0e6a1d9f00.pdf",
    "Eingefügter Text",
    "Unbenannt.txt",
  ])("%s ist nichtssagend", (name) => {
    expect(isMeaninglessName(name)).toBe(true);
  });

  it.each([
    "Blatt1_Aufgaben.pdf",
    "Analysis Skript.pdf",
    "Scan Altklausur WS24.pdf",
    "Lösungen Blatt 3.pdf",
    "Kapitel 4 Ableitungen.txt",
    "Biochemie Zusammenfassung.md",
  ])("%s ist aussagekräftig", (name) => {
    expect(isMeaninglessName(name)).toBe(false);
  });
});

describe("Namen aufräumen", () => {
  it("entfernt Anführungszeichen, Endungen und unzulässige Zeichen", () => {
    expect(cleanSuggestedName("„Übungsblatt 3 – Integralrechnung.pdf“")).toBe("Übungsblatt 3 – Integralrechnung");
    expect(cleanSuggestedName('  "Lösungen  zu Blatt 3/4" ')).toBe("Lösungen zu Blatt 3/4");
    expect(cleanSuggestedName("Altklausur WS 24/25 <final>")).toBe("Altklausur WS 24/25 -final-");
    expect(cleanSuggestedName("x".repeat(100))).toHaveLength(70);
  });

  it("findet ohne KI einen Ersatznamen", () => {
    const ts = new Date(2026, 10, 12).getTime();
    expect(fallbackName("pdf", "\n  1\nÜbungsblatt 5 – Reihen\nAufgabe 1", ts)).toBe("Übungsblatt 5 – Reihen");
    expect(fallbackName("image", undefined, ts)).toBe("Foto vom 12.11.2026");
    expect(fallbackName("pdf", "  ", ts)).toBe("Scan vom 12.11.2026");
  });

  it("liest Claudes Antwort tolerant", () => {
    expect(coerceMaterialName({ name: " Blatt 3 ", role: "solutions" })).toEqual({ name: "Blatt 3", role: "solutions" });
    expect(coerceMaterialName({ name: "Blatt 3", role: "quatsch" })).toEqual({ name: "Blatt 3", role: null });
    expect(coerceMaterialName({ role: "tasks" })).toBeNull();
  });
});

describe("splitMaterials", () => {
  const m = (id: string, createdAt = 0) => ({ id, subjectId: "s", createdAt }) as Material;
  const t = (id: string, materialIds: string[], planId?: string) => ({ id, materialIds, planId }) as Test;

  it("trennt neues von bereits in Tests verwendetem Material", () => {
    const result = splitMaterials([m("a", 1), m("b", 2), m("c", 3)], [t("t1", ["a"]), t("p1", ["b"], "plan")]);
    expect(result.fresh.map((x) => x.id)).toEqual(["b", "c"]);
    expect(result.used.map((u) => [u.material.id, u.tests.map((x) => x.id)])).toEqual([["a", ["t1"]]]);
  });
});
