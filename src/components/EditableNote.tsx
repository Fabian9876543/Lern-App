import { useState, type ReactNode } from "react";
import { clearDraft, findInSource, loadDraft } from "../lib/noteEdit";
import type { NoteMark, StudyNote } from "../types";
import NoteEditor from "./NoteEditor";
import { MarkableNote } from "./NoteMarks";

/**
 * Lernzettel zum Lesen und Markieren – oder zum Bearbeiten. Ungespeicherte
 * Änderungen von vorhin werden zum Weiterbearbeiten angeboten.
 */
export default function EditableNote({
  note,
  hasMaterials,
  children,
}: {
  note: StudyNote;
  hasMaterials: boolean;
  children?: ReactNode | ((ordered: NoteMark[]) => ReactNode);
}) {
  const [editing, setEditing] = useState<{ text?: string; select: { start: number; end: number } | null } | null>(null);
  const [, setDraftVersion] = useState(0);
  const draft = editing ? null : loadDraft(note.id);

  if (editing) {
    return <NoteEditor note={note} initialText={editing.text} select={editing.select} onClose={() => setEditing(null)} />;
  }

  return (
    <>
      {draft !== null && draft !== note.content && (
        <div className="callout callout-warn row-between note-draft">
          <span>Du hast ungespeicherte Änderungen an diesem Lernzettel.</span>
          <div className="row-wrap">
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ text: draft, select: null })}>
              Weiter bearbeiten
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                clearDraft(note.id);
                setDraftVersion((v) => v + 1);
              }}
            >
              Verwerfen
            </button>
          </div>
        </div>
      )}
      <MarkableNote
        note={note}
        hasMaterials={hasMaterials}
        onEdit={(quote) => setEditing({ select: quote ? findInSource(note.content, quote) : null })}
      >
        {children}
      </MarkableNote>
    </>
  );
}
