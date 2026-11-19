// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readCfbStreams } from "../src/lib/cfb";
import { cleanWordText, docToText } from "../src/lib/doc";
import { docxToMarkdown } from "../src/lib/docx";
import { conversionHint, isSupportedFile } from "../src/lib/files";
import { decodeRk, xlsToMarkdown } from "../src/lib/xls";

// ---------- Hilfen: kleinen Office-Container (CFB) bauen ----------

const SECTOR = 512;

/** Baut einen CFB-Container; Ströme ab 4096 Byte (kleinere werden aufgefüllt), damit keine Mini-Sektoren nötig sind. */
function buildCfb(streams: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(streams);
  const padded = names.map((n) => {
    const s = streams[n];
    const size = Math.max(4096, Math.ceil(s.length / SECTOR) * SECTOR);
    const out = new Uint8Array(size);
    out.set(s);
    return { name: n, data: out, size: s.length < 4096 ? 4096 : s.length };
  });
  const dataSectors = padded.reduce((n, s) => n + s.data.length / SECTOR, 0);
  const total = 2 + dataSectors; // Sektor 0: FAT, Sektor 1: Verzeichnis
  const file = new Uint8Array(SECTOR * (total + 1));
  const v = new DataView(file.buffer);
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (file[i] = b));
  v.setUint16(0x1a, 3, true);
  v.setUint16(0x1c, 0xfffe, true);
  v.setUint16(0x1e, 9, true);
  v.setUint16(0x20, 6, true);
  v.setUint32(0x2c, 1, true);
  v.setUint32(0x30, 1, true);
  v.setUint32(0x38, 4096, true);
  v.setUint32(0x3c, 0xfffffffe, true);
  v.setUint32(0x44, 0xfffffffe, true);
  for (let i = 0; i < 109; i++) v.setUint32(0x4c + i * 4, i === 0 ? 0 : 0xffffffff, true);
  const fat = (i: number, val: number) => v.setUint32(SECTOR + i * 4, val, true);
  for (let i = 0; i < SECTOR / 4; i++) fat(i, 0xffffffff);
  fat(0, 0xfffffffd);
  fat(1, 0xfffffffe);
  const dir = (index: number, name: string, type: number, start: number, size: number, right: number, child: number) => {
    const base = SECTOR * 2 + index * 128;
    for (let i = 0; i < name.length; i++) v.setUint16(base + i * 2, name.charCodeAt(i), true);
    v.setUint16(base + 0x40, (name.length + 1) * 2, true);
    file[base + 0x42] = type;
    v.setUint32(base + 0x44, 0xffffffff, true);
    v.setUint32(base + 0x48, right, true);
    v.setUint32(base + 0x4c, child, true);
    v.setUint32(base + 0x74, start, true);
    v.setUint32(base + 0x78, size, true);
  };
  dir(0, "Root Entry", 5, 0xfffffffe, 0, 0xffffffff, 1);
  let sector = 2;
  padded.forEach((s, i) => {
    const count = s.data.length / SECTOR;
    for (let k = 0; k < count; k++) fat(sector + k, k === count - 1 ? 0xfffffffe : sector + k + 1);
    file.set(s.data, SECTOR * (sector + 1));
    dir(i + 1, s.name, 2, sector, s.size, i + 2 < padded.length + 1 ? i + 2 : 0xffffffff, 0xffffffff);
    sector += count;
  });
  return file;
}

