import { describe, expect, it } from "vitest";
import { byteLength, headOf, makeExcerpt, splitBlocks, terms, wrapMaterial, type SourceMaterial } from "../src/lib/excerpt";

const page = (n: number, topic: string, size = 2500) =>
  `--- Seite ${n} ---\n${topic}: ${"Erläuterung mit Beispielen und Rechnungen. ".repeat(Math.ceil(size / 44))}`.slice(0, size);

const skript: SourceMaterial = {
  label: "Material 1: „Skript“",
  role: "reference",
  body: Array.from({ length: 40 }, (_, i) => page(i + 1, i >= 20 && i < 24 ? "Abschreibungen linear und degressiv" : `Kapitel ${i + 1} Bilanz`)).join("\n\n"),
};
const aufgaben: SourceMaterial = {
  label: "Material 2: „Aufgaben“",
  role: "tasks",
  body: Array.from({ length: 20 }, (_, i) => page(i + 1, `Aufgabe ${i + 1}`)).join("\n\n"),
};
const loesungen: SourceMaterial = {
  label: "Material 3: „Lösungen“",
  role: "solutions",
  body: Array.from({ length: 20 }, (_, i) => page(i + 1, `Lösung ${i + 1}`)).join("\n\n"),
};
const all = [skript, aufgaben, loesungen];
const size = (e: { parts: { label: string; body: string }[] }) =>
  e.parts.reduce((s, p) => s + byteLength(wrapMaterial(p.label, p.body)) + 2, 0);

describe("Abschnitte", () => {
  it("teilt an Seitenmarkierungen und sonst in Absatzgruppen", () => {
    expect(splitBlocks(skript.body).map((b) => b.page).slice(0, 3)).toEqual([1, 2, 3]);
    const text = Array.from({ length: 10 }, (_, i) => `Absatz ${i} ${"x".repeat(900)}`).join("\n\n");
    const blocks = splitBlocks(text, 3000);
    expect(blocks.length).toBeGreaterThan(2);
    expect(blocks.every((b) => b.text.length <= 6000)).toBe(true);
    expect(blocks.map((b) => b.text).join("\n\n")).toBe(text);
  });

  it("kürzt an Wortgrenzen", () => {
    expect(headOf("eins zwei drei vier", 9)).toBe("eins zwei");
    expect(headOf("eins zwei drei vier", 8)).toBe("eins");
    expect(byteLength(headOf("ä".repeat(100), 51))).toBeLessThanOrEqual(51);
  });

  it("vergleicht Wortstämme ohne Umlautunterschiede und Füllwörter", () => {
    expect(terms("Die Abschreibungen über Prüfungen")).toEqual(["abschr", "prufun"]);
  });
});

describe("Auszug", () => {
  it("lässt alles unverändert, wenn es passt", () => {
    const e = makeExcerpt(all, 1_000_000, { kind: "coverage" });
    expect(e.note).toBeNull();
    expect(e.parts[0].body).toBe(skript.body);
  });

  for (const strategy of [
    { kind: "coverage" as const },
    { kind: "prefix" as const },
    { kind: "relevance" as const, query: "Abschreibungen" },
    { kind: "sample" as const, seed: 7 },
  ]) {
    it(`bleibt im Budget (${strategy.kind})`, () => {
      const e = makeExcerpt(all, 60_000, strategy);
      expect(size(e)).toBeLessThanOrEqual(60_000);
      expect(e.share).toBeGreaterThan(0.2);
      expect(e.share).toBeLessThan(0.5);
      expect(e.note).toMatch(/Auszug von etwa \d+ %/);
      expect(e.parts).toHaveLength(3);
    });
  }

  it("coverage: jede Seite kommt mit ihrem Anfang vor", () => {
    const e = makeExcerpt(all, 60_000, { kind: "coverage" });
    for (let n = 1; n <= 40; n++) expect(e.parts[0].body).toContain(`--- Seite ${n} ---`);
    expect(e.parts[0].body).toContain("[…]");
  });

  it("prefix: Aufgaben und Lösungen decken dieselben Seiten ab", () => {
    const e = makeExcerpt(all, 60_000, { kind: "prefix" });
    const pages = (body: string) => [...body.matchAll(/--- Seite (\d+) ---/g)].map((m) => Number(m[1]));
    expect(pages(e.parts[1].body)).toEqual(pages(e.parts[2].body));
    expect(pages(e.parts[1].body)[0]).toBe(1);
  });

  it("relevance: nimmt die passenden Seiten", () => {
    const e = makeExcerpt(all, 30_000, { kind: "relevance", query: "Übungstest zum Thema „Abschreibungen“" });
    for (const n of [21, 22, 23, 24]) expect(e.parts[0].body).toContain(`--- Seite ${n} ---\nAbschreibungen`);
  });

  it("sample: verteilt über alle Dateien und variiert mit dem Startwert", () => {
    const a = makeExcerpt(all, 40_000, { kind: "sample", seed: 1 });
    const b = makeExcerpt(all, 40_000, { kind: "sample", seed: 2 });
    for (const p of a.parts) expect(p.body).toMatch(/--- Seite/);
    expect(a.parts[0].body).not.toBe(b.parts[0].body);
    expect(makeExcerpt(all, 40_000, { kind: "sample", seed: 1 }).parts[0].body).toBe(a.parts[0].body);
  });

  it("behält Verweise auf beigefügte Bilder immer", () => {
    const withImage: SourceMaterial = { label: "Scan", role: "tasks", body: "--- Seite 1 ---\n[eingescannte Seite: Bild 1 – siehe beigefügte Bilder]" };
    const e = makeExcerpt([skript, withImage], 20_000, { kind: "relevance", query: "Abschreibungen" });
    expect(e.parts[1].body).toContain("Bild 1 – siehe beigefügte Bilder");
  });
});
