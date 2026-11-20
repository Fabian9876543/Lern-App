import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeMath } from "../markdown";
import { FAMILY_MONO, FAMILY_SANS, FAMILY_SYM, FontCoverage, fontChain, parseFamilies, type FontBytes, type FontId } from "./fonts";
import { CONTENT_HEIGHT_PX, CONTENT_WIDTH_PX } from "./paint";
import type { Box, Color, Item, Layout, Matrix, Span } from "./types";

/**
 * Setzt einen Lernzettel unsichtbar im Browser – mit den Schriften, die später
 * ins PDF kommen – und liest aus, wo jedes Wort, jede Linie und jede Formel
 * gelandet ist. Der Browser übernimmt also Zeilenumbruch, Tabellen und KaTeX;
 * das PDF zeichnet das Ergebnis nur noch nach.
 */

export interface NoteDoc {
  title: string;
  /** Zeile unter dem Titel, z. B. „Rechnungswesen · Lernzettel · 20.11.2026“ */
  meta?: string;
  markdown: string;
}

const ACCENT = "#4f46e5";
const BORDER = "#dfe3ee";
const STYLE = `
.pdf-host {
  position: fixed; left: -40000px; top: 0; z-index: -1;
  width: ${CONTENT_WIDTH_PX}px; margin: 0; padding: 0;
  visibility: hidden; pointer-events: none;
  background: #fff; color: #1c2033;
  font-family: ${FAMILY_SANS}, ${FAMILY_SYM}; font-size: 14.5px; line-height: 1.55;
  font-weight: 400; font-style: normal; font-kerning: none; font-variant-ligatures: none;
  font-feature-settings: normal; font-synthesis: none; letter-spacing: normal; word-spacing: normal;
  text-align: left; text-transform: none; text-indent: 0; white-space: normal;
  overflow-wrap: break-word; hyphens: manual; tab-size: 4;
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
}
.pdf-host *, .pdf-host *::before, .pdf-host *::after { box-sizing: border-box; }
.pdf-host .pdf-header { margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid ${ACCENT}; }
.pdf-host .pdf-header h1 { display: block; margin: 0; font-size: 23px; line-height: 1.25; font-weight: 700; color: #1c2033; }
.pdf-host .pdf-meta { margin: 5px 0 0; font-size: 11.5px; line-height: 1.4; color: #646b82; }
.pdf-body > :first-child { margin-top: 0; }
.pdf-body h1, .pdf-body h2, .pdf-body h3, .pdf-body h4, .pdf-body h5, .pdf-body h6 {
  display: block; font-weight: 700; line-height: 1.3; color: #1c2033; gap: 0;
}
.pdf-body h1 { font-size: 20px; margin: 1.2em 0 0.5em; }
.pdf-body h2 { font-size: 17px; margin: 1.35em 0 0.5em; padding-bottom: 0.25em; border-bottom: 1px solid ${BORDER}; }
.pdf-body h3 { font-size: 15px; margin: 1.1em 0 0.35em; }
.pdf-body h4, .pdf-body h5, .pdf-body h6 { font-size: 14.5px; margin: 1em 0 0.3em; }
.pdf-body p { margin: 0.5em 0; }
.pdf-body ul, .pdf-body ol { margin: 0.45em 0; padding-left: 1.6em; }
.pdf-body li { list-style: none; margin: 0.2em 0; }
.pdf-body li > ul, .pdf-body li > ol, .pdf-body li > p { margin: 0.2em 0; }
.pdf-body .pdf-li-marker {
  display: inline-block; width: 1.6em; margin-left: -1.6em; padding-right: 0.45em;
  text-align: right; white-space: nowrap; color: ${ACCENT}; font-weight: 400; font-style: normal;
}
.pdf-body .pdf-check { margin-right: 0.35em; }
.pdf-body strong, .pdf-body b { font-weight: 700; }
.pdf-body em, .pdf-body i { font-style: italic; }
.pdf-body a { color: #4338ca; text-decoration: none; }
.pdf-body del, .pdf-body s { text-decoration: line-through; }
.pdf-body code {
  font-family: ${FAMILY_MONO}, ${FAMILY_SYM}; font-size: 0.88em;
  background: #f1f3f9; padding: 0.08em 0.3em; border-radius: 4px;
}
.pdf-body pre {
  font-family: ${FAMILY_MONO}, ${FAMILY_SYM}; font-size: 0.86em; line-height: 1.45;
  background: #f1f3f9; padding: 0.65em 0.8em; border-radius: 6px; margin: 0.65em 0;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.pdf-body pre code { font-size: inherit; background: none; padding: 0; border-radius: 0; }
.pdf-body blockquote {
  margin: 0.7em 0; padding: 0.45em 0.9em; border-left: 3px solid ${ACCENT};
  background: #f4f5fb; border-radius: 0 6px 6px 0;
}
.pdf-body blockquote > :first-child { margin-top: 0; }
.pdf-body blockquote > :last-child { margin-bottom: 0; }
.pdf-body table {
  display: table; border-collapse: separate; border-spacing: 0; margin: 0.7em 0; max-width: 100%;
  border-top: 1px solid #cfd5e3; border-left: 1px solid #cfd5e3; font-size: 0.95em;
}
.pdf-body th, .pdf-body td {
  border-right: 1px solid #cfd5e3; border-bottom: 1px solid #cfd5e3;
  padding: 0.32em 0.6em; vertical-align: top; text-align: left; overflow-wrap: anywhere;
}
.pdf-body th { background: #eef0f7; font-weight: 700; }
.pdf-body hr { border: none; border-top: 1px solid ${BORDER}; height: 0; margin: 1.1em 0; }
.pdf-body img { display: none; }
.pdf-body .katex { font-size: 1.15em; }
.pdf-body .katex-display { margin: 0.7em 0; overflow: visible; }
`;

