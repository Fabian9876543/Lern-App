import { useState } from "react";
import { autoNameMaterial } from "../lib/materialNaming";
import { ACCEPTED_FILE_TYPES, ROLE_LABELS, guessRole, prepareFile } from "../lib/files";
import { newId } from "../lib/ids";
import { repo } from "../store/store";
import type { MaterialRole } from "../types";
import FileDrop from "./FileDrop";
import Modal from "./Modal";

/**
 * Hochladen von Material (Dateien oder eingefügter Text). Nichtssagende
 * Dateinamen werden danach automatisch benannt.
 */
export default function MaterialUpload({
  subjectId,
  onAdded,
  hint,
}: {
  subjectId: string;
  /** IDs des neu hinzugefügten Materials. */
  onAdded?: (ids: string[]) => void;
  hint?: string;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [showPaste, setShowPaste] = useState(false);

  async function addFiles(files: File[]) {
    setUploading((n) => n + files.length);
    const failed: string[] = [];
    const added: string[] = [];
    for (const file of files) {
      try {
        const { blob, text, ...prepared } = await prepareFile(file);
        const id = newId();
        await repo.addMaterial(
          { id, subjectId, role: guessRole(file.name), createdAt: Date.now(), ...prepared },
          { blob, text },
        );
        added.push(id);
        const material = repo.getMaterial(id);
        if (material) autoNameMaterial(material, { blob, text });
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setErrors(failed);
    if (added.length) onAdded?.(added);
  }

  return (
    <div className="stack-sm">
      <FileDrop accept={ACCEPTED_FILE_TYPES} onFiles={addFiles} label="Dateien hochladen">
        <div className="filedrop-inner">
          <span className="filedrop-icon">⬆️</span>
          <strong>{uploading > 0 ? "Wird hochgeladen …" : "Dateien hierher ziehen oder tippen zum Auswählen"}</strong>
          <span className="muted small">{hint ?? "PDF, Fotos/Bilder, Text · Word/PowerPoint bitte als PDF exportieren"}</span>
        </div>
      </FileDrop>
      <div className="row-between">
        <span className="muted small">Unklare Dateinamen wie „IMG_2041.jpg“ werden automatisch benannt.</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowPaste(true)}>
          Text einfügen
        </button>
      </div>
      {errors.map((err, i) => (
        <p key={i} className="error-text">
          {err}
        </p>
      ))}
      {showPaste && (
        <PasteTextModal
          subjectId={subjectId}
          onClose={() => setShowPaste(false)}
          onAdded={(id) => onAdded?.([id])}
        />
      )}
    </div>
  );
}

function PasteTextModal({
  subjectId,
  onClose,
  onAdded,
}: {
  subjectId: string;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [role, setRole] = useState<MaterialRole>("reference");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    try {
      const id = newId();
      await repo.addMaterial(
        {
          id,
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
      const material = repo.getMaterial(id);
      if (material) autoNameMaterial(material, { text });
      onAdded(id);
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
          <span>Name (optional)</span>
          <input
            id="paste-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="leer lassen = automatisch"
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
