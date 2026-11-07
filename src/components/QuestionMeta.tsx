import { DIFFICULTY_LABELS, TYPE_LABELS } from "../ai/prompts";
import type { Question } from "../types";

export default function QuestionMeta({ question }: { question: Question }) {
  return (
    <div className="question-meta">
      <span className="chip">{question.topic}</span>
      <span className="chip chip-soft">{TYPE_LABELS[question.type]}</span>
      <span className={`chip chip-${question.difficulty}`}>{DIFFICULTY_LABELS[question.difficulty]}</span>
      <span className="chip chip-soft">
        {question.points} {question.points === 1 ? "Punkt" : "Punkte"}
      </span>
      {question.source && <span className="muted small source">{question.source}</span>}
    </div>
  );
}
