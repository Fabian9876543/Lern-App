import { CfbError, isCfb, readCfbStreams } from "./cfb";

/**
 * Liest den Text alter Word-Dateien (.doc, Word 97–2003). Der Text steht in
 * Stücken („Piece Table“) im Datenstrom „WordDocument“, teils als 8-Bit-Text
 * (Windows-1252), teils als UTF-16. Tabellen werden zu Zeilen mit „ | “
 * zwischen den Zellen, Feldfunktionen zeigen ihr Ergebnis.
 */

export class WordError extends Error {}

const u16 = (d: Uint8Array, p: number) => d[p] | (d[p + 1] << 8);
const u32 = (d: Uint8Array, p: number) => (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;

/** Windows-1252 – nicht überall als TextDecoder verfügbar, daher mit Rückfall auf Latin-1. */
function decode1252(bytes: Uint8Array): string {
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return s;
  }
}

function decodeUtf16(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  return s;
}

/**
 * Wandelt die Steuerzeichen von Word in lesbaren Text: Absätze, Tabellen
 * (Zellende \x07), Feldfunktionen (\x13 Anweisung \x14 Ergebnis \x15).
 */
export function cleanWordText(raw: string): string {
  let out = "";
  // Feld-Stapel: true = gerade im Ergebnis-Teil (wird angezeigt), false = Feldanweisung (wird ausgelassen)
  const fields: boolean[] = [];
  for (const ch of raw) {
    if (ch === "\x13") {
      fields.push(false);
      continue;
    }
    if (ch === "\x14") {
      if (fields.length) fields[fields.length - 1] = true;
      continue;
    }
    if (ch === "\x15") {
      fields.pop();
      continue;
    }
    if (fields.some((showing) => !showing)) continue;
    out += ch;
  }
  return out
    .replace(/\x07\r?\x07/g, "\n") // Zellende + Zeilenende einer Tabelle
    .replace(/\x07/g, " | ")
    .replace(/[\r\x0b\x0c]/g, "\n") // Absatz, Zeilenumbruch, Seitenumbruch
    .replace(/\x1e/g, "-") // geschützter Bindestrich
    .replace(/[\x00-\x08\x0e-\x1f]/g, "") // Bilder, Fußnotenzeichen u. Ä.
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Liest den Text einer .doc-Datei: zuerst den Haupttext, danach – als eigener
 * Abschnitt – Fußnoten, Kopf-/Fußzeilen und Textfelder.
 */
export function docToText(data: Uint8Array, fileName: string): string {
  if (!isCfb(data)) throw new WordError(`„${fileName}“ ist keine Word-Datei im Format .doc.`);
  let streams: Map<string, Uint8Array>;
  try {
    streams = readCfbStreams(data, ["WordDocument", "0Table", "1Table"]);
  } catch (e) {
    throw new WordError(`„${fileName}“ konnte nicht gelesen werden${e instanceof CfbError ? ` (${e.message})` : ""}.`);
  }
  const wd = streams.get("WordDocument");
  if (!wd) throw new WordError(`„${fileName}“ ist keine Word-Datei im Format .doc.`);
  const ident = wd && wd.length >= 0x200 ? u16(wd, 0) : 0;
  if (ident !== 0xa5ec && ident !== 0xa5dc) throw new WordError(`„${fileName}“ ist keine Word-Datei im Format .doc.`);
  const nFib = u16(wd!, 2);
  if (ident === 0xa5dc || nFib < 0xc1) throw new WordError(`„${fileName}“ stammt aus Word 95 oder älter. Bitte in Word als PDF speichern.`);
  const flags = u16(wd, 0x0a);
  if (flags & 0x0100) throw new WordError(`„${fileName}“ ist mit einem Passwort geschützt. Bitte den Schutz in Word entfernen.`);
  const table = streams.get(flags & 0x0200 ? "1Table" : "0Table");
  if (!table) throw new WordError(`„${fileName}“ ist beschädigt (Tabellenstrom fehlt).`);

  // FIB: feste Basis (32 Byte), dann variable Blöcke – daraus Textlänge und Lage der Stückliste (CLX)
  let pos = 32;
  const csw = u16(wd, pos);
  pos += 2 + csw * 2;
  const cslw = u16(wd, pos);
  const ccpText = u32(wd, pos + 2 + 3 * 4);
  pos += 2 + cslw * 4 + 2;
  const fcClx = u32(wd, pos + 33 * 8);
  const lcbClx = u32(wd, pos + 33 * 8 + 4);
  if (!lcbClx || fcClx + lcbClx > table.length) throw new WordError(`„${fileName}“ ist beschädigt.`);

  // CLX: zuerst Formatierungsblöcke (Typ 1), dann die Stückliste (Typ 2)
  let i = fcClx;
  const end = fcClx + lcbClx;
  while (i < end && table[i] === 0x01) i += 3 + u16(table, i + 1);
  if (table[i] !== 0x02) throw new WordError(`„${fileName}“ ist beschädigt.`);
  const lcb = u32(table, i + 1);
  const plc = i + 5;
  const n = Math.floor((lcb - 4) / 12);

  // Alle Textstücke der Reihe nach; ab Zeichen ccpText folgen Fußnoten, Kopfzeilen, Textfelder usw.
  let text = "";
  for (let k = 0; k < n; k++) {
    const cpStart = u32(table, plc + k * 4);
    const cpEnd = u32(table, plc + (k + 1) * 4);
    const len = Math.max(0, Math.min(cpEnd - cpStart, wd.length));
    const pcd = plc + (n + 1) * 4 + k * 8;
    const fcRaw = u32(table, pcd + 2);
    if (fcRaw & 0x40000000) {
      const start = (fcRaw & 0x3fffffff) / 2;
      text += decode1252(wd.subarray(start, start + len));
    } else {
      text += decodeUtf16(wd.subarray(fcRaw, fcRaw + len * 2));
    }
  }
  const main = cleanWordText(text.slice(0, ccpText));
  const extra = cleanWordText(text.slice(ccpText));
  if (!main && !extra) throw new WordError(`„${fileName}“ enthält keinen Text.`);
  if (!extra) return main;
  return `${main}\n\n--- Weitere Texte (Fußnoten, Kopf-/Fußzeilen, Textfelder) ---\n${extra}`.trim();
}