/** Minimale Word-97-Datei mit zwei Textstücken (8 Bit und UTF-16) und einem Textfeld nach dem Haupttext. */
function buildDoc(): Uint8Array {
  const wd = new Uint8Array(4096);
  const w = new DataView(wd.buffer);
  w.setUint16(0, 0xa5ec, true);
  w.setUint16(2, 0x00c1, true);
  w.setUint16(0x0a, 0x0200, true); // Tabellenstrom „1Table“
  w.setUint16(32, 14, true); // csw
  w.setUint16(62, 22, true); // cslw
  const fibRgLw = 64;
  w.setUint16(152, 0x5d, true); // cbRgFcLcb
  const fcLcb = 154;

  const piece1 = "Übung 1 – Bilanz\r"; // 8 Bit (Windows-1252)
  const piece2 = "Aktiva\x07Passiva\x07\x07Kasse\x07Eigenkapital\x07\x07Siehe \x13 PAGEREF x \x14Seite 2\x15.\r"; // UTF-16
  const extra = "Textfeld: Lösungshinweis\r";
  const b1 = 2048;
  const b2 = 2400;
  const b3 = 3200;
  const cp1252: Record<string, number> = { Ü: 0xdc, "–": 0x96 };
  [...piece1].forEach((ch, i) => (wd[b1 + i] = cp1252[ch] ?? ch.charCodeAt(0)));
  [...piece2].forEach((ch, i) => w.setUint16(b2 + i * 2, ch.charCodeAt(0), true));
  [...extra].forEach((ch, i) => w.setUint16(b3 + i * 2, ch.charCodeAt(0), true));
  const ccpText = piece1.length + piece2.length;
  w.setInt32(fibRgLw + 12, ccpText, true);

  const table = new Uint8Array(256);
  const t = new DataView(table.buffer);
  table[0] = 0x01; // Prc (Formatierung) – wird übersprungen
  t.setInt16(1, 2, true);
  let p = 5;
  table[p] = 0x02;
  const n = 3;
  t.setUint32(p + 1, (n + 1) * 4 + n * 8, true);
  const cps = [0, piece1.length, ccpText, ccpText + extra.length];
  cps.forEach((cp, i) => t.setUint32(p + 5 + i * 4, cp, true));
  const pcds = p + 5 + (n + 1) * 4;
  t.setUint32(pcds + 2, (b1 * 2) | 0x40000000, true);
  t.setUint32(pcds + 8 + 2, b2, true);
  t.setUint32(pcds + 16 + 2, b3, true);
  w.setUint32(fcLcb + 33 * 8, 0, true); // fcClx
  w.setUint32(fcLcb + 33 * 8 + 4, p + 5 + (n + 1) * 4 + n * 8, true); // lcbClx
  return buildCfb({ WordDocument: wd, "1Table": table });
}

// ---------- Tests ----------

describe("Alter Office-Container", () => {
  it("findet die Datenströme unter der Wurzel", () => {
    const streams = readCfbStreams(buildCfb({ Workbook: strToU8("abc"), Other: strToU8("x") }), ["workbook"]);
    expect([...streams.keys()]).toEqual(["workbook"]);
    expect(Array.from(streams.get("workbook")!.slice(0, 3))).toEqual([97, 98, 99]);
  });
});

describe("Excel 97–2003 (.xls)", () => {
  const md = xlsToMarkdown(new Uint8Array(readFileSync("tests/fixtures/bilanz.xls")), "bilanz.xls");

  it("liest alle Blätter mit Zahlenformaten", () => {
    expect(md).toMatch(/^Excel-Datei „bilanz\.xls“ mit 3 Tabellenblättern: „Bilanz“, „Buchungssätze“, „Lösungen“\./);
    expect(md).toContain("Formeln sind nur mit ihrem Ergebnis übernommen");
    expect(md).toContain("| 2 | Grundstücke | 120.000,00 € |");
    expect(md).toContain("| 3 | Kasse | 2.450,50 € |");
    expect(md).toContain("| 6 | Stichtag | 31.12.2026 |");
    expect(md).toContain("| 7 | Eigenkapitalquote | 42,5 % |");
    expect(md).toContain("| 8 | Geprüft | WAHR |");
    expect(md).toContain("| 9 | Kleine Zahl | -7 |");
    expect(md).toContain("## Tabellenblatt „Lösungen“ (ausgeblendet)");
  });

  it("liest Texte, die über mehrere Datensätze verteilt sind", () => {
    for (const i of [1, 97, 150, 200]) {
      expect(md).toContain(`| ${i} | Buchungssatz ${i}: Soll an Haben – Umsatzerlöse und Forderungen aus Lieferungen | ${(i - 1) * 10} |`);
    }
  });

  it("dekodiert RK-Zahlen", () => {
    expect(decodeRk((100 << 2) | 2)).toBe(100);
    expect(decodeRk((12345 << 2) | 3)).toBe(123.45);
    expect(decodeRk(0x3ff00000)).toBe(1);
    expect(decodeRk((-7 << 2) | 2)).toBe(-7);
  });

  it("meldet keine Excel-Datei verständlich", () => {
    expect(() => xlsToMarkdown(strToU8("kein excel"), "a.xls")).toThrow("ist keine Excel-Datei");
  });
});

