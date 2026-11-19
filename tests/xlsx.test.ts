// @vitest-environment jsdom
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeFormat, columnName, formatNumber, parseRef, shiftFormula, xlsxToMarkdown } from "../src/lib/xlsx";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** Baut eine kleine .xlsx-Datei so, wie Excel sie speichert. */
function makeWorkbook(): Uint8Array {
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${NS}><workbookPr/><sheets>
<sheet name="Kalkulation" sheetId="1" r:id="rId1"/>
<sheet name="Lösungen" sheetId="2" state="hidden" r:id="rId2"/>
<sheet name="Diagramm" sheetId="3" r:id="rId4"/>
<sheet name="Leer" sheetId="4" r:id="rId5"/>
</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet1.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
  const strings = `<?xml version="1.0" encoding="UTF-8"?>
<sst ${NS} count="5" uniqueCount="5">
<si><t>Artikel</t></si>
<si><t>Menge</t></si>
<si><r><rPr><b/></rPr><t>Preis</t></r><r><t xml:space="preserve"> netto</t></r><rPh sb="0" eb="1"><t>ふりがな</t></rPh></si>
<si><t>Äpfel | Birnen</t></si>
<si><t>Zeile 1_x000D_
Zeile 2</t></si>
</sst>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet ${NS}>
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="10" applyNumberFormat="1"/><xf numFmtId="2" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;
  const sheet1 = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet ${NS}><dimension ref="A1:E6"/><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Summe</t></is></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1200</v></c><c r="C2" s="1"><v>0.5</v></c><c r="D2" s="1"><f t="shared" ref="D2:D4" si="0">B2*C2</f><v>600</v></c><c r="E2" s="2"><v>45000</v></c></row>
<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3"><v>3</v></c><c r="C3" s="1"><v>1.25</v></c><c r="D3" s="1"><f t="shared" si="0"/><v>3.75</v></c><c r="E3" s="3"><v>0.125</v></c></row>
<row r="4"><c r="A4" t="b"><v>1</v></c><c r="B4"><v>0.1</v></c><c r="C4" s="4"><v>2.5</v></c><c r="D4" s="1"><f t="shared" si="0"/><v>0.25</v></c><c r="E4" t="e"><v>#DIV/0!</v></c></row>
<row r="6"><c r="C6" t="str"><f>IF(D5&gt;0,"Preis $",A1)</f><v>Preis $</v></c><c r="D6" s="1"><f>SUM($D$2:D4)</f><v>603.999999999</v></c><c r="E6"><f>B2/B3</f></c></row>
</sheetData></worksheet>`;
  // Präfix-Namensraum wie bei manchen Programmen (OpenXML SDK)
  const sheet2 = `<?xml version="1.0" encoding="UTF-8"?>
<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>
<x:row r="2"><x:c r="B2" t="inlineStr"><x:is><x:t>Lösung zu Aufgabe 1</x:t></x:is></x:c></x:row>
</x:sheetData></x:worksheet>`;
  const sheet3 = `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS}><sheetData/></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/sharedStrings.xml": strToU8(strings),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(sheet1),
    "xl/worksheets/sheet2.xml": strToU8(sheet2),
    "xl/worksheets/sheet3.xml": strToU8(sheet3),
  });
}

describe("Excel lesen", () => {
  const md = xlsxToMarkdown(makeWorkbook(), "Kalkulation.xlsx");

  it("listet die Tabellenblätter (ohne Diagrammblatt)", () => {
    expect(md).toMatch(/^Excel-Datei „Kalkulation\.xlsx“ mit 3 Tabellenblättern: „Kalkulation“, „Lösungen“, „Leer“\./);
    expect(md).toContain("## Tabellenblatt „Kalkulation“ (A1:E6)");
    expect(md).toContain("## Tabellenblatt „Lösungen“ (ausgeblendet) (B2:B2)");
    expect(md).toContain("## Tabellenblatt „Leer“\n\n(leer)");
    expect(md).not.toContain("Diagramm“ (");
  });

  it("baut eine Tabelle mit Zeilennummern und Spaltenbuchstaben", () => {
    expect(md).toContain("|  | A | B | C | D | E |\n| ---: | --- | --- | --- | --- | --- |");
    expect(md).toContain("| 1 | Artikel | Menge | Preis netto | Summe |  |");
    // Zahlenformate: Währung mit Tausenderpunkt, Datum, Prozent, Nachkommastellen; Text mit | maskiert
    expect(md).toContain("| 2 | Äpfel \\| Birnen | 1200 | 0,50 € | 600,00 € | 15.03.2023 |");
    expect(md).toContain("| 3 | Zeile 1 / Zeile 2 | 3 | 1,25 € | 3,75 € | 12,50 % |");
    expect(md).toContain("| 4 | WAHR | 0,1 | 2,50 | 0,25 € | #DIV/0! |");
    // leere Zeile 5 entfällt, Formel ohne gespeicherten Wert wird gezeigt
    expect(md).not.toContain("| 5 |");
    expect(md).toContain("| 6 |  |  | Preis \\$ | 604,00 € | =B2/B3 |");
  });

  it("listet Formeln – geteilte Formeln mit verschobenen Bezügen", () => {
    expect(md).toContain("Formeln stehen so da, wie Excel sie speichert");
    expect(md).toContain("- D2: `=B2*C2` → 600,00 €");
    expect(md).toContain("- D3: `=B3*C3` → 3,75 €");
    expect(md).toContain("- D4: `=B4*C4` → 0,25 €");
    expect(md).toContain('- C6: `=IF(D5>0,"Preis $",A1)` → Preis \\$');
    expect(md).toContain("- D6: `=SUM($D$2:D4)`");
    expect(md).toContain("- E6: `=B2/B3`\n");
  });

  it("liest Präfix-Namensräume und Inline-Text", () => {
    expect(md).toContain("| 2 | Lösung zu Aufgabe 1 |");
  });

  it("meldet kaputte Dateien verständlich", () => {
    expect(() => xlsxToMarkdown(new Uint8Array([1, 2, 3]), "kaputt.xlsx")).toThrow("kaputt.xlsx");
    expect(() => xlsxToMarkdown(zipSync({ "a.txt": strToU8("x") }), "a.xlsx")).toThrow("keine Excel-Arbeitsmappe");
  });

  it("kürzt sehr große Tabellen", () => {
    const rows = Array.from({ length: 620 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join("");
    const big = zipSync({
      "xl/workbook.xml": strToU8(`<workbook ${NS}><sheets><sheet name="Daten" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`),
    });
    const text = xlsxToMarkdown(big, "Daten.xlsx");
    expect(text).toContain("| 500 | 499 |");
    expect(text).not.toContain("| 501 |");
    expect(text).toContain("(Gekürzt: 120 weitere Zeilen ab Zeile 501 nicht übernommen.)");
  });
});

describe("Zellbezüge und Formate", () => {
  it("rechnet Spalten um", () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
    expect(parseRef("$AB$12")).toEqual({ col: 27, row: 12 });
  });

  it("verschiebt nur relative Bezüge außerhalb von Text", () => {
    expect(shiftFormula("B2*C2", 1, 0)).toBe("B3*C3");
    expect(shiftFormula("SUM($A$1:A2)+$B2+C$3", 2, 1)).toBe("SUM($A$1:B4)+$B4+D$3");
    expect(shiftFormula('IF(A1>0,"B2",A1)', 1, 0)).toBe('IF(A2>0,"B2",A2)');
    expect(shiftFormula("LOG10(A1)+Kosten!B2", 1, 0)).toBe("LOG10(A2)+Kosten!B3");
  });

  it("erkennt Zahlenformate", () => {
    expect(formatNumber(45000.5, analyzeFormat("dd.mm.yyyy hh:mm"))).toBe("15.03.2023 12:00");
    expect(formatNumber(0.75, analyzeFormat("h:mm"))).toBe("18:00");
    expect(formatNumber(1.5, analyzeFormat("[h]:mm"))).toBe("36:00");
    expect(formatNumber(1234.5, analyzeFormat('#,##0.00 "€"'))).toBe("1.234,50 €");
    expect(formatNumber(1234.5, analyzeFormat("[$€-407] #,##0"))).toBe("1.235 €");
    expect(formatNumber(0.0825, analyzeFormat("0.0%"))).toBe("8,3 %");
    expect(formatNumber(1 / 3, analyzeFormat("General"))).toBe("0,3333333333");
    expect(formatNumber(0, analyzeFormat("dd.mm.yyyy"), true)).toBe("01.01.1904");
  });
});
