import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import FileDrop from "../components/FileDrop";
import Modal from "../components/Modal";
import { db, deleteSubject, newId } from "../db";
import { summarize, formatDate } from "../lib/attempts";
import { ACCEPTED_FILE_TYPES, ROLE_LABELS, formatBytes, guessRole, prepareFile } from "../lib/files";
import { navigate } from "../router";
import type { Material, MaterialRole } from "../types";

const KIND_ICON = { pdf: "📄", image: "🖼️", text: "📝" } as const;

export default function SubjectPage({ subjectId }: { subjectId: string }) {
  const subject = useLiveQuery(async () => (await db.subjects.get(subjectId)) ?? null, [subjectId]);
  const materials = useLiveQuery(
    () => db.materials.where("subjectId").equals(subjectId).sortBy("createdAt"),
    [subjectId],
  );
  const tests = useLiveQuery(
    () => db.tests.where("subjectId").equals(subjectId).reverse().sortBy("createdAt"),
    [subjectId],
  );
  const attempts = useLiveQuery(() => db.attempts.where("subjectId").equals(subjectId).toArray(), [subjectId]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  if (subject === null) {
    return (
      <div className="card">
        <p>Dieses Fach existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  if (!subject || !materials || !tests || !attempts) return null;

  async function addFiles(files: File[]) {
    setUploading(true);
    const errors: string[] = [];
    for (const file of files) {
      try {
        const prepared = await prepareFile(file);
        await db.materials.add({
          id: newId(),
          subjectId,
          role: guessRole(file.name),
          createdAt: Date.now(),
          ...prepared,
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    setUploadErrors(errors);
    setUploading(false);
  }

  async function rename() {
    const name = prompt("Neuer Name des Fachs:", subject!.name)?.trim();
    if (name) await db.subjects.update(subjectId, { name });
  }

  async function remove() {
    if (!confirm(`Fach „${subject!.name}“ mit allen Materialien, Tests und Ergebnissen löschen?`)) return;
    await deleteSubject(subjectId);
    navigate("/", { replace: true });
  }

  function openMaterial(m: Material) {
    const blob = m.blob ?? new Blob([m.text ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href="#/" className="back-link">
          ← Fächer
        </a>
        <div className="row-between">
          <h1>
            <span className="subject-dot" style={{ background: subject.color }} />
            {subject.name}
          </h1>
          <div className="row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={rename}>
              Umbenennen
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
      </div>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Materialien</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPaste(true)}>
            Text einfügen
          </button>
        </div>
        <p className="muted small">
          Lade Aufgabenblätter, Lösungen, Skripte oder Altklausuren hoch und gib jeder Datei die passende Rolle. Die
          Rolle steuert, wie die KI das Material nutzt.
        </p>
        <FileDrop accept={ACCEPTED_FILE_TYPES} onFiles={addFiles} label="Dateien hochladen">
          <div className="filedrop-inner">
            <span className="filedrop-icon">⬆️</span>
            <strong>{uploading ? "Wird verarbeitet …" : "Dateien hierher ziehen oder tippen zum Auswählen"}</strong>
            <span className="muted small">PDF, Fotos/Bilder, Text · Word/PowerPoint bitte als PDF exportieren</span>
          </div>
        </FileDrop>
        {uploadErrors.map((err, i) => (
          <p key={i} className="error-text">
            {err}
          </p>
        ))}

        {materials.length > 0 && (
          <ul className="material-list">
            {materials.map((m) => (
              <li key={m.id} className="material-item">
                <span className="material-icon">{KIND_ICON[m.kind]}</span>
                <button className="link-btn material-name" onClick={() => openMaterial(m)} title="Öffnen">
                  {m.name}
                  <span className="muted small"> · {formatBytes(m.size)}</span>
                </button>
                <select
                  className={`select select-sm role-${m.role}`}
                  value={m.role}
                  aria-label={`Rolle von ${m.name}`}
                  onChange={(e) => db.materials.update(m.id, { role: e.target.value as MaterialRole })}
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={`${m.name} löschen`}
                  onClick={() => confirm(`„${m.name}“ löschen?`) && db.materials.delete(m.id)}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Tests</h2>
          <button
            className="btn btn-primary"
            disabled={materials.length === 0}
            onClick={() => navigate(`/subject/${subjectId}/new-test`)}
          >
            + Neuer Test
          </button>
        </div>
        {materials.length === 0 && <p className="muted">Lade zuerst Material hoch, um einen Test zu erstellen.</p>}
        {tests.length === 0 && materials.length > 0 && <p className="muted">Noch keine Tests erstellt.</p>}
        <div className="stack-sm">
          {tests.map((t) => {
            const finished = attempts
              .filter((a) => a.testId === t.id && a.status === "finished")
              .sort((a, b) => b.startedAt - a.startedAt);
            const last = finished[0];
            const best = finished.reduce((m, a) => Math.max(m, summarize(a, t).percent), -1);
            return (
              <a key={t.id} className="card card-link card-inner row-between" href={`#/test/${t.id}`}>
                <div>
                  <strong>{t.title}</strong>
                  <div className="muted small">
                    {t.mode === "exact" ? "Originalaufgaben" : "Neue Aufgaben"} · {t.questions.length} Fragen ·{" "}
                    {formatDate(t.createdAt)}
                  </div>
                </div>
                {last ? (
                  <div className="score-pill" title="Letztes / bestes Ergebnis">
                    {summarize(last, t).percent}% <span className="muted small">(best {best}%)</span>
                  </div>
                ) : (
                  <span className="chip chip-soft">neu</span>
                )}
              </a>
            );
          })}
        </div>
      </section>

      {showPaste && <PasteTextModal subjectId={subjectId} onClose={() => setShowPaste(false)} />}
    </div>
  );
}

function PasteTextModal({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [role, setRole] = useState<MaterialRole>("reference");

  async function save() {
    await db.materials.add({
      id: newId(),
      subjectId,
      name: name.trim() || "Eingefügter Text",
      kind: "text",
      mimeType: "text/plain",
      role,
      text,
      size: text.length,
      createdAt: Date.now(),
    });
    onClose();
  }

  return (
    <Modal
      title="Text als Material einfügen"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!text.trim()}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Notizen Kapitel 3" />
        </label>
        <label className="field">
          <span>Rolle</span>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as MaterialRole)}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Text</span>
        <textarea className="textarea" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </Modal>
  );
}
