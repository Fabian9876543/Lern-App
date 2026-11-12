import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "../ai/prompts";
import MaterialPreview from "../components/MaterialPreview";
import MaterialRow from "../components/MaterialRow";
import MaterialUpload from "../components/MaterialUpload";
import { formatBytes } from "../lib/files";
import { splitMaterials } from "../lib/materialNames";
import { IS_ARTIFACT } from "../platform";
import { navigate, routeQuery } from "../router";
import { repo, useStore } from "../store/store";
import type { GenerationProgress } from "../targets/types";
import type { Difficulty, GenerationSettings, Material, QuestionType, TestMode } from "../types";

/** Web-Version: maximale Größe einer API-Anfrage (Base64 vergrößert um ~33 %). */
const MAX_REQUEST_BYTES = 31 * 1024 * 1024;
function estimateRequestBytes(materials: Material[]): number {
  return materials.reduce((sum, m) => sum + (m.blob ? Math.ceil(m.blob.size * 1.34) : m.size), 0);
}

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[];

const DEFAULT_SETTINGS: GenerationSettings = {
  mode: "exact",
  questionCount: 10,
  difficulty: "mixed",
  allowedTypes: ALL_TYPES,
  focus: "",
  exactFormat: "original",
};

/** Neues Material ist für den nächsten Test gedacht – deshalb ist es vollständig vorausgewählt. */
function defaultSelection(materials: Material[]): Set<string> {
  return new Set(materials.map((m) => m.id));
}

