/**
 * Lernzettel ändern: Stelle im Markdown wiederfinden, Korrektur einsetzen,
 * Entwurf zwischenspeichern. Ohne Browser-Abhängigkeiten außer dem Entwurf.
 */

const WORD = /[\p{L}\p{N}]+/gu;
const MAX_WORDS = 60;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Findet eine angezeigte Stelle (z. B. eine Markierung) im Markdown-Quelltext.
 * Zuerst wörtlich, sonst Wort für Wort – dazwischen darf Formatierung stehen
 * (**fett**, Listenzeichen, Zeilenumbrüche, Satzzeichen).
 */
export function findInSource(source: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim();
  if (!q) return null;
  const exact = source.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length };
  const words = q.match(WORD) ?? [];
  if (words.length === 0) return null;
  const pattern = words.slice(0, MAX_WORDS).map(escapeRegex).join("[^\\p{L}\\p{N}]{1,16}?");
  const m = new RegExp(pattern, "u").exec(source);
  if (!m) return null;
  let end = m.index + m[0].length;
  // Wurde die Stelle gekürzt (sehr lang), bis zum Ende des letzten Wortes der Markierung erweitern.
  if (words.length > MAX_WORDS) {
    const last = escapeRegex(words[words.length - 1]);
    const rest = new RegExp(last, "u").exec(source.slice(end));
    if (rest) end += rest.index + rest[0].length;
  }
  return { start: m.index, end };
}

/**
 * Setzt Claudes Korrektur ein: `old` wird durch `replacement` ersetzt. Kommt
 * `old` mehrmals vor, gewinnt die Stelle, die am nächsten an der Markierung
 * liegt. Leerraum darf leicht abweichen. Null, wenn `old` nicht vorkommt.
 */
export function applyFix(source: string, old: string, replacement: string, near?: number): string | null {
  const target = old.trim();
  if (!target) return null;
  const hits: { start: number; end: number }[] = [];
  for (let i = source.indexOf(target); i !== -1; i = source.indexOf(target, i + 1)) hits.push({ start: i, end: i + target.length });
  if (hits.length === 0) {
    const pattern = target.split(/\s+/).map(escapeRegex).join("\\s+");
    const re = new RegExp(pattern, "g");
    for (let m = re.exec(source); m; m = re.exec(source)) hits.push({ start: m.index, end: m.index + m[0].length });
  }
  if (hits.length === 0) return null;
  const pick = near === undefined ? hits[0] : hits.reduce((a, b) => (Math.abs(b.start - near) < Math.abs(a.start - near) ? b : a));
  return source.slice(0, pick.start) + replacement.trim() + source.slice(pick.end);
}

// ---------- Entwurf (ungespeicherte Änderungen) ----------

const memory = new Map<string, string>();
const keyOf = (noteId: string) => `lern-app-note-draft:${noteId}`;

export function loadDraft(noteId: string): string | null {
  try {
    const v = localStorage.getItem(keyOf(noteId));
    if (v !== null) return v;
  } catch {
    // Speicher nicht verfügbar
  }
  return memory.get(noteId) ?? null;
}

export function saveDraft(noteId: string, text: string): void {
  memory.set(noteId, text);
  try {
    localStorage.setItem(keyOf(noteId), text);
  } catch {
    // nur im Speicher
  }
}

export function clearDraft(noteId: string): void {
  memory.delete(noteId);
  try {
    localStorage.removeItem(keyOf(noteId));
  } catch {
    // egal
  }
}
