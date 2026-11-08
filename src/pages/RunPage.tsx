import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import AnswerInput from "../components/AnswerInput";
import Feedback from "../components/Feedback";
import Markdown from "../components/Markdown";
import QuestionMeta from "../components/QuestionMeta";
import { confirmDialog } from "../components/Dialogs";
import { attemptQuestions, evaluateAnswer, selfGrade } from "../lib/attempts";
import { onAttemptFinished } from "../lib/plans";
import { hasAnswer } from "../lib/grading";
import { navigate } from "../router";
import { getState, repo, useStore } from "../store/store";
import type { AnswerRecord, AnswerResponse, Attempt, Test, Verdict } from "../types";

export default function RunPage({ attemptId }: { attemptId: string }) {
  const store = useStore();
  const attempt = store.attempts.find((a) => a.id === attemptId);
  const test = attempt ? store.tests.find((t) => t.id === attempt.testId) : undefined;
  const finished = attempt?.status === "finished";

  useEffect(() => {
    if (finished) navigate(`/result/${attemptId}`, { replace: true });
  }, [finished, attemptId]);

  if (!attempt || !test) {
    return (
      <div className="card">
        <p>Dieser Durchlauf existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  if (finished) return null;
  return <Runner attempt={attempt} test={test} />;
}

function Runner({ attempt, test }: { attempt: Attempt; test: Test }) {
  const questions = attemptQuestions(attempt, test);
  const index = Math.min(attempt.currentIndex, Math.max(0, questions.length - 1));
  const question = questions[index];
  const record = question ? attempt.answers[question.id] : undefined;
  const isExam = attempt.mode === "exam";

  const [draft, setDraft] = useState<AnswerResponse>(record?.response ?? {});
  const [showHint, setShowHint] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  // Beim Wechsel der Frage den gespeicherten Stand laden.
  useEffect(() => {
    setDraft(attempt.answers[question?.id ?? ""]?.response ?? {});
    setShowHint(!!attempt.answers[question?.id ?? ""]?.usedHint);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  if (!question) {
    return (
      <div className="card">
        <p>Dieser Test enthält keine Fragen mehr.</p>
        <a href={`#/test/${test.id}`}>Zurück zum Test</a>
      </div>
    );
  }

  const checked = !!record?.checked;
  const locked = checked && !isExam;

  function writeAnswer(qid: string, rec: AnswerRecord) {
    repo.updateAttempt(attempt.id, (a) => ({ ...a, answers: { ...a.answers, [qid]: rec } }));
  }

  function onDraftChange(r: AnswerResponse) {
    setDraft(r);
    // Entwurf verzögert speichern, damit man später fortsetzen kann.
    window.clearTimeout(saveTimer.current);
    const qid = question.id;
    saveTimer.current = window.setTimeout(() => {
      writeAnswer(qid, {
        response: r,
        checked: false,
        score: 0,
        maxScore: question.points,
        verdict: null,
        usedHint: showHint,
      });
    }, 300);
  }

  function flushDraft() {
    window.clearTimeout(saveTimer.current);
    if (!checked && hasAnswer(question, draft)) {
      writeAnswer(question.id, {
        response: draft,
        checked: false,
        score: 0,
        maxScore: question.points,
        verdict: null,
        usedHint: showHint,
      });
    }
  }

  function goTo(i: number) {
    flushDraft();
    repo.updateAttempt(attempt.id, { currentIndex: Math.max(0, Math.min(questions.length - 1, i)) });
  }

  async function check(giveUp = false) {
    setChecking(true);
    setError(null);
    window.clearTimeout(saveTimer.current);
    try {
      const response = giveUp ? {} : draft;
      const rec = await evaluateAnswer(question, response, { usedHint: showHint });
      if (giveUp) rec.feedback = "Lösung angezeigt.";
      writeAnswer(question.id, rec);
    } catch (e) {
      setError(`${platform.describeError(e)} Du kannst deine Antwort stattdessen selbst bewerten.`);
      writeAnswer(question.id, {
        response: draft,
        checked: true,
        score: 0,
        maxScore: question.points,
        verdict: null,
        usedHint: showHint,
      });
    } finally {
      setChecking(false);
    }
  }

  function onSelfGrade(v: Verdict) {
    if (record) writeAnswer(question.id, selfGrade(record, v));
  }

  async function finish() {
    flushDraft();
    const fresh = getState().attempts.find((a) => a.id === attempt.id)!;
    const unanswered = questions.filter((q) => !hasAnswer(q, fresh.answers[q.id]?.response)).length;
    if (unanswered > 0) {
      const ok = await confirmDialog(
        unanswered === 1 ? "1 Frage ist noch unbeantwortet." : `${unanswered} Fragen sind noch unbeantwortet.`,
        { title: isExam ? "Trotzdem abgeben?" : "Test beenden?", confirmLabel: isExam ? "Abgeben" : "Beenden" },
      );
      if (!ok) return;
    }

    if (isExam) {
      await gradeAll(fresh);
    } else {
      // Im Übungsmodus zählen nicht geprüfte Fragen als falsch.
      const answers = { ...fresh.answers };
      for (const q of questions) {
        if (!answers[q.id]?.checked) {
          answers[q.id] = {
            response: answers[q.id]?.response ?? {},
            checked: true,
            score: 0,
            maxScore: q.points,
            verdict: "wrong",
            gradedBy: "auto",
            feedback: "Nicht bearbeitet.",
          };
        }
      }
      repo.updateAttempt(attempt.id, { answers });
    }
    repo.updateAttempt(attempt.id, { status: "finished", finishedAt: Date.now() });
    onAttemptFinished(attempt.id);
    navigate(`/result/${attempt.id}`, { replace: true });
  }

  async function gradeAll(fresh: Attempt) {
    const pending = questions.filter((q) => !fresh.answers[q.id]?.checked);
    let done = 0;
    setSubmitting({ done, total: pending.length });
    const answers: Record<string, AnswerRecord> = { ...fresh.answers };
    const queue = [...pending];
    // Bis zu 4 Bewertungen parallel.
    async function worker() {
      for (let q = queue.shift(); q; q = queue.shift()) {
        const current = fresh.answers[q.id];
        try {
          answers[q.id] = await evaluateAnswer(q, current?.response ?? {}, { usedHint: current?.usedHint });
        } catch (e) {
          answers[q.id] = {
            response: current?.response ?? {},
            checked: true,
            score: 0,
            maxScore: q.points,
            verdict: null,
            feedback: `Automatische Bewertung fehlgeschlagen: ${platform.describeError(e)}`,
          };
        }
        done++;
        setSubmitting({ done, total: pending.length });
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    repo.updateAttempt(attempt.id, { answers });
  }

  if (submitting) {
    return (
      <div className="card generating stack-sm" aria-live="polite">
        <div className="spinner" />
        <h2>
          Antworten werden bewertet … {submitting.done}/{submitting.total}
        </h2>
        <p className="muted">Offene Antworten werden von Claude anhand der Musterlösung bewertet.</p>
      </div>
    );
  }

  const answeredCount = questions.filter((q) => hasAnswer(q, attempt.answers[q.id]?.response)).length;
  const isLast = index === questions.length - 1;
  const canCheck = hasAnswer(question, draft);

  return (
    <div className="stack run">
      <div className="run-header">
        <div className="row-between">
          <a href={`#/test/${test.id}`} className="back-link" onClick={() => flushDraft()}>
            ← {test.title}
          </a>
          <span className="chip chip-soft">{isExam ? "Prüfungsmodus" : "Übungsmodus"}</span>
        </div>
        <div className="progress" aria-label={`Frage ${index + 1} von ${questions.length}`}>
          <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
        <nav className="q-nav" aria-label="Fragen">
          {questions.map((q, i) => {
            const r = attempt.answers[q.id];
            const state = r?.checked && !isExam ? r.verdict ?? "open" : hasAnswer(q, r?.response) ? "answered" : "";
            return (
              <button
                key={q.id}
                className={`q-dot ${state} ${i === index ? "current" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Frage ${i + 1}`}
                aria-current={i === index}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>
      </div>

      <article className="card question-card stack-sm" key={question.id}>
        <div className="row-between">
          <h2 className="q-title">
            Frage {index + 1} <span className="muted">/ {questions.length}</span>
          </h2>
        </div>
        <QuestionMeta question={question} />
        <Markdown className="prompt">{question.prompt}</Markdown>

        <AnswerInput question={question} response={draft} onChange={onDraftChange} disabled={locked || checking} reveal={locked} />

        {question.hint && !locked && !isExam && (
          <div>
            {showHint ? (
              <div className="hint">💡 {question.hint}</div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHint(true)}>
                💡 Tipp anzeigen
              </button>
            )}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {locked && record && <Feedback question={question} record={record} onSelfGrade={onSelfGrade} />}
      </article>

      <div className="run-actions">
        <button className="btn btn-ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
          ← Zurück
        </button>
        <div className="row-wrap">
          {!isExam && !locked && (
            <>
              <button className="btn btn-ghost" onClick={() => check(true)} disabled={checking}>
                Lösung zeigen
              </button>
              <button className="btn btn-primary" onClick={() => check()} disabled={!canCheck || checking}>
                {checking ? "Wird geprüft …" : "Antwort prüfen"}
              </button>
            </>
          )}
          {(isExam || locked) &&
            (isLast ? (
              <button className="btn btn-primary" onClick={finish}>
                {isExam ? "Abgeben" : "Ergebnis anzeigen"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => goTo(index + 1)}>
                Weiter →
              </button>
            ))}
        </div>
      </div>
      <div className="right">
        <button className="link-btn small" onClick={finish}>
          Test jetzt beenden
        </button>
      </div>
    </div>
  );
}
