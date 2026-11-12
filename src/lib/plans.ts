import platform from "@platform-impl";
import { manualTopics, parseTopicLines, toPlanTopics } from "../ai/topics";
import { TYPE_LABELS } from "../ai/prompts";
import { getState, repo } from "../store/store";
import type { GenerationProgress } from "../targets/types";
import type { GenerationSettings, PlanTask, PlanTopic, Question, QuestionType, StudyNote, StudyPlan, Test } from "../types";
import { startAttempt } from "./attempts";
import { newId } from "./ids";
import {
  addExtraReviews,
  attemptTopicPercents,
  daysBetween,
  matchTopic,
  redistribute,
  schedulePlan,
  todayISO,
  topicStatus,
  weekdayOf,
  addDays,
  formatDay,
} from "./planner";

/** Aktionen rund um Lernpläne, die Speicher und KI nutzen. */

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[];
const AUTO_CHECKABLE: QuestionType[] = ["single_choice", "multiple_choice", "numeric", "short_answer"];

/** Unter diesem Ergebnis gilt ein Thema als unsicher und bekommt eine Zusatzwiederholung. */
export const WEAK_PERCENT = 60;

export function availableMinutes(startDate: string, examDate: string, minutesPerWeekday: number[]): number {
  let sum = 0;
  for (let d = startDate; d < examDate; d = addDays(d, 1)) sum += minutesPerWeekday[weekdayOf(d)] ?? 0;
  return sum;
}

export function studyDayCount(startDate: string, examDate: string, minutesPerWeekday: number[]): number {
  let n = 0;
  for (let d = startDate; d < examDate; d = addDays(d, 1)) if ((minutesPerWeekday[weekdayOf(d)] ?? 0) > 0) n++;
  return n;
}

export interface NewPlanInput {
  subjectId: string;
  subjectName: string;
  examDate: string;
  startDate: string;
  minutesPerWeekday: number[];
  materialIds: string[];
  focus: string;
  topicSource: "ai" | "manual";
  manualTopicsText: string;
  /** Manuelle Themen von Claude um Zeitbedarf, Wichtigkeit usw. ergänzen lassen. */
  enrichManual: boolean;
}

