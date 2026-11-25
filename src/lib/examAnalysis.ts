import platform from "@platform-impl";
import { useSyncExternalStore } from "react";
import { ERROR_KIND_LABELS, TYPE_LABELS } from "../ai/prompts";
import type { GeneratedExamAnalysis } from "../ai/schemas";
import { getState, repo } from "../store/store";
import type { GenerationProgress } from "../targets/types";
import type { ExamAnalysis, ExamTaskStatus, GenerationSettings, Importance, Material, QuestionType } from "../types";
import { newId } from "./ids";
import { splitTest } from "./testParts";

/**
 * Klausur-Analyse: korrigierte Klausur hochladen → Claude zeigt, was nicht gut
 * lief → gezielt Übungsaufgaben zu den Schwachstellen erstellen. Auswerten und
 * Üben laufen außerhalb der Seiten weiter (wie beim Lernzettel).
 */

export const PRIORITY_LABELS: Record<Importance, string> = { high: "hoch", medium: "mittel", low: "niedrig" };

export const STATUS_LABELS: Record<ExamTaskStatus, string> = {
  correct: "Richtig",
  partial: "Teilweise",
  wrong: "Falsch",
  missing: "Nicht bearbeitet",
  unknown: "Unklar",
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[];
const PRIORITY_RANK: Record<Importance, number> = { high: 0, medium: 1, low: 2 };

/** Übernimmt Claudes Auswertung in das gespeicherte Format. */
export function toExamAnalysis(
  g: GeneratedExamAnalysis,
  meta: { id: string; subjectId: string; materialIds: string[]; remarks: string; model: string; createdAt: number; fallbackTitle: string },
): ExamAnalysis {
  return {
    id: meta.id,
    subjectId: meta.subjectId,
    title: g.title.trim() || meta.fallbackTitle,
    materialIds: meta.materialIds,
    remarks: meta.remarks.trim(),
    pointsAchieved: g.points_achieved,
    pointsMax: g.points_max,
    grade: g.grade?.trim() || null,
    summary: g.summary.trim(),
    strengths: g.strengths.filter((s) => s.trim()),
    weaknesses: g.weaknesses
      .map((w, i) => ({ w, i }))
      .sort((a, b) => PRIORITY_RANK[a.w.priority] - PRIORITY_RANK[b.w.priority] || a.i - b.i)
      .map(({ w }) => ({
        topic: w.topic.trim(),
        priority: w.priority,
        problem: w.problem.trim(),
        advice: w.advice.trim(),
        tasks: w.tasks.filter((t) => t.trim()),
        pointsLost: w.points_lost,
      })),
    errorPatterns: g.error_patterns.filter((e) => e.description.trim()),
    tasks: g.tasks.map((t) => ({
      label: t.label.trim(),
      topic: t.topic.trim(),
      pointsAchieved: t.points_achieved,
      pointsMax: t.points_max,
      status: t.status,
      mistake: t.mistake.trim(),
      correction: t.correction.trim(),
      errorKinds: t.error_kinds,
    })),
    notes: g.notes.trim(),
    model: meta.model,
    createdAt: meta.createdAt,
  };
}

/** Erreichte Punkte in Prozent, wenn bekannt. */
export function scorePercent(a: Pick<ExamAnalysis, "pointsAchieved" | "pointsMax">): number | null {
  if (a.pointsAchieved === null || !a.pointsMax) return null;
  return Math.round((a.pointsAchieved / a.pointsMax) * 100);
}

export function analysisMaterials(a: ExamAnalysis): Material[] {
  const { materials } = getState();
  return a.materialIds.map((id) => materials.find((m) => m.id === id)).filter((m): m is Material => !!m);
}

// ---------- Gezielt üben ----------

export type PracticeTarget = { kind: "all" } | { kind: "weakness"; topic: string } | { kind: "task"; label: string };

export function practiceKey(target: PracticeTarget): string {
  return target.kind === "all" ? "all" : target.kind === "weakness" ? `w:${target.topic}` : `t:${target.label}`;
}

const STYLE =
  "Stil und Niveau wie in der Klausur, aber neue Zahlen, Situationen und Fragestellungen. Bau die Aufgaben so, dass genau diese Fehler auffallen würden, und geh in Erklärung und Tipp auf sie ein.";

/** Wie viele Aufgaben, Titel, Themen und Schwerpunkt für einen Übungstest zur Analyse. */
export function practicePlan(a: ExamAnalysis, target: PracticeTarget): { title: string; settings: GenerationSettings } {
  const base = { mode: "generated" as const, difficulty: "mixed" as const, allowedTypes: ALL_TYPES, exactFormat: "original" as const };
  const patterns = a.errorPatterns.map((e) => `${ERROR_KIND_LABELS[e.kind]}: ${e.description}`).join("; ");

  if (target.kind === "weakness") {
    const w = a.weaknesses.find((x) => x.topic === target.topic);
    const related = a.tasks.filter((t) => w?.tasks.includes(t.label) && t.mistake);
    const focus = [
      `Gezielte Übung zum Thema „${target.topic}“ – einer Schwachstelle aus der Klausur „${a.title}“.`,
      w?.problem ? `Was nicht sitzt: ${w.problem}` : "",
      w?.advice ? `Worauf es ankommt: ${w.advice}` : "",
      related.length ? `Fehler in der Klausur: ${related.map((t) => `${t.label}: ${t.mistake}`).join(" | ")}` : "",
      `Vom Einfachen bis zum Klausurniveau. ${STYLE}`,
    ];
    return {
      title: `Übung: ${target.topic}`,
      settings: { ...base, questionCount: 5, topicNames: [target.topic], focus: focus.filter(Boolean).join("\n") },
    };
  }

  if (target.kind === "task") {
    const t = a.tasks.find((x) => x.label === target.label);
    const focus = [
      `Aufgaben wie „${target.label}“ aus der Klausur „${a.title}“${t?.topic ? ` (Thema: ${t.topic})` : ""}.`,
      t?.mistake ? `Dort lief schief: ${t.mistake}` : "",
      `Erstelle ähnliche Aufgaben – gleicher Aufgabentyp, gleiches Niveau –, an denen man genau das üben kann. ${STYLE}`,
    ];
    return {
      title: `Übung wie ${target.label}`,
      settings: { ...base, questionCount: 4, topicNames: t?.topic ? [t.topic] : undefined, focus: focus.filter(Boolean).join("\n") },
    };
  }

  const weaknesses = a.weaknesses.length
    ? a.weaknesses
    : // Ohne ausgewiesene Schwachstellen: die Themen der Aufgaben mit Fehlern
      [...new Set(a.tasks.filter((t) => t.status !== "correct" && t.topic).map((t) => t.topic))].map((topic) => ({
        topic,
        priority: "medium" as const,
        problem: a.tasks.filter((t) => t.topic === topic && t.mistake).map((t) => t.mistake).join(" "),
        advice: "",
        tasks: [],
        pointsLost: null,
      }));
  const lines = weaknesses.map(
    (w) =>
      `- ${w.topic} (Priorität ${PRIORITY_LABELS[w.priority]}): ${w.problem}${w.tasks.length ? ` – in der Klausur: ${w.tasks.join(", ")}` : ""}`,
  );
  const focus = [
    `Gezielte Übung zu den Schwachstellen aus der Klausur „${a.title}“. Übe genau das, was dort schiefging:`,
    ...lines,
    patterns ? `Wiederkehrende Fehler: ${patterns}` : "",
    `Mehr Aufgaben zu Schwachstellen mit hoher Priorität. ${STYLE}`,
  ];
  return {
    title: `Übung: Schwachstellen aus „${a.title}“`,
    settings: {
      ...base,
      questionCount: Math.min(15, Math.max(6, weaknesses.length * 3)),
      topicNames: weaknesses.length ? weaknesses.map((w) => w.topic) : undefined,
      focus: focus.filter(Boolean).join("\n"),
    },
  };
}

// ---------- Laufende Aufträge (Auswerten und Üben) ----------

export interface ExamJob {
  progress: GenerationProgress;
  controller: AbortController;
  done: boolean;
  error?: string;
  /** Fertig: die neue Analyse bzw. der neue Übungstest. */
  resultId?: string;
}

const jobs = new Map<string, ExamJob>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function useExamJob(key: string): ExamJob | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return jobs.get(key);
}

