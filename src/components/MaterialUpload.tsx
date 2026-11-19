import { useEffect, useRef, useState } from "react";
import { autoNameMaterial } from "../lib/materialNaming";
import { ACCEPTED_FILE_TYPES, ROLE_LABELS } from "../lib/files";
import { pickedFromInput, type PickedFile } from "../lib/folders";
import { dismissUploadReport, reportWorthShowing, uploadFiles, useUploadState, type UploadReport } from "../lib/upload";
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
  const { progress, report } = useUploadState(subjectId);
  const [showPaste, setShowPaste] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Ordnerauswahl: Das Attribut kennt React nicht, deshalb direkt am Element setzen.
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  function addFiles(items: PickedFile[]) {
    void uploadFiles(subjectId, items, {
      confirmLarge: (message) => confirmDialog(message, { title: "Ordner hochladen", confirmLabel: "Alle hochladen" }),
      onAdded,
    });
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
          if (files.length) addFiles(pickedFromInput(files));
        }}
      />
      <div className="row-between">
        <span className="muted small">Unklare Dateinamen wie „IMG_2041.jpg“ werden automatisch benannt.</span>
        <div className="row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => folderInputRef.current?.click()}>
            Ordner hochladen
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPaste(true)}>
            Text einfügen
          </button>
        </div>
      </div>
      {report && reportWorthShowing(report) && <UploadReportBox report={report} onClose={() => dismissUploadReport(subjectId)} />}
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

/** Ergebnis eines Uploads: was hochgeladen wurde und welche Dateien nicht – mit Grund. */
function UploadReportBox({ report, onClose }: { report: UploadReport; onClose: () => void }) {
  const problems = report.problems.length;
  const files = (n: number) => (n === 1 ? "1 Datei" : `${n} Dateien`);
  return (
    <div className={`callout upload-report ${problems ? "callout-warn" : "callout-ok"}`} role="status">
      <div className="row-between">
        <strong>
          {report.added} von {files(report.total)} hochgeladen
          {report.duplicates > 0 && ` · ${report.duplicates} ${report.duplicates === 1 ? "war" : "waren"} schon vorhanden`}
        </strong>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Schließen
        </button>
      </div>
      {problems > 0 && (
        <>
          <p className="small">Nicht hochgeladen ({files(problems)}):</p>
          <ul className="upload-problems">
            {report.problems.map((p) => (
              <li key={p.path}>
                <strong>{p.path}</strong> – {p.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      {report.systemFiles.length > 0 && (
        <details className="small">
          <summary>
            Außerdem {report.systemFiles.length === 1 ? "1 Systemdatei" : `${report.systemFiles.length} Systemdateien`} ausgelassen –
            die sind kein Lernmaterial
          </summary>
          <ul className="upload-problems muted">
            {report.systemFiles.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      {report.duplicates > 0 && (
        <p className="small muted">
          Dateien, die aus demselben Ordner schon hochgeladen sind, werden übersprungen – so kannst du einen Ordner einfach
          noch einmal hochladen, um Fehlendes zu ergänzen.
        </p>
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
