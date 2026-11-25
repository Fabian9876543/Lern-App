import platform from "@platform-impl";
import { useState } from "react";
import { loadModule } from "../lib/lazyImport";

/** Dateiname aus dem Titel (ohne Zeichen, die Dateisysteme nicht mögen). */
export function noteFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "Lernzettel";
}

/** Steht der Titel schon als erste Überschrift im Lernzettel, nicht doppelt ausgeben. */
export function withoutLeadingTitle(content: string, title: string): string {
  const m = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(content);
  const norm = (s: string) => s.replace(/[*_`]/g, "").trim().toLowerCase();
  return m && norm(m[1]) === norm(title) ? content.slice(m[0].length).replace(/^\s*\n/, "") : content;
}

/** Knöpfe „PDF“ und „Markdown“ für einen Lernzettel. */
export default function NoteDownloads({
  title,
  meta,
  content,
  appendix = "",
  pdfPrimary = false,
}: {
  title: string;
  /** Zeile unter dem Titel im PDF */
  meta?: string;
  content: string;
  /** Wird angehängt, z. B. die markierten Stellen mit Claudes Erklärungen */
  appendix?: string;
  /** PDF als Hauptknopf (sonst beide dezent) */
  pdfPrimary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = noteFileName(title);
  const body = [withoutLeadingTitle(content, title), appendix.trim()].filter(Boolean).join("\n\n---\n\n");

  async function pdf() {
    setBusy(true);
    setError(null);
    try {
      const { notePdf } = await loadModule(() => import("../lib/pdfExport"), "Der PDF-Export");
      const bytes = await notePdf({ title, meta, markdown: body });
      await platform.saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${name}.pdf`);
    } catch (e) {
      setError(platform.describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function markdown() {
    setError(null);
    try {
      await platform.saveFile(new Blob([`# ${title}\n\n${body}\n`], { type: "text/markdown" }), `${name}.md`);
    } catch (e) {
      setError(platform.describeError(e));
    }
  }

  const pdfButton = (
    <button key="pdf" className={`btn ${pdfPrimary ? "btn-primary" : "btn-ghost"}`} onClick={pdf} disabled={busy} aria-busy={busy}>
      {busy ? "PDF wird erstellt …" : pdfPrimary ? "PDF herunterladen" : "PDF"}
    </button>
  );
  const mdButton = (
    <button key="md" className="btn btn-ghost" onClick={markdown} title="Als Markdown-Datei (.md) herunterladen">
      Markdown
    </button>
  );

  return (
    <div className={`note-downloads ${pdfPrimary ? "end" : ""}`}>
      {pdfPrimary ? [mdButton, pdfButton] : [pdfButton, mdButton]}
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}
