import type { Item, Layout, Page, Span } from "./types";

const EPS = 0.5;

/** Überlappende Bereiche zusammenfassen (aneinanderstoßende bleiben getrennt – dort darf umbrochen werden). */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.bottom > s.top).sort((a, b) => a.top - b.top);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.top < last.bottom - EPS) last.bottom = Math.max(last.bottom, s.bottom);
    else out.push({ ...s });
  }
  return out;
}

/** Oberkante von Flächen (Hintergründe, Rahmen), damit sie nicht als Streifen auf der alten Seite hängen bleiben. */
function boxTops(items: Item[]): number[] {
  const tops: number[] = [];
  for (const it of items) {
    if (it.kind === "rect" || it.kind === "frame") tops.push(it.box.y);
    else if (it.kind === "path") tops.push(it.top);
  }
  return tops.sort((a, b) => a - b);
}

interface Break {
  /** Ende der alten Seite */
  end: number;
  /** Anfang der neuen Seite */
  next: number;
}

/**
 * Letzte Stelle bis `limit`, an der zwischen zwei Blöcken umbrochen werden kann.
 * Liefert null, wenn es keine Lücke nach `start` gibt.
 */
function lastGap(merged: Span[], tops: number[], start: number, limit: number): Break | null {
  let best: Break | null = null;
  for (let i = 0; i < merged.length; i++) {
    const prevBottom = merged[i].bottom;
    if (prevBottom > limit + EPS) break;
    if (prevBottom <= start + EPS) continue;
    const nextTop = i + 1 < merged.length ? merged[i + 1].top : Infinity;
    // Flächen, die in der Lücke beginnen, gehören ganz auf die neue Seite.
    const firstBox = tops.find((t) => t >= prevBottom - EPS && t < nextTop);
    const next = Math.min(nextTop, firstBox ?? Infinity);
    const end = Math.max(prevBottom, Math.min(next, limit));
    best = { end, next: next === Infinity ? end : next };
  }
  return best;
}

/**
 * Teilt den gesetzten Text auf Seiten der Höhe `pageHeight` auf. Umbrochen wird
 * möglichst zwischen Blöcken (weiche Bereiche), sonst zwischen Zeilen (harte
 * Bereiche), notfalls mitten durch (wenn ein einzelnes Teil höher als eine Seite ist).
 */
export function paginate(layout: Layout, pageHeight: number): Page[] {
  const hard = mergeSpans(layout.hard);
  const soft = mergeSpans([...layout.hard, ...layout.soft]);
  const tops = boxTops(layout.items);
  const total = Math.max(layout.height, hard.length ? hard[hard.length - 1].bottom : 0);
  const pages: Page[] = [];
  let start = 0;
  while (start < total - EPS) {
    // Seite beginnt mitten in einer Tabelle: deren Kopf oben wiederholen
    const table = layout.tables?.find((t) => start >= t.head - EPS && start < t.bottom - EPS);
    const header = table && table.head - table.top < pageHeight * 0.25 ? { top: table.top, bottom: table.head } : undefined;
    const limit = start + pageHeight - (header ? header.bottom - header.top : 0);
    if (total <= limit + EPS) {
      pages.push({ start, end: total, header });
      break;
    }
    const preferred = lastGap(soft, tops, start, limit);
    const chosen =
      preferred && preferred.end >= start + (limit - start) * 0.5
        ? preferred
        : (lastGap(hard, tops, start, limit) ?? preferred ?? { end: limit, next: limit });
    pages.push({ start, end: chosen.end, header });
    // Leerraum am Seitenanfang überspringen
    start = Math.max(chosen.next, chosen.end);
    const following = hard.find((s) => s.bottom > start + EPS);
    if (!following) break;
  }
  return pages.length ? pages : [{ start: 0, end: Math.max(total, 1) }];
}