/** Legt einen Plan-Entwurf an (Themen prüfen, Einstufungstest) und gibt seine ID zurück. */
export async function createDraftPlan(
  input: NewPlanInput,
  opts: { signal?: AbortSignal; onProgress?: (p: GenerationProgress) => void } = {},
): Promise<string> {
  const materials = getState().materials.filter((m) => input.materialIds.includes(m.id));
  const lines = parseTopicLines(input.manualTopicsText);
  let topics: PlanTopic[];
  let title = `Klausur ${input.subjectName}`;
  let notes = "";

  if (input.topicSource === "manual" && !input.enrichManual) {
    topics = manualTopics(lines, newId);
  } else {
    const analysis = await platform.analyzeTopics({
      subjectName: input.subjectName,
      materials,
      examDate: input.examDate,
      daysUntilExam: daysBetween(todayISO(), input.examDate),
      availableMinutes: availableMinutes(input.startDate, input.examDate, input.minutesPerWeekday),
      focus: input.focus,
      givenTopics: input.topicSource === "manual" ? lines : undefined,
      signal: opts.signal,
      onProgress: opts.onProgress,
    });
    topics = toPlanTopics(analysis.topics, newId);
    if (input.topicSource === "manual") {
      // Namen und Reihenfolge so, wie eingegeben; Themen ohne Schätzung behalten die Standardwerte.
      const estimated = topics;
      const used = new Set<string>();
      topics = manualTopics(lines, newId).map((own) => {
        const match = matchTopic(own.name, estimated);
        if (!match || used.has(match.id)) return own;
        used.add(match.id);
        return { ...match, name: own.name, description: match.description || own.description };
      });
    }
    if (analysis.title) title = analysis.title;
    notes = analysis.notes;
  }
  if (topics.length === 0) throw new Error("Bitte mindestens ein Thema angeben.");
  // Gleichnamige Pläne im selben Fach unterscheidbar machen.
  if (getState().plans.some((p) => p.subjectId === input.subjectId && p.title === title)) {
    title = `${title} (${formatDay(input.examDate)})`;
  }

  const plan: StudyPlan = {
    id: newId(),
    subjectId: input.subjectId,
    title,
    examDate: input.examDate,
    startDate: input.startDate,
    minutesPerWeekday: input.minutesPerWeekday,
    materialIds: input.materialIds,
    focus: input.focus,
    topics,
    tasks: [],
    status: "draft",
    notes,
    warnings: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  repo.addPlan(plan);
  return plan.id;
}

/** Erstellt aus dem Entwurf den Kalender und aktiviert den Plan. Erledigte Aufgaben bleiben erhalten. */
export function finalizePlan(planId: string): void {
  repo.updatePlan(planId, (p) => {
    const startDate = p.startDate < todayISO() ? todayISO() : p.startDate;
    const result = schedulePlan({
      topics: p.topics,
      startDate,
      examDate: p.examDate,
      minutesPerWeekday: p.minutesPerWeekday,
      makeId: newId,
    });
    const history = p.tasks.filter((t) => t.status !== "open");
    return { ...p, startDate, status: "active", tasks: [...history, ...result.tasks], warnings: result.warnings };
  });
}

/** Zurück in den Entwurf, um Themen oder Zeiten zu ändern; erledigte Aufgaben bleiben. */
export function reopenPlan(planId: string): void {
  repo.updatePlan(planId, (p) => ({ ...p, status: "draft", tasks: p.tasks.filter((t) => t.status !== "open") }));
}

export function redistributePlan(planId: string): void {
  repo.updatePlan(planId, (p) => {
    const result = redistribute(p, todayISO());
    return { ...p, tasks: result.tasks, warnings: result.warnings };
  });
}

export function setTaskStatus(planId: string, taskId: string, status: PlanTask["status"]): void {
  repo.updatePlan(planId, (p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }));
}

// ---------- Tests zum Plan ----------

function planMaterials(plan: StudyPlan) {
  return getState().materials.filter((m) => plan.materialIds.includes(m.id));
}

/** true, wenn der Plan (noch vorhandenes) Material hat; sonst arbeitet Claude aus seinem Fachwissen. */
export function planHasMaterials(plan: StudyPlan): boolean {
  return planMaterials(plan).length > 0;
}

/** Fügt dem Plan Material hinzu; Tests und Lernzettel, die ab jetzt entstehen, nutzen es. */
export function addPlanMaterials(planId: string, materialIds: string[]): void {
  repo.updatePlan(planId, (p) => ({ ...p, materialIds: [...new Set([...p.materialIds, ...materialIds])] }));
}

/** Nimmt Material aus dem Plan (die Datei selbst bleibt im Fach). */
export function removePlanMaterial(planId: string, materialId: string): void {
  repo.updatePlan(planId, (p) => ({ ...p, materialIds: p.materialIds.filter((id) => id !== materialId) }));
}

/** Ungefähre Fragenzahl des Tests zu einer Plan-Aufgabe (null bei Aufgaben ohne Test). */
export function taskQuestionCount(task: PlanTask): number | null {
  if (task.type === "practice") return Math.min(12, Math.max(4, Math.round(task.minutes / 3)));
  if (task.type === "review") return Math.min(10, Math.max(4, Math.round(task.minutes / 3)));
  if (task.type === "mock_exam") return Math.min(20, Math.max(8, Math.round(task.minutes / 6)));
  return null;
}

function subjectNameOf(plan: StudyPlan): string {
  return getState().subjects.find((s) => s.id === plan.subjectId)?.name ?? "";
}

