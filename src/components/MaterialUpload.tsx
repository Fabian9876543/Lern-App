import { useEffect, useRef, useState } from "react";
import { autoNameMaterial } from "../lib/materialNaming";
import { ACCEPTED_FILE_TYPES, ROLE_LABELS, formatBytes, guessRole, prepareFile } from "../lib/files";
import { describeSkipped, pickedFromInput, planUpload, type PickedFile } from "../lib/folders";
import { confirmDialog } from "./Dialogs";
import { newId } from "../lib/ids";
import { repo } from "../store/store";
import type { MaterialRole } from "../types";
import FileDrop from "./FileDrop";
import Modal from "./Modal";

/**
 * Hochladen von Material (Dateien oder eingefügter Text). Nichtssagende
 * Dateinamen werden danach automatisch benannt.
 */
/** Ab dieser Größe fragt die App nach, bevor ein Ordner hochgeladen wird. */
const CONFIRM_FILES = 25;
const CONFIRM_BYTES = 100 * 1024 * 1024;

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
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Ordnerauswahl: Das Attribut kennt React nicht, deshalb direkt am Element setzen.
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  async function addFiles(items: PickedFile[]) {
    const plan = planUpload(items);
    setErrors([]);
    setNotice(describeSkipped(plan.unsupported));
    if (plan.accepted.length === 0) return;
    const roots = [...new Set(plan.accepted.map((i) => i.folder?.split("/")[0]).filter((f): f is string => !!f))];
    const bytes = plan.accepted.reduce((sum, i) => sum + i.file.size, 0);
    if (roots.length && (plan.accepted.length > CONFIRM_FILES || bytes > CONFIRM_BYTES)) {
      const ok = await confirmDialog(
        `${roots.map((r) => `„${r}“`).join(", ")} ${roots.length === 1 ? "enthält" : "enthalten"} ${plan.accepted.length} lesbare Dateien (${formatBytes(bytes)}). Alle hochladen?`,
        { title: "Ordner hochladen", confirmLabel: "Alle hochladen" },
      );
      if (!ok) return;
    }

    setProgress({ done: 0, total: plan.accepted.length });
    const failed: string[] = [];
    const added: string[] = [];
    for (const { file, folder } of plan.accepted) {
      try {
        const { blob, text, ...prepared } = await prepareFile(file);
        const id = newId();
        await repo.addMaterial(
          { id, subjectId, role: guessRole(file.name, folder), createdAt: Date.now(), ...(folder ? { folder } : {}), ...prepared },
          { blob, text },
        );
        added.push(id);
        const material = repo.getMaterial(id);
        if (material) autoNameMaterial(material, { blob, text });
      } catch (e) {
        failed.push(`${folder ? `${folder}/` : ""}${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    }
    setProgress(null);
    setErrors(failed);
    if (added.length) onAdded?.(added);
  }

  return (
    <div className="stack-sm">
      <FileDrop accept={ACCEPTED_FILE_TYPES} onFiles={addFiles} label="Dateien oder Ordner hochladen">
        <div className="filedrop-inner" aria-live="polite">
          <span className="filedrop-icon">⬆️</span>
          <strong>
            {progress
              ? `Wird hochgeladen … ${progress.total > 1 ? `${progress.done} von ${progress.total}` : ""}`
              : "Dateien oder Ordner hierher ziehen oder tippen zum Auswählen"}
          </strong>
          <span className="muted small">
            {hint ?? "PDF, Fotos/Bilder, Excel (.xlsx), Text · Word/PowerPoint bitte als PDF exportieren"}
          </span>
        </div>
      </FileDrop>
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        data-testid="folder-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void addFiles(pickedFromInput(files));
        }}
      />
      <div className="row-between">
        <span className="muted small">Unklare Dateinamen wie „IMG_2041.jpg“ werden automatisch benannt.</span>
        <div className="row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => folderInputRef.current?.click()} disabled={!!progress}>
            Ordner hochladen
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPaste(true)}>
            Text einfügen
          </button>
        </div>
      </div>
      {notice && <p className="muted small upload-notice">{notice}</p>}
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
