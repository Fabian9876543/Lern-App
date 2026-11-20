import fontkit from "@pdf-lib/fontkit";

/**
 * Schriften der PDF-Ausgabe. Dieselben Dateien setzen den Lernzettel vorher im
 * Browser (als FontFace) und landen danach eingebettet im PDF – so stimmen
 * Zeilenumbrüche und Positionen überein.
 */

export const FAMILY_SANS = "LernPdfSans";
export const FAMILY_SYM = "LernPdfSym";
export const FAMILY_MONO = "LernPdfMono";

export const APP_FONTS = ["sans", "sans-bold", "sans-italic", "sans-bolditalic", "sym", "mono", "mono-bold"] as const;
export type AppFontId = (typeof APP_FONTS)[number];

/** KaTeX-Schriften (Dateiname ohne Endung, z. B. „KaTeX_Main-Regular“). */
export const KATEX_FONTS = [
  "KaTeX_AMS-Regular",
  "KaTeX_Caligraphic-Bold",
  "KaTeX_Caligraphic-Regular",
  "KaTeX_Fraktur-Bold",
  "KaTeX_Fraktur-Regular",
  "KaTeX_Main-Bold",
  "KaTeX_Main-BoldItalic",
  "KaTeX_Main-Italic",
  "KaTeX_Main-Regular",
  "KaTeX_Math-BoldItalic",
  "KaTeX_Math-Italic",
  "KaTeX_SansSerif-Bold",
  "KaTeX_SansSerif-Italic",
  "KaTeX_SansSerif-Regular",
  "KaTeX_Script-Regular",
  "KaTeX_Size1-Regular",
  "KaTeX_Size2-Regular",
  "KaTeX_Size3-Regular",
  "KaTeX_Size4-Regular",
  "KaTeX_Typewriter-Regular",
] as const;
export type KatexFontId = (typeof KATEX_FONTS)[number];

export type FontId = AppFontId | KatexFontId;
export type FontBytes = Partial<Record<FontId, Uint8Array>>;

/** Fett ab Gewicht 600 – es gibt nur 400 und 700, und so wählt auch der Browser. */
export const isBold = (weight: string | number) => Number(weight) > 500 || weight === "bold" || weight === "bolder";
export const isItalic = (style: string) => style.startsWith("italic") || style.startsWith("oblique");

/** Welche Datei der Browser für diese CSS-Schrift nimmt (null: keine eigene Schrift). */
export function faceFor(family: string, bold: boolean, italic: boolean): FontId | null {
  switch (family) {
    case FAMILY_SANS:
      return bold ? (italic ? "sans-bolditalic" : "sans-bold") : italic ? "sans-italic" : "sans";
    case FAMILY_SYM:
      return "sym";
    case FAMILY_MONO:
      return bold ? "mono-bold" : "mono";
  }
  if (!family.startsWith("KaTeX_")) return null;
  const variants = KATEX_FONTS.filter((f) => f.startsWith(`${family}-`));
  if (!variants.length) return null;
  const wanted = bold && italic ? "BoldItalic" : bold ? "Bold" : italic ? "Italic" : "Regular";
  const order = [wanted, ...(italic ? ["Italic", "BoldItalic"] : []), ...(bold ? ["Bold"] : []), "Regular", "Italic"];
  for (const v of order) {
    const hit = variants.find((f) => f === `${family}-${v}`);
    if (hit) return hit;
  }
  return variants[0];
}

/** CSS-font-family-Liste zerlegen: `"KaTeX_Main", LernPdfSans` → ["KaTeX_Main", "LernPdfSans"]. */
export function parseFamilies(css: string): string[] {
  return css
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Reihenfolge der Schriften, in der nach einem Zeichen gesucht wird – wie im Browser. */
export function fontChain(familyCss: string, weight: string | number, style: string): FontId[] {
  const bold = isBold(weight);
  const italic = isItalic(style);
  const chain: FontId[] = [];
  for (const family of parseFamilies(familyCss)) {
    const id = faceFor(family, bold, italic);
    if (id && !chain.includes(id)) chain.push(id);
  }
  // Sicherheitsnetz: Text in fremden Schriften landet in unserer Sans und den Symbolen.
  for (const id of [faceFor(FAMILY_SANS, bold, italic)!, "sym" as const]) if (!chain.includes(id)) chain.push(id);
  return chain;
}

/** Ersatz für Zeichen (meist Emoji), die keine der Schriften hat. */
const REPLACEMENTS: Record<string, string> = {
  "✅": "✔",
  "❌": "✘",
  "❎": "✘",
  "⭐": "★",
  "🌟": "★",
  "❗": "!",
  "❕": "!",
  "❓": "?",
  "❔": "?",
  "🔴": "●",
  "🟠": "●",
  "🟡": "●",
  "🟢": "●",
  "🔵": "●",
  "🔹": "◆",
  "🔸": "◆",
  "🔷": "◆",
  "🔶": "◆",
  "👉": "→",
  "➡": "→",
  "⬅": "←",
  "⬆": "↑",
  "⬇": "↓",
  "➕": "+",
  "➖": "−",
  "✖": "×",
  "➗": "÷",
};

/** Unsichtbare Zeichen, die im PDF nur stören würden. */
const INVISIBLE = /^[\u00AD\u200B-\u200F\u2060\uFE0E\uFE0F\uFEFF]$/;

/** Schnell nachsehen, welche Schrift welches Zeichen hat. */
export class FontCoverage {
  private fonts = new Map<FontId, { hasGlyphForCodePoint(cp: number): boolean }>();
  private cache = new Map<string, FontId | null>();

  constructor(bytes: FontBytes) {
    for (const [id, data] of Object.entries(bytes) as [FontId, Uint8Array][]) {
      this.fonts.set(id, fontkit.create(data as never) as never);
    }
  }

  has(id: FontId, cp: number): boolean {
    return this.fonts.get(id)?.hasGlyphForCodePoint(cp) ?? false;
  }

  /** Erste Schrift der Kette, die das Zeichen hat. */
  pick(chain: FontId[], cp: number): FontId | null {
    const key = `${chain.join("|")}:${cp}`;
    let hit = this.cache.get(key);
    if (hit === undefined) {
      hit = chain.find((id) => this.has(id, cp)) ?? null;
      this.cache.set(key, hit);
    }
    return hit;
  }

  /**
   * Text so umbauen, dass jede Schrift-Kette ihn darstellen kann: Emoji durch
   * ähnliche Zeichen ersetzen, Unbekanntes weglassen.
   */
  sanitize(text: string, chain: FontId[]): string {
    let out = "";
    for (const ch of text.normalize("NFC")) {
      if (INVISIBLE.test(ch)) continue;
      if (/\s/.test(ch) || this.pick(chain, ch.codePointAt(0)!)) {
        out += ch;
        continue;
      }
      const replacement = REPLACEMENTS[ch];
      if (replacement && [...replacement].every((c) => this.pick(chain, c.codePointAt(0)!))) out += replacement;
    }
    return out;
  }

  /** Text in Abschnitte gleicher Schrift teilen. */
  runs(text: string, chain: FontId[]): { text: string; font: FontId }[] {
    const runs: { text: string; font: FontId }[] = [];
    for (const ch of text) {
      const font = this.pick(chain, ch.codePointAt(0)!);
      if (!font) continue;
      const last = runs[runs.length - 1];
      if (last && last.font === font) last.text += ch;
      else runs.push({ text: ch, font });
    }
    return runs;
  }
}
