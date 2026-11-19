import { CfbError, isCfb, readCfbStreams } from "./cfb";
import { SpreadsheetError, formatForId, formatNumber, workbookMarkdown, type Cell, type Fmt } from "./xlsx";

/**
 * Liest alte Excel-Dateien (.xls, Excel 97–2003, „BIFF8“). Übernommen werden
 * alle Tabellenblätter mit Werten und Zahlenformaten. Formeln stehen in .xls
 * nur verschlüsselt als Rechenschritte in der Datei – übernommen wird ihr
 * zuletzt berechnetes Ergebnis.
 */

const R = {
  BOF: 0x0809,
  EOF: 0x000a,
  FILEPASS: 0x002f,
  DATEMODE: 0x0022,
  FORMAT: 0x041e,
  XF: 0x00e0,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  RSTRING: 0x00d6,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  BOOLERR: 0x0205,
  FORMULA: 0x0006,
  STRING: 0x0207,
} as const;

const ERRORS: Record<number, string> = {
  0x00: "#NULL!",
  0x07: "#DIV/0!",
  0x0f: "#VALUE!",
  0x17: "#REF!",
  0x1d: "#NAME?",
  0x24: "#NUM!",
  0x2a: "#N/A",
};

interface Rec {
  id: number;
  data: Uint8Array;
  /** Position des Datensatzes im Datenstrom. */
  pos: number;
}

function* records(stream: Uint8Array, start = 0): Generator<Rec> {
  let pos = start;
  while (pos + 4 <= stream.length) {
    const id = stream[pos] | (stream[pos + 1] << 8);
    const len = stream[pos + 2] | (stream[pos + 3] << 8);
    yield { id, data: stream.subarray(pos + 4, Math.min(pos + 4 + len, stream.length)), pos };
    pos += 4 + len;
  }
}

const u16 = (d: Uint8Array, p: number) => d[p] | (d[p + 1] << 8);
const u32 = (d: Uint8Array, p: number) => (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
const f64 = (d: Uint8Array, p: number) => new DataView(d.buffer, d.byteOffset + p, 8).getFloat64(0, true);

/** Zeichen lesen: 8 Bit (komprimiert, Latin-1) oder UTF-16. */
function chars(d: Uint8Array, p: number, count: number, wide: boolean): { text: string; end: number } {
  let text = "";
  if (wide) {
    const n = Math.min(count, Math.floor((d.length - p) / 2));
    for (let i = 0; i < n; i++) text += String.fromCharCode(u16(d, p + i * 2));
    return { text, end: p + n * 2 };
  }
  const n = Math.min(count, d.length - p);
  for (let i = 0; i < n; i++) text += String.fromCharCode(d[p + i]);
  return { text, end: p + n };
}

/** XLUnicodeString: Länge (16 Bit), Optionen, Zeichen. */
function unicodeString(d: Uint8Array, p: number): string {
  return chars(d, p + 3, u16(d, p), (d[p + 2] & 1) === 1).text;
}

/** RK-Zahl: kompakt gespeicherte Ganz- oder Gleitkommazahl, ggf. durch 100 geteilt. */
export function decodeRk(rk: number): number {
  let n: number;
  if (rk & 2) {
    n = rk >> 2; // vorzeichenbehaftete 30-Bit-Ganzzahl
  } else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, rk & 0xfffffffc, true);
    n = buf.getFloat64(0, true);
  }
  return rk & 1 ? n / 100 : n;
}

