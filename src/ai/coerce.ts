import type { MaterialRole } from "../types";
import type { GeneratedQuestion, GeneratedTest, GeneratedTopic, GradingResult, TopicAnalysis } from "./schemas";

/**
 * Liest KI-Antworten tolerant ein, wenn kein JSON-Schema erzwungen werden kann
 * (claude.ai-Version): fehlende oder falsch typisierte Felder bekommen
 * sinnvolle Standardwerte. Die eigentliche Plausibilitätsprüfung übernimmt
 * danach normalizeQuestions().
 */

const TYPES = ["single_choice", "multiple_choice", "short_answer", "numeric", "free_text"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function strOrNull(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter((x) => x.trim() !== "") : [];
}

function intList(v: unknown): number[] {
  if (!Array.isArray(v)) return typeof v === "number" ? [v] : [];
  return v.map(num).filter((n): n is number => n !== null).map(Math.round);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function coerceQuestion(raw: unknown): GeneratedQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const prompt = str(q.prompt ?? q.question).trim();
  if (!prompt) return null;
  return {
    type: oneOf(q.type, TYPES, "free_text"),
    prompt,
    options: strList(q.options),
    correct_options: intList(q.correct_options),
    numeric_answer: num(q.numeric_answer),
    numeric_tolerance: num(q.numeric_tolerance),
    unit: strOrNull(q.unit),
    accepted_answers: strList(q.accepted_answers),
    model_solution: str(q.model_solution ?? q.solution),
    explanation: str(q.explanation),
    hint: strOrNull(q.hint),
    topic: str(q.topic, "Allgemein") || "Allgemein",
    difficulty: oneOf(q.difficulty, DIFFICULTIES, "medium"),
    points: num(q.points) ?? 1,
    source: strOrNull(q.source),
    solution_from_material: q.solution_from_material === true,
  };
}

export function coerceGeneratedTest(raw: unknown): GeneratedTest {
  const obj = (Array.isArray(raw) ? { questions: raw } : raw ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(obj.questions) ? obj.questions : [];
  return {
    title: str(obj.title).trim(),
    notes: str(obj.notes).trim(),
    questions: questions.map(coerceQuestion).filter((q): q is GeneratedQuestion => q !== null),
  };
}

export function coerceGrading(raw: unknown): GradingResult | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const score = num(g.score);
  if (score === null) return null;
  return {
    verdict: oneOf(g.verdict, ["correct", "partial", "wrong"] as const, "partial"),
    score,
    feedback: str(g.feedback).trim(),
  };
}

export function coerceTopicAnalysis(raw: unknown): TopicAnalysis {
  const obj = (Array.isArray(raw) ? { topics: raw } : raw ?? {}) as Record<string, unknown>;
  const topics = Array.isArray(obj.topics) ? obj.topics : [];
  return {
    title: str(obj.title).trim(),
    notes: str(obj.notes).trim(),
    topics: topics
      .map((t): GeneratedTopic | null => {
        if (!t || typeof t !== "object") {
          const name = str(t).trim();
          return name
            ? { name, description: "", estimated_minutes: 60, importance: "medium", prerequisites: [], sources: "" }
            : null;
        }
        const r = t as Record<string, unknown>;
        const name = str(r.name ?? r.topic).trim();
        if (!name) return null;
        return {
          name,
          description: str(r.description).trim(),
          estimated_minutes: num(r.estimated_minutes) ?? 60,
          importance: oneOf(r.importance, DIFFICULTY_TO_IMPORTANCE, "medium"),
          prerequisites: strList(r.prerequisites),
          sources: str(r.sources).trim(),
        };
      })
      .filter((t): t is GeneratedTopic => t !== null),
  };
}

const DIFFICULTY_TO_IMPORTANCE = ["high", "medium", "low"] as const;

const ROLES = ["tasks", "solutions", "tasks_with_solutions", "reference"] as const;

/** Namensvorschlag für ein Material; null, wenn kein Name erkennbar ist. */
export function coerceMaterialName(raw: unknown): { name: string; role: MaterialRole | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name).trim();
  if (!name) return null;
  return { name, role: (ROLES as readonly string[]).includes(r.role as string) ? (r.role as MaterialRole) : null };
}