describe("Word 97–2003 (.doc)", () => {
  it("liest Text aus 8-Bit- und UTF-16-Stücken, Tabellen und Feldergebnisse", () => {
    expect(docToText(buildDoc(), "Übung.doc")).toBe(
      [
        "Übung 1 – Bilanz",
        "Aktiva | Passiva",
        "Kasse | Eigenkapital",
        "Siehe Seite 2.",
        "",
        "--- Weitere Texte (Fußnoten, Kopf-/Fußzeilen, Textfelder) ---",
        "Textfeld: Lösungshinweis",
      ].join("\n"),
    );
  });

  it("räumt Steuerzeichen auf", () => {
    expect(cleanWordText("A\x13 HYPERLINK \x13 inner \x15 \x14Link\x15 B\x01\x08\rC\x0bD\x1eE")).toBe("ALink B\nC\nD-E");
  });

  it("erkennt Nicht-Word-Dateien", () => {
    expect(() => docToText(strToU8("{\\rtf1 ..."), "a.doc")).toThrow("keine Word-Datei");
  });
});

describe("Word (.docx)", () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const docx = zipSync({
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W}><w:body>
<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:r><w:t>Die 4 Fälle der Bilanzveränderung</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Kosten: 100 $ </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>netto</w:t></w:r><w:del><w:r><w:delText>alt</w:delText></w:r></w:del></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Aktivtausch</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>Passivtausch</w:t></w:r></w:p>
<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:t>Seite 3</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Soll</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Haben</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Kasse | Bank</w:t></w:r></w:p><w:p><w:r><w:t>2. Zeile</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Eigenkapital</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><mc:AlternateContent><mc:Choice><w:t>Textfeld</w:t></mc:Choice><mc:Fallback><w:t>Textfeld</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>
<w:sectPr/></w:body></w:document>`),
  });

  it("übernimmt Überschriften, Listen und Tabellen als Markdown", () => {
    expect(docxToMarkdown(docx, "Beispiel.docx")).toBe(
      [
        "## Die 4 Fälle der Bilanzveränderung",
        "Kosten: 100 \\$ netto",
        "- Aktivtausch",
        "- Passivtausch",
        "Seite 3",
        "| Soll | Haben |\n| --- | --- |\n| Kasse \\| Bank / 2. Zeile | Eigenkapital |",
        "Textfeld",
      ].join("\n\n"),
    );
  });
});

describe("Unterstützte Formate", () => {
  it("nimmt alte und neue Office-Formate an", () => {
    for (const name of ["a.xls", "a.xlsx", "a.doc", "a.docx", "Übung 05 - Lösungsansätze.xls"]) expect(isSupportedFile(name, ""), name).toBe(true);
    for (const name of ["a.pptx", "a.ods", "a.odt"]) expect(isSupportedFile(name, ""), name).toBe(false);
    expect(conversionHint("a.pptx")).toBe("Präsentationen bitte als PDF exportieren");
  });
});