export function cancelExamJob(key: string): void {
  jobs.get(key)?.controller.abort();
  jobs.delete(key);
  notify();
}

export function clearExamJob(key: string): void {
  jobs.delete(key);
  notify();
}

/**
 * Startet einen Auftrag im Hintergrund (läuft beim Seitenwechsel weiter).
 * `work` liefert die ID des Ergebnisses und meldet Fortschritt über `report`.
 */
export function runJob(key: string, work: (job: ExamJob, report: (p: GenerationProgress) => void) => Promise<string>): void {
  if (jobs.get(key)?.done === false) return;
  const job: ExamJob = { progress: { phase: "preparing", questionsSoFar: 0 }, controller: new AbortController(), done: false };
  jobs.set(key, job);
  notify();
  const report = (p: GenerationProgress) => {
    job.progress = p;
    notify();
  };
  work(job, report)
    .then((id) => {
      job.resultId = id;
    })
    .catch((e) => {
      if (!job.controller.signal.aborted) job.error = platform.describeError(e);
    })
    .finally(() => {
      job.done = true;
      notify();
    });
}

export const newAnalysisKey = (subjectId: string) => `analysis:new:${subjectId}`;
export const practiceJobKey = (analysisId: string, target: PracticeTarget) => `practice:${analysisId}:${practiceKey(target)}`;

