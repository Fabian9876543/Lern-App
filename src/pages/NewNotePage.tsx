import platform from "@platform-impl";
import { useEffect, useState } from "react";
import { NOTE_LENGTH_LABELS } from "../ai/prompts";
import Markdown from "../components/Markdown";
import MaterialList, { type MaterialSelection } from "../components/MaterialList";
import MaterialPreview from "../components/MaterialPreview";
import MaterialRow from "../components/MaterialRow";
import MaterialUpload from "../components/MaterialUpload";
import { splitMaterials, usedLabel } from "../lib/materialNames";
import { cancelNoteJob, clearNoteJob, startMaterialNote, useNoteJob } from "../lib/materialNotes";
import { navigate, routeQuery } from "../router";
import { useStore } from "../store/store";
import type { Material, NoteLength } from "../types";

/** Lernzettel direkt aus Material erstellen. */
export default function NewNotePage({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const modelLabel = platform.useGenerationModelLabel();
  const subject = store.subjects.find((s) => s.id === subjectId);
  const materials = store.materials.filter((m) => m.subjectId === subjectId);
  const { fresh, used } = splitMaterials(
    materials,
    store.tests.filter((t) => t.subjectId === subjectId),
    store.plans.filter((p) => p.subjectId === subjectId),
    store.analyses.filter((a) => a.subjectId === subjectId),
  );
  const jobKey = `new:${subjectId}`;
  const job = useNoteJob(jobKey);

  const [selected, setSelected] = useState<Set<string>>(() => {
    const fromQuery = (routeQuery().get("materials") ?? "").split(",").filter((id) => materials.some((m) => m.id === id));
    return new Set(fromQuery.length ? fromQuery : fresh.map((m) => m.id));
  });
  const [focus, setFocus] = useState("");
  const [length, setLength] = useState<NoteLength>("normal");
  const [preview, setPreview] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fertig: zum Lernzettel; Fehler: anzeigen und Formular wieder freigeben.
  useEffect(() => {
    if (!job?.done) return;
    if (job.noteId) navigate(`/note/${job.noteId}`, { replace: true });
    else if (job.error) setError(job.error);
    clearNoteJob(jobKey);
  }, [job?.done, job?.noteId, job?.error, jobKey]);

  if (!subject) return null;

  const selection: MaterialSelection = {
    isSelected: (id) => selected.has(id),
    setMany: (ids, on) =>
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
        return next;
      }),
  };
  const toggle = (id: string) => selection.setMany([id], !selected.has(id));
  const chosen = materials.filter((m) => selected.has(m.id));
  const blocker =
    chosen.length === 0
      ? "Bitte mindestens ein Material auswählen."
      : ai.state === "unavailable"
        ? (ai.reason ?? "Claude ist nicht verfügbar.")
        : null;

  function create() {
    setError(null);
    startMaterialNote(jobKey, { subjectId, materialIds: chosen.map((m) => m.id), focus, length });
  }

  if (job && !job.done) {
    return (
      <div className="stack">
        <section className="card stack-sm" aria-live="polite" aria-busy="true">
          <div className="row-between">
            <div className="note-writing">
              <div className="spinner spinner-sm" />
              <strong>Claude schreibt den Lernzettel …</strong>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => cancelNoteJob(jobKey)}>
              Abbrechen
            </button>
          </div>
          {job.text ? (
            <Markdown className="study-note">{job.text}</Markdown>
          ) : (
            <p className="muted small">
              Claude liest dein Material und legt gleich los. Du kannst die Seite verlassen – der Lernzettel wird trotzdem
              fertig geschrieben und gespeichert.
            </p>
          )}
        </section>
      </div>
    );
  }

  const row = (m: Material, extra?: string) => (
    <MaterialRow
      key={m.id}
      material={m}
      onPreview={setPreview}
      actions={false}
      extra={extra ? <> · {extra}</> : undefined}
      selectable={{ checked: selected.has(m.id), onToggle: () => toggle(m.id) }}
    />
  );

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/subject/${subjectId}`} className="crumb">
          {subject.name}
        </a>
        <h1>Lernzettel erstellen</h1>
        <p className="muted">
          Claude fasst dein Material zusammen: das Wichtigste pro Thema mit Fundstellen, vorgerechnete Beispiele, typische
          Fehler und ein kurzer Selbstcheck.
        </p>
      </div>

      <section className="card stack-sm">
        <h2>1. Material</h2>
        <MaterialUpload subjectId={subjectId} onAdded={(ids) => selection.setMany(ids, true)} />
        {fresh.length > 0 ? (
          <MaterialList materials={fresh} selection={selection} row={(m) => row(m)} />
        ) : (
          <p className="muted small">Lade oben Material hoch oder wähle unten früheres Material aus.</p>
        )}
        {used.length > 0 && (
          <details className="used-materials" open={used.some((u) => selected.has(u.material.id))}>
            <summary className="small">Schon verwendetes Material ({used.length})</summary>
            <MaterialList
              materials={used.map((u) => u.material)}
              selection={selection}
              row={(m) => {
                const u = used.find((x) => x.material.id === m.id)!;
                return row(m, usedLabel(u));
              }}
            />
          </details>
        )}
        <p className="muted small">Ausgewählt: {chosen.length === 1 ? "1 Datei" : `${chosen.length} Dateien`}</p>
      </section>

      <section className="card stack-sm">
        <h2>2. Worum soll es gehen?</h2>
        <label className="field">
          <span>Thema oder Schwerpunkt (optional)</span>
          <input
            id="note-focus"
            className="input"
            value={focus}
            placeholder="z. B. „Abschreibungen“ oder „Kapitel 4–5“ – leer lassen für den ganzen Stoff"
            onChange={(e) => setFocus(e.target.value)}
          />
        </label>
        <div className="field">
          <span>Umfang</span>
          <div className="mode-cards three">
            {(Object.keys(NOTE_LENGTH_LABELS) as NoteLength[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`card mode-card ${length === l ? "active" : ""}`}
                aria-pressed={length === l}
                onClick={() => setLength(l)}
              >
                <strong>{NOTE_LENGTH_LABELS[l].label}</strong>
                <span className="muted small">{NOTE_LENGTH_LABELS[l].hint}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="callout callout-error">{error}</div>}

      <div className="row-between sticky-actions">
        <span className="muted small">
          {modelLabel} · {platform.usageNote}
        </span>
        <button className="btn btn-primary btn-lg" disabled={!!blocker} onClick={create} title={blocker ?? ""}>
          Lernzettel erstellen
        </button>
      </div>
      {blocker && <p className="muted small right">{blocker}</p>}
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
