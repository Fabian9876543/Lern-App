import fontkit from "@pdf-lib/fontkit";
import {
  clip,
  concatTransformationMatrix,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { FontCoverage, type FontBytes, type FontId } from "./fonts";
import { paginate } from "./paginate";
import type { Box, Color, Item, Layout, Matrix } from "./types";

/** A4 in Punkt */
export const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = { top: 50, right: 50, bottom: 58, left: 50 };
/** 1 CSS-Pixel = 0,75 pt (wie beim Drucken im Browser) */
export const PT_PER_PX = 0.75;
/** So breit wird im Browser gesetzt, damit es genau auf die Seite passt. */
export const CONTENT_WIDTH_PX = (PAGE.width - MARGIN.left - MARGIN.right) / PT_PER_PX;
export const CONTENT_HEIGHT_PX = (PAGE.height - MARGIN.top - MARGIN.bottom) / PT_PER_PX;

export interface PaintOptions {
  title: string;
  /** Text links in der Fußzeile */
  footer: string;
  subject?: string;
  author?: string;
}

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const color = (c: Color) => rgb(c[0], c[1], c[2]);

/** SVG-Pfad eines Rechtecks mit (einzelnen) Eckenradien, Koordinaten in pt, y nach unten. */
function roundedRect(w: number, h: number, r: [number, number, number, number]): string {
  const max = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, max)));
  const k = 0.5523;
  const n = (v: number) => +v.toFixed(3);
  return [
    `M${n(tl)},0`,
    `L${n(w - tr)},0`,
    tr ? `C${n(w - tr + tr * k)},0 ${n(w)},${n(tr - tr * k)} ${n(w)},${n(tr)}` : "",
    `L${n(w)},${n(h - br)}`,
    br ? `C${n(w)},${n(h - br + br * k)} ${n(w - br + br * k)},${n(h)} ${n(w - br)},${n(h)}` : "",
    `L${n(bl)},${n(h)}`,
    bl ? `C${n(bl - bl * k)},${n(h)} 0,${n(h - bl + bl * k)} 0,${n(h - bl)}` : "",
    `L0,${n(tl)}`,
    tl ? `C0,${n(tl - tl * k)} ${n(tl - tl * k)},0 ${n(tl)},0` : "",
    "Z",
  ].join(" ");
}

function itemExtent(it: Item): [number, number] {
  switch (it.kind) {
    case "text":
      return [it.top, it.bottom];
    case "path":
      return [it.top, it.bottom];
    default:
      return [it.box.y, it.box.y + it.box.h];
  }
}

