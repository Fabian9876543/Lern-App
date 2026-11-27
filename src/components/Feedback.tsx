import type { ReactNode } from "react";
import { describeCorrectAnswer } from "../ai/normalize";
import type { AnswerRecord, Question, Verdict } from "../types";
import Markdown from "./Markdown";

const VERDICT_TEXT: Record<Verdict, string> = {
  correct: "Richtig",
  partial: "Teilweise richtig",
  wrong: "Leider falsch",
};

/** Ergebnis einer geprüften Antwort inkl. Musterlösung und Korrektur-Optionen. */
export default function Feedback({
  question,
  record,
  onSelfGrade,
  children,
}: {
  question: Question;
  record: AnswerRecord;
  onSelfGrade: (v: Verdict) => void;
  /** Zusätzliches unter der Rückmeldung, z. B. „Lösung stimmt nicht?“ */
  children?: ReactNode;
}) {
  const verdict = record.verdict;
  const showShortAnswer = question.type !== "free_text";

  return (
    <div className="feedback stack-sm">
      {verdict ? (
        <div className={`verdict verdict-${verdict}`} role="status">
          <strong>
            {verdict === "correct" ? "✓ " : verdict === "partial" ? "½ " : "✗ "}
            {VERDICT_TEXT[verdict]}
          </strong>
          <span>
            {formatPoints(record.score)} / {formatPoints(record.maxScore)} Punkte
            {record.gradedBy === "ai" && " · bewertet von KI"}
            {record.gradedBy === "self" && " · selbst bewertet"}
          </span>
        </div>
      ) : (
        <div className="verdict verdict-open" role="status">
          <strong>Selbst bewerten</strong>
          <span>Vergleiche deine Antwort mit der Musterlösung.</span>
        </div>
      )}

      {record.feedback && <Markdown className="feedback-text">{record.feedback}</Markdown>}

      {showShortAnswer && (
        <div className="solution-box">
          <div className="label">Richtige Antwort</div>
          <Markdown>{describeCorrectAnswer(question)}</Markdown>
        </div>
      )}
      {question.modelSolution && question.modelSolution !== "–" && (
        <details className="solution-box" open={question.type === "free_text" || verdict !== "correct"}>
          <summary className="label">
            Musterlösung
            {!question.solutionFromMaterial && <span className="chip chip-soft">von KI erstellt</span>}
          </summary>
          <Markdown>{question.modelSolution}</Markdown>
        </details>
      )}
      {question.explanation && (
        <details className="solution-box">
          <summary className="label">Erklärung</summary>
          <Markdown>{question.explanation}</Markdown>
        </details>
      )}
      {question.solutionFix && <SolutionFixNote fix={question.solutionFix} />}

      <div className="self-grade">
        <span className="muted small">{verdict ? "Bewertung anpassen:" : "Wie war deine Antwort?"}</span>
        <div className="row-wrap">
          {(["correct", "partial", "wrong"] as Verdict[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`btn btn-sm ${verdict === v && record.gradedBy === "self" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => onSelfGrade(v)}
            >
              {VERDICT_TEXT[v].replace("Leider f", "F")}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Hinweis, dass Claude die Lösung nach „Lösung stimmt nicht?“ korrigiert hat. */
export function SolutionFixNote({ fix }: { fix: NonNullable<Question["solutionFix"]> }) {
  return (
    <Markdown className="muted small solution-fixed">
      {`✎ Lösung am ${new Date(fix.at).toLocaleDateString("de-DE")} von Claude korrigiert${fix.reason ? `: ${fix.reason}` : "."}`}
    </Markdown>
  );
}

export function formatPoints(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
