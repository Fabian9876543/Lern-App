/**
 * Planung fürs Abschreiben: Wenn mehr Bilder (Fotos, eingescannte Seiten)
 * zusammenkommen, als pro Anfrage an Claude gehen, werden die bildreichsten
 * Materialien zuerst abgeschrieben – so lange, bis der Rest passt.
 */

/** Wählt die Materialien, die abgeschrieben werden müssen (größte zuerst). */
export function chooseForTranscription(items: { id: string; images: number }[], maxImages: number): string[] {
  let total = items.reduce((sum, i) => sum + i.images, 0);
  const chosen: string[] = [];
  for (const item of [...items].filter((i) => i.images > 0).sort((a, b) => b.images - a.images)) {
    if (total <= maxImages) break;
    chosen.push(item.id);
    total -= item.images;
  }
  return chosen;
}

/** Teilt eine Liste in Portionen von höchstens `size` Einträgen. */
export function inBatches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

/** Ein Abschnitt eines Materials: Text oder ein Bild (ggf. mit PDF-Seitennummer). */
export type Segment = { kind: "text"; text: string; page?: number } | { kind: "image"; image: Blob; page?: number };

/** Setzt den gespeicherten Text eines Materials aus Textseiten und abgeschriebenen Bildern zusammen. */
export function assembleTranscript(segments: Segment[], transcribed: string[]): string {
  let next = 0;
  return segments
    .map((s) => {
      const body = s.kind === "text" ? s.text : transcribed[next++] || "[nicht lesbar]";
      return s.page !== undefined ? `--- Seite ${s.page} ---\n${body}` : body;
    })
    .join("\n\n");
}
