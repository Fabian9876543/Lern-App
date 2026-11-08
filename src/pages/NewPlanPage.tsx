import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import { WeekdayMinutesInput } from "../components/PlanParts";
import { parseTopicLines } from "../ai/topics";
import { ROLE_LABELS } from "../lib/files";
import { addDays, daysBetween, formatMinutes, todayISO } from "../lib/planner";
import { availableMinutes, createDraftPlan, studyDayCount } from "../lib/plans";
import { navigate } from "../router";
import { useStore } from "../store/store";
import type { GenerationProgress } from "../targets/types";

const DEFAULT_WEEK = [0, 60, 60, 60, 60, 60, 120];

export default function NewPlanPage({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const modelLabel = platform.useGenerationModelLabel();
  const subject = store.subjects.find((s) => s.id === subjectId);
  const materials = store.materials.filter((m) => m.subjectId === subjectId);

  const [examDate, setExamDate] = useState(addDays(todayISO(), 28));
  const [startDate, setStartDate] = useState(todayISO());
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(materials.map((m) => m.id)));
  const [source, setSource] = useState<"ai" | "manual">(materials.length ? "ai" : "manual");
  const [manualText, setManualText] = useState("");
  const [enrich, setEnrich] = useState(true);
  const [focus, setFocus] = useState("");
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

  const validDates = examDate > startDate;
  const minutes = validDates ? availableMinutes(startDate, examDate, week) : 0;
  const dayCount = validDates ? studyDayCount(startDate, examDate, week) : 0;
  const lines = parseTopicLines(manualText);
  const useAi = source === "ai" || enrich;

  let blocker: string | null = null;
  if (!validDates) blocker = "Das Prüfungsdatum muss nach dem Start liegen.";
  else if (minutes === 0) blocker = "Bitte für mindestens einen Wochentag Lernzeit eintragen.";
  else if (source === "manual" && lines.length === 0) blocker = "Bitte mindestens ein Thema eingeben.";
  else if (source === "ai" && selected.size === 0) blocker = "Bitte Material auswählen, aus dem Claude die Themen ableiten soll.";
  else if (useAi && ai.state === "unavailable") blocker = ai.reason ?? "Claude ist nicht verfügbar.";

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function create() {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    if (useAi) setProgress({ phase: "preparing", questionsSoFar: 0 });
    try {
      const id = await createDraftPlan(
        {
          subjectId,
          subjectName: subject!.name,
          examDate,
          startDate,
          minutesPerWeekday: week,
          materialIds: [...selected],
          focus,
          topicSource: source,
          manualTopicsText: manualText,
          enrichManual: enrich,
        },
        { signal: controller.signal, onProgress: (p) => mounted.current && setProgress(p) },
      );
      if (mounted.current) navigate(`/plan/${id}`, { replace: true });
    } catch (e) {
      if (mounted.current) {
        setError(controller.signal.aborted ? null : platform.describeError(e));
        setProgress(null);
      }
    }
  }

  if (progress) {
    return (
      <div className="card generating stack-sm" aria-live="polite">
        <div className="spinner" />
        <h2>
          {progress.phase === "preparing" && "Material wird vorbereitet …"}
          {progress.phase === "analyzing" && (source === "manual" ? "Claude schätzt deine Themen ein …" : "Claude sucht die Prüfungsthemen …")}
          {progress.phase === "writing" &&
            (progress.questionsSoFar > 0 ? `${progress.questionsSoFar} Themen gefunden …` : "Themenliste wird geschrieben …")}
        </h2>
        <p className="muted">Danach kannst du die Themen prüfen und anpassen.</p>
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
        <h1>Lernplan erstellen</h1>
        <p className="muted">
          Du gibst Prüfungstermin und Lernzeit an, Claude ermittelt die Themen – die App verteilt sie dann auf die Tage bis
          zur Prüfung, mit Übungstests, Wiederholungen und einer Probeklausur.
        </p>
      </div>

      <section className="card stack-sm">
        <h2>Prüfung</h2>
        <div className="form-grid">
          <label className="field">
            <span>Prüfungsdatum</span>
            <input
              id="exam-date"
              className="input"
              type="date"
              value={examDate}
              min={addDays(todayISO(), 1)}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Lernen ab</span>
            <input
              id="start-date"
              className="input"
              type="date"
              value={startDate}
              min={todayISO()}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="card stack-sm">
        <h2>Lernzeit pro Wochentag</h2>
        <WeekdayMinutesInput value={week} onChange={setWeek} />
        <p className="muted small">
          {validDates
            ? `Bis zur Prüfung: ${daysBetween(startDate, examDate)} Tage · ${dayCount} Lerntage · zusammen ca. ${formatMinutes(minutes)}`
            : "Bitte ein Prüfungsdatum nach dem Startdatum wählen."}
        </p>
      </section>

      <section className="card stack-sm">
        <h2>Themen der Prüfung</h2>
        <div className="mode-cards">
          <button
            type="button"
            className={`card mode-card ${source === "ai" ? "active" : ""}`}
            onClick={() => setSource("ai")}
            aria-pressed={source === "ai"}
            disabled={materials.length === 0}
          >
            <strong>Claude schlägt die Themen vor</strong>
            <span className="muted small">
              {materials.length
                ? "Aus deinem Material – mit Zeitbedarf, Wichtigkeit und Fundstellen."
                : "Dafür zuerst Material im Fach hochladen."}
            </span>
          </button>
          <button
            type="button"
            className={`card mode-card ${source === "manual" ? "active" : ""}`}
            onClick={() => setSource("manual")}
            aria-pressed={source === "manual"}
          >
            <strong>Ich gebe die Themen selbst ein</strong>
            <span className="muted small">Zum Beispiel die Themenliste, die für die Klausur angekündigt wurde.</span>
          </button>
        </div>
        {source === "manual" && (
          <>
            <label className="field">
              <span>Ein Thema pro Zeile (optional mit „ – “ eine kurze Beschreibung)</span>
              <textarea
                id="manual-topics"
                className="textarea"
                rows={8}
                value={manualText}
                placeholder={"Grenzwerte und Stetigkeit\nAbleitungen – Regeln, Kettenregel\nKurvendiskussion\nIntegration durch Substitution"}
                onChange={(e) => setManualText(e.target.value)}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} />
              Zeitbedarf, Wichtigkeit und Fundstellen von Claude schätzen lassen
            </label>
            {!enrich && <p className="muted small">Ohne Claude bekommt jedes Thema 60 Minuten – du kannst das im nächsten Schritt anpassen.</p>}
          </>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Material</h2>
        <p className="muted small">Wird für die Themen, die Übungstests und die Probeklausur genutzt.</p>
        {materials.length === 0 ? (
          <p className="muted">Noch kein Material in diesem Fach.</p>
        ) : (
          <ul className="material-list">
            {materials.map((m) => (
              <li key={m.id} className="material-item">
                <label className="check grow">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  <span>{m.name}</span>
                </label>
                <span className={`chip role-chip role-${m.role}`}>{ROLE_LABELS[m.role]}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="field">
          <span>Hinweise für Claude (optional)</span>
          <input
            id="plan-focus"
            className="input"
            value={focus}
            placeholder="z. B. „Kapitel 5 kann ich schon“ oder „Beweise kommen nicht dran“"
            onChange={(e) => setFocus(e.target.value)}
          />
        </label>
      </section>

      {error && <div className="callout callout-error">{error}</div>}

      <div className="row-between sticky-actions">
        <span className="muted small">{useAi ? `${modelLabel} · ${platform.usageNote}` : "Ohne Claude"}</span>
        <button className="btn btn-primary btn-lg" disabled={!!blocker} onClick={create} title={blocker ?? ""}>
          Weiter: Themen prüfen
        </button>
      </div>
      {blocker && <p className="muted small right">{blocker}</p>}
    </div>
  );
}
