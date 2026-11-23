/**
 * Markierungen im angezeigten Lernzettel (nur im Browser): Auswahl auslesen,
 * Stellen als Range wiederfinden und antippen. Gerechnet wird auf dem
 * sichtbaren Text – ohne die unsichtbare MathML, die KaTeX zu jeder Formel
 * mitschreibt.
 */

export interface TextMap {
  text: string;
  nodes: Text[];
  starts: number[];
}

/** Sichtbarer Text eines Elements mit der Lage aller Textknoten. */
export function textMap(root: Element): TextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(".katex-mathml") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    nodes.push(t);
    starts.push(text.length);
    text += t.data;
  }
  return { text, nodes, starts };
}

/** Lage einer Range im sichtbaren Text, oder null, wenn sie keinen Text umfasst. */
export function rangeOffsets(map: TextMap, range: Range): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  map.nodes.forEach((node, i) => {
    if (!range.intersectsNode(node)) return;
    const s = map.starts[i];
    const from = node === range.startContainer ? s + range.startOffset : s;
    const to = node === range.endContainer ? s + range.endOffset : s + node.length;
    if (start < 0) start = from;
    end = to;
  });
  return start < 0 || end <= start ? null : { start, end };
}

/** Range zu einer Lage im sichtbaren Text. */
export function rangeAt(map: TextMap, start: number, end: number): Range | null {
  let startNode = -1;
  let endNode = -1;
  for (let i = 0; i < map.nodes.length; i++) {
    const s = map.starts[i];
    const e = s + map.nodes[i].length;
    if (startNode < 0 && e > start) startNode = i;
    if (s < end && e >= end) {
      endNode = i;
      break;
    }
  }
  if (startNode < 0 || endNode < 0) return null;
  const range = document.createRange();
  range.setStart(map.nodes[startNode], start - map.starts[startNode]);
  range.setEnd(map.nodes[endNode], end - map.starts[endNode]);
  return range;
}

function formulaOf(node: Node): Element | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest(".katex") ?? null;
}

/** Erweitert eine Auswahl, die in einer Formel beginnt oder endet, auf die ganze Formel. */
export function expandToFormulas(range: Range): Range {
  const r = range.cloneRange();
  const start = formulaOf(r.startContainer);
  if (start) r.setStartBefore(start);
  const end = formulaOf(r.endContainer);
  if (end) r.setEndAfter(end);
  return r;
}

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, tr, blockquote, pre, .katex-display";

/** Text einer Auswahl, Formeln als LaTeX ($…$) – so versteht Claude sie und so lässt sie sich wieder anzeigen. */
export function quoteOf(range: Range): string {
  const frag = range.cloneContents();
  frag.querySelectorAll(".katex").forEach((k) => {
    const tex = k.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    // Abgesetzte Formeln erkennt man an der MathML (display="block") – der Rahmen .katex-display fehlt in der Kopie oft.
    const display = !!k.closest(".katex-display") || k.querySelector("math")?.getAttribute("display") === "block";
    const text = tex ? (display ? `$$${tex}$$` : `$${tex}$`) : (k.querySelector(".katex-html")?.textContent ?? "");
    k.replaceWith(document.createTextNode(text));
  });
  frag.querySelectorAll(BLOCKS).forEach((el) => el.append("\n"));
  frag.querySelectorAll("td, th").forEach((el) => el.append(" "));
  return (frag.textContent ?? "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Welche Markierung liegt unter dem Punkt (Bildschirmkoordinaten)? Bei Überlappung die kürzeste. */
export function markAt(marks: { id: string; range: Range; length: number }[], x: number, y: number): string | null {
  const sorted = [...marks].sort((a, b) => a.length - b.length);
  for (const m of sorted) {
    for (const r of m.range.getClientRects()) {
      if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) return m.id;
    }
  }
  return null;
}

/** Kann der Browser Stellen einfärben, ohne den Text zu verändern (CSS Custom Highlight API)? */
export function supportsHighlights(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
}
