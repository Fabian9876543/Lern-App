import platform from "@platform-impl";
import { useEffect, useState } from "react";
import MaterialList, { type MaterialSelection } from "../components/MaterialList";
import MaterialPreview from "../components/MaterialPreview";
import MaterialRow from "../components/MaterialRow";
import MaterialUpload from "../components/MaterialUpload";
import { cancelExamJob, clearExamJob, newAnalysisKey, startExamAnalysis, useExamJob } from "../lib/examAnalysis";
import { splitMaterials, usedLabel } from "../lib/materialNames";
import { navigate, routeQuery } from "../router";
import { useStore } from "../store/store";
import type { GenerationProgress } from "../targets/types";
import type { Material } from "../types";

function progressText(p: GenerationProgress): string {
  if (p.phase === "transcribing") return `Claude schreibt die Seiten ab … ${p.pagesDone ?? 0} von ${p.pagesTotal ?? "?"}`;
  if (p.phase === "writing" && p.questionsSoFar > 0)
    return `${p.questionsSoFar === 1 ? "1 Aufgabe" : `${p.questionsSoFar} Aufgaben`} ausgewertet …`;
  if (p.phase === "preparing") return "Deine Klausur wird vorbereitet …";
  return "Claude sieht sich deine Klausur an …";
}

/** Korrigierte Klausur hochladen und von Claude auswerten lassen. */
export default function NewAnalysisPage({ subjectId }: { subjectId: string }) {
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
  const key = newAnalysisKey(subjectId);
  const job = useExamJob(key);
  // Nur ausdrücklich gewählte Dateien – anderes neues Material gehört meist nicht zur Klausur.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((routeQuery().get("materials") ?? "").split(",").filter((id) => materials.some((m) => m.id === id))),
  );
  const [remarks, setRemarks] = useState("");
  const [preview, setPreview] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job?.done) return;
    if (job.resultId) navigate(`/analysis/${job.resultId}`, { replace: true });
    else if (job.error) setError(job.error);
    clearExamJob(key);
  }, [job?.done, job?.resultId, job?.error, key]);

  if (!subject) return null;

  if (job && !job.done) {
    return (
      <div className="card generating stack-sm" aria-live="polite" aria-busy="true">
        <div className="spinner" />
        <h2>{progressText(job.progress)}</h2>
        {job.progress.phase === "transcribing" && (
          <p className="small">
            Das sind mehr Fotos, als Claude auf einmal ansehen kann. Die Seiten werden deshalb einmal abgeschrieben –
            samt Korrekturen und Punkten.
          </p>
        )}
        <p className="muted">
          Das dauert meist ein bis drei Minuten. Du kannst die Seite verlassen – die Auswertung läuft weiter und steht
          dann im Fach unter „Klausuren auswerten“.
        </p>
        <button className="btn btn-ghost" onClick={() => cancelExamJob(key)}>
          Abbrechen
        </button>
      </div>
    );
  }

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
      ? "Bitte lade deine korrigierte Klausur hoch oder wähle sie aus."
      : ai.state === "unavailable"
        ? (ai.reason ?? "Claude ist nicht verfügbar.")
        : null;

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
        <h1>Klausur auswerten</h1>
        <p className="muted">
          Lade deine korrigierte Klausur hoch. Claude zeigt dir Aufgabe für Aufgabe, was nicht gut lief, fasst deine
          Schwachstellen zusammen und erstellt dir dazu passende Übungsaufgaben.
        </p>
      </div>

      <section className="card stack-sm">
        <h2>1. Deine korrigierte Klausur</h2>
        <ul className="muted small analysis-tips">
          <li>Fotos oder Scan aller Seiten – mit den Korrekturen und Punkten deiner Lehrkraft.</li>
          <li>Wenn vorhanden, auch Aufgabenblatt, Musterlösung oder Erwartungshorizont.</li>
        </ul>
        <MaterialUpload subjectId={subjectId} onAdded={(ids) => selection.setMany(ids, true)} />
        {fresh.length > 0 && <MaterialList materials={fresh} selection={selection} row={(m) => row(m)} />}
        {used.length > 0 && (
          <details className="used-materials" open={used.some((u) => selected.has(u.material.id))}>
            <summary className="small">Schon verwendetes Material ({used.length})</summary>
            <MaterialList materials={used.map((u) => u.material)} selection={selection} row={(m) => row(m, usedLabel(used.find((u) => u.material.id === m.id)!))} />
          </details>
        )}
        <p className="muted small">Ausgewählt: {chosen.length === 1 ? "1 Datei" : `${chosen.length} Dateien`}</p>
      </section>

      <section className="card stack-sm">
        <h2>2. Noch etwas dazu? (optional)</h2>
        <label className="field">
          <span>Was du über die Klausur weißt</span>
          <textarea
            id="analysis-remarks"
            className="textarea"
            rows={2}
            value={remarks}
            maxLength={600}
            placeholder="z. B. „Note 4 – die Lehrerin meinte, meine Rechenwege sind zu knapp“"
            onChange={(e) => setRemarks(e.target.value)}
          />
        </label>
      </section>

      {error && <div className="callout callout-error">{error}</div>}

      <div className="row-between sticky-actions">
        <span className="muted small">
          {modelLabel} · {platform.usageNote}
        </span>
        <button className="btn btn-primary btn-lg" disabled={!!blocker} onClick={() => {
          setError(null);
          startExamAnalysis({ subjectId, materialIds: chosen.map((m) => m.id), remarks });
        }} title={blocker ?? ""}>
          Klausur auswerten
        </button>
      </div>
      {blocker && <p className="muted small right">{blocker}</p>}
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