/** Diese Dateien werden im Browser als Schrift angemeldet (Familie, Gewicht, Stil). */
const FACES: [FontId, string, string, string][] = [
  ["sans", FAMILY_SANS, "400", "normal"],
  ["sans-bold", FAMILY_SANS, "700", "normal"],
  ["sans-italic", FAMILY_SANS, "400", "italic"],
  ["sans-bolditalic", FAMILY_SANS, "700", "italic"],
  ["sym", FAMILY_SYM, "400", "normal"],
  ["mono", FAMILY_MONO, "400", "normal"],
  ["mono-bold", FAMILY_MONO, "700", "normal"],
];

let facesReady: Promise<void> | null = null;
function registerFaces(fonts: FontBytes): Promise<void> {
  facesReady ??= (async () => {
    const faces = FACES.map(([id, family, weight, style]) => new FontFace(family, fonts[id] as Uint8Array<ArrayBuffer>, { weight, style }));
    await Promise.all(faces.map((f) => f.load()));
    faces.forEach((f) => document.fonts.add(f));
  })().catch((e) => {
    facesReady = null;
    throw e;
  });
  return facesReady;
}

function injectStyle() {
  if (document.getElementById("lern-pdf-style")) return;
  const el = document.createElement("style");
  el.id = "lern-pdf-style";
  el.textContent = STYLE;
  document.head.append(el);
}

function parseColor(css: string): { c: Color; a: number } | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(css);
  if (!m) return null;
  let a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (m[4]?.endsWith("%")) a /= 100;
  return { c: [+m[1] / 255, +m[2] / 255, +m[3] / 255], a };
}

/** Halbtransparente Farben auf weißem Papier. */
const onWhite = ({ c, a }: { c: Color; a: number }): Color => c.map((v) => v * a + (1 - a)) as Color;

function intersect(a: Box | undefined, b: Box): Box {
  if (!a) return b;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

const BLOCKS = new Set(["P", "LI", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "HEADER"]);

/** Aufzählungszeichen und Nummern als echten Text einfügen (::marker taucht im DOM nicht auf). */
function addListMarkers(root: HTMLElement) {
  for (const li of root.querySelectorAll<HTMLLIElement>("li")) {
    const list = li.parentElement;
    if (!list) continue;
    const box = li.querySelector<HTMLInputElement>(":scope > input[type=checkbox], :scope > p > input[type=checkbox]");
    if (box) {
      const check = document.createElement("span");
      check.className = "pdf-check";
      check.textContent = box.checked ? "☑" : "☐";
      box.replaceWith(check);
      continue;
    }
    let marker: string;
    if (list.tagName === "OL") {
      const start = Number(list.getAttribute("start") ?? "1") || 1;
      const index = [...list.children].filter((c) => c.tagName === "LI").indexOf(li);
      marker = `${start + index}.`;
    } else {
      let depth = 0;
      for (let p = list.parentElement; p && p !== root; p = p.parentElement) if (p.tagName === "UL") depth++;
      marker = ["•", "◦", "▪"][Math.min(depth, 2)];
    }
    const span = document.createElement("span");
    span.className = "pdf-li-marker";
    span.textContent = marker;
    const first = [...li.childNodes].find((n) => n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.textContent ?? "")));
    const target = first instanceof HTMLParagraphElement ? first : li;
    target.prepend(span);
  }
}

