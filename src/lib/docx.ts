import { strFromU8, unzipSync } from "fflate";
import { WordError } from "./doc";

/**
 * Liest Word-Dateien (.docx) und gibt den Inhalt als Markdown zurück:
 * Überschriften, Aufzählungen und Tabellen bleiben erkennbar, Formeln aus dem
 * Formel-Editor erscheinen als Text. Bilder werden nicht übernommen.
 */

const MAX_XML_BYTES = 60 * 1024 * 1024;

function escapeText(text: string): string {
  // $ würde sonst als Formel gelesen
  return text.replace(/\$/g, "\\$");
}

/** Text eines Elements in Dokumentreihenfolge: w:t / m:t, Tabs und Zeilenumbrüche. */
function runText(el: Element): string {
  let out = "";
  for (const child of Array.from(el.children)) {
    switch (child.localName) {
      case "t":
        out += child.textContent ?? "";
        break;
      case "tab":
        out += "\t";
        break;
      case "br":
      case "cr":
        out += "\n";
        break;
      case "noBreakHyphen":
        out += "-";
        break;
      case "pPr":
      case "rPr":
      case "instrText":
      case "delText":
      case "Fallback":
        // Formatierung, Feldanweisungen, gelöschter Text (Änderungsverfolgung), doppelte Ersatzdarstellung
        break;
      default:
        out += runText(child);
    }
  }
  return out;
}

function paragraphMarkdown(p: Element): string {
  const text = escapeText(runText(p).replace(/[ \t]+$/gm, "")).trim();
  if (!text) return "";
  const pPr = Array.from(p.children).find((c) => c.localName === "pPr");
  const style = pPr ? Array.from(pPr.children).find((c) => c.localName === "pStyle") : undefined;
  const styleName = style ? (style.getAttribute("w:val") ?? Array.from(style.attributes).find((a) => a.localName === "val")?.value ?? "") : "";
  const heading = /^(?:heading|berschrift|überschrift)\s*(\d)/i.exec(styleName) ?? (/^(title|titel)$/i.test(styleName) ? ["", "1"] : null);
  if (heading) return `${"#".repeat(Math.min(6, Number(heading[1]) + 1))} ${text.replace(/\n/g, " ")}`;
  // Aufzählung: direkt nummeriert oder über eine Listen-Formatvorlage („List Bullet“, „Aufzählungszeichen“ …)
  const isList =
    (!!pPr && Array.from(pPr.children).some((c) => c.localName === "numPr")) ||
    /^(list|liste|aufz)/i.test(styleName);
  if (isList) return `- ${text.replace(/\n/g, " ")}`;
  return text;
}

function tableMarkdown(tbl: Element): string {
  const rows = Array.from(tbl.children)
    .filter((c) => c.localName === "tr")
    .map((tr) =>
      Array.from(tr.children)
        .filter((c) => c.localName === "tc")
        .map((tc) =>
          blocks(tc)
            .join(" / ")
            .replace(/\n+/g, " / ")
            .replace(/\|/g, "\\|")
            .replace(/^#+ |^- /gm, "")
            .trim(),
        ),
    )
    .filter((r) => r.length);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

/** Absätze und Tabellen eines Containers (Dokumentkörper, Tabellenzelle, Inhaltssteuerelement). */
function blocks(container: Element): string[] {
  const out: string[] = [];
  for (const child of Array.from(container.children)) {
    if (child.localName === "p") out.push(paragraphMarkdown(child));
    else if (child.localName === "tbl") out.push(tableMarkdown(child));
    else if (child.localName === "sdt" || child.localName === "sdtContent" || child.localName === "customXml") out.push(...blocks(child));
  }
  return out.filter(Boolean);
}

/** Wandelt eine .docx-Datei in Markdown um. */
export function docxToMarkdown(data: Uint8Array, fileName: string): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" && f.originalSize <= MAX_XML_BYTES });
  } catch {
    throw new WordError(`„${fileName}“ konnte nicht gelesen werden – ist es eine Word-Datei im Format .docx?`);
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new WordError(`„${fileName}“ enthält kein Word-Dokument.`);
  const doc = new DOMParser().parseFromString(strFromU8(xml), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new WordError(`„${fileName}“ ist beschädigt.`);
  const body = doc.getElementsByTagNameNS("*", "body")[0];
  if (!body) throw new WordError(`„${fileName}“ enthält kein Word-Dokument.`);
  const text = blocks(body).join("\n\n").trim();
  if (!text) throw new WordError(`„${fileName}“ enthält keinen Text (vielleicht nur Bilder? Dann bitte als PDF speichern).`);
  return text;
}
