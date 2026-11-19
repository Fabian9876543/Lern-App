import { strFromU8, unzipSync } from "fflate";

/**
 * Liest Excel-Dateien (.xlsx / .xlsm) im Browser und gibt alle Tabellenblätter
 * als Markdown-Tabellen zurück – mit Zeilennummern und Spaltenbuchstaben, damit
 * sich Aufgaben auf Zellen beziehen können, und mit einer Liste der Formeln.
 *
 * Eigener, schlanker Leser (ZIP + XML), weil die verbreitete Bibliothek auf npm
 * veraltet ist. Gelesen werden Werte, Zahlenformate (Datum, Prozent, Währung,
 * Nachkommastellen) und Formeln; Diagramme, Bilder und Formatierungen nicht.
 */

export class SpreadsheetError extends Error {}

export const SHEET_LIMITS = {
  /** Zeilen mit Inhalt pro Tabellenblatt. */
  rows: 500,
  /** Spalten pro Tabellenblatt. */
  cols: 40,
  /** Zeichen pro Zelle. */
  cell: 300,
  /** Formeln, die pro Tabellenblatt aufgelistet werden. */
  formulas: 300,
  /** Zeichen insgesamt. */
  text: 150_000,
  /** Größte entpackte Einzeldatei in der ZIP-Datei. */
  entryBytes: 60 * 1024 * 1024,
};

// ---------- XML-Helfer ----------

function parseXml(text: string, what: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new SpreadsheetError(`${what} ist beschädigt.`);
  return doc;
}

function children(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS("*", name));
}

/** Attribut ohne Rücksicht auf das Namensraum-Präfix (z. B. r:id). */
function attr(el: Element, localName: string): string | null {
  const direct = el.getAttribute(localName);
  if (direct !== null) return direct;
  for (const a of Array.from(el.attributes)) if (a.localName === localName) return a.value;
  return null;
}

/** Excel kodiert Steuerzeichen als _xHHHH_. */
function decodeEscapes(s: string): string {
  return s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Text eines <si>- bzw. <is>-Elements ohne phonetische Hilfstexte (<rPh>). */
function richText(el: Element): string {
  return decodeEscapes(
    children(el, "t")
      .filter((t) => (t.parentNode as Element | null)?.localName !== "rPh")
      .map((t) => t.textContent ?? "")
      .join(""),
  );
}

// ---------- Zellbezüge ----------

export function columnName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref.toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
}

/**
 * Verschiebt relative Zellbezüge einer Formel – für „geteilte“ Formeln, die
 * Excel nur in der ersten Zelle eines Bereichs vollständig speichert.
 */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (!dRow && !dCol) return formula;
  // Nur außerhalb von Textkonstanten ("…") verschieben.
  return formula
    .split('"')
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(
            /(?<![A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
            (match, colAbs: string, colName: string, rowAbs: string, rowNum: string) => {
              const ref = parseRef(colName + rowNum);
              if (!ref) return match;
              const col = colAbs ? ref.col : ref.col + dCol;
              const row = rowAbs ? ref.row : ref.row + dRow;
              if (col < 0 || row < 1) return match;
              return `${colAbs}${columnName(col)}${rowAbs}${row}`;
            },
          ),
    )
    .join('"');
}

// ---------- Zahlenformate ----------

export type Fmt =
  | { type: "general" }
  | { type: "text" }
  | { type: "date"; time: boolean; seconds: boolean; date: boolean; elapsed: boolean }
  | { type: "number"; decimals: number; percent: boolean; grouping: boolean; prefix: string; suffix: string; scientific: boolean };

const BUILTIN_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "dd.mm.yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "dd.mm.yyyy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
  48: "##0.0E+0",
  49: "@",
};

