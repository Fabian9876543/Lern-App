import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import { confirmDialog, promptDialog } from "../components/Dialogs";
import Modal from "../components/Modal";
import { TaskRow, TopicEditor, TopicStatusList, WeekdayMinutesInput } from "../components/PlanParts";
import { summarize } from "../lib/attempts";
import {
  daysBetween,
  effectiveMinutes,
  formatDay,
  formatLongDate,
  formatMinutes,
  todayISO,
  topicStatus,
} from "../lib/planner";
import {
  availableMinutes,
  finalizePlan,
  noteFor,
  planHasMaterials,
  redistributePlan,
  reopenPlan,
  setTaskStatus,
  startPlacementTest,
  startTaskTest,
} from "../lib/plans";
import { navigate } from "../router";
import { repo, useStore, type StoreState } from "../store/store";
import type { GenerationProgress } from "../targets/types";
import type { PlanTask, StudyPlan } from "../types";

export default function PlanPage({ planId }: { planId: string }) {
  const store = useStore();
  const plan = store.plans.find((p) => p.id === planId);
  const [generating, setGenerating] = useState<{ label: string; progress: GenerationProgress } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editTimes, setEditTimes] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!plan) {
    return (
      <div className="card">
        <p>Dieser Lernplan existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  const subject = store.subjects.find((s) => s.id === plan.subjectId);

  /** Erzeugt bei Bedarf einen Test (mit Fortschrittsanzeige) und öffnet den Durchlauf. */
  async function runWithTest(label: string, start: (opts: { signal: AbortSignal; onProgress: (p: GenerationProgress) => void }) => Promise<string>) {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating({ label, progress: { phase: "preparing", questionsSoFar: 0 } });
    try {
      const attemptId = await start({
        signal: controller.signal,
        onProgress: (p) => mounted.current && setGenerating({ label, progress: p }),
      });
      if (mounted.current) navigate(`/run/${attemptId}`);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) setError(platform.describeError(e));
    } finally {
      if (mounted.current) setGenerating(null);
    }
  }

  async function rename() {
    const title = await promptDialog("Lernplan umbenennen", { label: "Name", initial: plan!.title });
    if (title) repo.updatePlan(plan!.id, { title });
  }

  async function remove() {
    const ok = await confirmDialog("Der Lernplan und die Tests, die für ihn erstellt wurden, werden gelöscht.", {
      title: "Lernplan löschen?",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    repo.deletePlan(plan!.id);
    navigate(`/subject/${plan!.subjectId}`, { replace: true });
  }

  if (generating) {
    const p = generating.progress;
    return (
      <div className="card generating stack-sm" aria-live="polite">
        <div className="spinner" />
        <h2>
          {p.phase === "preparing" && (planHasMaterials(plan) ? "Material wird vorbereitet …" : `${generating.label} wird vorbereitet …`)}
          {p.phase === "analyzing" && `${generating.label} wird erstellt …`}
          {p.phase === "writing" && (p.questionsSoFar > 0 ? `${p.questionsSoFar} Fragen erstellt …` : "Fragen werden geschrieben …")}
        </h2>
        <p className="muted">Das kann ein bis zwei Minuten dauern.</p>
        <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/subject/${plan.subjectId}`} className="back-link">
          ← {subject?.name ?? "Fach"}
        </a>
        <div className="row-between">
          <h1>{plan.title}</h1>
          <div className="row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={rename}>
              Umbenennen
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
        <p className="muted">
          Prüfung am {formatLongDate(plan.examDate)}
          {plan.examDate >= todayISO() ? ` · noch ${daysBetween(todayISO(), plan.examDate)} Tage` : " · vorbei"}
        </p>
      </div>

      {plan.notes && (
        <div className="callout">
          <strong>Hinweis von Claude:</strong> {plan.notes}
        </div>
      )}
      {!planHasMaterials(plan) && (
        <div className="callout">
          <strong>Ohne Material:</strong> Übungstests, Wiederholungen, Probeklausur und Lernzettel erstellt Claude aus
          seinem Fachwissen. Das kann vom Stoff deiner Veranstaltung abweichen – gleiche im Zweifel mit Vorlesung, Skript
          oder Buch ab.
        </div>
      )}
      {error && <div className="callout callout-error">{error}</div>}

      {plan.status === "draft" ? (
        <DraftView plan={plan} store={store} onEditTimes={() => setEditTimes(true)} runWithTest={runWithTest} />
      ) : (
        <ActiveView plan={plan} store={store} onEditTimes={() => setEditTimes(true)} runWithTest={runWithTest} />
      )}

      {editTimes && <TimesModal plan={plan} onClose={() => setEditTimes(false)} />}
    </div>
  );
}

type RunWithTest = (
  label: string,
  start: (opts: { signal: AbortSignal; onProgress: (p: GenerationProgress) => void }) => Promise<string>,
) => Promise<void>;

// ---------- Entwurf ----------

function DraftView({
  plan,
  store,
  onEditTimes,
  runWithTest,
}: {
  plan: StudyPlan;
  store: StoreState;
  onEditTimes: () => void;
  runWithTest: RunWithTest;
}) {
  const ai = platform.useAiStatus();
  const start = plan.startDate < todayISO() ? todayISO() : plan.startDate;
  const available = availableMinutes(start, plan.examDate, plan.minutesPerWeekday);
  const needed = plan.topics.reduce((s, t) => s + effectiveMinutes(t), 0);
  // Übungstests und Wiederholungen brauchen zusätzlich etwa die Hälfte der Lernzeit.
  const neededTotal = Math.round(needed * 1.6);
  const placementTest = plan.placementTestId ? store.tests.find((t) => t.id === plan.placementTestId) : undefined;
  const placementAttempts = placementTest ? store.attempts.filter((a) => a.testId === placementTest.id) : [];
  const placementOpen = placementAttempts.find((a) => a.status === "in_progress");
  const placementDone = placementAttempts.filter((a) => a.status === "finished").sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
  const hasNames = plan.topics.length > 0 && plan.topics.every((t) => t.name.trim());

  return (
    <>
      <section className="card stack-sm">
        <div className="row-between">
          <h2>1. Themen prüfen</h2>
          <span className="muted small">
            {plan.topics.length} Themen · {formatMinutes(needed)} Lernzeit
          </span>
        </div>
        <p className="muted small">
          Passe Namen, Zeitbedarf und Wichtigkeit an, ergänze fehlende Themen und bringe sie in eine sinnvolle Reihenfolge.
          Übungstests und Wiederholungen plant die App zusätzlich ein.
        </p>
        <TopicEditor topics={plan.topics} onChange={(topics) => repo.updatePlan(plan.id, { topics })} />
      </section>

      <section className="card stack-sm">
        <h2>2. Einstufungstest (optional)</h2>
        <p className="muted small">
          Ein kurzer Test mit ein bis zwei Fragen pro Thema. Was du schon kannst, bekommt im Plan weniger Zeit. Die Fragen
          werden direkt in der App ausgewertet.
        </p>
        {placementDone ? (
          <div className="row-between">
            <span>
              Erledigt: <strong>{summarize(placementDone, placementTest!).percent} %</strong> insgesamt – die Ergebnisse pro
              Thema stehen oben in der Liste.
            </span>
            <a className="btn btn-ghost btn-sm" href={`#/result/${placementDone.id}`}>
              Auswertung ansehen
            </a>
          </div>
        ) : (
          <div className="row-wrap">
            <button
              className="btn btn-primary"
              disabled={!hasNames || (!placementTest && ai.state === "unavailable")}
              onClick={() => runWithTest("Einstufungstest", (opts) => startPlacementTest(plan.id, opts))}
            >
              {placementOpen ? "Einstufungstest fortsetzen" : placementTest ? "Einstufungstest starten" : "Einstufungstest erstellen"}
            </button>
            {!placementTest && ai.state === "unavailable" && <span className="muted small">{ai.reason}</span>}
          </div>
        )}
      </section>

      <section className="card stack-sm">
        <h2>3. Plan erstellen</h2>
        <p className={neededTotal > available ? "callout callout-warn" : "muted"}>
          Geschätzt nötig: ca. {formatMinutes(neededTotal)} inklusive Übung und Wiederholung · eingetragen bis zur Prüfung:{" "}
          {formatMinutes(available)}.
          {neededTotal > available && " Das wird knapp – die App kürzt dann die Lernzeiten und setzt wichtige Themen zuerst."}
        </p>
        <div className="row-between">
          <button className="btn btn-ghost" onClick={onEditTimes}>
            Termin und Lernzeit ändern
          </button>
          <button className="btn btn-primary btn-lg" disabled={!hasNames} onClick={() => finalizePlan(plan.id)}>
            Lernplan erstellen
          </button>
        </div>
        {!hasNames && <p className="muted small right">Bitte jedem Thema einen Namen geben.</p>}
      </section>
    </>
  );
}

// ---------- Aktiver Plan ----------

function ActiveView({
  plan,
  store,
  onEditTimes,
  runWithTest,
}: {
  plan: StudyPlan;
  store: StoreState;
  onEditTimes: () => void;
  runWithTest: RunWithTest;
}) {
  const [showAll, setShowAll] = useState(false);
  const today = todayISO();
  const status = topicStatus(plan, store.tests, store.attempts);
  const totalMinutes = plan.tasks.reduce((s, t) => s + t.minutes, 0);
  const doneMinutes = plan.tasks.filter((t) => t.status === "done").reduce((s, t) => s + t.minutes, 0);
  const doneCount = plan.tasks.filter((t) => t.status === "done").length;
  const overdue = plan.tasks.filter((t) => t.status === "open" && t.date < today);
  const todayTasks = plan.tasks.filter((t) => t.date === today);
  const upcoming = plan.tasks.filter((t) => t.date > today);
  const past = plan.tasks.filter((t) => t.date < today && t.status !== "open");

  const byDate = new Map<string, PlanTask[]>();
  for (const t of upcoming) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  const dates = [...byDate.keys()].sort();
  const visibleDates = showAll ? dates : dates.slice(0, 7);

  async function rebuild() {
    const ok = await confirmDialog(
      "Du kannst dann Themen, Zeitbedarf und Termin ändern und den Plan ab heute neu erstellen. Erledigte Aufgaben bleiben erhalten.",
      { title: "Plan neu erstellen?", confirmLabel: "Bearbeiten" },
    );
    if (ok) reopenPlan(plan.id);
  }

  const row = (t: PlanTask, showDate?: boolean) => {
    const test = t.testId ? store.tests.find((x) => x.id === t.testId) : undefined;
    const attempts = test ? store.attempts.filter((a) => a.testId === test.id) : [];
    const open = attempts.find((a) => a.status === "in_progress");
    const doneAttempt = t.attemptId ? attempts.find((a) => a.id === t.attemptId) : undefined;
    const resultPercent = doneAttempt && test ? summarize(doneAttempt, test).percent : null;
    const isTestTask = t.type === "practice" || t.type === "review" || t.type === "mock_exam";
    const noteTopicId = t.type === "learn" ? t.topicIds[0] : undefined;
    const hasNote = !!noteTopicId && !!noteFor(store.notes, plan.id, noteTopicId);
    let actionLabel: string | undefined;
    let onAction: (() => void) | undefined;
    if (noteTopicId) {
      actionLabel = hasNote ? "Lernzettel" : "Lernzettel erstellen";
      onAction = () => navigate(`/plan/${plan.id}/note/${noteTopicId}?task=${t.id}${hasNote ? "" : "&create=1"}`);
    }
    if (isTestTask) {
      onAction = () => runWithTest(t.type === "mock_exam" ? "Probeklausur" : "Test", (opts) => startTaskTest(plan.id, t.id, opts));
      if (open) actionLabel = "Fortsetzen";
      else if (t.status === "done") actionLabel = "Nochmal";
      else if (t.type === "mock_exam") actionLabel = "Probeklausur starten";
      else if (t.type === "review") actionLabel = "Wiederholen";
      else actionLabel = "Übungstest starten";
    }
    return (
      <TaskRow
        key={t.id}
        task={t}
        topics={plan.topics}
        showDate={showDate ? formatDay(t.date) : undefined}
        actionLabel={actionLabel}
        resultPercent={resultPercent}
        busy={false}
        onToggle={() => setTaskStatus(plan.id, t.id, t.status === "done" ? "open" : "done")}
        onAction={onAction}
        onResult={doneAttempt ? () => navigate(`/result/${doneAttempt.id}`) : undefined}
      />
    );
  };

  return (
    <>
      <section className="card stack-sm">
        <div className="row-between">
          <strong>
            {doneCount} von {plan.tasks.length} Aufgaben erledigt
          </strong>
          <span className="muted small">
            {formatMinutes(doneMinutes)} von {formatMinutes(totalMinutes)}
          </span>
        </div>
        <div className="progress">
          <span style={{ width: `${totalMinutes ? (doneMinutes / totalMinutes) * 100 : 0}%` }} />
        </div>
        <div className="row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => redistributePlan(plan.id)}>
            Offenes neu verteilen
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onEditTimes}>
            Termin und Lernzeit ändern
          </button>
          <button className="btn btn-ghost btn-sm" onClick={rebuild}>
            Themen bearbeiten
          </button>
        </div>
      </section>

      {plan.warnings.map((w) => (
        <div key={w} className="callout callout-warn">
          {w}
        </div>
      ))}
      {overdue.length > 0 && (
        <div className="callout callout-warn row-between">
          <span>
            {overdue.length === 1 ? "1 Aufgabe" : `${overdue.length} Aufgaben`} aus vergangenen Tagen{" "}
            {overdue.length === 1 ? "ist" : "sind"} noch offen.
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => redistributePlan(plan.id)}>
            Auf die nächsten Tage verteilen
          </button>
        </div>
      )}

      <section className="card stack-sm">
        <h2>Heute · {formatDay(today)}</h2>
        {overdue.length > 0 && <ul className="task-list">{overdue.map((t) => row(t, true))}</ul>}
        {todayTasks.length > 0 ? (
          <ul className="task-list">{todayTasks.map((t) => row(t))}</ul>
        ) : (
          <p className="muted">Für heute ist nichts geplant.</p>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Themenstand</h2>
        <TopicStatusList
          topics={plan.topics}
          status={status}
          noteHref={(id) => (noteFor(store.notes, plan.id, id) ? `#/plan/${plan.id}/note/${id}` : null)}
        />
        <p className="muted small">
          Aus deinen Tests im Plan (bzw. dem Einstufungstest). Themen unter 60 % bekommen automatisch eine Zusatzwiederholung.
        </p>
      </section>

      <section className="card stack-sm">
        <h2>Kommende Tage</h2>
        {dates.length === 0 && <p className="muted">Keine weiteren Aufgaben bis zur Prüfung.</p>}
        {visibleDates.map((d) => (
          <div key={d} className="plan-day">
            <div className="plan-day-head">
              <strong>{formatDay(d)}</strong>
              <span className="muted small">{formatMinutes(byDate.get(d)!.reduce((s, t) => s + t.minutes, 0))}</span>
            </div>
            <ul className="task-list">{byDate.get(d)!.map((t) => row(t))}</ul>
          </div>
        ))}
        {dates.length > 7 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Weniger anzeigen" : `Alle ${dates.length} Tage anzeigen`}
          </button>
        )}
      </section>

      {past.length > 0 && (
        <details className="card">
          <summary>Erledigt aus vergangenen Tagen ({past.length})</summary>
          <ul className="task-list">{past.map((t) => row(t, true))}</ul>
        </details>
      )}
    </>
  );
}

// ---------- Termin und Lernzeit ----------

function TimesModal({ plan, onClose }: { plan: StudyPlan; onClose: () => void }) {
  const [examDate, setExamDate] = useState(plan.examDate);
  const [week, setWeek] = useState(plan.minutesPerWeekday);
  const today = todayISO();

  function save() {
    repo.updatePlan(plan.id, { examDate, minutesPerWeekday: week });
    if (plan.status === "active") redistributePlan(plan.id);
    onClose();
  }

  return (
    <Modal
      title="Termin und Lernzeit"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={examDate <= today || week.every((m) => !m)} onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <label className="field">
        <span>Prüfungsdatum</span>
        <input id="times-exam-date" className="input" type="date" value={examDate} min={today} onChange={(e) => setExamDate(e.target.value)} />
      </label>
      <div className="field">
        <span>Lernzeit pro Wochentag</span>
        <WeekdayMinutesInput value={week} onChange={setWeek} />
      </div>
      {plan.status === "active" && (
        <p className="muted small">Offene Aufgaben werden danach automatisch auf die neuen Lernzeiten verteilt.</p>
      )}
    </Modal>
  );
}