/** Klausur auswerten lassen; fertig: `resultId` ist die neue Analyse. */
export function startExamAnalysis(req: { subjectId: string; materialIds: string[]; remarks: string }): void {
  runJob(newAnalysisKey(req.subjectId), async (job) => {
    const { materials, subjects } = getState();
    const chosen = materials.filter((m) => req.materialIds.includes(m.id));
    if (chosen.length === 0) throw new Error("Die ausgewählten Dateien gibt es nicht mehr.");
    const { analysis, model } = await platform.analyzeExam({
      subjectName: subjects.find((s) => s.id === req.subjectId)?.name ?? "",
      materials: chosen,
      remarks: req.remarks,
      signal: job.controller.signal,
      onProgress: (p) => {
        job.progress = p;
        notify();
      },
    });
    const createdAt = Date.now();
    const saved = toExamAnalysis(analysis, {
      id: newId(),
      subjectId: req.subjectId,
      materialIds: chosen.map((m) => m.id),
      remarks: req.remarks,
      model,
      createdAt,
      fallbackTitle: `Klausur vom ${new Date(createdAt).toLocaleDateString("de-DE")}`,
    });
    repo.saveAnalysis(saved);
    return saved.id;
  });
}

/** Übungstest zu einer Analyse erstellen; fertig: `resultId` ist der (erste) neue Test. */
export function startPractice(analysisId: string, target: PracticeTarget): void {
  runJob(practiceJobKey(analysisId, target), async (job) => {
    const { analyses, subjects } = getState();
    const a = analyses.find((x) => x.id === analysisId);
    if (!a) throw new Error("Diese Klausur-Analyse gibt es nicht mehr.");
    const { title, settings } = practicePlan(a, target);
    const test = await platform.generateTest({
      subjectId: a.subjectId,
      subjectName: subjects.find((s) => s.id === a.subjectId)?.name ?? "",
      materials: analysisMaterials(a),
      settings,
      signal: job.controller.signal,
      onProgress: (p) => {
        job.progress = p;
        notify();
      },
    });
    const parts = splitTest({ ...test, title, analysisId }, newId);
    parts.forEach((t) => repo.addTest(t));
    return parts[0].id;
  });
}

/** Alle laufenden Übungs-Aufträge einer Analyse (für die Anzeige). */
export function practiceRunning(analysisId: string): boolean {
  return [...jobs.entries()].some(([k, j]) => k.startsWith(`practice:${analysisId}:`) && !j.done);
}
