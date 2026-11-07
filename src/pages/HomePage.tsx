import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, newId } from "../db";
import { navigate } from "../router";
import { useSettings } from "../settings";
import { formatDate } from "../lib/attempts";

const COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"];

export default function HomePage() {
  const settings = useSettings();
  const subjects = useLiveQuery(() => db.subjects.orderBy("createdAt").toArray(), []);
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const tests = useLiveQuery(() => db.tests.toArray(), []);
  const openAttempts = useLiveQuery(
    () => db.attempts.where("status").equals("in_progress").reverse().sortBy("startedAt"),
    [],
  );
  const [name, setName] = useState("");

  async function createSubject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    await db.subjects.add({
      id,
      name: trimmed,
      color: COLORS[(subjects?.length ?? 0) % COLORS.length],
      createdAt: Date.now(),
    });
    setName("");
    navigate(`/subject/${id}`);
  }

  if (!subjects || !materials || !tests || !openAttempts) return null;
  const testById = new Map(tests.map((t) => [t.id, t]));

  return (
    <div className="stack">
      {!settings.apiKey && (
        <div className="callout callout-warn">
          <strong>Noch kein API-Schlüssel hinterlegt.</strong> Damit die App Tests aus deinen Materialien erstellen
          kann, braucht sie einen Claude-API-Schlüssel. <a href="#/settings">Jetzt in den Einstellungen eintragen →</a>
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
              die die KI aus deinem Material ableitet.
            </li>
          </ol>
        </section>
      )}

      {openAttempts.length > 0 && (
        <section className="stack-sm">
          <h2>Weitermachen</h2>
          {openAttempts.slice(0, 3).map((a) => {
            const test = testById.get(a.testId);
            if (!test) return null;
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
