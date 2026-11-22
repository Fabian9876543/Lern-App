/**
 * Liest JSON-Antworten von Claude tolerant ein – auch wenn die Antwort
 * mittendrin abgeschnitten wurde. Dann werden alle vollständigen Einträge
 * einer Liste (z. B. "questions") gerettet.
 */

/** Ab der ersten { bzw. [ (ohne ```json-Zaun und Text davor). */
export function jsonStart(text: string): string {
  const fence = /```(?:json)?\s*\n?/i.exec(text);
  const from = fence ? text.slice(fence.index + fence[0].length) : text;
  const i = from.search(/[{[]/);
  return i < 0 ? "" : from.slice(i);
}

/** Backslashes, die in JSON nicht erlaubt sind (z. B. LaTeX \sum), verdoppeln; Kommas vor } und ] entfernen. */
function repair(s: string): string {
  return s.replace(/\\(["\\/bfnrtu])|\\/g, (m, ok) => (ok ? m : "\\\\")).replace(/,(\s*[}\]])/g, "$1");
}

/** JSON.parse, bei Fehlern einmal mit Reparatur; undefined, wenn es nicht lesbar ist. */
export function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(repair(s));
    } catch {
      return undefined;
    }
  }
}

/** Index des schließenden Anführungszeichens eines Strings ab `start` (oder -1, wenn er nicht endet). */
function stringEnd(s: string, start: number): number {
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === '"') return i;
  }
  return -1;
}

function nextNonSpace(s: string, from: number): number {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

export interface ParsedReply {
  /** Felder des äußeren Objekts (bei abgeschnittener Antwort nur die vollständigen) */
  fields: Record<string, unknown>;
  /** Vollständige Einträge der Liste */
  items: unknown[];
  /** Die ganze Antwort war gültiges JSON. */
  complete: boolean;
}

/**
 * Liest ein Objekt der Form {…, "<key>": [ {…}, {…} ], …} – oder direkt eine
 * Liste. Ist die Antwort abgeschnitten oder an einer Stelle kaputt, kommen
 * alle vollständig lesbaren Einträge und Felder zurück.
 */
export function parseListReply(text: string, key: string): ParsedReply {
  const src = jsonStart(text);
  const end = Math.max(src.lastIndexOf("}"), src.lastIndexOf("]"));
  if (end >= 0) {
    const value = parseJson(src.slice(0, end + 1));
    if (Array.isArray(value)) return { fields: {}, items: value, complete: true };
    if (value && typeof value === "object") {
      const fields = value as Record<string, unknown>;
      return { fields, items: Array.isArray(fields[key]) ? (fields[key] as unknown[]) : [], complete: true };
    }
  }

  // Abgeschnitten oder kaputt: Zeichen für Zeichen durchgehen.
  const fields: Record<string, unknown> = {};
  const items: unknown[] = [];
  const stack: string[] = [];
  let currentKey: string | null = null;
  // Tiefe der gesuchten Liste (Einträge liegen eine Ebene tiefer)
  let listDepth = src.startsWith("[") ? 1 : -1;
  let itemStart = -1;
  const inRootObject = () => stack.length === 1 && stack[0] === "{";

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      const close = stringEnd(src, i);
      if (close < 0) break;
      if (inRootObject()) {
        const token = parseJson(src.slice(i, close + 1));
        if (src[nextNonSpace(src, close + 1)] === ":") currentKey = typeof token === "string" ? token : null;
        else if (currentKey !== null && token !== undefined) fields[currentKey] = token;
      }
      i = close;
    } else if (c === "{" || c === "[") {
      stack.push(c);
      if (c === "[" && stack.length === 2 && stack[0] === "{" && currentKey === key) listDepth = 2;
      if (c === "{" && listDepth > 0 && stack.length === listDepth + 1) itemStart = i;
    } else if (c === "}" || c === "]") {
      if (c === "}" && itemStart >= 0 && stack.length === listDepth + 1) {
        const item = parseJson(src.slice(itemStart, i + 1));
        if (item !== undefined) items.push(item);
        itemStart = -1;
      }
      stack.pop();
      if (listDepth > 0 && stack.length < listDepth) listDepth = -1;
    } else if (inRootObject() && currentKey !== null && /[-\dtfn]/.test(c)) {
      const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 40));
      if (m) {
        fields[currentKey] = JSON.parse(m[0]);
        i += m[0].length - 1;
      }
    }
  }
  return { fields, items, complete: false };
}
