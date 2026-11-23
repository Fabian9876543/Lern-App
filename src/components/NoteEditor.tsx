import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clearDraft, saveDraft } from "../lib/noteEdit";
import { useLeaveGuard } from "../router";
import { repo } from "../store/store";
import type { StudyNote } from "../types";
import { confirmDialog } from "./Dialogs";
import Markdown from "./Markdown";

/**
 * Lernzettel selbst bearbeiten: Markdown-Text mit Vorschau. Ungespeicherte
 * Änderungen bleiben als Entwurf erhalten, wenn man die Seite verlässt.
 */
export default function NoteEditor({
  note,
  initialText,
  select,
  onClose,
}: {
  note: StudyNote;
  /** Weiterbearbeiten eines Entwurfs. */
  initialText?: string;
  /** Diese Stelle im Text auswählen (z. B. die markierte Stelle). */
  select?: { start: number; end: number } | null;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText ?? note.content);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const changed = text !== note.content;
  const latest = useRef({ text, changed });
  latest.current = { text, changed };

  // Entwurf mitschreiben (kurz verzögert) – und beim Verlassen der Seite sofort.
  useEffect(() => {
    const timer = window.setTimeout(() => (changed ? saveDraft(note.id, text) : clearDraft(note.id)), 400);
    return () => window.clearTimeout(timer);
  }, [text, changed, note.id]);
  useLeaveGuard(() => {
    if (latest.current.changed) saveDraft(note.id, latest.current.text);
  });

  // Gewünschte Stelle auswählen und in den sichtbaren Bereich holen.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight + 4, window.innerHeight * 0.7)}px`;
    if (!select) return;
    area.focus({ preventScroll: true });
    area.setSelectionRange(select.start, select.end);
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 22;
    const line = text.slice(0, select.start).split("\n").length - 1;
    area.scrollTop = Math.max(0, line * lineHeight - area.clientHeight / 3);
    area.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    const content = text.trim();
    if (!content) return;
    repo.updateNote(note.id, { content, editedAt: Date.now() });
    clearDraft(note.id);
    onClose();
  }

  async function cancel() {
    if (changed) {
      const ok = await confirmDialog("Deine Änderungen an diesem Lernzettel werden verworfen.", {
        title: "Änderungen verwerfen?",
        confirmLabel: "Verwerfen",
        danger: true,
      });
      if (!ok) return;
    }
    clearDraft(note.id);
    onClose();
  }

  return (
    <section className="card stack-sm note-editor" aria-label="Lernzettel bearbeiten">
      <div className="row-between">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "edit"} className={`tab ${tab === "edit" ? "active" : ""}`} onClick={() => setTab("edit")}>
            Bearbeiten
          </button>
          <button role="tab" aria-selected={tab === "preview"} className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
            Vorschau
          </button>
        </div>
        {changed && <span className="muted small">Nicht gespeichert</span>}
      </div>
      {tab === "edit" ? (
        <>
          <textarea
            ref={areaRef}
            id="note-editor-text"
            className="textarea note-editor-text"
            value={text}
            spellCheck
            lang="de"
            aria-label="Text des Lernzettels"
            onChange={(e) => setText(e.target.value)}
          />
          <p className="muted small">
            Schreibweise: **fett**, ## Überschrift, - Liste, Formeln in $…$ (z. B. $a^2 + b^2$), Tabellen mit | Spalte | Spalte |.
          </p>
        </>
      ) : (
        <div className="note-editor-preview">
          <Markdown className="study-note">{text}</Markdown>
        </div>
      )}
      <div className="row-between">
        <button className="btn btn-ghost" onClick={cancel}>
          Abbrechen
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!changed || !text.trim()}>
          Speichern
        </button>
      </div>
    </section>
  );
}
