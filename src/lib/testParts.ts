import type { Test } from "../types";

/**
 * Ein Eintrag im claude.ai-Speicher darf höchstens 256 KB groß sein. Ein Test
 * mit sehr vielen Aufgaben wird deshalb in mehrere Tests aufgeteilt – mit Luft
 * für spätere Änderungen (bearbeitete oder ergänzte Fragen).
 */
export const MAX_TEST_BYTES = 180_000;

const encoder = new TextEncoder();
const size = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/** Teilt einen zu großen Test in gleich große Teile („Titel (Teil 1 von 3)“); sonst bleibt er, wie er ist. */
export function splitTest(test: Test, makeId: () => string, maxBytes = MAX_TEST_BYTES): Test[] {
  if (test.questions.length < 2 || size(test) <= maxBytes) return [test];
  const base = size({ ...test, questions: [] }) + 400; // Titelzusatz und Hinweis
  const room = Math.max(1, maxBytes - base);
  const sizes = test.questions.map((q) => size(q) + 1);
  const total = sizes.reduce((a, b) => a + b, 0);
  // Möglichst gleich viele Fragen pro Teil – so wenige Teile wie möglich, jeder unter der Grenze
  let chunks: Test["questions"][] = [];
  for (let count = Math.max(2, Math.ceil(total / room)); count <= test.questions.length; count++) {
    const per = Math.ceil(test.questions.length / count);
    chunks = [];
    for (let i = 0; i < test.questions.length; i += per) chunks.push(test.questions.slice(i, i + per));
    const fits = chunks.every((c, k) => sizes.slice(k * per, k * per + c.length).reduce((a, b) => a + b, 0) <= room);
    if (fits) break;
  }
  const n = chunks.length;
  if (n <= 1) return [test];
  return chunks.map((questions, k) => ({
    ...test,
    id: k === 0 ? test.id : makeId(),
    title: `${test.title} (Teil ${k + 1} von ${n})`,
    questions,
    notes: [
      `Teil ${k + 1} von ${n}: Es waren zu viele Aufgaben für einen einzelnen Test, deshalb wurden sie auf ${n} Tests aufgeteilt.`,
      test.notes,
    ]
      .filter(Boolean)
      .join("\n\n"),
    // Neueste stehen oben – Teil 1 soll zuerst kommen
    createdAt: test.createdAt + (n - 1 - k),
  }));
}
