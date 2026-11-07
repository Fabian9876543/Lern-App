import type { AnswerResponse, Question, Verdict } from "../types";

export interface LocalGrade {
  score: number;
  verdict: Verdict;
}

/**
 * Bewertet eine Antwort lokal, ohne KI. Gibt `null` zurück, wenn eine lokale
 * Bewertung nicht möglich ist (Freitext, oder Kurzantwort ohne exakten Treffer).
 */
export function gradeLocally(question: Question, response: AnswerResponse): LocalGrade | null {
  const points = question.points;
  switch (question.type) {
    case "single_choice": {
      const selected = response.selected ?? [];
      const ok = selected.length === 1 && question.correctOptions.includes(selected[0]);
      return ok ? { score: points, verdict: "correct" } : { score: 0, verdict: "wrong" };
    }
    case "multiple_choice": {
      const selected = new Set(response.selected ?? []);
      const correct = new Set(question.correctOptions);
      if (correct.size === 0) return null;
      let hits = 0;
      let misses = 0;
      selected.forEach((i) => (correct.has(i) ? hits++ : misses++));
      if (hits === correct.size && misses === 0) return { score: points, verdict: "correct" };
      const ratio = Math.max(0, (hits - misses) / correct.size);
      const score = roundScore(ratio * points);
      return { score, verdict: score > 0 ? "partial" : "wrong" };
    }
    case "numeric": {
      if (question.numericAnswer === null) return null;
      const value = parseNumber(response.number ?? "");
      if (value === null) return { score: 0, verdict: "wrong" };
      return numericMatches(value, question.numericAnswer, question.numericTolerance)
        ? { score: points, verdict: "correct" }
        : { score: 0, verdict: "wrong" };
    }
    case "short_answer": {
      const given = normalizeText(response.text ?? "");
      if (!given) return { score: 0, verdict: "wrong" };
      const match = question.acceptedAnswers.some((a) => normalizeText(a) === given);
      return match ? { score: points, verdict: "correct" } : null;
    }
    case "free_text":
      return null;
  }
}

export function hasAnswer(question: Question, response: AnswerResponse | undefined): boolean {
  if (!response) return false;
  switch (question.type) {
    case "single_choice":
    case "multiple_choice":
      return (response.selected?.length ?? 0) > 0;
    case "numeric":
      return (response.number ?? "").trim() !== "";
    case "short_answer":
      return (response.text ?? "").trim() !== "";
    case "free_text":
      return (response.text ?? "").trim() !== "" || !!response.image;
  }
}

function roundScore(n: number): number {
  return Math.round(n * 2) / 2;
}

export function numericMatches(value: number, expected: number, tolerance: number | null): boolean {
  const tol = tolerance !== null && tolerance > 0 ? tolerance : Math.max(Math.abs(expected) * 1e-6, 1e-9);
  // kleine Zugabe gegen Gleitkomma-Rundungsfehler
  return Math.abs(value - expected) <= tol * (1 + 1e-9) + 1e-12;
}

/**
 * Liest eine Zahl aus einer Eingabe wie „3,5“, „1.234,5 m“, „-2.5e3“ oder „1,2·10^3“.
 */
export function parseNumber(input: string): number | null {
  let s = input.trim().replace(/\s+/g, "").replace(/−/g, "-");
  if (!s) return null;
  // Zehnerpotenzen: 1,2·10^3, 1.2*10^-3, 1,2×10^(3)
  const pow = /^([-+]?[\d.,]+)[·*×x]10\^\(?([-+]?\d+)\)?/.exec(s);
  if (pow) {
    const mantissa = parseNumber(pow[1]);
    return mantissa === null ? null : mantissa * Math.pow(10, Number(pow[2]));
  }
  const fraction = /^([-+]?\d+)\/(\d+)$/.exec(s);
  if (fraction) {
    const den = Number(fraction[2]);
    return den === 0 ? null : Number(fraction[1]) / den;
  }
  const match = /^[-+]?[\d.,]+(?:e[-+]?\d+)?/i.exec(s);
  if (!match) return null;
  s = match[0];
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Das zuletzt vorkommende Zeichen ist das Dezimaltrennzeichen.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[„“"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

export function verdictFromScore(score: number, max: number): Verdict {
  if (score >= max) return "correct";
  if (score <= 0) return "wrong";
  return "partial";
}