/** Ostasiatische Datumsformate ohne festen Code – Excel speichert nur die ID. */
const BUILTIN_DATE_IDS = new Set([27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

export function analyzeFormat(code: string): Fmt {
  const section = code.split(";")[0];
  const cleaned = section
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/_.|\*./g, "")
    .replace(/\[(?![hms]+\])[^\]]*\]/gi, "");
  if (cleaned.trim() === "@") return { type: "text" };
  if (/general|standard/i.test(cleaned) && !/[0#?]/.test(cleaned)) return { type: "general" };
  if (!/[0#?]/.test(cleaned) && /[dmyhs]/i.test(cleaned)) {
    const time = /[hs]/i.test(cleaned);
    const date = /[dy]/i.test(cleaned) || (!time && /m/i.test(cleaned));
    return { type: "date", date, time, seconds: /s/i.test(cleaned), elapsed: /\[h+\]/i.test(cleaned) };
  }
  const decimals = /\.([0#?]+)/.exec(cleaned)?.[1].length ?? 0;
  const currency = /€|EUR/.test(section) ? "€" : /\$/.test(section.replace(/\[\$(?!\$)[^\]]*\]/g, "")) || /\[\$\$/.test(section) ? "$" : "";
  return {
    type: "number",
    decimals,
    percent: cleaned.includes("%"),
    grouping: /[#0],[#0]/.test(cleaned),
    prefix: currency === "$" ? "$" : "",
    suffix: currency === "€" ? " €" : "",
    scientific: /E[+-]/i.test(cleaned),
  };
}

function formatDecimal(n: number, decimals: number | null, grouping = false): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 10,
    useGrouping: grouping,
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

function formatSerialDate(serial: number, fmt: Extract<Fmt, { type: "date" }>, date1904: boolean): string {
  if (fmt.elapsed) {
    const totalSeconds = Math.round(serial * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const rest = `${h}:${pad(Math.floor((totalSeconds % 3600) / 60))}`;
    return fmt.seconds ? `${rest}:${pad(totalSeconds % 60)}` : rest;
  }
  // 25569 Tage zwischen 30.12.1899 (Excel-Nullpunkt) und 1.1.1970; 1462 Tage Versatz im 1904-System.
  const d = new Date(Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86_400_000));
  const datePart = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const timePart = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${fmt.seconds ? `:${pad(d.getUTCSeconds())}` : ""}`;
  if (fmt.date && fmt.time) return `${datePart} ${timePart}`;
  return fmt.time ? timePart : datePart;
}

export function formatNumber(value: number, fmt: Fmt, date1904 = false): string {
  if (!Number.isFinite(value)) return String(value);
  switch (fmt.type) {
    case "date":
      return formatSerialDate(value, fmt, date1904);
    case "number": {
      if (fmt.scientific) return value.toExponential(fmt.decimals).replace(".", ",");
      const n = fmt.percent ? value * 100 : value;
      const body = formatDecimal(n, fmt.decimals, fmt.grouping);
      return `${fmt.prefix}${body}${fmt.percent ? " %" : ""}${fmt.suffix}`;
    }
    default:
      return Number.isInteger(value) ? String(value) : formatDecimal(value, null);
  }
}

// ---------- Arbeitsmappe ----------

interface SheetInfo {
  name: string;
  path: string;
  hidden: boolean;
}

export interface Cell {
  row: number;
  col: number;
  value: string;
  formula?: string;
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `xl/${target}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

function readSheetList(files: Record<string, Uint8Array>): { sheets: SheetInfo[]; date1904: boolean } {
  const wbFile = files["xl/workbook.xml"];
  if (!wbFile) throw new SpreadsheetError("Die Datei enthält keine Excel-Arbeitsmappe.");
  const wb = parseXml(strFromU8(wbFile), "Die Arbeitsmappe");
  const pr = children(wb, "workbookPr")[0];
  const date1904 = !!pr && ["1", "true"].includes(attr(pr, "date1904") ?? "");

  const rels = new Map<string, { target: string; type: string }>();
  const relFile = files["xl/_rels/workbook.xml.rels"];
  if (relFile) {
    for (const r of children(parseXml(strFromU8(relFile), "Die Arbeitsmappe"), "Relationship")) {
      rels.set(attr(r, "Id") ?? "", { target: attr(r, "Target") ?? "", type: attr(r, "Type") ?? "" });
    }
  }
  const sheets: SheetInfo[] = [];
  children(wb, "sheet").forEach((s, i) => {
    const rel = rels.get(attr(s, "id") ?? "");
    if (rel && !/worksheet$/i.test(rel.type)) return; // Diagrammblätter u. Ä.
    const path = rel ? resolveTarget(rel.target) : `xl/worksheets/sheet${i + 1}.xml`;
    const state = attr(s, "state");
    sheets.push({ name: attr(s, "name") ?? `Blatt ${i + 1}`, path, hidden: state === "hidden" || state === "veryHidden" });
  });
  return { sheets, date1904 };
}

function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const file = files["xl/sharedStrings.xml"];
  if (!file) return [];
  return children(parseXml(strFromU8(file), "Die Textliste"), "si").map(richText);
}

function readStyles(files: Record<string, Uint8Array>): Fmt[] {
  const file = files["xl/styles.xml"];
  if (!file) return [];
  const doc = parseXml(strFromU8(file), "Die Formatvorlagen");
  const custom = new Map<number, string>();
  for (const f of children(doc, "numFmt")) custom.set(Number(attr(f, "numFmtId")), attr(f, "formatCode") ?? "General");
  const cellXfs = children(doc, "cellXfs")[0];
  if (!cellXfs) return [];
  return Array.from(cellXfs.children)
    .filter((el) => el.localName === "xf")
    .map((xf) => {
      return formatForId(Number(attr(xf, "numFmtId") ?? 0), custom);
    });
}

/** Zahlenformat zu einer Format-ID – eigene Formate der Datei oder eingebaute. Auch für .xls. */
export function formatForId(id: number, custom: Map<number, string>): Fmt {
  if (custom.has(id)) return analyzeFormat(custom.get(id)!);
  if (BUILTIN_DATE_IDS.has(id)) return analyzeFormat("dd.mm.yyyy");
  return analyzeFormat(BUILTIN_FORMATS[id] ?? "General");
}

function readCells(xml: string, strings: string[], styles: Fmt[], date1904: boolean): Cell[] {
  const doc = parseXml(xml, "Ein Tabellenblatt");
  const cells: Cell[] = [];
  const shared = new Map<string, { formula: string; row: number; col: number }>();
  let rowCounter = 0;
  for (const rowEl of children(doc, "row")) {
    const rowNum = Number(attr(rowEl, "r")) || rowCounter + 1;
    rowCounter = rowNum;
    let colCounter = -1;
    for (const c of Array.from(rowEl.children).filter((el) => el.localName === "c")) {
      const ref = parseRef(attr(c, "r") ?? "");
      const col = ref ? ref.col : colCounter + 1;
      colCounter = col;
      const type = attr(c, "t") ?? "n";
      const v = Array.from(c.children).find((el) => el.localName === "v")?.textContent ?? null;
      const fEl = Array.from(c.children).find((el) => el.localName === "f");

      let formula: string | undefined;
      if (fEl) {
        const text = fEl.textContent?.trim() ?? "";
        const si = attr(fEl, "si");
        if (attr(fEl, "t") === "shared" && si !== null) {
          if (text) shared.set(si, { formula: text, row: rowNum, col });
          else {
            const master = shared.get(si);
            if (master) formula = shiftFormula(master.formula, rowNum - master.row, col - master.col);
          }
        }
        formula ??= text || undefined;
      }

      let value = "";
      if (type === "s") value = v !== null ? (strings[Number(v)] ?? "") : "";
      else if (type === "inlineStr") {
        const is = Array.from(c.children).find((el) => el.localName === "is");
        value = is ? richText(is) : "";
      } else if (type === "str") value = decodeEscapes(v ?? "");
      else if (type === "b") value = v === null ? "" : v === "1" || v === "true" ? "WAHR" : "FALSCH";
      else if (type === "e") value = v ?? "";
      else if (type === "d") {
        const d = v ? new Date(v) : null;
        value = d && !Number.isNaN(d.getTime()) ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : (v ?? "");
      } else if (v !== null && v !== "") {
        const n = Number(v);
        value = Number.isNaN(n) ? v : formatNumber(n, styles[Number(attr(c, "s") ?? 0)] ?? { type: "general" }, date1904);
      }
      if (value || formula) cells.push({ row: rowNum, col, value, formula });
    }
  }
  return cells;
}

// ---------- Markdown ----------

function escapeCell(text: string): string {
  const flat = text.replace(/\r?\n/g, " / ").replace(/\s+/g, " ").trim();
  const capped = flat.length > SHEET_LIMITS.cell ? `${flat.slice(0, SHEET_LIMITS.cell - 1)}…` : flat;
  return capped.replace(/([|$*\\`])/g, "\\$1");
}

function sheetMarkdown(sheet: { name: string; hidden: boolean }, cells: Cell[]): { text: string; hasFormulas: boolean } {
  const title = `## Tabellenblatt „${sheet.name}“${sheet.hidden ? " (ausgeblendet)" : ""}`;
  if (cells.length === 0) return { text: `${title}\n\n(leer)`, hasFormulas: false };

  const minCol = Math.min(...cells.map((c) => c.col));
  const maxCol = Math.max(...cells.map((c) => c.col));
  const lastCol = Math.min(maxCol, minCol + SHEET_LIMITS.cols - 1);
  const rows = new Map<number, Map<number, Cell>>();
  for (const c of cells) {
    if (!rows.has(c.row)) rows.set(c.row, new Map());
    rows.get(c.row)!.set(c.col, c);
  }
  const rowNums = [...rows.keys()].sort((a, b) => a - b);
  const shownRows = rowNums.slice(0, SHEET_LIMITS.rows);
  const range = `${columnName(minCol)}${rowNums[0]}:${columnName(maxCol)}${rowNums[rowNums.length - 1]}`;

  const cols = Array.from({ length: lastCol - minCol + 1 }, (_, i) => minCol + i);
  const lines = [
    `${title} (${range})`,
    "",
    `|  | ${cols.map(columnName).join(" | ")} |`,
    `| ---: | ${cols.map(() => "---").join(" | ")} |`,
  ];
  for (const r of shownRows) {
    const row = rows.get(r)!;
    const values = cols.map((c) => {
      const cell = row.get(c);
      if (!cell) return "";
      return escapeCell(cell.value || (cell.formula ? `=${cell.formula}` : ""));
    });
    lines.push(`| ${r} | ${values.join(" | ")} |`);
  }
  const notes: string[] = [];
  if (rowNums.length > shownRows.length) {
    notes.push(`${rowNums.length - shownRows.length} weitere Zeilen ab Zeile ${rowNums[shownRows.length]} nicht übernommen`);
  }
  if (maxCol > lastCol) notes.push(`Spalten ab ${columnName(lastCol + 1)} nicht übernommen`);
  if (notes.length) lines.push("", `(Gekürzt: ${notes.join("; ")}.)`);

  const shown = new Set(shownRows);
  const formulas = cells.filter((c) => c.formula && shown.has(c.row) && c.col <= lastCol);
  if (formulas.length) {
    lines.push("", "Formeln:");
    for (const c of formulas.slice(0, SHEET_LIMITS.formulas)) {
      lines.push(`- ${columnName(c.col)}${c.row}: \`=${c.formula!.replace(/`/g, "'")}\`${c.value ? ` → ${escapeCell(c.value)}` : ""}`);
    }
    if (formulas.length > SHEET_LIMITS.formulas) lines.push(`- … und ${formulas.length - SHEET_LIMITS.formulas} weitere`);
  }
  return { text: lines.join("\n"), hasFormulas: formulas.length > 0 };
}

/** Wandelt eine .xlsx-Datei in Markdown um (alle Tabellenblätter). */
export function xlsxToMarkdown(data: Uint8Array, fileName: string): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) =>
        f.originalSize <= SHEET_LIMITS.entryBytes &&
        (/^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml)$/.test(f.name) ||
          f.name === "xl/_rels/workbook.xml.rels" ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)),
    });
  } catch {
    throw new SpreadsheetError(`„${fileName}“ konnte nicht gelesen werden – ist es eine Excel-Datei im Format .xlsx?`);
  }
  const { sheets, date1904 } = readSheetList(files);
  const strings = readSharedStrings(files);
  const styles = readStyles(files);
  return workbookMarkdown(
    fileName,
    sheets.map((sheet) => ({
      name: sheet.name,
      hidden: sheet.hidden,
      cells: () => (files[sheet.path] ? readCells(strFromU8(files[sheet.path]), strings, styles, date1904) : []),
    })),
  );
}