export default function NewTestPage({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const modelLabel = platform.useGenerationModelLabel();
  const subject = store.subjects.find((s) => s.id === subjectId);
  const materials = store.materials.filter((m) => m.subjectId === subjectId);
  // Neues Material (noch in keinem Test) steht oben; Material aus früheren Tests kann man wieder dazunehmen.
  const { fresh, used } = splitMaterials(
    materials,
    store.tests.filter((t) => t.subjectId === subjectId),
  );
  const [preview, setPreview] = useState<Material | null>(null);
  const [settings, setSettings] = useState<GenerationSettings>(() => {
    const from = repo.getTest(routeQuery().get("from") ?? "");
    return from
      ? { ...DEFAULT_SETTINGS, mode: "generated", questionCount: Math.min(30, from.questions.length) }
      : DEFAULT_SETTINGS;
  });
  const [selected, setSelected] = useState<Set<string>>(() => {
    const from = repo.getTest(routeQuery().get("from") ?? "");
    if (from) return new Set(from.materialIds.filter((id) => materials.some((m) => m.id === id)));
    return defaultSelection(fresh);
  });
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!subject) return null;

  const chosen = materials.filter((m) => selected.has(m.id));
  const bytes = estimateRequestBytes(chosen);
  const hasTasks = chosen.some((m) => m.role === "tasks" || m.role === "tasks_with_solutions");
  const hasSolutions = chosen.some((m) => m.role === "solutions" || m.role === "tasks_with_solutions");

  let blocker: string | null = null;
  if (ai.state === "unavailable") blocker = ai.reason ?? "Claude ist nicht verfügbar.";
  else if (chosen.length === 0) blocker = "Bitte mindestens ein Material auswählen.";
  else if (settings.mode === "exact" && !hasTasks)
    blocker = "Für Originalaufgaben muss mindestens ein Material die Rolle „Aufgaben“ oder „Aufgaben + Lösungen“ haben.";
  else if (settings.mode === "generated" && settings.allowedTypes.length === 0)
    blocker = "Bitte mindestens ein Aufgabenformat auswählen.";
  else if (!IS_ARTIFACT && bytes > MAX_REQUEST_BYTES)
    blocker = "Die Auswahl ist zu groß (max. ca. 30 MB). Bitte weniger Dateien wählen.";

  function setMode(mode: TestMode) {
    setSettings((s) => ({ ...s, mode }));
  }

  function toggleMaterial(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleType(t: QuestionType) {
    setSettings((s) => ({
      ...s,
      allowedTypes: s.allowedTypes.includes(t) ? s.allowedTypes.filter((x) => x !== t) : [...s.allowedTypes, t],
    }));
  }

  async function generate() {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ phase: "preparing", questionsSoFar: 0 });
    try {
      const test = await platform.generateTest({
        subjectId,
        materials: chosen,
        settings: { ...settings, questionCount: settings.mode === "generated" ? settings.questionCount : null },
        signal: controller.signal,
        onProgress: (p) => mounted.current && setProgress(p),
      });
      repo.addTest(test);
      if (mounted.current) navigate(`/test/${test.id}`, { replace: true });
    } catch (e) {
      if (mounted.current) {
        setError(controller.signal.aborted ? null : platform.describeError(e));
        setProgress(null);
      }
    } finally {
      abortRef.current = null;
    }
  }

  if (progress) {
    return (
      <div className="card generating stack-sm" aria-live="polite">
        <div className="spinner" />
        <h2>
          {progress.phase === "preparing" && "Material wird vorbereitet …"}
          {progress.phase === "analyzing" && "Claude liest dein Material …"}
          {progress.phase === "writing" &&
            (progress.questionsSoFar > 0 ? `${progress.questionsSoFar} Fragen erstellt …` : "Fragen werden geschrieben …")}
        </h2>
        <p className="muted">
          Das kann je nach Umfang ein bis mehrere Minuten dauern. Lass diese Seite geöffnet.
        </p>
        <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/subject/${subjectId}`} className="back-link">
          ← {subject.name}
        </a>
        <h1>Neuen Test erstellen</h1>
      </div>

      <section className="stack-sm">
        <h2>1. Was für ein Test?</h2>
        <div className="mode-cards">
          <button
            type="button"
            className={`card mode-card ${settings.mode === "exact" ? "active" : ""}`}
            onClick={() => setMode("exact")}
            aria-pressed={settings.mode === "exact"}
          >
            <span className="mode-icon">📋</span>
            <strong>Meine Aufgaben abfragen</strong>
            <span className="muted small">
              Claude übernimmt genau die Aufgaben aus deinen Aufgabenblättern und die Lösungen aus deinen
              Lösungsdateien und macht daraus einen interaktiven Test.
            </span>
          </button>
          <button
            type="button"
            className={`card mode-card ${settings.mode === "generated" ? "active" : ""}`}
            onClick={() => setMode("generated")}
            aria-pressed={settings.mode === "generated"}
          >
            <span className="mode-icon">✨</span>
            <strong>Neue Aufgaben erzeugen</strong>
            <span className="muted small">
              Dein Material dient als Referenz: Claude erstellt neue, andere Aufgaben zum gleichen Stoff – ideal zum
              Üben über die bekannten Aufgaben hinaus.
            </span>
          </button>
        </div>
      </section>

      <section className="card stack-sm">
        <h2>2. Material für diesen Test</h2>
        <MaterialUpload
          subjectId={subjectId}
          onAdded={(ids) => setSelected((prev) => new Set([...prev, ...ids]))}
        />
        {fresh.length > 0 ? (
          <ul className="material-list">
            {fresh.map((m) => (
              <MaterialRow
                key={m.id}
                material={m}
                onPreview={setPreview}
                selectable={{ checked: selected.has(m.id), onToggle: () => toggleMaterial(m.id) }}
              />
            ))}
          </ul>
        ) : (
          <p className="muted small">Lade oben das Material für diesen Test hoch.</p>
        )}
        {used.length > 0 && (
          <details className="used-materials" open={used.some((u) => selected.has(u.material.id))}>
            <summary className="small">Material aus früheren Tests wiederverwenden ({used.length})</summary>
            <ul className="material-list">
              {used.map(({ material, tests }) => (
                <MaterialRow
                  key={material.id}
                  material={material}
                  onPreview={setPreview}
                  actions={false}
                  extra={<> · aus „{tests[0].title}“</>}
                  selectable={{ checked: selected.has(material.id), onToggle: () => toggleMaterial(material.id) }}
                />
              ))}
            </ul>
          </details>
        )}
        <p className="muted small">
          Ausgewählt: {chosen.length} {chosen.length === 1 ? "Datei" : "Dateien"} · {formatBytes(bytes)}
          {settings.mode === "exact" && hasTasks && !hasSolutions && (
            <> · Keine Lösungsdatei ausgewählt – Claude löst die Aufgaben dann selbst.</>
          )}
        </p>
        <p className="muted small">Die Rolle steuert, wie Claude das Material nutzt – bei Bedarf rechts ändern.</p>
      </section>

      <section className="card stack-sm">
        <h2>3. Einstellungen</h2>
        {settings.mode === "exact" ? (
          <>
            <div className="field">
              <span>Aufgabenformat</span>
              <label className="check">
                <input
                  type="radio"
                  name="format"
                  checked={settings.exactFormat === "original"}
                  onChange={() => setSettings((s) => ({ ...s, exactFormat: "original" }))}
                />
                Wie im Original (offene Aufgaben bleiben offen, Claude bewertet deine Antwort)
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="format"
                  checked={settings.exactFormat === "auto_checkable"}
                  onChange={() => setSettings((s) => ({ ...s, exactFormat: "auto_checkable" }))}
                />
                Möglichst automatisch prüfbar (Multiple Choice, Zahlenergebnis, Kurzantwort)
              </label>
            </div>
            <label className="field">
              <span>Nur bestimmte Aufgaben? (optional)</span>
              <input
                className="input"
                placeholder="z. B. „nur Blatt 3“ oder „Aufgaben 1–4“"
                value={settings.focus}
                onChange={(e) => setSettings((s) => ({ ...s, focus: e.target.value }))}
              />
            </label>
          </>
        ) : (
          <>
            <div className="form-grid">
              <label className="field">
                <span>Anzahl Fragen: {settings.questionCount}</span>
                <input
                  type="range"
                  min={3}
                  max={40}
                  value={settings.questionCount ?? 10}
                  onChange={(e) => setSettings((s) => ({ ...s, questionCount: Number(e.target.value) }))}
                />
              </label>
              <label className="field">
                <span>Schwierigkeit</span>
                <select
                  className="select"
                  value={settings.difficulty}
                  onChange={(e) => setSettings((s) => ({ ...s, difficulty: e.target.value as Difficulty | "mixed" }))}
                >
                  {(["mixed", "easy", "medium", "hard"] as const).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field">
              <span>Aufgabenformate</span>
              <div className="row-wrap">
                {ALL_TYPES.map((t) => (
                  <label key={t} className="check chip-check">
                    <input type="checkbox" checked={settings.allowedTypes.includes(t)} onChange={() => toggleType(t)} />
                    {TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Schwerpunkt (optional)</span>
              <input
                className="input"
                placeholder="z. B. „Integration durch Substitution“ oder „Kapitel 4–5“"
                value={settings.focus}
                onChange={(e) => setSettings((s) => ({ ...s, focus: e.target.value }))}
              />
            </label>
          </>
        )}
      </section>

      {error && <div className="callout callout-error">{error}</div>}

      <div className="row-between sticky-actions">
        <span className="muted small">
          Modell: {modelLabel} · {platform.usageNote}
        </span>
        <button className="btn btn-primary btn-lg" disabled={!!blocker} onClick={generate} title={blocker ?? ""}>
          Test erstellen
        </button>
      </div>
      {blocker && <p className="muted small right">{blocker}</p>}
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
