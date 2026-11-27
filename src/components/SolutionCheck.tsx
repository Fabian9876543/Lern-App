import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import { describeCorrectAnswer } from "../ai/normalize";
import type { SolutionCheckResult } from "../ai/schemas";
import { applySolutionFix, checkQuestionSolution, correctedQuestion, type SolutionFixOutcome } from "../lib/solutionCheck";
import { getState, useStore } from "../store/store";
import type { AnswerRecord, Question } from "../types";
import Markdown from "./Markdown";

type Phase = "idle" | "asking" | "running" | "result" | "applying" | "done";

/**
 * „Lösung stimmt nicht?“ unter der Rückmeldung zu einer Frage: Claude prüft die
 * hinterlegte Lösung; eine Korrektur wird erst nach Bestätigung übernommen und
 * die Antwort dann neu bewertet.
 */
export default function SolutionCheck({
  question,
  record,
  testId,
  attemptId,
}: {
  question: Question;
  record?: AnswerRecord;
  testId: string;
  attemptId?: string;
}) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const [phase, setPhase] = useState<Phase>("idle");
  const [request, setRequest] = useState("");
  const [check, setCheck] = useState<SolutionCheckResult | null>(null);
  const [outcome, setOutcome] = useState<SolutionFixOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const test = store.tests.find((t) => t.id === testId);
  if (!test) return null;
  const hasMaterial = store.materials.some((m) => test.materialIds.includes(m.id));

  async function runCheck() {
    setError(null);
    setPhase("running");
    const c = new AbortController();
    controller.current = c;
    try {
      const result = await checkQuestionSolution({ testId, question, record, request, signal: c.signal });
      if (c.signal.aborted) return;
      setCheck(result);
      setPhase("result");
    } catch (e) {
      if (c.signal.aborted) return;
      setError(platform.describeError(e));
      setPhase("asking");
    }
  }

  async function accept() {
    if (!check) return;
    setError(null);
    setPhase("applying");
    try {
      setOutcome(await applySolutionFix({ testId, questionId: question.id, check, attemptId }));
      setPhase("done");
    } catch (e) {
      setError(platform.describeError(e));
      setPhase("result");
    }
  }

  function reset() {
    setCheck(null);
    setOutcome(null);
    setError(null);
    setRequest("");
    setPhase("idle");
  }

  if (phase === "idle") {
    return (
      <div className="solution-check">
        <button className="link-btn small" onClick={() => setPhase("asking")}>
          Lösung stimmt nicht?
        </button>
      </div>
    );
  }

  if (phase === "asking") {
    return (
      <div className="solution-check mark-fix stack-sm">
        <label className="field">
          <span>Was stimmt an der Lösung nicht? (optional)</span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={800}
            value={request}
            autoFocus
            placeholder="z. B. „Laut Skript sind es 19 %, nicht 16 %“ – oder leer lassen"
            onChange={(e) => setRequest(e.target.value)}
          />
        </label>
        <p className="muted small">
          Claude rechnet die Aufgabe {hasMaterial ? "anhand deines Materials" : "mit seinem Fachwissen"} nach. Ist die
          Lösung wirklich falsch, siehst du die Korrektur und entscheidest selbst, ob sie übernommen wird – dann wird deine
          Antwort neu bewertet.
        </p>
        {error && <p className="error-text small">{error}</p>}
        <div className="row-wrap">
          <button
            className="btn btn-primary btn-sm"
            onClick={runCheck}
            disabled={ai.state !== "ready"}
            title={ai.state === "unavailable" ? ai.reason : ""}
          >
            Von Claude prüfen lassen
          </button>
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  if (phase === "running" || phase === "applying") {
    return (
      <div className="solution-check mark-fix practice-progress" aria-live="polite" aria-busy="true">
        <div className="spinner spinner-sm" />
        <span className="small">
          {phase === "running"
            ? "Claude rechnet die Aufgabe nach und prüft die Lösung …"
            : "Lösung wird korrigiert und deine Antwort neu bewertet …"}
        </span>
        {phase === "running" && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              controller.current?.abort();
              setPhase("asking");
            }}
          >
            Abbrechen
          </button>
        )}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="solution-check callout callout-ok mark-fix stack-sm" role="status">
        <strong>✓ Die Lösung ist im Test korrigiert.</strong>
        <RegradeText outcome={outcome} />
        <div>
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            OK
          </button>
        </div>
      </div>
    );
  }

  // Ergebnis der Prüfung
  const latest = getState().tests.find((t) => t.id === testId)?.questions.find((q) => q.id === question.id) ?? question;
  const corrected = check ? correctedQuestion(latest, check) : null;

  if (!check?.solution_wrong) {
    return (
      <div className="solution-check callout mark-fix stack-sm" role="status">
        <span>
          <strong>Claude meint, die Lösung stimmt.</strong> {check?.reason}
        </span>
        <p className="muted small">
          Siehst du das anders, kannst du deine Antwort oben selbst bewerten oder die Frage auf der{" "}
          <a href={`#/test/${testId}`}>Testseite</a> bearbeiten.
        </p>
        <div className="row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            OK
          </button>
        </div>
      </div>
    );
  }

  if (!corrected) {
    return (
      <div className="solution-check callout callout-warn mark-fix stack-sm" role="status">
        <span>
          <strong>Claude hält die Lösung für falsch, hat aber keine vollständige Korrektur geliefert.</strong> {check.reason}
        </span>
        <div className="row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => setPhase("asking")} disabled={ai.state !== "ready"}>
            Noch einmal prüfen
          </button>
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            Schließen
          </button>
        </div>
      </div>
    );
  }

  const oldAnswer = latest.type === "free_text" ? "" : describeCorrectAnswer(latest);
  const newAnswer = corrected.type === "free_text" ? "" : describeCorrectAnswer(corrected);
  const solutionDiffers = corrected.modelSolution !== latest.modelSolution;

  return (
    <div className="solution-check mark-fix stack-sm">
      <strong>Claude hat einen Fehler in der Lösung gefunden</strong>
      {check.reason && <Markdown className="small">{check.reason}</Markdown>}
      {oldAnswer !== newAnswer && (
        <SolutionDiff label="Richtige Antwort" before={oldAnswer || "–"} after={newAnswer || "–"} />
      )}
      {solutionDiffers && (
        <SolutionDiff label="Musterlösung" before={latest.modelSolution || "–"} after={corrected.modelSolution} />
      )}
      <p className="muted small">
        {record && attemptId
          ? "Beim Übernehmen wird die Lösung im Test geändert und deine Antwort neu bewertet."
          : "Beim Übernehmen wird die Lösung im Test geändert."}
      </p>
      {error && <p className="error-text small">{error}</p>}
      <div className="row-wrap">
        <button className="btn btn-primary btn-sm" onClick={accept}>
          Korrektur übernehmen
        </button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>
          Verwerfen
        </button>
      </div>
    </div>
  );
}

