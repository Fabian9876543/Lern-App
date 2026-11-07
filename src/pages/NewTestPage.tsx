import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { describeError } from "../ai/client";
import { generateTest, type GenerationProgress } from "../ai/generateTest";
import { MAX_REQUEST_BYTES, estimateRequestBytes } from "../ai/materials";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "../ai/prompts";
import { db } from "../db";
import { ROLE_LABELS, formatBytes } from "../lib/files";
import { navigate } from "../router";
import { MODELS, useSettings } from "../settings";
import type { Difficulty, GenerationSettings, Material, QuestionType, TestMode } from "../types";

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[];

const DEFAULT_SETTINGS: GenerationSettings = {
  mode: "exact",
  questionCount: 10,
  difficulty: "mixed",
  allowedTypes: ALL_TYPES,
  focus: "",
  exactFormat: "original",
};

function defaultSelection(materials: Material[], mode: TestMode): Set<string> {
  return new Set(materials.filter((m) => mode === "generated" || m.role !== "reference").map((m) => m.id));
}

function fromTestId(): string | null {
  const query = window.location.hash.split("?")[1];
  return query ? new URLSearchParams(query).get("from") : null;
}

export default function NewTestPage({ subjectId }: { subjectId: string }) {
  const settingsStore = useSettings();
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);
  const materials = useLiveQuery(
    () => db.materials.where("subjectId").equals(subjectId).sortBy("createdAt"),
    [subjectId],
  );
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<Set<string> | null>(null);
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

  // Vorauswahl: entweder aus einem bestehenden Test („Ähnliche Aufgaben“) oder nach Rolle.
  useEffect(() => {
    if (!materials || selected) return;
    const from = fromTestId();
    if (from) {
      db.tests.get(from).then((t) => {
        if (t) {
          setSettings({ ...DEFAULT_SETTINGS, mode: "generated", questionCount: Math.min(30, t.questions.length) });
          setSelected(new Set(t.materialIds.filter((id) => materials.some((m) => m.id === id))));
        } else setSelected(defaultSelection(materials, "exact"));
      });
    } else {
      setSelected(defaultSelection(materials, "exact"));
    }
  }, [materials, selected]);

  if (!subject || !materials || !selected) return null;

  const chosen = materials.filter((m) => selected.has(m.id));
  const bytes = estimateRequestBytes(chosen);
  const hasTasks = chosen.some((m) => m.role === "tasks" || m.role === "tasks_with_solutions");
  const hasSolutions = chosen.some((m) => m.role === "solutions" || m.role === "tasks_with_solutions");
  const modelLabel = MODELS.find((m) => m.id === settingsStore.generationModel)?.label ?? settingsStore.generationModel;

  let blocker: string | null = null;
  if (!settingsStore.apiKey) blocker = "Bitte zuerst in den Einstellungen einen API-Schlüssel eintragen.";
  else if (chosen.length === 0) blocker = "Bitte mindestens ein Material auswählen.";
  else if (settings.mode === "exact" && !hasTasks)
    blocker = "Für Originalaufgaben muss mindestens ein Material die Rolle „Aufgaben“ oder „Aufgaben + Lösungen“ haben.";
  else if (settings.mode === "generated" && settings.allowedTypes.length === 0)
    blocker = "Bitte mindestens ein Aufgabenformat auswählen.";
  else if (bytes > MAX_REQUEST_BYTES) blocker = "Die Auswahl ist zu groß (max. ca. 30 MB). Bitte weniger Dateien wählen.";

  function setMode(mode: TestMode) {
    setSettings((s) => ({ ...s, mode }));
    setSelected(defaultSelection(materials!, mode));
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
      const test = await generateTest({
        subjectId,
        materials: chosen,
        settings: { ...settings, questionCount: settings.mode === "generated" ? settings.questionCount : null },
        signal: controller.signal,
        onProgress: (p) => mounted.current && setProgress(p),
      });
      await db.tests.add(test);
      if (mounted.current) navigate(`/test/${test.id}`, { replace: true });
    } catch (e) {
      if (mounted.current) {
        setError(controller.signal.aborted ? null : describeError(e));
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
          {progress.phase === "analyzing" && "Die KI liest dein Material …"}
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
              Die KI übernimmt genau die Aufgaben aus deinen Aufgabenblättern und die Lösungen aus deinen
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
              Dein Material dient als Referenz: Die KI erstellt neue, andere Aufgaben zum gleichen Stoff – ideal zum
              Üben über die bekannten Aufgaben hinaus.
            </span>
          </button>
        </div>
      </section>

      <section className="card stack-sm">
        <h2>2. Welches Material?</h2>
        <ul className="material-list">
          {materials.map((m) => (
            <li key={m.id} className="material-item">
              <label className="check grow">
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleMaterial(m.id)} />
                <span>{m.name}</span>
              </label>
              <span className={`chip role-chip role-${m.role}`}>{ROLE_LABELS[m.role]}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Ausgewählt: {chosen.length} {chosen.length === 1 ? "Datei" : "Dateien"} · {formatBytes(bytes)}
          {settings.mode === "exact" && hasTasks && !hasSolutions && (
            <> · Keine Lösungsdatei ausgewählt – die KI löst die Aufgaben dann selbst.</>
          )}
        </p>
        <p className="muted small">
          Rollen falsch? Du kannst sie auf der <a href={`#/subject/${subjectId}`}>Fachseite</a> ändern.
        </p>
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
                Wie im Original (offene Aufgaben bleiben offen, KI bewertet deine Antwort)
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
        <span className="muted small">Modell: {modelLabel}</span>
        <button className="btn btn-primary btn-lg" disabled={!!blocker} onClick={generate} title={blocker ?? ""}>
          Test erstellen
        </button>
      </div>
      {blocker && <p className="muted small right">{blocker}</p>}
    </div>
  );
}
