import type { MarkAnchor, MarkBasis, MarkLevel, NoteMark } from "../types";

/**
 * Markierungen im Lernzettel: Stellen, die man nicht mehr (genau) weiß.
 * Hier steht alles, was ohne Browser auskommt (und getestet wird): Stellen
 * wiederfinden, Claudes Antwort auswerten, Texte für Anzeige und Download.
 */

export const MARK_LEVELS: Record<MarkLevel, { label: string; short: string }> = {
  unsure: { label: "Bin unsicher", short: "Unsicher" },
  forgot: { label: "Weiß ich nicht mehr", short: "Weiß ich nicht mehr" },
};

/** Höchstlänge einer Markierung (Zeichen des angezeigten Textes) – etwa ein Absatz. */
export const MAX_MARK_LENGTH = 1500;

/** Höchstzahl an Nachrichten pro Markierung (Erklärungen und Nachfragen), damit der Lernzettel nicht zu groß wird. */
export const MAX_MARK_MESSAGES = 12;

const CONTEXT = 32;

/** Merkt sich eine Stelle samt etwas Text davor und danach (zum Unterscheiden gleicher Stellen). */
export function makeAnchor(text: string, start: number, end: number): MarkAnchor {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Findet eine gemerkte Stelle im Text wieder. Kommt sie mehrfach vor, gewinnt
 * die Fundstelle mit dem passendsten Text davor und danach. Hat sich nur der
 * Leerraum geändert, wird sie trotzdem gefunden; sonst null.
 */
export function locateAnchor(text: string, anchor: MarkAnchor): { start: number; end: number } | null {
  if (!anchor.exact.trim()) return null;
  const score = (start: number, end: number) =>
    commonSuffix(text.slice(Math.max(0, start - anchor.prefix.length), start), anchor.prefix) +
    commonPrefix(text.slice(end, end + anchor.suffix.length), anchor.suffix);

  let best: { start: number; end: number; score: number } | null = null;
  for (let i = text.indexOf(anchor.exact); i !== -1; i = text.indexOf(anchor.exact, i + 1)) {
    const s = score(i, i + anchor.exact.length);
    if (!best || s > best.score) best = { start: i, end: i + anchor.exact.length, score: s };
  }
  if (best) return { start: best.start, end: best.end };

  // Leerraum ignorieren: im Text ohne Leerraum suchen und zurückrechnen.
  const squashed: string[] = [];
  const index: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    squashed.push(text[i]);
    index.push(i);
  }
  const needle = anchor.exact.replace(/\s+/g, "");
  const hay = squashed.join("");
  let found: { start: number; end: number; score: number } | null = null;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const start = index[i];
    const end = index[i + needle.length - 1] + 1;
    const s = score(start, end);
    if (!found || s > found.score) found = { start, end, score: s };
  }
  return found ? { start: found.start, end: found.end } : null;
}

/** Ist dieselbe Stelle schon markiert? */
export function sameAnchor(a: MarkAnchor, b: MarkAnchor): boolean {
  return a.exact === b.exact && a.prefix === b.prefix && a.suffix === b.suffix;
}

// ---------- Claudes Antwort ----------

const BASIS_LINE = /^[ \t>*_]*GRUNDLAGE[ \t*_]*:(.*)$/gim;

/** Liest die Zeile „GRUNDLAGE: …“ am Ende einer Erklärung aus und entfernt sie aus dem Text. */
export function parseExplanation(raw: string): { content: string; basis: MarkBasis[] | undefined } {
  let text = raw.trim();
  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) text = fenced[1].trim();
  const matches = [...text.matchAll(BASIS_LINE)];
  const last = matches[matches.length - 1];
  let basis: MarkBasis[] | undefined;
  if (last) {
    const value = last[1].toLowerCase();
    const found: MarkBasis[] = [];
    if (/material/.test(value)) found.push("material");
    if (/wissen/.test(value)) found.push("wissen");
    if (/internet|web/.test(value)) found.push("internet");
    basis = found.length ? found : undefined;
    text = text.replace(BASIS_LINE, "");
  }
  text = text
    .replace(/\n\s*(?:---|\*\*\*)\s*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { content: text, basis };
}

/** Während Claude noch schreibt: eine angefangene Zeile „GRUNDLAGE: …“ nicht anzeigen. */
export function streamingText(text: string): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  const last = lines[lines.length - 1].replace(/[>*_\s]/g, "");
  if (last && (last.toUpperCase().startsWith("GRUNDLAGE") || ("GRUNDLAGE:".startsWith(last) && last.length >= 2))) {
    lines.pop();
  }
  return lines.join("\n").replace(/\n\s*(?:---|\*\*\*)\s*$/, "").trim();
}

export type BasisTone = "material" | "mixed" | "other";

/** Kurzer Hinweis, worauf sich eine Erklärung stützt. */
export function basisLabel(basis: MarkBasis[] | undefined): { text: string; tone: BasisTone } | null {
  if (!basis?.length) return null;
  const m = basis.includes("material");
  const w = basis.includes("wissen");
  const i = basis.includes("internet");
  const extra = w && i ? "Claudes Wissen und Internetsuche" : w ? "Claudes Wissen" : i ? "Internetsuche" : "";
  if (m && !extra) return { text: "Aus deinem Material", tone: "material" };
  if (m) return { text: `Aus deinem Material, ergänzt mit ${extra}`, tone: "mixed" };
  return {
    text: `Nicht aus deinem Material – ${w && i ? "aus Claudes Wissen und dem Internet" : w ? "aus Claudes Fachwissen" : "aus dem Internet"}`,
    tone: "other",
  };
}

// ---------- Download ----------

function quoteBlock(text: string): string {
  return text
    .split("\n")
    .map((l) => `> ${l}`.trimEnd())
    .join("\n");
}

/**
 * Anhang für PDF und Markdown: die markierten Stellen mit Claudes Erklärungen,
 * in der Reihenfolge, in der sie im Lernzettel stehen.
 */
export function marksAppendix(marks: NoteMark[]): string {
  const answered = marks.filter((m) => m.messages.some((x) => x.role === "assistant"));
  if (answered.length === 0) return "";
  const parts = answered.map((mark, i) => {
    const lines = [`### ${i + 1}. ${MARK_LEVELS[mark.level].label}`, "", quoteBlock(mark.quote), ""];
    for (const msg of mark.messages) {
      if (msg.role === "user") lines.push(`**Deine Nachfrage:** ${msg.content.replace(/\s*\n\s*/g, " ")}`, "");
      else {
        lines.push(msg.content, "");
        const label = basisLabel(msg.basis);
        if (label) lines.push(`*${label.text}*`, "");
        if (msg.links?.length) lines.push(msg.links.map((l) => `- [${l.title || l.url}](${l.url})`).join("\n"), "");
      }
    }
    return lines.join("\n").trim();
  });
  return `## Deine markierten Stellen\n\n${parts.join("\n\n")}`;
}