function* textNodes(root: Node): Generator<Text> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(".katex-mathml, svg, style, script") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) yield n as Text;
}

/** Schlüssel für alles, was die Lage der Grundlinie bestimmt. */
const metricKey = (cs: CSSStyleDeclaration) => `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}|${cs.fontSize}`;

export async function layoutNote(note: NoteDoc, fonts: FontBytes, coverage: FontCoverage): Promise<Layout> {
  injectStyle();
  await registerFaces(fonts);

  const host = document.createElement("div");
  host.className = "pdf-host";
  host.setAttribute("aria-hidden", "true");
  const header = document.createElement("header");
  header.className = "pdf-header";
  const h1 = document.createElement("h1");
  h1.textContent = note.title;
  header.append(h1);
  if (note.meta) {
    const meta = document.createElement("p");
    meta.className = "pdf-meta";
    meta.textContent = note.meta;
    header.append(meta);
  }
  const body = document.createElement("div");
  body.className = "pdf-body";
  host.append(header, body);
  document.body.append(host);
  const root = createRoot(body);

  try {
    flushSync(() =>
      root.render(
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>
          {normalizeMath(note.markdown)}
        </ReactMarkdown>,
      ),
    );
    addListMarkers(body);

    // KaTeX: fehlende Zeichen in unseren Schriften suchen statt in Times New Roman
    for (const el of host.querySelectorAll<HTMLElement>(".katex, .katex *")) {
      if (el.closest(".katex-mathml") || el instanceof SVGElement) continue;
      const families = parseFamilies(getComputedStyle(el).fontFamily);
      if (families[0]?.startsWith("KaTeX_") && !families.includes(FAMILY_SANS)) {
        el.style.fontFamily = `${families[0]}, ${FAMILY_SANS}, ${FAMILY_SYM}`;
      }
    }

    // Zeichen, die keine Schrift hat (Emoji …), ersetzen oder weglassen
    for (const node of textNodes(host)) {
      const cs = getComputedStyle(node.parentElement!);
      const chain = fontChain(cs.fontFamily, cs.fontWeight, cs.fontStyle);
      const clean = coverage.sanitize(node.data, chain);
      if (clean !== node.data) node.data = clean;
    }

    // Schriften laden (KaTeX lädt erst bei Bedarf)
    const wanted = new Set<string>();
    for (const node of textNodes(host)) {
      const cs = getComputedStyle(node.parentElement!);
      const family = parseFamilies(cs.fontFamily)[0];
      if (family) wanted.add(`${cs.fontStyle} ${cs.fontWeight} 16px "${family}"`);
    }
    await Promise.all([...wanted].map((f) => document.fonts.load(f).catch(() => [])));
    await document.fonts.ready;

    // Zu breite Formeln und Tabellen verkleinern, damit sie auf die Seite passen
    for (let pass = 0; pass < 2; pass++) {
      for (const el of host.querySelectorAll<HTMLElement>(".katex-display, table, pre")) {
        const over = el.scrollWidth / host.clientWidth;
        if (over > 1.002) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          el.style.fontSize = `${(size / over) * 0.985}px`;
        }
      }
    }

    return extract(host, coverage);
  } finally {
    root.unmount();
    host.remove();
  }
}