/** Gemeinsame Textliste (SST) – Texte dürfen über CONTINUE-Datensätze verteilt sein. */
function readSst(chunks: Uint8Array[]): string[] {
  const strings: string[] = [];
  if (!chunks.length) return strings;
  let ci = 0;
  let d = chunks[0];
  const count = u32(d, 4);
  let pos = 8;
  const next = () => {
    ci++;
    d = chunks[ci] ?? new Uint8Array(0);
    pos = 0;
  };
  const skip = (n: number) => {
    while (n > 0 && ci < chunks.length) {
      const avail = d.length - pos;
      if (n <= avail) {
        pos += n;
        return;
      }
      n -= avail;
      next();
    }
  };
  for (let i = 0; i < count && ci < chunks.length; i++) {
    if (pos >= d.length) next();
    if (ci >= chunks.length) break;
    const cch = u16(d, pos);
    let flags = d[pos + 2];
    pos += 3;
    let runs = 0;
    let ext = 0;
    if (flags & 0x08) {
      runs = u16(d, pos);
      pos += 2;
    }
    if (flags & 0x04) {
      ext = u32(d, pos);
      pos += 4;
    }
    let text = "";
    let got = 0;
    for (;;) {
      const part = chars(d, pos, cch - got, (flags & 1) === 1);
      got += part.text.length;
      text += part.text;
      pos = part.end;
      if (got >= cch || ci >= chunks.length - 1) break;
      // Fortsetzung: Der nächste Abschnitt beginnt mit neuen Optionen (8 oder 16 Bit).
      next();
      flags = d[0];
      pos = 1;
    }
    skip(runs * 4);
    skip(ext);
    strings.push(text);
  }
  return strings;
}

interface SheetEntry {
  name: string;
  offset: number;
  hidden: boolean;
}

