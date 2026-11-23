export const APP_PREFIX = "Hinweis der App: ";

/** Hinweise zu einem Test oder Lernplan: Absätze der App getrennt von Claudes Hinweisen. */
export function splitNotes(notes: string): { app: string[]; claude: string } {
  const paragraphs = notes
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    app: paragraphs.filter((p) => p.startsWith(APP_PREFIX)).map((p) => p.slice(APP_PREFIX.length)),
    claude: paragraphs.filter((p) => !p.startsWith(APP_PREFIX)).join(" "),
  };
}

/**
 * Claude nummeriert mehrere Hinweise oft im Fließtext („1) … 2) …“). Dann als
 * Liste zurückgeben, sonst als einen einzigen Punkt.
 */
export function numberedItems(text: string): string[] {
  const t = text.trim();
  if (!/^1[).]\s/.test(t)) return t ? [t] : [];
  const parts = t.split(/\s+(?=\d{1,2}[).]\s)/);
  const items: string[] = [];
  let expected = 1;
  for (const part of parts) {
    const m = /^(\d{1,2})[).]\s+([\s\S]*)$/.exec(part);
    if (m && Number(m[1]) === expected) {
      items.push(m[2].trim());
      expected++;
    } else if (items.length) {
      // Zahl mitten im Satz (z. B. „Aufgabe 2) …“ außer der Reihe) – gehört zum vorigen Punkt.
      items[items.length - 1] += ` ${part}`;
    } else items.push(part);
  }
  return items.length >= 2 ? items : [t];
}
