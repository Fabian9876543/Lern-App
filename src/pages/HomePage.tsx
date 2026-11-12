import platform from "@platform-impl";
import { useState } from "react";
import { formatDate } from "../lib/attempts";
import { newId } from "../lib/ids";
import StudyCalendar from "../components/StudyCalendar";
import { IS_ARTIFACT } from "../platform";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";

const COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"];

export default function HomePage() {
  const { subjects, materials, tests, attempts, plans, storageMode } = useStore();
  const [guestNoteHidden, setGuestNoteHidden] = useState(() => {
    try {
      return localStorage.getItem("lern-app-guest-note") === "hidden";
    } catch {
      return false;
    }
  });
  function hideGuestNote() {
    setGuestNoteHidden(true);
    try {
      localStorage.setItem("lern-app-guest-note", "hidden");
    } catch {
      // nicht kritisch
    }
  }
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

      {IS_ARTIFACT && storageMode === "local" && !guestNoteHidden && (
        <div className="callout row-between" role="note">
          <span>
            <strong>Gastmodus:</strong> Deine Fächer, Materialien und Ergebnisse werden nur in diesem Browser gespeichert
            – nicht auf anderen Geräten, und niemand sonst sieht sie. Claude läuft über dein eigenes Konto. Lege ab und zu
            unter <a href="#/settings">Einstellungen</a> ein Backup an.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={hideGuestNote}>
            Verstanden
          </button>
        </div>
      )}
      {storageMode === "memory" && (
        <div className="callout callout-warn" role="alert">
          <strong>Achtung:</strong> Dieser Browser lässt die Lern-App nichts speichern. Alles, was du anlegst, ist nach dem
          Neuladen weg – lade dir vorher unter <a href="#/settings">Einstellungen</a> ein Backup herunter.
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
              Läuft über dein Claude-Konto – keine API-Kosten.
              {storageMode === "cloud" && " Deine Daten sind auf allen Geräten verfügbar, auf denen du claude.ai nutzt."}
            </p>
          )}
        </section>
      )}

      {plans.length > 0 && <StudyCalendar plans={plans} subjects={subjects} />}

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
