import { useState } from "react";
import { confirmDialog, promptDialog } from "../components/Dialogs";
import FileDrop from "../components/FileDrop";
import MaterialPreview from "../components/MaterialPreview";
import Modal from "../components/Modal";
import { formatDate, summarize } from "../lib/attempts";
import { ACCEPTED_FILE_TYPES, ROLE_LABELS, formatBytes, guessRole, prepareFile } from "../lib/files";
import { newId } from "../lib/ids";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";
import type { Material, MaterialRole } from "../types";

const KIND_ICON = { pdf: "📄", image: "🖼️", text: "📝" } as const;

export default function SubjectPage({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [showPaste, setShowPaste] = useState(false);
  const [preview, setPreview] = useState<Material | null>(null);

  const subject = store.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    return (
      <div className="card">
        <p>Dieses Fach existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  const materials = store.materials.filter((m) => m.subjectId === subjectId);
  const tests = store.tests.filter((t) => t.subjectId === subjectId).sort((a, b) => b.createdAt - a.createdAt);
  const attempts = store.attempts.filter((a) => a.subjectId === subjectId);

  async function addFiles(files: File[]) {
    setUploading((n) => n + files.length);
    const errors: string[] = [];
    for (const file of files) {
      try {
        const { blob, text, ...prepared } = await prepareFile(file);
        await repo.addMaterial(
          { id: newId(), subjectId, role: guessRole(file.name), createdAt: Date.now(), ...prepared },
          { blob, text },
        );
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setUploadErrors(errors);
  }

  async function rename() {
    const name = await promptDialog("Fach umbenennen", { label: "Name", initial: subject!.name });
    if (name) repo.updateSubject(subjectId, { name });
  }

  async function remove() {
    const ok = await confirmDialog(`„${subject!.name}“ mit allen Materialien, Tests und Ergebnissen löschen?`, {
      title: "Fach löschen",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    repo.deleteSubject(subjectId);
    navigate("/", { replace: true });
  }

  async function removeMaterial(m: Material) {
    const ok = await confirmDialog(`„${m.name}“ löschen?`, { title: "Material löschen", confirmLabel: "Löschen", danger: true });
    if (ok) repo.deleteMaterial(m.id);
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
          Rolle steuert, wie Claude das Material nutzt.
        </p>
        <FileDrop accept={ACCEPTED_FILE_TYPES} onFiles={addFiles} label="Dateien hochladen">
          <div className="filedrop-inner">
            <span className="filedrop-icon">⬆️</span>
            <strong>{uploading > 0 ? "Wird hochgeladen …" : "Dateien hierher ziehen oder tippen zum Auswählen"}</strong>
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
                <button className="link-btn material-name" onClick={() => setPreview(m)} title="Ansehen">
                  {m.name}
                  <span className="muted small"> · {formatBytes(m.size)}</span>
                </button>
                <select
                  className={`select select-sm role-${m.role}`}
                  value={m.role}
                  aria-label={`Rolle von ${m.name}`}
                  onChange={(e) => repo.updateMaterial(m.id, { role: e.target.value as MaterialRole })}
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
                  onClick={() => removeMaterial(m)}
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
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PasteTextModal({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [role, setRole] = useState<MaterialRole>("reference");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    try {
      await repo.addMaterial(
        {
          id: newId(),
          subjectId,
          name: name.trim() || "Eingefügter Text",
          kind: "text",
          mimeType: "text/plain",
          role,
          size: text.length,
          createdAt: Date.now(),
        },
        { text },
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal
      title="Text als Material einfügen"
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text">{error}</span>}
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
          <input
            id="paste-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Notizen Kapitel 3"
          />
        </label>
        <label className="field">
          <span>Rolle</span>
          <select id="paste-role" className="select" value={role} onChange={(e) => setRole(e.target.value as MaterialRole)}>
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
        <textarea id="paste-text" className="textarea" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </Modal>
  );
}
