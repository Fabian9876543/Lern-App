import { useState } from "react";
import { normalizeImage } from "../lib/files";
import { repo } from "../store/store";
import type { AnswerResponse, Question } from "../types";
import Markdown from "./Markdown";

/**
 * Eingabefelder für eine Antwort, passend zum Aufgabentyp.
 * `reveal` markiert nach dem Prüfen richtige/falsche Optionen.
 */
export default function AnswerInput({
  question,
  response,
  onChange,
  disabled,
  reveal,
}: {
  question: Question;
  response: AnswerResponse;
  onChange: (r: AnswerResponse) => void;
  disabled: boolean;
  reveal: boolean;
}) {
  switch (question.type) {
    case "single_choice":
    case "multiple_choice":
      return (
        <ChoiceInput question={question} response={response} onChange={onChange} disabled={disabled} reveal={reveal} />
      );
    case "numeric":
      return (
        <div className="numeric-input">
          <input
            className="input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ergebnis, z. B. 3,14"
            value={response.number ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...response, number: e.target.value })}
            aria-label="Zahlenergebnis"
          />
          {question.unit && <span className="unit">{question.unit}</span>}
        </div>
      );
    case "short_answer":
      return (
        <input
          className="input"
          type="text"
          autoComplete="off"
          placeholder="Deine Antwort"
          value={response.text ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...response, text: e.target.value })}
          aria-label="Kurzantwort"
        />
      );
    case "free_text":
      return <FreeTextInput response={response} onChange={onChange} disabled={disabled} />;
  }
}

function ChoiceInput({
  question,
  response,
  onChange,
  disabled,
  reveal,
}: {
  question: Question;
  response: AnswerResponse;
  onChange: (r: AnswerResponse) => void;
  disabled: boolean;
  reveal: boolean;
}) {
  const multi = question.type === "multiple_choice";
  const selected = new Set(response.selected ?? []);

  function toggle(index: number) {
    if (disabled) return;
    if (multi) {
      const next = new Set(selected);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      onChange({ ...response, selected: [...next].sort((a, b) => a - b) });
    } else {
      onChange({ ...response, selected: [index] });
    }
  }

  return (
    <div className="options" role={multi ? "group" : "radiogroup"}>
      {multi && !disabled && <p className="muted small">Mehrere Antworten möglich</p>}
      {question.options.map((option, index) => {
        const isSelected = selected.has(index);
        const isCorrect = question.correctOptions.includes(index);
        let state = "";
        if (reveal) {
          if (isCorrect) state = "correct";
          else if (isSelected) state = "wrong";
        }
        return (
          <button
            key={index}
            type="button"
            className={`option ${isSelected ? "selected" : ""} ${state}`}
            onClick={() => toggle(index)}
            disabled={disabled}
            role={multi ? "checkbox" : "radio"}
            aria-checked={isSelected}
          >
            <span className={`option-marker ${multi ? "square" : "round"}`}>
              {reveal && isCorrect ? "✓" : reveal && isSelected ? "✗" : String.fromCharCode(65 + index)}
            </span>
            <Markdown className="option-text">{option}</Markdown>
          </button>
        );
      })}
    </div>
  );
}

function FreeTextInput({
  response,
  onChange,
  disabled,
}: {
  response: AnswerResponse;
  onChange: (r: AnswerResponse) => void;
  disabled: boolean;
}) {
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function addImage(file: File) {
    setImageError(null);
    setUploading(true);
    try {
      const blob = await normalizeImage(file, 1600, 900_000);
      onChange({ ...response, image: await repo.storeAnswerImage(blob) });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack-sm">
      <textarea
        className="textarea"
        rows={6}
        placeholder="Deine Lösung / dein Lösungsweg …  (Formeln gern als LaTeX, z. B. $x^2$)"
        value={response.text ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ ...response, text: e.target.value })}
        aria-label="Freitext-Antwort"
      />
      {response.image ? (
        <div className="answer-image">
          <img src={response.image} alt="Foto deiner Lösung" />
          {!disabled && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...response, image: undefined })}>
              Foto entfernen
            </button>
          )}
        </div>
      ) : (
        !disabled && (
          <label className="btn btn-ghost btn-sm file-btn">
            {uploading ? "Foto wird gespeichert …" : "📷 Foto der handschriftlichen Lösung anhängen"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) addImage(file);
              }}
            />
          </label>
        )
      )}
      {imageError && <p className="error-text">{imageError}</p>}
    </div>
  );
}
