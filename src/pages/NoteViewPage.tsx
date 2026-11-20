import platform from "@platform-impl";
import { useEffect, useState } from "react";
import { NOTE_LENGTH_LABELS } from "../ai/prompts";
import { confirmDialog, promptDialog } from "../components/Dialogs";
import Markdown from "../components/Markdown";
import MaterialList from "../components/MaterialList";
import MaterialPreview from "../components/MaterialPreview";
import MaterialRow from "../components/MaterialRow";
import NoteDownloads from "../components/NoteDownloads";
import { cancelNoteJob, clearNoteJob, startMaterialNote, useNoteJob } from "../lib/materialNotes";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";
import type { Material } from "../types";

/** Ein Lernzettel aus Material: lesen, neu schreiben, umbenennen, herunterladen, löschen. */
export default function NoteViewPage({ noteId }: { noteId: string }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const note = store.notes.find((n) => n.id === noteId);
  const jobKey = `note:${noteId}`;
  const job = useNoteJob(jobKey);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Material | null>(null);

  useEffect(() => {
    if (!job?.done) return;
    if (job.error) setError(job.error);
    clearNoteJob(jobKey);
  }, [job?.done, job?.error, jobKey]);

  if (!note) {
    return (
      <div className="card">
        <p>Diesen Lernzettel gibt es nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  if (note.planId && note.topicId) {
    // Lernzettel zu einem Lernplan-Thema gehören zum Plan.
    return (
      <div className="card stack-sm">
        <p>Dieser Lernzettel gehört zu einem Lernplan.</p>
        <a className="btn btn-primary" href={`#/plan/${note.planId}/note/${note.topicId}`}>
          Im Lernplan öffnen
        </a>
      </div>
    );
  }

  const subject = store.subjects.find((s) => s.id === note.subjectId);
  const ids = note.materialIds ?? [];
  const sources = ids.map((id) => store.materials.find((m) => m.id === id)).filter((m) => !!m);
  const missing = ids.length - sources.length;
  const writing = !!job && !job.done;

  async function rewrite() {
    const ok = await confirmDialog("Claude schreibt den Lernzettel aus demselben Material neu; der jetzige wird ersetzt.", {
      title: "Lernzettel neu schreiben?",
      confirmLabel: "Neu schreiben",
    });
    if (!ok) return;
    setError(null);
    startMaterialNote(jobKey, {
      subjectId: note!.subjectId,
      materialIds: sources.map((m) => m.id),
      focus: note!.focus ?? "",
      length: note!.length ?? "normal",
      replaceId: note!.id,
    });
  }

  async function rename() {
    const title = await promptDialog("Lernzettel umbenennen", { label: "Titel", initial: note!.topicName });
    if (title) repo.updateNote(note!.id, { topicName: title });
  }

  async function remove() {
    const ok = await confirmDialog(`„${note!.topicName}“ löschen?`, { title: "Lernzettel löschen", confirmLabel: "Löschen", danger: true });
    if (!ok) return;
    repo.deleteNote(note!.id);
    navigate(`/subject/${note!.subjectId}`, { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/subject/${note.subjectId}`} className="back-link">
          ← {subject?.name ?? "Fach"}
        </a>
        <p className="muted small eyebrow">Lernzettel</p>
        <div className="row-between">
          <h1>{note.topicName}</h1>
          <div className="row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={rename}>
              Umbenennen
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
        {(note.focus || note.length) && (
          <p className="muted small">
            {[note.focus && `Schwerpunkt: ${note.focus}`, note.length && NOTE_LENGTH_LABELS[note.length].label].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {error && <div className="callout callout-error">{error}</div>}

      {writing ? (
        <section className="card stack-sm" aria-live="polite" aria-busy="true">
          <div className="row-between">
            <div className="note-writing">
              <div className="spinner spinner-sm" />
              <strong>Claude schreibt den Lernzettel neu …</strong>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => cancelNoteJob(jobKey)}>
              Abbrechen
            </button>
          </div>
          {job.text ? <Markdown className="study-note">{job.text}</Markdown> : <p className="muted small">Gleich geht's los.</p>}
        </section>
      ) : (
        <>
          <article className="card">
            <Markdown className="study-note">{note.content}</Markdown>
          </article>
          <p className="muted small">
            Von Claude aus deinem Material geschrieben · {new Date(note.createdAt).toLocaleDateString("de-DE")} · {note.model}
          </p>
          <div className="row-between">
            <button
              className="btn btn-ghost"
              onClick={rewrite}
              disabled={ai.state !== "ready" || sources.length === 0}
              title={sources.length === 0 ? "Das Material ist gelöscht." : ""}
            >
              Neu schreiben
            </button>
            <NoteDownloads
              title={note.topicName}
              meta={[subject?.name, "Lernzettel", note.focus && `Schwerpunkt: ${note.focus}`, new Date(note.createdAt).toLocaleDateString("de-DE")]
                .filter(Boolean)
                .join(" · ")}
              content={note.content}
              pdfPrimary
            />
          </div>
        </>
      )}

      {ids.length > 0 && (
        <details className="card note-sources">
          <summary>
            <strong>Quellen</strong>
            <span className="muted small">
              {" · "}
              {ids.length === 1 ? "aus 1 Datei" : `aus ${ids.length} Dateien`}
              {missing > 0 && ` (${missing} inzwischen gelöscht)`}
            </span>
          </summary>
          <div className="stack-sm note-sources-body">
            <p className="muted small">Aus diesem Material hat Claude den Lernzettel geschrieben. Antippen zum Ansehen.</p>
            {sources.length > 0 ? (
              <MaterialList
                materials={sources}
                row={(m) => <MaterialRow key={m.id} material={m} onPreview={setPreview} actions={false} role={false} />}
              />
            ) : (
              <p className="muted small">Das Material ist inzwischen gelöscht.</p>
            )}
          </div>
        </details>
      )}
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
