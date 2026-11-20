import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  APP_FONTS,
  FontCoverage,
  KATEX_FONTS,
  faceFor,
  fontChain,
  parseFamilies,
  type FontBytes,
  type FontId,
} from "../src/lib/pdfExport/fonts";
import { CONTENT_HEIGHT_PX, paintPdf } from "../src/lib/pdfExport/paint";
import { mergeSpans, paginate } from "../src/lib/pdfExport/paginate";
import type { Item, Layout, Span, TextItem } from "../src/lib/pdfExport/types";

const APP_FILES: Record<(typeof APP_FONTS)[number], string> = {
  sans: "sans-regular",
  "sans-bold": "sans-bold",
  "sans-italic": "sans-italic",
  "sans-bolditalic": "sans-bolditalic",
  sym: "sym-regular",
  mono: "mono-regular",
  "mono-bold": "mono-bold",
};
function loadFonts(): FontBytes {
  const out: FontBytes = {};
  for (const id of APP_FONTS) out[id] = new Uint8Array(readFileSync(`src/assets/pdf-fonts/${APP_FILES[id]}.ttf`));
  for (const id of KATEX_FONTS) out[id] = new Uint8Array(readFileSync(`node_modules/katex/dist/fonts/${id}.ttf`));
  return out;
}
const fonts = loadFonts();
const coverage = new FontCoverage(fonts);

describe("Schriftwahl", () => {
  it("ordnet CSS-Schriften den eingebetteten Dateien zu – so wie der Browser", () => {
    expect(faceFor("LernPdfSans", true, false)).toBe("sans-bold");
    expect(faceFor("LernPdfSans", false, true)).toBe("sans-italic");
    expect(faceFor("LernPdfMono", true, true)).toBe("mono-bold");
    expect(faceFor("KaTeX_Main", false, false)).toBe("KaTeX_Main-Regular");
    expect(faceFor("KaTeX_Main", true, true)).toBe("KaTeX_Main-BoldItalic");
    // KaTeX_Math gibt es nur kursiv
    expect(faceFor("KaTeX_Math", false, false)).toBe("KaTeX_Math-Italic");
    expect(faceFor("KaTeX_Size3", true, false)).toBe("KaTeX_Size3-Regular");
    expect(faceFor("Times New Roman", false, false)).toBeNull();
  });

  it("baut die Suchreihenfolge aus font-family, Gewicht und Stil", () => {
    expect(parseFamilies(`"KaTeX_Main", LernPdfSans, 'LernPdfSym'`)).toEqual(["KaTeX_Main", "LernPdfSans", "LernPdfSym"]);
    expect(fontChain("KaTeX_Math, LernPdfSans, LernPdfSym", "400", "italic")).toEqual(["KaTeX_Math-Italic", "sans-italic", "sym"]);
    // 500 bleibt normal, 600 wird fett (es gibt nur 400 und 700)
    expect(fontChain("LernPdfSans, LernPdfSym", "500", "normal")).toEqual(["sans", "sym"]);
    expect(fontChain("LernPdfSans, LernPdfSym", "600", "normal")).toEqual(["sans-bold", "sym"]);
    // Fremde Schriften fallen auf unsere zurück
    expect(fontChain("system-ui, Arial", "400", "normal")).toEqual(["sans", "sym"]);
  });

  it("ersetzt Emoji durch ähnliche Zeichen und lässt Unbekanntes weg", () => {
    const chain: FontId[] = ["sans", "sym"];
    expect(coverage.sanitize("✅ richtig ❌ falsch ⚠️ Achtung 💡 Tipp", chain)).toBe("✔ richtig ✘ falsch ⚠ Achtung  Tipp");
    expect(coverage.sanitize("Grüße, Maße – „Zitat“ → ≤ ½ € ☐", chain)).toBe("Grüße, Maße – „Zitat“ → ≤ ½ € ☐");
    // zerlegte Umlaute werden zusammengesetzt, weiche Trennstriche entfernt
    expect(coverage.sanitize("Grüße Ab­schreibung", chain)).toBe("Grüße Abschreibung");
  });

  it("teilt Text nach Schrift auf (fehlende Zeichen aus den Symbolen)", () => {
    expect(coverage.runs("a→b☐", ["sans", "sym"])).toEqual([
      { text: "a→b", font: "sans" },
      { text: "☐", font: "sym" },
    ]);
  });
});

