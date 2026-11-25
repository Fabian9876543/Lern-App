import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import { ERROR_KIND_LABELS } from "../ai/prompts";
import Feedback, { formatPoints } from "../components/Feedback";
import Markdown from "../components/Markdown";
import QuestionMeta from "../components/QuestionMeta";
import { attemptQuestions, formatDate, formatDuration, selfGrade, startAttempt, summarize } from "../lib/attempts";
import { PRIORITY_LABELS, cancelExamJob, clearExamJob, useExamJob } from "../lib/examAnalysis";
import { resultAnalysisKey, resultAnalysisOf, startResultAnalysis } from "../lib/resultAnalysis";
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
import type { AnswerRecord, Attempt, Importance, Question, Test, Verdict } from "../types";

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

      {(toRepeat.length > 0 || resultAnalysisOf(store.analyses, attempt.id)) && <ResultAnalysisCard attempt={attempt} />}

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

const PRIORITY_CHIP: Record<Importance, string> = { high: "chip-wrong", medium: "chip-partial", low: "chip-soft" };

/** Schriftliche Auswertung von Claude: Muster, Schwachstellen, Übungstipps. */
function ResultAnalysisCard({ attempt }: { attempt: Attempt }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const key = resultAnalysisKey(attempt.id);
  const job = useExamJob(key);
  const analysis = resultAnalysisOf(store.analyses, attempt.id);

  useEffect(() => {
    if (job?.done && !job.error) clearExamJob(key);
  }, [job?.done, job?.error, key]);

  function start() {
    clearExamJob(key);
    startResultAnalysis(attempt.id);
  }

  const aiHint = ai.state === "unavailable" ? ai.reason : "";

  if (job && !job.done) {
    return (
      <section className="card stack-sm" aria-busy="true">
        <h2>Auswertung von Claude</h2>
        <div className="practice-progress" aria-live="polite">
          <div className="spinner spinner-sm" />
          <span className="small">Claude wertet deinen Test aus … das dauert meist unter einer Minute.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => cancelExamJob(key)}>
            Abbrechen
          </button>
        </div>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="card stack-sm">
        <h2>Auswertung von Claude</h2>
        <p className="small">
          Claude schaut sich deine Fehler an, erkennt Muster – z. B. immer dieselbe Verwechslung – und sagt dir, woran es
          liegt und wie du es übst.
        </p>
        <div>
          <button className="btn btn-ghost" disabled={ai.state !== "ready"} title={aiHint} onClick={start}>
            📝 Von Claude auswerten lassen
          </button>
        </div>
        {job?.error && <p className="error-text small">{job.error}</p>}
      </section>
    );
  }

  return (
    <section className="stack-sm result-analysis" aria-labelledby="result-analysis-title">
      <div className="card stack-sm">
        <h2 id="result-analysis-title">Auswertung von Claude</h2>
        {analysis.summary && <Markdown>{analysis.summary}</Markdown>}
        {analysis.strengths.length > 0 && (
          <div className="stack-xs">
            <strong className="small">Das lief gut</strong>
            <ul className="analysis-strengths">
              {analysis.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {analysis.errorPatterns.length > 0 && (
          <div className="stack-xs">
            <strong className="small">Wiederkehrende Fehler</strong>
            <ul className="error-patterns">
              {analysis.errorPatterns.map((e, i) => (
                <li key={i}>
                  <span className="chip chip-soft">{ERROR_KIND_LABELS[e.kind]}</span>
                  <span>{e.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {analysis.notes && <p className="muted small">{analysis.notes}</p>}
        <p className="muted small">
          Erstellt {formatDate(analysis.createdAt)} ·{" "}
          <button className="link-btn" disabled={ai.state !== "ready"} title={aiHint} onClick={start}>
            Neu auswerten
          </button>
        </p>
        {job?.error && <p className="error-text small">{job.error}</p>}
      </div>
      {analysis.weaknesses.length > 0 && <h2>Daran solltest du arbeiten</h2>}
      {analysis.weaknesses.map((w) => (
        <article key={w.topic} className={`card stack-sm weakness weakness-${w.priority}`}>
          <div className="row-between weakness-head">
            <h3>{w.topic}</h3>
            <span className={`chip ${PRIORITY_CHIP[w.priority]}`}>Priorität {PRIORITY_LABELS[w.priority]}</span>
          </div>
          {w.problem && <Markdown>{w.problem}</Markdown>}
          {w.advice && (
            <div className="weakness-advice">
              <strong className="small">So übst du:</strong> <Markdown>{w.advice}</Markdown>
            </div>
          )}
          {(w.tasks.length > 0 || w.pointsLost !== null) && (
            <p className="muted small">
              {w.tasks.length > 0 && <>Betrifft: {w.tasks.join(", ")}</>}
              {w.tasks.length > 0 && w.pointsLost !== null && " · "}
              {w.pointsLost !== null && <>{formatPoints(w.pointsLost)} Punkte verloren</>}
            </p>
          )}
        </article>
      ))}
    </section>
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
  const hasAnalysis = !!resultAnalysisOf(store.analyses, attempt.id);

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
        Fehlern und den Rückmeldungen dazu{hasAnalysis ? " und der Auswertung oben" : ""}, vom Einfachen bis zum Niveau
        dieses Tests.
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