/** Zeichnet die Anzeigeliste auf A4-Seiten und liefert die PDF-Datei. */
export async function paintPdf(layout: Layout, fonts: FontBytes, options: PaintOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(options.title, { showInWindowTitleBar: true });
  doc.setLanguage("de-DE");
  doc.setCreator("Lern-App");
  doc.setProducer("Lern-App");
  if (options.subject) doc.setSubject(options.subject);
  if (options.author) doc.setAuthor(options.author);

  const embedded = new Map<FontId, PDFFont>();
  async function font(id: FontId): Promise<PDFFont> {
    let f = embedded.get(id);
    if (!f) {
      const bytes = fonts[id];
      if (!bytes) throw new Error(`Schrift ${id} fehlt`);
      f = await doc.embedFont(bytes, { subset: true });
      embedded.set(id, f);
    }
    return f;
  }
  for (const it of layout.items) if (it.kind === "text") for (const r of it.runs) await font(r.font);

  const coverage = new FontCoverage({ sans: fonts.sans!, sym: fonts.sym! });
  const footerRuns = (text: string) => coverage.runs(coverage.sanitize(text, ["sans", "sym"]), ["sans", "sym"]);
  for (const r of footerRuns(options.footer + " Seite 0123456789 von")) await font(r.font);

  const pages = paginate(layout, CONTENT_HEIGHT_PX);
  const s = PT_PER_PX;

  pages.forEach((range, index) => {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    // Ein Ausschnitt [from, to) des Satzbereichs, `at` Pixel unter dem oberen Rand des Satzspiegels
    const region = (from: number, to: number, at: number) => {
      const top = PAGE.height - MARGIN.top - at * s;
      const X = (x: number) => MARGIN.left + x * s;
      const Y = (y: number) => top - (y - from) * s;
      // Satzbereich → Seite (pt, y nach oben)
      const toPage: Matrix = [s, 0, 0, -s, MARGIN.left, top + from * s];
      const bleed = 8;
      const height = (to - from) * s;
      page.pushOperators(
        pushGraphicsState(),
        rectangle(MARGIN.left - bleed, top - height, PAGE.width - MARGIN.left - MARGIN.right + 2 * bleed, height),
        clip(),
        endPath(),
      );
      const withClip = (box: Box | undefined, draw: () => void) => {
        if (!box) return draw();
        page.pushOperators(pushGraphicsState(), rectangle(X(box.x), Y(box.y + box.h), box.w * s, box.h * s), clip(), endPath());
        draw();
        page.pushOperators(popGraphicsState());
      };
      for (const it of layout.items) {
        const [itTop, itBottom] = itemExtent(it);
        if (itBottom <= from || itTop >= to) continue;
        switch (it.kind) {
          case "text": {
            let x = X(it.x);
            const size = it.size * s;
            for (const run of it.runs) {
              const f = embedded.get(run.font)!;
              page.drawText(run.text, { x, y: Y(it.baseline), size, font: f, color: color(it.color) });
              x += f.widthOfTextAtSize(run.text, size);
            }
            break;
          }
          case "rect":
            withClip(it.clip, () => {
              if (it.radius && it.radius.some((r) => r > 0)) {
                page.drawSvgPath(roundedRect(it.box.w * s, it.box.h * s, it.radius.map((r) => r * s) as never), {
                  x: X(it.box.x),
                  y: Y(it.box.y),
                  color: color(it.color),
                });
              } else {
                page.drawRectangle({ x: X(it.box.x), y: Y(it.box.y + it.box.h), width: it.box.w * s, height: it.box.h * s, color: color(it.color) });
              }
            });
            break;
          case "frame": {
            const half = it.width / 2;
            withClip(it.clip, () =>
              page.drawSvgPath(
                roundedRect((it.box.w - it.width) * s, (it.box.h - it.width) * s, it.radius.map((r) => Math.max(0, r - half) * s) as never),
                { x: X(it.box.x + half), y: Y(it.box.y + half), borderColor: color(it.color), borderWidth: it.width * s },
              ),
            );
            break;
          }
          case "path":
            withClip(it.clip, () => drawPath(page, it.d, mul(toPage, it.matrix), it.fill, it.stroke, it.strokeWidth));
            break;
        }
      }
      page.pushOperators(popGraphicsState());
    };

    const head = range.header ? range.header.bottom - range.header.top : 0;
    if (range.header) region(range.header.top, range.header.bottom, 0);
    region(range.start, range.end, head);

    // Fußzeile
    const size = 8;
    const grey = rgb(0.45, 0.47, 0.55);
    const y = MARGIN.bottom - 26;
    const right = `Seite ${index + 1} von ${pages.length}`;
    const width = (runs: { text: string; font: FontId }[]) =>
      runs.reduce((sum, r) => sum + embedded.get(r.font)!.widthOfTextAtSize(r.text, size), 0);
    const rightRuns = footerRuns(right);
    const rightWidth = width(rightRuns);
    let leftRuns = footerRuns(options.footer);
    const room = PAGE.width - MARGIN.left - MARGIN.right - rightWidth - 24;
    if (width(leftRuns) > room) {
      let text = options.footer;
      while (text.length > 1 && width(footerRuns(text + " …")) > room) text = text.slice(0, -1);
      leftRuns = footerRuns(text.trimEnd() + " …");
    }
    const drawRuns = (runs: { text: string; font: FontId }[], x: number) => {
      for (const r of runs) {
        const f = embedded.get(r.font)!;
        page.drawText(r.text, { x, y, size, font: f, color: grey });
        x += f.widthOfTextAtSize(r.text, size);
      }
    };
    page.drawLine({
      start: { x: MARGIN.left, y: y + 12 },
      end: { x: PAGE.width - MARGIN.right, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.91),
    });
    drawRuns(leftRuns, MARGIN.left);
    drawRuns(rightRuns, PAGE.width - MARGIN.right - rightWidth);
  });

  return doc.save();
}

function drawPath(page: PDFPage, d: string, m: Matrix, fill?: Color, stroke?: Color, strokeWidth?: number) {
  // drawSvgPath spiegelt selbst die y-Achse (scale 1, -1); das wird hier vorab ausgeglichen.
  const t = mul(m, [1, 0, 0, -1, 0, 0]);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...t));
  page.drawSvgPath(d, {
    x: 0,
    y: 0,
    color: fill ? color(fill) : undefined,
    borderColor: stroke ? color(stroke) : undefined,
    borderWidth: stroke ? (strokeWidth ?? 1) : undefined,
  });
  page.pushOperators(popGraphicsState());
}