/** Wandelt eine .xls-Datei in Markdown um (alle Tabellenblätter). */
export function xlsToMarkdown(data: Uint8Array, fileName: string): string {
  if (!isCfb(data)) {
    throw new SpreadsheetError(`„${fileName}“ ist keine Excel-Datei im Format .xls (oder stammt aus einer sehr alten Excel-Version).`);
  }
  let stream: Uint8Array | undefined;
  try {
    const streams = readCfbStreams(data, ["Workbook", "Book"]);
    stream = streams.get("Workbook");
    if (!stream && streams.has("Book")) {
      throw new SpreadsheetError(`„${fileName}“ stammt aus Excel 95 oder älter. Bitte in Excel als .xlsx speichern.`);
    }
  } catch (e) {
    if (e instanceof SpreadsheetError) throw e;
    throw new SpreadsheetError(`„${fileName}“ konnte nicht gelesen werden${e instanceof CfbError ? ` (${e.message})` : ""}.`);
  }
  if (!stream) throw new SpreadsheetError(`„${fileName}“ enthält keine Excel-Arbeitsmappe.`);

  // Arbeitsmappen-Teil: Blätter, Textliste, Formate
  const sheets: SheetEntry[] = [];
  const formats = new Map<number, string>();
  const xfFormats: number[] = [];
  const sstChunks: Uint8Array[] = [];
  let date1904 = false;
  let inSst = false;
  let first = true;
  for (const rec of records(stream)) {
    if (first) {
      first = false;
      if (rec.id !== R.BOF) throw new SpreadsheetError(`„${fileName}“ ist beschädigt.`);
      if (u16(rec.data, 0) !== 0x0600) {
        throw new SpreadsheetError(`„${fileName}“ stammt aus Excel 95 oder älter. Bitte in Excel als .xlsx speichern.`);
      }
      continue;
    }
    if (rec.id === R.CONTINUE && inSst) {
      sstChunks.push(rec.data);
      continue;
    }
    inSst = false;
    switch (rec.id) {
      case R.EOF:
        break;
      case R.FILEPASS:
        throw new SpreadsheetError(`„${fileName}“ ist mit einem Passwort geschützt. Bitte den Schutz in Excel entfernen.`);
      case R.DATEMODE:
        date1904 = u16(rec.data, 0) === 1;
        continue;
      case R.FORMAT:
        formats.set(u16(rec.data, 0), unicodeString(rec.data, 2));
        continue;
      case R.XF:
        xfFormats.push(u16(rec.data, 2));
        continue;
      case R.BOUNDSHEET: {
        const type = rec.data[5];
        if (type !== 0) continue; // Diagramm-, Makro- und VBA-Blätter
        const cch = rec.data[6];
        const name = chars(rec.data, 8, cch, (rec.data[7] & 1) === 1).text;
        sheets.push({ name, offset: u32(rec.data, 0), hidden: (rec.data[4] & 3) !== 0 });
        continue;
      }
      case R.SST:
        sstChunks.push(rec.data);
        inSst = true;
        continue;
      default:
        continue;
    }
    break; // EOF der Arbeitsmappen-Daten
  }
  const strings = readSst(sstChunks);
  const fmtCache = new Map<number, Fmt>();
  const fmtOf = (xf: number): Fmt => {
    const id = xfFormats[xf] ?? 0;
    if (!fmtCache.has(id)) fmtCache.set(id, formatForId(id, formats));
    return fmtCache.get(id)!;
  };
  const num = (n: number, xf: number) => formatNumber(n, fmtOf(xf), date1904);

  function readSheet(offset: number): Cell[] {
    const cells: Cell[] = [];
    const put = (row: number, col: number, value: string) => {
      if (value !== "") cells.push({ row: row + 1, col, value });
    };
    let depth = 0;
    let pendingString: { row: number; col: number } | null = null;
    let stringChunks: Uint8Array[] | null = null;
    const finishString = () => {
      if (pendingString && stringChunks) {
        // STRING-Datensatz (Ergebnis einer Textformel), ggf. mit CONTINUE fortgesetzt
        const d = stringChunks[0];
        let text = chars(d, 3, u16(d, 0), (d[2] & 1) === 1).text;
        for (const c of stringChunks.slice(1)) text += chars(c, 1, u16(d, 0) - text.length, (c[0] & 1) === 1).text;
        put(pendingString.row, pendingString.col, text);
      }
      pendingString = null;
      stringChunks = null;
    };
    for (const rec of records(stream!, offset)) {
      const d = rec.data;
      if (rec.id === R.BOF) {
        depth++;
        continue;
      }
      if (rec.id === R.EOF) {
        depth--;
        if (depth <= 0) break;
        continue;
      }
      if (depth !== 1) continue; // eingebettete Diagramme
      if (rec.id === R.CONTINUE && stringChunks) {
        stringChunks.push(d);
        continue;
      }
      if (stringChunks) finishString();
      switch (rec.id) {
        case R.LABELSST:
          put(u16(d, 0), u16(d, 2), strings[u32(d, 6)] ?? "");
          break;
        case R.LABEL:
        case R.RSTRING:
          put(u16(d, 0), u16(d, 2), unicodeString(d, 6));
          break;
        case R.NUMBER:
          put(u16(d, 0), u16(d, 2), num(f64(d, 6), u16(d, 4)));
          break;
        case R.RK:
          put(u16(d, 0), u16(d, 2), num(decodeRk(u32(d, 6)), u16(d, 4)));
          break;
        case R.MULRK: {
          const row = u16(d, 0);
          const firstCol = u16(d, 2);
          const n = Math.floor((d.length - 6) / 6);
          for (let i = 0; i < n; i++) put(row, firstCol + i, num(decodeRk(u32(d, 6 + i * 6)), u16(d, 4 + i * 6)));
          break;
        }
        case R.BOOLERR:
          put(u16(d, 0), u16(d, 2), d[7] ? (ERRORS[d[6]] ?? "#FEHLER") : d[6] ? "WAHR" : "FALSCH");
          break;
        case R.FORMULA: {
          const row = u16(d, 0);
          const col = u16(d, 2);
          if (d[12] === 0xff && d[13] === 0xff) {
            const type = d[6];
            if (type === 0) pendingString = { row, col }; // Text folgt im STRING-Datensatz
            else if (type === 1) put(row, col, d[8] ? "WAHR" : "FALSCH");
            else if (type === 2) put(row, col, ERRORS[d[8]] ?? "#FEHLER");
          } else {
            put(row, col, num(f64(d, 6), u16(d, 4)));
          }
          break;
        }
        case R.STRING:
          if (pendingString) stringChunks = [d];
          break;
        default:
          break;
      }
    }
    if (stringChunks) finishString();
    return cells;
  }

  return workbookMarkdown(
    fileName,
    sheets.map((s) => ({ name: s.name, hidden: s.hidden, cells: () => readSheet(s.offset) })),
    "Alte Excel-Datei (.xls): Formeln sind nur mit ihrem Ergebnis übernommen.",
  );
}
