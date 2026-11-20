import { pdfFonts } from "./fontData";
import { FontCoverage } from "./fonts";
import { layoutNote, type NoteDoc } from "./layout";
import { paintPdf } from "./paint";

export type { NoteDoc };

/** Lernzettel (Markdown mit Formeln) → PDF-Datei mit echtem Text. */
export async function notePdf(note: NoteDoc): Promise<Uint8Array> {
  const fonts = pdfFonts();
  const coverage = new FontCoverage(fonts);
  const layout = await layoutNote(note, fonts, coverage);
  return paintPdf(layout, fonts, {
    title: note.title,
    footer: `Lernzettel: ${note.title}`,
    subject: note.meta,
  });
}
