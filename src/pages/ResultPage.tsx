import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import Feedback, { formatPoints } from "../components/Feedback";
import Markdown from "../components/Markdown";
import QuestionMeta from "../components/QuestionMeta";
import { attemptQuestions, formatDuration, selfGrade, startAttempt, summarize } from "../lib/attempts";
import { cancelExamJob, clearExamJob, useExamJob } from "../lib/examAnalysis";
import {
  PRACTICE_COUNTS,
  mistakesOf,
  resultPracticeKey,
  startResultPractice,
  suggestedCount,
  weakTopics,
} from "../lib/resultPractice";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";
import type { AnswerRecord, Attempt, Question, Test, Verdict } from "../types";

export default function ResultPage({ attemptId }: { attemptId: string }) {
  const store = useStore();
  const attempt = store.attempts.find((a) => a.id === attemptId);
  const test = attempt ? store.tests.find((t) => t.id === attempt.testId) : undefined;

  if (!attempt || !test) {
    return (
      <div className="card">
        <p>Dieses Ergebnis existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  const plan = test.planId ? store.plans.find((p) => p.id === test.planId) : undefined;
  const questions = attemptQuestions(attempt, test);
  const summary = summarize(attempt, test);
  const toRepeat = questions.filter((q) => attempt.answers[q.id]?.verdict !== "correct");

  function onSelfGrade(q: Question, v: Verdict) {
    const rec: AnswerRecord = attempt!.answers[q.id] ?? {
      response: {},
      checked: true,
      score: 0,
      maxScore: q.points,
      verdict: null,
    };
    repo.updateAttempt(attempt!.id, (a) => ({ ...a, answers: { ...a.answers, [q.id]: selfGrade(rec, v) } }));
  }

  function repeat(ids?: string[]) {
    const id = startAttempt(test!, {
      mode: attempt!.mode,
      questionIds: ids,
      shuffle: !!ids,
      label: ids ? "Fehler wiederholen" : undefined,
    });
    navigate(`/run/${id}`);
  }

  const message =
    summary.percent >= 90
      ? "Hervorragend! 🎉"
      : summary.percent >= 75
        ? "Sehr gut! 💪"
        : summary.percent >= 50
          ? "Gut – da geht noch was."
          : "Dranbleiben – Wiederholung lohnt sich!";

  return (
    <div className="stack">
      <div className="page-header">
        {plan ? (
          <a href={`#/plan/${plan.id}`} className="crumb">
            {plan.title}
          </a>
        ) : (
          <a href={`#/test/${test.id}`} className="crumb">
            {test.title}
          </a>
        )}
        <h1>Ergebnis</h1>
      </div>

      <section className="card result-summary">
        <div className="score-ring" style={{ "--p": summary.percent } as React.CSSProperties}>
          <span>{summary.percent}%</span>
        </div>
        <div className="stack-sm">
          <h2>{message}</h2>
          <p>
            <strong>
              {formatPoints(summary.score)} von {formatPoints(summary.max)} Punkten
            </strong>
          </p>
          <div className="row-wrap">
            <span className="chip chip-correct">✓ {summary.correct} richtig</span>
            {summary.partial > 0 && <span className="chip chip-partial">½ {summary.partial} teilweise</span>}
            <span className="chip chip-wrong">✗ {summary.wrong} falsch</span>
            {summary.open > 0 && <span className="chip chip-soft">? {summary.open} offen</span>}
          </div>
          <p className="muted small">
            {attempt.label} · Dauer: {formatDuration((attempt.finishedAt ?? Date.now()) - attempt.startedAt)}
          </p>
        </div>
      </section>

      {summary.open > 0 && (
        <div className="callout callout-warn">
          {summary.open} Antwort(en) konnten nicht automatisch bewertet werden. Bewerte sie unten selbst anhand der
          Musterlösung.
        </div>
      )}

      <div className="row-wrap">
        {toRepeat.length > 0 && (
          <button className="btn btn-primary" onClick={() => repeat(toRepeat.map((q) => q.id))}>
            🔁 Fehler wiederholen ({toRepeat.length} {toRepeat.length === 1 ? "Frage" : "Fragen"})
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => repeat()}>
          Ganzen Test wiederholen
        </button>
        {test.planId && store.plans.some((p) => p.id === test.planId) ? (
          <a className="btn btn-ghost" href={`#/plan/${test.planId}`}>
            Zum Lernplan
          </a>
        ) : (
          <a className="btn btn-ghost" href={`#/test/${test.id}`}>
            Zur Testübersicht
          </a>
        )}
      </div>

      {toRepeat.length > 0 && <ResultPractice attempt={attempt} test={test} />}

      {summary.byTopic.length > 1 && (
        <section className="card stack-sm">
          <h2>Nach Thema</h2>
          <ul className="topic-list">
            {summary.byTopic.map((t) => {
              const pct = t.max > 0 ? Math.round((t.score / t.max) * 100) : 0;
              return (
                <li key={t.topic}>
                  <span>{t.topic}</span>
                  <span className="score-bar-wrap">
                    <span className={`score-bar ${pct < 50 ? "low" : pct < 80 ? "mid" : "high"}`}>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <strong>{pct}%</strong>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="stack-sm">
        <h2>Alle Fragen im Detail</h2>
        {questions.map((q, i) => {
          const rec = attempt.answers[q.id];
          const verdict = rec?.verdict;
          return (
            <details key={q.id} className={`card review-item review-${verdict ?? "open"}`} open={verdict !== "correct"}>
              <summary>
                <span className="q-number">{i + 1}</span>
                <span className="q-summary">
                  {verdict === "correct" ? "✓" : verdict === "partial" ? "½" : verdict === "wrong" ? "✗" : "?"}{" "}
                  {q.topic}
                </span>
                <span className="muted small">
                  {formatPoints(rec?.score ?? 0)}/{formatPoints(q.points)}
                </span>
              </summary>
              <div className="stack-sm">
                <QuestionMeta question={q} />
                <Markdown className="prompt">{q.prompt}</Markdown>
                <div className="solution-box your-answer">
                  <div className="label">Deine Antwort</div>
                  <YourAnswer question={q} record={rec} />
                </div>
                <Feedback
                  question={q}
                  record={rec ?? { response: {}, checked: true, score: 0, maxScore: q.points, verdict: null }}
                  onSelfGrade={(v) => onSelfGrade(q, v)}
                />
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}

/** Neuer Test mit neuen Aufgaben zu den Fehlern dieses Durchlaufs. */
function ResultPractice({ attempt, test }: { attempt: Attempt; test: Test }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const key = resultPracticeKey(attempt.id);
  const job = useExamJob(key);
  const watching = useRef(false);
  const mistakes = mistakesOf(attempt, test).length;
  const topics = weakTopics(attempt, test);
  const [count, setCount] = useState(() => suggestedCount(mistakes));
  const created = store.tests.filter((t) => t.fromAttemptId === attempt.id).sort((a, b) => a.createdAt - b.createdAt);

  if (job && !job.done) watching.current = true;
  useEffect(() => {
    if (!job?.done) return;
    // Nur weiterleiten, wenn man beim Erstellen auf der Seite war – sonst steht der Test einfach in der Liste.
    if (job.resultId && watching.current) navigate(`/test/${job.resultId}`);
    if (!job.error) clearExamJob(key);
    watching.current = false;
  }, [job?.done, job?.resultId, job?.error, key]);

  const shown = topics.slice(0, 4);
  const p = job?.progress;

  return (
    <section className="card stack-sm practice-card">
      <h2>Gezielt weiterüben</h2>
      <p className="small">
        Claude erstellt einen <strong>neuen Test mit neuen Aufgaben</strong> zu genau dem, was noch nicht saß – mit deinen
        Fehlern und den Rückmeldungen dazu, vom Einfachen bis zum Niveau dieses Tests.
      </p>
      {shown.length > 0 && (
        <div className="row-wrap weak-topics" aria-label="Schwerpunkte">
          <span className="muted small">Schwerpunkte:</span>
          {shown.map((t) => (
            <span key={t.topic} className="chip chip-soft" title={`${formatPoints(t.score)} von ${formatPoints(t.max)} Punkten`}>
              {t.topic}
            </span>
          ))}
          {topics.length > shown.length && <span className="muted small">+ {topics.length - shown.length} weitere</span>}
        </div>
      )}
      {job && !job.done ? (
        <div className="practice-progress" aria-live="polite" aria-busy="true">
          <div className="spinner spinner-sm" />
          <span className="small">
            {p?.phase === "writing" && p.questionsSoFar > 0
              ? `${p.questionsSoFar} von ${count} Aufgaben erstellt …`
              : "Claude erstellt neue Aufgaben zu deinen Fehlern …"}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => cancelExamJob(key)}>
            Abbrechen
          </button>
        </div>
      ) : (
        <div className="row-wrap">
          <label className="small practice-count">
            Fragen
            <select className="select select-sm" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {PRACTICE_COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={ai.state !== "ready"}
            title={ai.state === "unavailable" ? ai.reason : ""}
            onClick={() => {
              clearExamJob(key);
              startResultPractice(attempt.id, count);
            }}
          >
            ✨ Neuen Test zu meinen Fehlern erstellen
          </button>
        </div>
      )}
      {job?.error && <p className="error-text small">{job.error}</p>}
      {created.length > 0 && (
        <p className="small">
          Schon erstellt:{" "}
          {created.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <a href={`#/test/${t.id}`}>{t.title}</a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function YourAnswer({ question, record }: { question: Question; record?: AnswerRecord }) {
  const r = record?.response;
  if (!r) return <p className="muted">– keine Antwort –</p>;
  switch (question.type) {
    case "single_choice":
    case "multiple_choice": {
      const sel = r.selected ?? [];
      if (sel.length === 0) return <p className="muted">– keine Antwort –</p>;
      return <Markdown>{sel.map((i) => question.options[i]).join("; ")}</Markdown>;
    }
    case "numeric":
      return r.number ? (
        <p>
          {r.number} {question.unit}
        </p>
      ) : (
        <p className="muted">– keine Antwort –</p>
      );
    case "short_answer":
    case "free_text":
      return (
        <>
          {r.text ? <Markdown>{r.text}</Markdown> : !r.image && <p className="muted">– keine Antwort –</p>}
          {r.image && <img className="answer-image-small" src={r.image} alt="Foto deiner Lösung" />}
        </>
      );
  }
}