export interface SheetSource {
  name: string;
  hidden: boolean;
  /** Zellen erst bei Bedarf lesen – bei sehr großen Mappen werden spätere Blätter ausgelassen. */
  cells: () => Cell[];
}

/** Baut aus den Tabellenblättern einer Excel-Datei (.xlsx oder .xls) den Markdown-Text. */
export function workbookMarkdown(fileName: string, sheets: SheetSource[], extraNote?: string): string {
  if (sheets.length === 0) throw new SpreadsheetError(`„${fileName}“ enthält keine Tabellenblätter.`);
  const parts: string[] = [];
  let length = 0;
  let anyFormulas = false;
  const omitted: string[] = [];
  for (const sheet of sheets) {
    if (length > SHEET_LIMITS.text) {
      omitted.push(sheet.name);
      continue;
    }
    const md = sheetMarkdown(sheet, sheet.cells());
    anyFormulas ||= md.hasFormulas;
    parts.push(md.text);
    length += md.text.length;
  }

  const head = [
    `Excel-Datei „${fileName}“ mit ${sheets.length === 1 ? "1 Tabellenblatt" : `${sheets.length} Tabellenblättern`}: ${sheets
      .map((s) => `„${s.name}“`)
      .join(", ")}.`,
  ];
  if (anyFormulas) {
    head.push("Formeln stehen so da, wie Excel sie speichert (englische Funktionsnamen, Komma als Trennzeichen).");
  }
  if (extraNote) head.push(extraNote);
  if (omitted.length) {
    head.push(`Wegen der Größe nicht übernommen: ${omitted.map((n) => `„${n}“`).join(", ")}.`);
  }
  return `${head.join(" ")}\n\n${parts.join("\n\n")}`;
}