/** Setzt das Thema jeder Frage auf den exakten Namen eines Plan-Themas. */
function alignTopics(test: Test, topics: PlanTopic[], fallback?: PlanTopic): Test {
  return {
    ...test,
    questions: test.questions.map((q) => {
      const t = matchTopic(q.topic, topics) ?? fallback;
      return t ? { ...q, topic: t.name } : q;
    }),
  };
}

async function generatePlanTest(
  plan: StudyPlan,
  settings: GenerationSettings,
  title: string,
  opts: { signal?: AbortSignal; onProgress?: (p: GenerationProgress) => void; fallbackTopic?: PlanTopic },
): Promise<Test> {
  const hint = plan.focus.trim();
  const test = await platform.generateTest({
    subjectId: plan.subjectId,
    subjectName: subjectNameOf(plan),
    materials: planMaterials(plan),
    settings: hint ? { ...settings, focus: `${settings.focus}\nHinweise des Lernenden zur Prüfung: ${hint}` } : settings,
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
  const aligned = alignTopics({ ...test, title, planId: plan.id }, plan.topics, opts.fallbackTopic);
  repo.addTest(aligned);
  return aligned;
}

/** Fundstellen, die nichts über das Material sagen (z. B. bei Plänen ohne Material). */
const NO_SOURCE = /^(kein|nicht im) material$/i;

/** Fundstelle eines Themas oder "", wenn sie nichts über das Material sagt. */
export function usableSource(sources: string): string {
  const s = sources.trim();
  return NO_SOURCE.test(s) ? "" : s;
}

function topicFocus(topics: PlanTopic[]): string {
  return topics
    .map((t) => {
      const source = usableSource(t.sources) ? ` – Fundstelle: ${usableSource(t.sources)}` : "";
      return `„${t.name}“${t.description ? ` (${t.description})` : ""}${source}`;
    })
    .join("; ");
}

function baseSettings(partial: Partial<GenerationSettings>): GenerationSettings {
  return {
    mode: "generated",
    questionCount: 8,
    difficulty: "mixed",
    allowedTypes: ALL_TYPES,
    focus: "",
    exactFormat: "original",
    ...partial,
  };
}

/** Startet (oder erzeugt zuerst) den Einstufungstest und gibt die Durchlauf-ID zurück. */
export async function startPlacementTest(
  planId: string,
  opts: { signal?: AbortSignal; onProgress?: (p: GenerationProgress) => void } = {},
): Promise<string> {
  const plan = repo.getPlan(planId)!;
  let test = plan.placementTestId ? repo.getTest(plan.placementTestId) : undefined;
  if (!test) {
    const count = Math.min(20, Math.max(5, Math.round(plan.topics.length * 1.5)));
    test = await generatePlanTest(
      plan,
      baseSettings({
        questionCount: count,
        difficulty: "medium",
        allowedTypes: AUTO_CHECKABLE,
        focus: `Einstufungstest: Prüfe mit je ein bis zwei kurzen Fragen pro Thema, ob die Grundlagen bereits sitzen. Jedes Thema muss mindestens einmal vorkommen. Themen: ${topicFocus(plan.topics)}`,
        topicNames: plan.topics.map((t) => t.name),
      }),
      "Einstufungstest",
      opts,
    );
    repo.updatePlan(planId, { placementTestId: test.id });
  }
  const open = getState().attempts.find((a) => a.testId === test!.id && a.status === "in_progress");
  return open?.id ?? startAttempt(test, { mode: "exam", shuffle: false, label: "Einstufungstest" });
}

/** Startet den Test zu einer Plan-Aufgabe (Übung, Wiederholung, Probeklausur) und gibt die Durchlauf-ID zurück. */
export async function startTaskTest(
  planId: string,
  taskId: string,
  opts: { signal?: AbortSignal; onProgress?: (p: GenerationProgress) => void } = {},
): Promise<string> {
  const plan = repo.getPlan(planId)!;
  const task = plan.tasks.find((t) => t.id === taskId)!;
  const existing = task.testId ? repo.getTest(task.testId) : undefined;
  const mode = task.type === "mock_exam" ? "exam" : "practice";

  if (existing) {
    const open = getState().attempts.find((a) => a.testId === existing.id && a.status === "in_progress");
    return open?.id ?? startAttempt(existing, { mode, shuffle: task.type !== "mock_exam", label: task.title });
  }

  const topics = plan.topics.filter((t) => task.topicIds.includes(t.id));
  let test: Test;
  if (task.type === "practice") {
    test = await generatePlanTest(
      plan,
      baseSettings({
        questionCount: taskQuestionCount(task)!,
        focus: `Übungstest zum Thema ${topicFocus(topics)}. Nur Aufgaben zu diesem Thema.`,
        topicNames: topics.map((t) => t.name),
      }),
      task.title,
      { ...opts, fallbackTopic: topics.length === 1 ? topics[0] : undefined },
    );
  } else if (task.type === "review") {
    const reviewTopics = topics.length > 1 ? weakestTopics(plan, 4) : topics;
    const mistakes = collectMistakes(plan, reviewTopics);
    if (mistakes.length >= Math.min(3, 2 * reviewTopics.length)) {
      // Fehler aus früheren Tests – ohne KI.
      test = {
        id: newId(),
        subjectId: plan.subjectId,
        title: task.title,
        mode: "exact",
        materialIds: plan.materialIds,
        settings: baseSettings({ mode: "exact", questionCount: null }),
        questions: mistakes.slice(0, 15),
        notes: "",
        createdAt: Date.now(),
        model: "Wiederholung aus früheren Fehlern",
        planId: plan.id,
      };
      repo.addTest(test);
    } else {
      test = await generatePlanTest(
        plan,
        baseSettings({
          questionCount: taskQuestionCount(task)!,
          difficulty: "medium",
          focus: `Kurze Wiederholung zu ${topicFocus(reviewTopics)}. Prüfe die wichtigsten Kernpunkte.`,
          topicNames: reviewTopics.map((t) => t.name),
        }),
        task.title,
        { ...opts, fallbackTopic: reviewTopics.length === 1 ? reviewTopics[0] : undefined },
      );
    }
  } else {
    const weighted = [...plan.topics].sort((a, b) => importanceRank(a) - importanceRank(b));
    test = await generatePlanTest(
      plan,
      baseSettings({
        questionCount: taskQuestionCount(task)!,
        focus: `Probeklausur im Stil der echten Prüfung über alle Themen. Gewichte die Themen nach Wichtigkeit (zuerst die wichtigsten). Wenn Altklausuren im Material sind, orientiere dich an deren Aufbau und Niveau. Themen: ${topicFocus(weighted)}`,
        topicNames: plan.topics.map((t) => t.name),
      }),
      task.title,
      opts,
    );
  }
  repo.updatePlan(planId, (p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, testId: test.id } : t)) }));
  return startAttempt(test, { mode, shuffle: false, label: task.title });
}