function extract(host: HTMLElement, coverage: FontCoverage): Layout {
  const origin = host.getBoundingClientRect();
  const rel = (r: DOMRect | DOMRectReadOnly): Box => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  const items: Item[] = [];
  const hard: Span[] = [];
  const soft: Span[] = [];
  const linesOf = new Map<Element, Span[]>();
  const range = document.createRange();

  // 1. Abstand Oberkante → Grundlinie je Schrift und Größe, direkt am Text gemessen
  const offsets = new Map<string, number>();
  const probes: { key: string; node: Text; marker: HTMLElement }[] = [];
  for (const node of textNodes(host)) {
    const cs = getComputedStyle(node.parentElement!);
    const key = metricKey(cs);
    if (offsets.has(key) || probes.some((p) => p.key === key)) continue;
    const first = node.data.search(/\S/);
    if (first < 0) continue;
    const target = first > 0 ? node.splitText(first) : node;
    const marker = document.createElement("span");
    marker.style.cssText = "display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline";
    target.before(marker);
    probes.push({ key, node: target, marker });
  }
  for (const p of probes) {
    range.setStart(p.node, 0);
    range.setEnd(p.node, Math.min(p.node.length, String.fromCodePoint(p.node.data.codePointAt(0)!).length));
    const top = range.getBoundingClientRect().top;
    offsets.set(p.key, p.marker.getBoundingClientRect().bottom - top);
  }
  probes.forEach((p) => p.marker.remove());

  const decorations = new Map<Element, { underline: boolean; strike: boolean }>();
  function decoration(el: Element | null): { underline: boolean; strike: boolean } {
    if (!el || el === host) return { underline: false, strike: false };
    let d = decorations.get(el);
    if (!d) {
      const line = getComputedStyle(el).textDecorationLine;
      const up = decoration(el.parentElement);
      d = { underline: up.underline || line.includes("underline"), strike: up.strike || line.includes("line-through") };
      decorations.set(el, d);
    }
    return d;
  }

  function blockOf(el: Element): Element | null {
    for (let e: Element | null = el; e && e !== host; e = e.parentElement) if (BLOCKS.has(e.tagName)) return e;
    return null;
  }

  function emitText(text: string, r: DOMRect, cs: CSSStyleDeclaration, chain: FontId[], parent: Element) {
    if (r.width === 0 && r.height === 0) return;
    const runs = coverage.runs(text, chain);
    if (!runs.length) return;
    const size = parseFloat(cs.fontSize);
    const box = rel(r);
    const baseline = box.y + (offsets.get(metricKey(cs)) ?? size * 0.8);
    const color = onWhite(parseColor(cs.color) ?? { c: [0, 0, 0], a: 1 });
    items.push({ kind: "text", x: box.x, baseline, top: box.y, bottom: box.y + box.h, size, color, runs });
    const span = { top: box.y, bottom: box.y + box.h };
    hard.push(span);
    const block = blockOf(parent);
    if (block) linesOf.set(block, [...(linesOf.get(block) ?? []), span]);
    const deco = decoration(parent);
    const thickness = Math.max(0.6, size / 15);
    if (deco.underline) items.push({ kind: "rect", box: { x: box.x, y: baseline + size * 0.11, w: box.w, h: thickness }, color });
    if (deco.strike) items.push({ kind: "rect", box: { x: box.x, y: baseline - size * 0.3, w: box.w, h: thickness }, color });
  }

  function text(node: Text, cs: CSSStyleDeclaration) {
    const data = node.data;
    if (!/\S/.test(data)) return;
    const chain = fontChain(cs.fontFamily, cs.fontWeight, cs.fontStyle);
    const parent = node.parentElement!;
    for (const m of data.matchAll(/\S+/g)) {
      const start = m.index!;
      range.setStart(node, start);
      range.setEnd(node, start + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
      if (rects.length <= 1) {
        emitText(m[0], rects[0] ?? range.getBoundingClientRect(), cs, chain, parent);
        continue;
      }
      // Wort über mehrere Zeilen umbrochen: zeichenweise nach Zeilen aufteilen
      let current = "";
      let rect: DOMRect | null = null;
      let offset = start;
      for (const ch of m[0]) {
        range.setStart(node, offset);
        range.setEnd(node, offset + ch.length);
        offset += ch.length;
        const r = range.getBoundingClientRect();
        if (rect && Math.abs(r.top - rect.top) < 1) {
          current += ch;
          rect = new DOMRect(rect.left, rect.top, r.right - rect.left, Math.max(rect.height, r.height));
        } else {
          if (rect && current) emitText(current, rect, cs, chain, parent);
          current = ch;
          rect = r;
        }
      }
      if (rect && current) emitText(current, rect, cs, chain, parent);
    }
  }

  function boxes(el: Element, cs: CSSStyleDeclaration, clip: Box | undefined) {
    const rects = [...el.getClientRects()].filter((r) => r.width > 0.01 && r.height > 0.01);
    if (!rects.length) return;
    const radius = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(
      (v) => parseFloat(v) || 0,
    ) as [number, number, number, number];
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0.02) {
      for (const r of rects) {
        items.push({ kind: "rect", box: rel(r), color: onWhite(bg), radius: radius.some((v) => v > 0) ? radius : undefined, clip });
      }
    }
    const side = (s: "Top" | "Right" | "Bottom" | "Left") => {
      const style = cs.getPropertyValue(`border-${s.toLowerCase()}-style`);
      const width = parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0;
      const col = parseColor(cs.getPropertyValue(`border-${s.toLowerCase()}-color`));
      if (style === "none" || style === "hidden" || width <= 0 || !col || col.a <= 0.02) return null;
      return { width, color: onWhite(col) };
    };
    const [t, r, b, l] = (["Top", "Right", "Bottom", "Left"] as const).map(side);
    if (!t && !r && !b && !l) return;
    const same = t && r && b && l && [r, b, l].every((x) => x!.width === t.width && x!.color.every((v, i) => v === t.color[i]));
    for (const rect of rects) {
      const box = rel(rect);
      if (same && radius.some((v) => v > 0)) {
        items.push({ kind: "frame", box, color: t!.color, width: t!.width, radius, clip });
        continue;
      }
      if (t) items.push({ kind: "rect", box: { x: box.x, y: box.y, w: box.w, h: t.width }, color: t.color, clip });
      if (b) items.push({ kind: "rect", box: { x: box.x, y: box.y + box.h - b.width, w: box.w, h: b.width }, color: b.color, clip });
      if (l) items.push({ kind: "rect", box: { x: box.x, y: box.y, w: l.width, h: box.h }, color: l.color, clip });
      if (r) items.push({ kind: "rect", box: { x: box.x + box.w - r.width, y: box.y, w: r.width, h: box.h }, color: r.color, clip });
    }
  }

  function svg(el: SVGSVGElement, clip: Box | undefined) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const box = rel(r);
    const vb = el.viewBox?.baseVal;
    let m: Matrix = [1, 0, 0, 1, box.x, box.y];
    if (vb && vb.width > 0 && vb.height > 0) {
      let sx = box.w / vb.width;
      let sy = box.h / vb.height;
      let tx = 0;
      let ty = 0;
      const par = el.preserveAspectRatio.baseVal;
      if (par.align !== SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE) {
        const scale = par.meetOrSlice === SVGPreserveAspectRatio.SVG_MEETORSLICE_SLICE ? Math.max(sx, sy) : Math.min(sx, sy);
        const align = Math.max(0, par.align - SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_XMINYMIN);
        tx = ((box.w - vb.width * scale) * (align % 3)) / 2;
        ty = ((box.h - vb.height * scale) * Math.floor(align / 3)) / 2;
        sx = sy = scale;
      }
      m = [sx, 0, 0, sy, box.x + tx - vb.x * sx, box.y + ty - vb.y * sy];
    }
    const area = intersect(clip, box);
    if (area.w <= 0 || area.h <= 0) return;
    hard.push({ top: area.y, bottom: area.y + area.h });
    for (const shape of el.querySelectorAll<SVGGeometryElement>("path, line, rect, polyline, polygon")) {
      const cs = getComputedStyle(shape);
      let d: string | null = null;
      let closed = true;
      if (shape instanceof SVGPathElement) d = shape.getAttribute("d");
      else if (shape instanceof SVGLineElement) {
        d = `M${shape.x1.baseVal.value},${shape.y1.baseVal.value} L${shape.x2.baseVal.value},${shape.y2.baseVal.value}`;
        closed = false;
      } else if (shape instanceof SVGRectElement) {
        const [x, y, w, h] = [shape.x, shape.y, shape.width, shape.height].map((v) => v.baseVal.value);
        d = `M${x},${y} H${x + w} V${y + h} H${x} Z`;
      } else if (shape instanceof SVGPolylineElement || shape instanceof SVGPolygonElement) {
        const pts = [...shape.points].map((p) => `${p.x},${p.y}`);
        if (pts.length) d = `M${pts.join(" L")}${shape instanceof SVGPolygonElement ? " Z" : ""}`;
        closed = shape instanceof SVGPolygonElement;
      }
      if (!d) continue;
      const fill = cs.fill !== "none" && closed ? parseColor(cs.fill) : null;
      const stroke = cs.stroke !== "none" ? parseColor(cs.stroke) : null;
      const strokeWidth = parseFloat(cs.strokeWidth) || 1;
      if (!fill && !stroke) continue;
      items.push({
        kind: "path",
        d,
        matrix: m,
        fill: fill && fill.a > 0 ? onWhite(fill) : undefined,
        stroke: stroke && stroke.a > 0 ? onWhite(stroke) : undefined,
        strokeWidth,
        clip: area,
        top: area.y,
        bottom: area.y + area.h,
      });
    }
  }

  function walk(el: Element, clip: Box | undefined) {
    if (el.matches(".katex-mathml, script, style, img, input")) return;
    if (el instanceof SVGSVGElement) return svg(el, clip);
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    if (el !== host) boxes(el, cs, clip);
    let inner = clip;
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") inner = intersect(clip, rel(el.getBoundingClientRect()));
    if (el.classList.contains("katex")) {
      const r = el.getBoundingClientRect();
      hard.push({ top: r.top - origin.top, bottom: r.bottom - origin.top });
    }
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text(child as Text, cs);
      else if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element, inner);
    }
  }

  walk(host, undefined);

  // Weiche Bereiche: Tabellenzeilen, kurze Code-Blöcke und Zitate, Überschrift + erste Zeile danach,
  // Anfang und Ende von Absätzen (keine einzelne Zeile allein auf einer Seite)
  const pageH = CONTENT_HEIGHT_PX;
  const spanOf = (el: Element): Span => {
    const r = el.getBoundingClientRect();
    return { top: r.top - origin.top, bottom: r.bottom - origin.top };
  };
  for (const tr of host.querySelectorAll("tr")) soft.push(spanOf(tr));
  for (const el of host.querySelectorAll("pre, blockquote")) {
    const s = spanOf(el);
    if (s.bottom - s.top < pageH * 0.35) soft.push(s);
  }
  const sortedHard = [...hard].sort((a, b) => a.top - b.top);
  for (const h of host.querySelectorAll(".pdf-body h1, .pdf-body h2, .pdf-body h3, .pdf-body h4, .pdf-body h5, .pdf-body h6")) {
    const s = spanOf(h);
    const next = sortedHard.find((x) => x.top >= s.bottom - 1);
    soft.push({ top: s.top, bottom: next ? Math.max(next.bottom, s.bottom) : s.bottom });
  }
  for (const [block, spans] of linesOf) {
    if (block.tagName !== "P" && block.tagName !== "LI") continue;
    const lines: Span[] = [];
    for (const s of [...spans].sort((a, b) => a.top - b.top)) {
      const last = lines[lines.length - 1];
      if (last && s.top < last.bottom - 0.5) last.bottom = Math.max(last.bottom, s.bottom);
      else lines.push({ ...s });
    }
    if (lines.length >= 2) soft.push({ top: lines[0].top, bottom: lines[1].bottom });
    if (lines.length >= 3) soft.push({ top: lines[lines.length - 2].top, bottom: lines[lines.length - 1].bottom });
  }

  // Tabellen mit Kopfzeile: Kopf nicht allein unten auf der Seite lassen, auf Folgeseiten wiederholen
  const tables: NonNullable<Layout["tables"]> = [];
  for (const table of host.querySelectorAll("table")) {
    const thead = table.querySelector(":scope > thead");
    if (!thead) continue;
    const t = spanOf(table);
    const head = spanOf(thead).bottom;
    tables.push({ top: t.top, head, bottom: t.bottom });
    const firstRow = table.querySelector(":scope > tbody > tr");
    if (firstRow) soft.push({ top: t.top, bottom: spanOf(firstRow).bottom });
  }

  return { width: host.clientWidth, height: host.scrollHeight, items, hard, soft, tables };
}