describe("Schriftdateien", () => {
  const all = Object.entries(fonts) as [FontId, Uint8Array][];

  it("alle Glyphen beginnen an geraden Positionen (sonst gehen sie beim Einbetten kaputt)", () => {
    for (const [id, bytes] of all) {
      const font = fontkit.create(bytes as never) as unknown as { loca: { offsets: number[] } };
      const odd = font.loca.offsets.filter((o) => o % 2 !== 0);
      expect(odd, id).toEqual([]);
    }
  });

  it("Glyphen überstehen die Teilmengen-Bildung beim Einbetten unverändert", async () => {
    const samples: Partial<Record<FontId, string>> = {
      sans: "Abschreibung äöüß €→≤",
      "sans-bold": "Überblick 2.000 €",
      sym: "☐☑✔✘◆★",
      mono: "Konto 0440 → €",
      "KaTeX_Main-Regular": "AfA=+−()",
      "KaTeX_Math-Italic": "xyBpn",
    };
    for (const [id, text] of Object.entries(samples) as [FontId, string][]) {
      const font = fontkit.create(fonts[id] as never) as never as {
        glyphForCodePoint(cp: number): { id: number; path: { commands: unknown[] } };
        createSubset(): { includeGlyph(g: unknown): number; encodeStream(): NodeJS.ReadableStream };
      };
      const subset = font.createSubset();
      const pairs = [...text].map((ch) => {
        const g = font.glyphForCodePoint(ch.codePointAt(0)!);
        return { ch, src: g, sub: subset.includeGlyph(g) };
      });
      const bytes = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = subset.encodeStream();
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
      });
      const out = fontkit.create(bytes as never) as never as { getGlyph(id: number): { path: { commands: unknown[] } } };
      for (const p of pairs) {
        expect(out.getGlyph(p.sub).path.commands.length, `${id} ${p.ch}`).toBe(p.src.path.commands.length);
      }
    }
  });
});

const line = (top: number, h = 20): TextItem => ({
  kind: "text",
  x: 0,
  baseline: top + h * 0.8,
  top,
  bottom: top + h,
  size: 14,
  color: [0, 0, 0],
  runs: [{ text: "Text", font: "sans" }],
});
function layoutOf(lines: number[], extra: Partial<Layout> = {}, items: Item[] = []): Layout {
  const its = [...lines.map((t) => line(t)), ...items];
  const hard: Span[] = lines.map((t) => ({ top: t, bottom: t + 20 }));
  return { width: 600, height: Math.max(...lines) + 20, items: its, hard, soft: [], ...extra };
}

describe("Seitenaufteilung", () => {
  it("fasst nur überlappende Bereiche zusammen", () => {
    expect(mergeSpans([{ top: 0, bottom: 10 }, { top: 10, bottom: 20 }, { top: 15, bottom: 30 }])).toEqual([
      { top: 0, bottom: 10 },
      { top: 10, bottom: 30 },
    ]);
  });

  it("bricht nur zwischen Zeilen um", () => {
    const lines = Array.from({ length: 100 }, (_, i) => i * 30);
    const pages = paginate(layoutOf(lines), 1000);
    expect(pages.length).toBeGreaterThan(2);
    for (const p of pages) {
      for (const t of lines) {
        const inside = t < p.end && t + 20 > p.start;
        if (inside) expect(t >= p.start - 0.5 && t + 20 <= p.end + 0.5, `Zeile ${t} auf Seite ${p.start}–${p.end}`).toBe(true);
      }
      expect(p.end - p.start).toBeLessThanOrEqual(1000);
    }
    expect(pages[pages.length - 1].end).toBe(lines[lines.length - 1] + 20);
  });

  it("hält weiche Bereiche zusammen (z. B. Überschrift + erste Zeile), wenn die Seite halb voll ist", () => {
    const lines = Array.from({ length: 40 }, (_, i) => i * 30);
    // Überschrift bei 840 soll mit den nächsten Zeilen (bis 920) zusammenbleiben; die Seite endet bei 900
    const pages = paginate(layoutOf(lines, { soft: [{ top: 840, bottom: 920 }] }), 900);
    expect(pages[0].end).toBeLessThanOrEqual(840);
    expect(pages[1].start).toBe(840);
  });

  it("zerschneidet notfalls ein Teil, das höher als eine Seite ist", () => {
    const layout: Layout = { width: 600, height: 2500, items: [], hard: [{ top: 0, bottom: 2500 }], soft: [] };
    const pages = paginate(layout, 1000);
    expect(pages.map((p) => [p.start, p.end])).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 2500],
    ]);
  });

  it("nimmt Hintergründe, die in der Lücke beginnen, ganz auf die neue Seite", () => {
    // Code-Block beginnt bei 955 (Hintergrund), erste Code-Zeile bei 965
    const lines = [...Array.from({ length: 32 }, (_, i) => i * 30), 965, 995, 1025];
    const box: Item = { kind: "rect", box: { x: 0, y: 955, w: 600, h: 100 }, color: [0.9, 0.9, 0.9] };
    const pages = paginate(layoutOf(lines, { soft: [{ top: 955, bottom: 1055 }] }, [box]), 1000);
    expect(pages[1].start).toBe(955);
  });

  it("wiederholt den Tabellenkopf auf Folgeseiten und rechnet ihn ein", () => {
    const lines = Array.from({ length: 60 }, (_, i) => 100 + i * 30);
    const layout = layoutOf(lines, { tables: [{ top: 100, head: 130, bottom: 100 + 60 * 30 }] });
    const pages = paginate(layout, 1000);
    expect(pages[0].header).toBeUndefined();
    expect(pages[1].header).toEqual({ top: 100, bottom: 130 });
    expect(pages[1].end - pages[1].start).toBeLessThanOrEqual(1000 - 30);
  });
});