function importanceRank(t: PlanTopic): number {
  return t.importance === "high" ? 0 : t.importance === "medium" ? 1 : 2;
}

/** Die Themen mit dem schwächsten Stand (unbekannte zählen als schwach). */
export function weakestTopics(plan: StudyPlan, count: number): PlanTopic[] {
  const { tests, attempts } = getState();
  const status = topicStatus(plan, tests, attempts);
  return [...plan.topics]
    .sort((a, b) => (status.get(a.id)?.percent ?? 50) - (status.get(b.id)?.percent ?? 50) || importanceRank(a) - importanceRank(b))
    .slice(0, count);
}

/** Fragen zu den Themen, die im jeweils letzten Versuch nicht richtig waren. */
function collectMistakes(plan: StudyPlan, topics: PlanTopic[]): Question[] {
  const { tests, attempts } = getState();
  const planTests = new Map(tests.filter((t) => t.planId === plan.id).map((t) => [t.id, t]));
  const latest = new Map<string, { q: Question; correct: boolean }>();
  const finished = attempts
    .filter((a) => a.status === "finished" && planTests.has(a.testId))
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  for (const a of finished) {
    const test = planTests.get(a.testId)!;
    for (const q of test.questions) {
      const rec = a.answers[q.id];
      if (!rec?.checked || !a.questionIds.includes(q.id)) continue;
      const topic = matchTopic(q.topic, topics);
      if (!topic) continue;
      latest.set(q.id, { q, correct: rec.verdict === "correct" });
    }
  }
  return [...latest.values()].filter((v) => !v.correct).map((v) => v.q);
}

