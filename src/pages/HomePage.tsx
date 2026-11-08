import platform from "@platform-impl";
import { useState } from "react";
import { formatDate } from "../lib/attempts";
import { newId } from "../lib/ids";
import { daysBetween, formatDay, formatMinutes, todayISO } from "../lib/planner";
import { IS_ARTIFACT } from "../platform";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";

const COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"];

export default function HomePage() {
  const { subjects, materials, tests, attempts, plans } = useStore();
  const ai = platform.useAiStatus();
  const [name, setName] = useState("");

  function createSubject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    repo.addSubject({ id, name: trimmed, color: COLORS[subjects.length % COLORS.length], createdAt: Date.now() });
    setName("");
    navigate(`/subject/${id}`);
  }

  const testById = new Map(tests.map((t) => [t.id, t]));
  const today = todayISO();
  const activePlans = plans.filter((p) => p.status === "active" && p.examDate >= today);
  const todayRows = activePlans
    .map((p) => ({
      plan: p,
      subject: subjects.find((s) => s.id === p.subjectId),
      tasks: p.tasks.filter((t) => t.date === today),
      overdue: p.tasks.filter((t) => t.date < today && t.status === "open").length,
    }))
    .filter((r) => r.tasks.length > 0 || r.overdue > 0);
  const openAttempts = attempts
    .filter((a) => a.status === "in_progress" && testById.has(a.testId))
    .sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="stack">
      {ai.state === "unavailable" && (
        <div className="callout callout-warn">
          {IS_ARTIFACT ? (
            ai.reason
          ) : (
            <>
              <strong>Noch kein API-Schlüssel hinterlegt.</strong> Damit die App Tests aus deinen Materialien erstellen
              kann, braucht sie einen Claude-API-Schlüssel.{" "}
              <a href="#/settings">Jetzt in den Einstellungen eintragen →</a>
            </>
          )}
        </div>
      )}

      {subjects.length === 0 && (
        <section className="card hero">
          <h1>Lerne mit Tests aus deinem eigenen Material</h1>
          <ol className="steps">
            <li>
              <strong>Fach anlegen</strong> – z. B. „Mathe 2“ oder „Biochemie“.
            </li>
            <li>
              <strong>Material hochladen</strong> – Übungsblätter, Lösungen, Skripte, Altklausuren (PDF, Fotos, Text).
            </li>
            <li>
              <strong>Test erstellen</strong> – entweder genau mit deinen Aufgaben und Lösungen oder mit neuen Aufgaben,
              die Claude aus deinem Material ableitet.
            </li>
          </ol>
          {IS_ARTIFACT && (
            <p className="muted small">
              Läuft über dein Claude-Abo – keine API-Kosten. Deine Daten sind auf allen Geräten verfügbar, auf denen du
              claude.ai nutzt.
            </p>
          )}
        </section>
      )}

      {todayRows.length > 0 && (
        <section className="stack-sm">
          <h2>Heute · {formatDay(today)}</h2>
          {todayRows.map(({ plan, subject, tasks, overdue }) => {
            const open = tasks.filter((t) => t.status === "open");
            return (
              <a key={plan.id} className="card card-link stack-sm" href={`#/plan/${plan.id}`}>
                <div className="row-between">
                  <strong>
                    {subject && <span className="subject-dot" style={{ background: subject.color }} />} {plan.title}
                  </strong>
                  <span className="muted small">Prüfung in {daysBetween(today, plan.examDate)} Tagen</span>
                </div>
                {tasks.length > 0 && (
                  <ul className="today-list">
                    {tasks.map((t) => (
                      <li key={t.id} className={t.status === "done" ? "done" : ""}>
                        {t.status === "done" ? "✓" : "○"} {t.title} <span className="muted small">· {formatMinutes(t.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="muted small">
                  {open.length === 0 && tasks.length > 0 ? "Für heute alles erledigt. " : ""}
                  {overdue > 0 ? `${overdue} offene Aufgabe(n) von früheren Tagen.` : ""}
                </span>
              </a>
            );
          })}
        </section>
      )}

      {openAttempts.length > 0 && (
        <section className="stack-sm">
          <h2>Weitermachen</h2>
          {openAttempts.slice(0, 3).map((a) => {
            const test = testById.get(a.testId)!;
            const answered = Object.keys(a.answers).length;
            return (
              <a key={a.id} className="card card-link row-between" href={`#/run/${a.id}`}>
                <div>
                  <strong>{test.title}</strong>
                  <div className="muted small">
                    {a.label} · begonnen {formatDate(a.startedAt)} · {answered}/{a.questionIds.length} bearbeitet
                  </div>
                </div>
                <span className="btn btn-primary btn-sm">Fortsetzen</span>
              </a>
            );
          })}
        </section>
      )}

      <section className="stack-sm">
        <h2>Deine Fächer</h2>
        <div className="grid">
          {subjects.map((s) => {
            const mCount = materials.filter((m) => m.subjectId === s.id).length;
            const tCount = tests.filter((t) => t.subjectId === s.id).length;
            return (
              <a key={s.id} className="card card-link subject-card" href={`#/subject/${s.id}`}>
                <span className="subject-color" style={{ background: s.color }} />
                <strong>{s.name}</strong>
                <span className="muted small">
                  {mCount} {mCount === 1 ? "Material" : "Materialien"} · {tCount} {tCount === 1 ? "Test" : "Tests"}
                </span>
              </a>
            );
          })}
          <form className="card subject-card new-subject" onSubmit={createSubject}>
            <label className="field">
              <span>Neues Fach</span>
              <input
                id="new-subject-name"
                className="input"
                placeholder="z. B. Analysis 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
              Fach anlegen
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