describe("PDF zeichnen", () => {
  it("erstellt ein A4-PDF mit eingebetteten Teilschriften, Fußzeile und Metadaten", async () => {
    const items: Item[] = [
      { ...line(0), runs: [{ text: "Abschreibung ", font: "sans-bold" }, { text: "☐", font: "sym" }] },
      { ...line(30), runs: [{ text: "x", font: "KaTeX_Math-Italic" }, { text: "=1", font: "KaTeX_Main-Regular" }] },
      { kind: "rect", box: { x: 0, y: 60, w: 300, h: 40 }, color: [0.95, 0.95, 0.97], radius: [6, 6, 6, 6] },
      { kind: "frame", box: { x: 0, y: 110, w: 300, h: 40 }, color: [0.3, 0.3, 0.9], width: 1, radius: [4, 4, 4, 4] },
      {
        kind: "path",
        d: "M0,0 L100,0 L100,10 Z",
        matrix: [1, 0, 0, 1, 10, 160],
        fill: [0, 0, 0],
        clip: { x: 0, y: 160, w: 50, h: 10 },
        top: 160,
        bottom: 170,
      },
      ...Array.from({ length: 60 }, (_, i) => line(200 + i * 30)),
    ];
    const layout: Layout = {
      width: 660,
      height: 200 + 60 * 30,
      items,
      hard: items.filter((i): i is TextItem => i.kind === "text").map((t) => ({ top: t.top, bottom: t.bottom })),
      soft: [],
    };
    const bytes = await paintPdf(layout, fonts, { title: "Abschreibungen ✅", footer: "Lernzettel: Abschreibungen ✅" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(paginate(layout, CONTENT_HEIGHT_PX).length);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("Abschreibungen ✅");
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    // nur die benutzten Zeichen sind eingebettet → klein
    expect(bytes.length).toBeLessThan(80_000);

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true }).promise;
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join("");
    expect(text).toContain("Abschreibung");
    expect(text).toContain("☐");
    expect(text).toContain("Seite 1 von");
    expect(text).toContain("Lernzettel: Abschreibungen ✔");
  });
});

describe("Lernzettel-Text", () => {
  it("lässt eine Überschrift weg, die genau dem Titel entspricht", async () => {
    const { withoutLeadingTitle } = await import("../src/components/NoteDownloads");
    expect(withoutLeadingTitle("# Abschreibungen\n\n## Überblick\nText", "Abschreibungen")).toBe("## Überblick\nText");
    expect(withoutLeadingTitle("# **Abschreibungen**\nText", "abschreibungen")).toBe("Text");
    expect(withoutLeadingTitle("# Etwas anderes\nText", "Abschreibungen")).toBe("# Etwas anderes\nText");
    expect(withoutLeadingTitle("## Überblick\nText", "Überblick")).toBe("## Überblick\nText");
  });
});
