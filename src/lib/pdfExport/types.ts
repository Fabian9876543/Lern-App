import type { FontId } from "./fonts";

/**
 * Was im Browser gesetzt wurde, als „Anzeigeliste“: alle Koordinaten in CSS-Pixeln,
 * relativ zur linken oberen Ecke des Satzbereichs, y wächst nach unten.
 */

export type Color = [number, number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Affine Abbildung wie in PDF/SVG: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface TextItem {
  kind: "text";
  x: number;
  /** Grundlinie */
  baseline: number;
  /** Ober- und Unterkante der Zeile (für den Seitenumbruch) */
  top: number;
  bottom: number;
  size: number;
  color: Color;
  runs: { text: string; font: FontId }[];
}

export interface RectItem {
  kind: "rect";
  box: Box;
  color: Color;
  /** Eckenradien oben links, oben rechts, unten rechts, unten links */
  radius?: [number, number, number, number];
  clip?: Box;
}

export interface FrameItem {
  kind: "frame";
  box: Box;
  color: Color;
  width: number;
  radius: [number, number, number, number];
  clip?: Box;
}

export interface PathItem {
  kind: "path";
  d: string;
  /** SVG-Koordinaten → Satzbereich */
  matrix: Matrix;
  fill?: Color;
  stroke?: Color;
  strokeWidth?: number;
  clip?: Box;
  /** Ausdehnung im Satzbereich (für den Seitenumbruch) */
  top: number;
  bottom: number;
}

export type Item = TextItem | RectItem | FrameItem | PathItem;

/** Bereich, durch den kein Seitenumbruch gehen soll. */
export interface Span {
  top: number;
  bottom: number;
}

export interface Layout {
  width: number;
  height: number;
  items: Item[];
  /** Darf nie zerschnitten werden: Textzeilen, Formeln */
  hard: Span[];
  /** Soll nicht zerschnitten werden: Tabellenzeilen, Überschrift + erste Zeile, Absatzanfang/-ende */
  soft: Span[];
  /** Tabellen mit Kopfzeile: oben [top, head] wird auf Folgeseiten wiederholt */
  tables?: { top: number; head: number; bottom: number }[];
}

export interface Page {
  /** sichtbarer Ausschnitt [start, end) */
  start: number;
  end: number;
  /** Tabellenkopf, der oben auf der Seite wiederholt wird */
  header?: Span;
}