function SolutionDiff({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="stack-xs">
      <span className="small muted">{label}</span>
      <div className="mark-fix-diff solution-diff">
        <div className="mark-fix-old">
          <span className="small muted">Bisher</span>
          <Markdown>{before}</Markdown>
        </div>
        <div className="mark-fix-new">
          <span className="small muted">Korrigiert</span>
          <Markdown>{after}</Markdown>
        </div>
      </div>
    </div>
  );
}

const formatPoints = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function RegradeText({ outcome }: { outcome: SolutionFixOutcome | null }) {
  if (!outcome) return null;
  const { before, after, error, others } = outcome;
  const othersText =
    others > 0 ? ` In ${others === 1 ? "einem anderen Durchlauf" : `${others} anderen Durchläufen`} dieses Tests wurde die Bewertung ebenfalls angepasst.` : "";
  if (error) {
    return (
      <span className="small">
        Deine Antwort konnte nicht neu bewertet werden: {error} Bewerte sie oben selbst.{othersText}
      </span>
    );
  }
  if (!before || !after) return othersText ? <span className="small">{othersText.trim()}</span> : null;
  if (!after.verdict) return <span className="small">Bewerte deine Antwort oben selbst anhand der neuen Lösung.{othersText}</span>;
  const max = formatPoints(after.maxScore);
  const text =
    before.verdict && before.score !== after.score
      ? `Deine Antwort wurde neu bewertet: jetzt ${formatPoints(after.score)} statt ${formatPoints(before.score)} von ${max} Punkten.`
      : `Deine Antwort wurde neu bewertet: ${formatPoints(after.score)} von ${max} Punkten.`;
  return (
    <span className="small">
      {text}
      {othersText}
    </span>
  );
}
