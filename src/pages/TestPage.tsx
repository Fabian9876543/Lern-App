import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { describeError } from "../ai/client";
import { generateTest } from "../ai/generateTest";
import { describeCorrectAnswer } from "../ai/normalize";
import Markdown from "../components/Markdown";
import QuestionEditor from "../components/QuestionEditor";
import QuestionMeta from "../components/QuestionMeta";
import { db, deleteTest, newId } from "../db";
import { formatDate, startAttempt, summarize } from "../lib/attempts";
import { navigate } from "../router";
import type { AttemptMode, Material, Question } from "../types";

export default function TestPage({ testId }: { testId: string }) {
  const test = useLiveQuery(async () => (await db.tests.get(testId)) ?? null, [testId]);
  const attempts = useLiveQuery(
    () => db.attempts.where("testId").equals(testId).reverse().sortBy("startedAt"),
    [testId],
  );
  const materials = useLiveQuery(async () => {
    const t = await db.tests.get(testId);
    return t ? (await db.materials.bulkGet(t.materialIds)).filter((m): m is Material => !!m) : [];
  }, [testId]);
  const [mode, setMode] = useState<AttemptMode>("practice");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (test === null) {
    return (
      <div className="card">
        <p>Dieser Test existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  if (!test || !attempts || !materials) return null;

  const inProgress = attempts.find((a) => a.status === "in_progress");
  const finished = attempts.filter((a) => a.status === "finished");

  async function start() {
    const id = await startAttempt(test!, { mode, shuffle: shuffleQuestions });
    navigate(`/run/${id}`);
  }

  async function rename() {
    const title = prompt("Neuer Titel:", test!.title)?.trim();
    if (title) await db.tests.update(testId, { title });
  }

  async function remove() {
    if (!confirm(`Test „${test!.title}“ inklusive aller Ergebnisse löschen?`)) return;
    await deleteTest(testId);
    navigate(`/subject/${test!.subjectId}`, { replace: true });
  }

  async function saveQuestion(q: Question) {
    const exists = test!.questions.some((x) => x.id === q.id);
    const questions = exists ? test!.questions.map((x) => (x.id === q.id ? q : x)) : [...test!.questions, q];
    await db.tests.update(testId, { questions });
    setEditing(null);
  }

  async function deleteQuestion(q: Question) {
    if (!confirm("Diese Frage löschen?")) return;
    await db.tests.update(testId, { questions: test!.questions.filter((x) => x.id !== q.id) });
  }

  async function regenerate() {
    setError(null);
    setRegenerating(true);
    try {
      const fresh = await generateTest({
        subjectId: test!.subjectId,
        materials: materials ?? [],
        settings: test!.settings,
      });
      await db.tests.add(fresh);
      navigate(`/test/${fresh.id}`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setRegenerating(false);
    }
  }

  function newQuestion(): Question {
    return {
      id: newId(),
      type: "free_text",
      prompt: "",
      options: [],
      correctOptions: [],
      numericAnswer: null,
      numericTolerance: null,
      unit: null,
      acceptedAnswers: [],
      modelSolution: "",
      explanation: "",
      hint: null,
      topic: test!.questions[0]?.topic ?? "Allgemein",
      difficulty: "medium",
      points: 2,
      source: "selbst hinzugefügt",
      solutionFromMaterial: true,
    };
  }

  const totalPoints = test.questions.reduce((s, q) => s + q.points, 0);

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/subject/${test.subjectId}`} className="back-link">
          ← Zurück zum Fach
        </a>
        <div className="row-between">
          <h1>{test.title}</h1>
          <div className="row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={rename}>
              Umbenennen
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
        <p className="muted small">
          {test.mode === "exact" ? "Originalaufgaben" : "Neue Aufgaben"} · {test.questions.length} Fragen ·{" "}
          {totalPoints} Punkte · erstellt {formatDate(test.createdAt)}
          {materials.length > 0 && <> · aus {materials.map((m) => m.name).join(", ")}</>}
        </p>
      </div>

      {test.notes && (
        <div className="callout">
          <strong>Hinweis der KI:</strong> {test.notes}
        </div>
      )}

      <section className="card stack-sm">
        {inProgress && (
          <div className="callout row-between">
            <span>
              Du hast einen begonnenen Durchlauf ({Object.keys(inProgress.answers).length}/
              {inProgress.questionIds.length} bearbeitet).
            </span>
            <a className="btn btn-primary btn-sm" href={`#/run/${inProgress.id}`}>
              Fortsetzen
            </a>
          </div>
        )}
        <h2>Test starten</h2>
        <div className="mode-toggle" role="radiogroup">
          <button
            className={`toggle ${mode === "practice" ? "active" : ""}`}
            onClick={() => setMode("practice")}
            role="radio"
            aria-checked={mode === "practice"}
          >
            <strong>Übungsmodus</strong>
            <span className="small">Sofortiges Feedback nach jeder Frage</span>
          </button>
          <button
            className={`toggle ${mode === "exam" ? "active" : ""}`}
            onClick={() => setMode("exam")}
            role="radio"
            aria-checked={mode === "exam"}
          >
            <strong>Prüfungsmodus</strong>
            <span className="small">Auswertung erst am Ende</span>
          </button>
        </div>
        <div className="row-between">
          <label className="check">
            <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} />
            Reihenfolge mischen
          </label>
          <button className="btn btn-primary btn-lg" onClick={start} disabled={test.questions.length === 0}>
            Los geht's
          </button>
        </div>
      </section>

      {finished.length > 0 && (
        <section className="card stack-sm">
          <h2>Bisherige Ergebnisse</h2>
          <ul className="attempt-list">
            {finished.map((a) => {
              const s = summarize(a, test);
              return (
                <li key={a.id}>
                  <a href={`#/result/${a.id}`} className="row-between attempt-row">
                    <span>
                      {formatDate(a.finishedAt ?? a.startedAt)} · <span className="muted">{a.label}</span>
                    </span>
                    <span className="score-bar-wrap">
                      <span className="score-bar">
                        <span style={{ width: `${s.percent}%` }} />
                      </span>
                      <strong>{s.percent}%</strong>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card stack-sm">
        <h2>Mehr üben</h2>
        <div className="row-wrap">
          {test.mode === "generated" && (
            <button className="btn btn-ghost" onClick={regenerate} disabled={regenerating || materials.length === 0}>
              {regenerating ? "Erstelle neue Variante …" : "🔄 Neue Variante mit anderen Aufgaben"}
            </button>
          )}
          <a className="btn btn-ghost" href={`#/subject/${test.subjectId}/new-test?from=${test.id}`}>
            ✨ Neue Aufgaben im gleichen Stil …
          </a>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="stack-sm">
        <div className="row-between">
          <h2>Fragen</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(newQuestion())}>
            + Frage hinzufügen
          </button>
        </div>
        <p className="muted small">
          Prüfe die Fragen bei Bedarf – falls die KI etwas falsch übernommen hat, kannst du es hier korrigieren.
        </p>
        {test.questions.map((q, i) => (
          <details key={q.id} className="card question-preview">
            <summary>
              <span className="q-number">{i + 1}</span>
              <Markdown className="q-summary clamp">{q.prompt}</Markdown>
            </summary>
            <div className="stack-sm">
              <QuestionMeta question={q} />
              <Markdown>{q.prompt}</Markdown>
              {(q.type === "single_choice" || q.type === "multiple_choice") && (
                <ul className="preview-options">
                  {q.options.map((o, oi) => (
                    <li key={oi} className={q.correctOptions.includes(oi) ? "correct" : ""}>
                      <Markdown>{o}</Markdown>
                    </li>
                  ))}
                </ul>
              )}
              {q.type !== "free_text" && q.type !== "single_choice" && q.type !== "multiple_choice" && (
                <div className="solution-box">
                  <div className="label">Richtige Antwort</div>
                  <Markdown>{describeCorrectAnswer(q)}</Markdown>
                </div>
              )}
              <details className="solution-box">
                <summary className="label">Musterlösung</summary>
                <Markdown>{q.modelSolution}</Markdown>
              </details>
              <div className="row-wrap">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(q)}>
                  Bearbeiten
                </button>
                <button className="btn btn-ghost btn-sm btn-danger" onClick={() => deleteQuestion(q)}>
                  Löschen
                </button>
              </div>
            </div>
          </details>
        ))}
      </section>

      {editing && <QuestionEditor question={editing} onSave={saveQuestion} onClose={() => setEditing(null)} />}
    </div>
  );
}
