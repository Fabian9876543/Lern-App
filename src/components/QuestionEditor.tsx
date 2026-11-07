import { useState } from "react";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "../ai/prompts";
import { parseNumber } from "../lib/grading";
import type { Difficulty, Question, QuestionType } from "../types";
import Modal from "./Modal";

/** Formular zum Bearbeiten oder Anlegen einer Frage. */
export default function QuestionEditor({
  question,
  onSave,
  onClose,
}: {
  question: Question;
  onSave: (q: Question) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState<Question>(question);
  const [optionsText, setOptionsText] = useState(question.options.join("\n"));
  const [acceptedText, setAcceptedText] = useState(question.acceptedAnswers.join("\n"));
  const [numberText, setNumberText] = useState(question.numericAnswer?.toString().replace(".", ",") ?? "");
  const [toleranceText, setToleranceText] = useState(question.numericTolerance?.toString().replace(".", ",") ?? "");
  const [error, setError] = useState<string | null>(null);

  const options = optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
  const isChoice = q.type === "single_choice" || q.type === "multiple_choice";

  function update<K extends keyof Question>(key: K, value: Question[K]) {
    setQ((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCorrect(index: number) {
    if (q.type === "single_choice") update("correctOptions", [index]);
    else {
      const set = new Set(q.correctOptions);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      update("correctOptions", [...set].sort((a, b) => a - b));
    }
  }

  function save() {
    if (!q.prompt.trim()) return setError("Bitte eine Aufgabenstellung eingeben.");
    const result: Question = {
      ...q,
      prompt: q.prompt.trim(),
      options: isChoice ? options : [],
      correctOptions: isChoice ? q.correctOptions.filter((i) => i < options.length) : [],
      acceptedAnswers: q.type === "short_answer" ? acceptedText.split("\n").map((a) => a.trim()).filter(Boolean) : [],
      numericAnswer: q.type === "numeric" ? parseNumber(numberText) : null,
      numericTolerance: q.type === "numeric" && toleranceText.trim() ? parseNumber(toleranceText) : null,
    };
    if (isChoice && (result.options.length < 2 || result.correctOptions.length === 0)) {
      return setError("Auswahlfragen brauchen mindestens 2 Optionen und eine richtige Antwort.");
    }
    if (q.type === "numeric" && result.numericAnswer === null) return setError("Bitte ein gültiges Zahlenergebnis angeben.");
    if (q.type === "short_answer" && result.acceptedAnswers.length === 0) {
      return setError("Bitte mindestens eine akzeptierte Antwort angeben.");
    }
    onSave(result);
  }

  return (
    <Modal
      title="Frage bearbeiten"
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text">{error}</span>}
          <button className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Format</span>
          <select className="select" value={q.type} onChange={(e) => update("type", e.target.value as QuestionType)}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Thema</span>
          <input className="input" value={q.topic} onChange={(e) => update("topic", e.target.value)} />
        </label>
        <label className="field">
          <span>Schwierigkeit</span>
          <select
            className="select"
            value={q.difficulty}
            onChange={(e) => update("difficulty", e.target.value as Difficulty)}
          >
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Punkte</span>
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            value={q.points}
            onChange={(e) => update("points", Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
      </div>

      <label className="field">
        <span>Aufgabenstellung (Markdown, Formeln mit $…$)</span>
        <textarea className="textarea" rows={5} value={q.prompt} onChange={(e) => update("prompt", e.target.value)} />
      </label>

      {isChoice && (
        <>
          <label className="field">
            <span>Antwortmöglichkeiten (eine pro Zeile)</span>
            <textarea className="textarea" rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
          </label>
          <div className="field">
            <span>Richtige Antwort(en)</span>
            <div className="row-wrap">
              {options.map((o, i) => (
                <label key={i} className="check">
                  <input
                    type={q.type === "single_choice" ? "radio" : "checkbox"}
                    name="correct"
                    checked={q.correctOptions.includes(i)}
                    onChange={() => toggleCorrect(i)}
                  />
                  {String.fromCharCode(65 + i)}: {o.length > 40 ? o.slice(0, 40) + "…" : o}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {q.type === "numeric" && (
        <div className="form-grid">
          <label className="field">
            <span>Ergebnis</span>
            <input className="input" value={numberText} onChange={(e) => setNumberText(e.target.value)} />
          </label>
          <label className="field">
            <span>Toleranz (±)</span>
            <input className="input" value={toleranceText} onChange={(e) => setToleranceText(e.target.value)} />
          </label>
          <label className="field">
            <span>Einheit</span>
            <input className="input" value={q.unit ?? ""} onChange={(e) => update("unit", e.target.value || null)} />
          </label>
        </div>
      )}

      {q.type === "short_answer" && (
        <label className="field">
          <span>Akzeptierte Antworten (eine pro Zeile)</span>
          <textarea className="textarea" rows={3} value={acceptedText} onChange={(e) => setAcceptedText(e.target.value)} />
        </label>
      )}

      <label className="field">
        <span>Musterlösung</span>
        <textarea
          className="textarea"
          rows={5}
          value={q.modelSolution}
          onChange={(e) => update("modelSolution", e.target.value)}
        />
      </label>
      <label className="field">
        <span>Erklärung</span>
        <textarea
          className="textarea"
          rows={3}
          value={q.explanation}
          onChange={(e) => update("explanation", e.target.value)}
        />
      </label>
      <label className="field">
        <span>Tipp (optional)</span>
        <input className="input" value={q.hint ?? ""} onChange={(e) => update("hint", e.target.value || null)} />
      </label>
    </Modal>
  );
}