// ---------- Lernzettel ----------

export function noteFor(notes: StudyNote[], planId: string, topicId: string): StudyNote | undefined {
  return notes.find((n) => n.planId === planId && n.topicId === topicId);
}

/** Geplante Lernzeit für ein Thema: Summe seiner Lern-Aufgaben, sonst die Schätzung. */
function learnMinutes(plan: StudyPlan, topic: PlanTopic): number {
  const sum = plan.tasks.filter((t) => t.type === "learn" && t.topicIds.includes(topic.id)).reduce((s, t) => s + t.minutes, 0);
  return sum || topic.estimatedMinutes;
}

/** Lässt Claude einen Lernzettel zum Thema schreiben (ersetzt einen vorhandenen) und speichert ihn. */
export async function createStudyNote(
  planId: string,
  topicId: string,
  opts: { signal?: AbortSignal; onText?: (text: string) => void } = {},
): Promise<StudyNote> {
  const plan = repo.getPlan(planId);
  const topic = plan?.topics.find((t) => t.id === topicId);
  if (!plan || !topic) throw new Error("Dieses Thema gibt es im Lernplan nicht mehr.");
  const materials = planMaterials(plan);
  const result = await platform.createStudyNote({
    subjectName: subjectNameOf(plan),
    topic: {
      name: topic.name,
      description: topic.description,
      sources: usableSource(topic.sources),
    },
    planTopics: plan.topics.map((t) => t.name),
    minutes: learnMinutes(plan, topic),
    focus: plan.focus,
    materials,
    signal: opts.signal,
    onText: opts.onText,
  });
  const note: StudyNote = {
    id: newId(),
    subjectId: plan.subjectId,
    planId,
    topicId,
    topicName: topic.name,
    content: result.content,
    fromMaterial: materials.length > 0,
    model: result.model,
    createdAt: Date.now(),
  };
  repo.saveNote(note);
  return note;
}

// ---------- Nach einem Durchlauf ----------

/** Wird aufgerufen, wenn ein Durchlauf abgeschlossen ist: Einstufung übernehmen, Aufgabe abhaken, nachsteuern. */
export function onAttemptFinished(attemptId: string): void {
  const { attempts, tests, plans } = getState();
  const attempt = attempts.find((a) => a.id === attemptId);
  const test = attempt && tests.find((t) => t.id === attempt.testId);
  if (!attempt || !test?.planId) return;
  const plan = plans.find((p) => p.id === test.planId);
  if (!plan) return;
  const percents = attemptTopicPercents(attempt, test, plan.topics);

  if (plan.placementTestId === test.id) {
    repo.updatePlan(plan.id, (p) => ({
      ...p,
      topics: p.topics.map((t) => (percents.has(t.id) ? { ...t, placementPercent: percents.get(t.id)! } : t)),
    }));
    return;
  }

  repo.updatePlan(plan.id, (p) => {
    let tasks = p.tasks.map((t) =>
      t.testId === test.id && t.status === "open" ? { ...t, status: "done" as const, attemptId } : t,
    );
    if (p.status === "active") {
      const weak = [...percents].filter(([, pct]) => pct < WEAK_PERCENT).map(([id]) => id);
      if (weak.length) tasks = addExtraReviews({ ...p, tasks }, weak, todayISO(), newId);
    }
    return { ...p, tasks };
  });
}
