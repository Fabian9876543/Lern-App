import type { Attempt, Importance, PlanTask, PlanTaskType, PlanTopic, StudyPlan, Test } from "../types";
import { normalizeText } from "./grading";

/**
 * Lernplan-Logik ohne KI: Datumsrechnung, Verteilung der Themen auf die
 * Lerntage, Umplanen und Auswertung des Themenstands. Alles hier ist rein
 * (ohne Seiteneffekte) und deshalb gut testbar.
 */

// ---------- Datum ----------

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function weekdayOf(iso: string): number {
  return parseISO(iso).getDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const WEEKDAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function formatDay(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// ---------- Einstufung ----------

/** Wie viel Lernzeit ein Thema nach dem Einstufungstest noch braucht (Faktor). */
export function placementFactor(percent: number | null): number {
  if (percent === null) return 1;
  if (percent >= 85) return 0.35;
  if (percent >= 65) return 0.6;
  if (percent >= 40) return 0.85;
  return 1;
}

export function effectiveMinutes(topic: PlanTopic): number {
  return round5(topic.estimatedMinutes * placementFactor(topic.placementPercent));
}

// ---------- Reihenfolge ----------

/** Sortiert Themen so, dass Voraussetzungen vorher drankommen; sonst bleibt die Reihenfolge erhalten. */
export function orderTopics(topics: PlanTopic[]): PlanTopic[] {
  const ids = new Set(topics.map((t) => t.id));
  const remaining = new Map(topics.map((t) => [t.id, new Set(t.prerequisites.filter((p) => ids.has(p) && p !== t.id))]));
  const result: PlanTopic[] = [];
  const done = new Set<string>();
  while (result.length < topics.length) {
    const next = topics.find((t) => !done.has(t.id) && [...remaining.get(t.id)!].every((p) => done.has(p)));
    // Bei zirkulären Voraussetzungen einfach in der ursprünglichen Reihenfolge weiter.
    const pick = next ?? topics.find((t) => !done.has(t.id))!;
    result.push(pick);
    done.add(pick.id);
  }
  return result;
}

// ---------- Lerntage ----------

interface Day {
  date: string;
  capacity: number;
  used: number;
}

function studyDays(fromDate: string, examDate: string, minutesPerWeekday: number[]): Day[] {
  const days: Day[] = [];
  for (let d = fromDate; d < examDate; d = addDays(d, 1)) {
    const capacity = minutesPerWeekday[weekdayOf(d)] ?? 0;
    if (capacity > 0) days.push({ date: d, capacity, used: 0 });
  }
  return days;
}

const free = (d: Day) => d.capacity - d.used;

/** Anzahl der Tage am Ende, die für Probeklausur und Schlusswiederholung reserviert sind. */
export function finalPhaseLength(studyDayCount: number): number {
  if (studyDayCount < 3) return 0;
  if (studyDayCount < 10) return 1;
  return clamp(Math.round(studyDayCount * 0.12), 2, 4);
}

const TYPE_ORDER: Record<PlanTaskType, number> = { review: 0, learn: 1, practice: 2, mock_exam: 3, buffer: 4 };

export function sortTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : TYPE_ORDER[a.type] - TYPE_ORDER[b.type]));
}

const IMPORTANCE_WEIGHT: Record<Importance, number> = { high: 1.15, medium: 1, low: 0.75 };

export interface ScheduleResult {
  tasks: PlanTask[];
  warnings: string[];
  requiredMinutes: number;
  availableMinutes: number;
}

/**
 * Verteilt die Themen auf die Lerntage zwischen Start und Prüfung:
 * Lernen (ggf. in Teilen), Übungstest, Wiederholungen nach ca. 2 und 6 Tagen,
 * am Ende Probeklausur, Schlusswiederholung und Puffer.
 */
export function schedulePlan(input: {
  topics: PlanTopic[];
  startDate: string;
  examDate: string;
  minutesPerWeekday: number[];
  makeId: () => string;
}): ScheduleResult {
  const { startDate, examDate, minutesPerWeekday, makeId } = input;
  const warnings: string[] = [];
  const days = studyDays(startDate, examDate, minutesPerWeekday);
  const topics = orderTopics(input.topics);

  const work = topics.map((t) => {
    const eff = effectiveMinutes(t);
    return {
      topic: t,
      eff,
      practice: clamp(round5(eff * 0.3), 15, 45),
      review: clamp(round5(eff * 0.15), 10, 30),
    };
  });
  const requiredMinutes = work.reduce((s, w) => s + w.eff + w.practice + 2 * w.review, 0);

  if (days.length === 0) {
    return {
      tasks: [],
      warnings: ["Zwischen Start und Prüfung ist keine Lernzeit eingetragen."],
      requiredMinutes,
      availableMinutes: 0,
    };
  }

  const finalCount = finalPhaseLength(days.length);
  const mainDays = days.slice(0, days.length - finalCount);
  const finalDays = days.slice(days.length - finalCount);
  const availableMinutes = mainDays.reduce((s, d) => s + d.capacity, 0);
  const tasks: PlanTask[] = [];
  const task = (date: string, type: PlanTaskType, topicIds: string[], title: string, minutes: number) => {
    const t: PlanTask = { id: makeId(), date, type, topicIds, title, minutes, status: "open" };
    tasks.push(t);
    return t;
  };

  // Zeit knapp? Dann Lernzeiten kürzen (unwichtige Themen stärker) und ggf. zweite Wiederholung streichen.
  const learnTotal = work.reduce((s, w) => s + w.eff, 0);
  let fixedTotal = work.reduce((s, w) => s + w.practice + 2 * w.review, 0);
  let dropSecondReview = false;
  let scale = learnTotal > 0 ? (availableMinutes - fixedTotal) / learnTotal : 1;
  if (scale < 0.4) {
    dropSecondReview = true;
    fixedTotal = work.reduce((s, w) => s + w.practice + w.review, 0);
    scale = learnTotal > 0 ? (availableMinutes - fixedTotal) / learnTotal : 1;
  }
  scale = clamp(scale, 0.3, 1);
  if (requiredMinutes > availableMinutes) {
    warnings.push(
      `Die Zeit ist knapp: Für alle Themen wären ca. ${formatMinutes(requiredMinutes)} nötig, eingeplant sind ${formatMinutes(availableMinutes)}. Die Lernzeiten wurden gekürzt.`,
    );
  }

  let overflow = false;
  let cursor = 0;
  const lastMain = mainDays.length - 1;
  // Viel Zeit übrig? Dann Themen gleichmäßig über den Zeitraum verteilen und eine dritte Wiederholung einplanen.
  const plenty = requiredMinutes <= availableMinutes * 0.8;

  const findDay = (fromIndex: number, minutes: number): number => {
    for (let i = Math.max(0, fromIndex); i < mainDays.length; i++) if (free(mainDays[i]) >= minutes) return i;
    return -1;
  };
  const indexOnOrAfter = (date: string): number => mainDays.findIndex((d) => d.date >= date);

  for (const [topicIndex, w] of work.entries()) {
    if (mainDays.length === 0) break;
    const name = w.topic.name;
    if (plenty) cursor = Math.max(cursor, Math.floor((topicIndex * mainDays.length) / work.length));
    const learn = scale < 1 ? Math.min(w.eff, round5(w.eff * scale * IMPORTANCE_WEIGHT[w.topic.importance])) : w.eff;

    // Lernen, bei Bedarf über mehrere Tage aufgeteilt.
    const parts: { index: number; minutes: number }[] = [];
    let remaining = learn;
    while (remaining > 0) {
      while (cursor <= lastMain && free(mainDays[cursor]) < Math.min(15, remaining)) cursor++;
      if (cursor > lastMain) {
        overflow = true;
        parts.push({ index: lastMain, minutes: remaining });
        mainDays[lastMain].used += remaining;
        break;
      }
      const chunk = Math.min(remaining, free(mainDays[cursor]));
      parts.push({ index: cursor, minutes: chunk });
      mainDays[cursor].used += chunk;
      remaining -= chunk;
    }
    parts.forEach((p, i) =>
      task(
        mainDays[p.index].date,
        "learn",
        [w.topic.id],
        parts.length > 1 ? `${name} lernen (Teil ${i + 1}/${parts.length})` : `${name} lernen`,
        p.minutes,
      ),
    );
    const learnEnd = parts[parts.length - 1].index;

    // Übungstest am selben oder nächsten möglichen Tag.
    let pIndex = findDay(learnEnd, w.practice);
    if (pIndex < 0) {
      overflow = true;
      pIndex = lastMain;
    }
    mainDays[pIndex].used += w.practice;
    task(mainDays[pIndex].date, "practice", [w.topic.id], `Übungstest: ${name}`, w.practice);

    // Wiederholungen nach ca. 2 und 6 Tagen (verteiltes Lernen).
    const reviewOffsets = dropSecondReview ? [2] : plenty ? [2, 6, 13] : [2, 6];
    for (const [n, offset] of reviewOffsets.entries()) {
      const target = indexOnOrAfter(addDays(mainDays[learnEnd].date, offset));
      let rIndex = target >= 0 ? findDay(target, w.review) : -1;
      if (rIndex < 0 && n === 0 && pIndex < lastMain) rIndex = findDay(pIndex + 1, w.review);
      if (rIndex < 0) continue; // Die Schlussphase wiederholt ohnehin alle Themen.
      mainDays[rIndex].used += w.review;
      task(mainDays[rIndex].date, "review", [w.topic.id], `Wiederholung: ${name}`, w.review);
    }
  }

  if (overflow) warnings.push("Nicht alles passt in deine Lernzeit – an einigen Tagen ist mehr geplant als eingetragen.");

  // Schlussphase
  const allIds = topics.map((t) => t.id);
  finalDays.forEach((d, i) => {
    if (i === 0) task(d.date, "mock_exam", allIds, "Probeklausur", Math.min(d.capacity, 120));
    else if (i === finalDays.length - 1 && finalDays.length > 2)
      task(d.date, "buffer", allIds, "Puffer: Offenes nachholen und locker wiederholen", d.capacity);
    else task(d.date, "review", allIds, "Wiederholung der unsichersten Themen", d.capacity);
  });
  if (finalCount === 0) warnings.push("Für eine Probeklausur bleibt vor der Prüfung keine Zeit.");

  return { tasks: sortTasks(tasks), warnings, requiredMinutes, availableMinutes };
}

// ---------- Umplanen ----------

/**
 * Verteilt alle offenen Aufgaben neu auf die Lerntage ab `today` – in ihrer
 * bisherigen Reihenfolge. Erledigtes bleibt, Probeklausur und Schlussphase
 * bleiben an ihrem Termin, sofern der noch nicht vorbei ist.
 */
export function redistribute(plan: StudyPlan, today: string): { tasks: PlanTask[]; warnings: string[] } {
  const days = studyDays(today, plan.examDate, plan.minutesPerWeekday);
  const fixed: PlanTask[] = [];
  const movable: PlanTask[] = [];
  for (const t of sortTasks(plan.tasks)) {
    const finalTask = t.type === "mock_exam" || t.type === "buffer" || t.topicIds.length > 1;
    const pinned = finalTask && t.date >= today && t.date < plan.examDate;
    if (t.status !== "open" || pinned) fixed.push(t);
    else movable.push(t);
  }
  if (days.length === 0) {
    return { tasks: plan.tasks, warnings: ["Bis zur Prüfung ist keine Lernzeit mehr eingetragen."] };
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const t of fixed) {
    const d = byDate.get(t.date);
    // Offene Termine und heute schon Erledigtes belegen Zeit.
    if (d && (t.status === "open" || (t.status === "done" && t.date === today))) d.used += t.minutes;
  }
  // Tage der Schlussphase (mit fest eingeplanter Probeklausur) nicht mit anderem füllen.
  const firstPinned = fixed.filter((t) => t.status === "open" && t.topicIds.length > 1).map((t) => t.date).sort()[0];
  const usable = firstPinned ? days.filter((d) => d.date < firstPinned) : days;
  const pool = usable.length > 0 ? usable : days;

  // Jede Aufgabe behält möglichst ihren Termin; Verpasstes rückt auf heute, und wo ein Tag voll ist,
  // rutscht die Aufgabe auf den nächsten freien Tag. Wiederholungen bleiben nach dem Lernen ihres Themas.
  let overflow = false;
  const lastByTopic = new Map<string, string>();
  const moved = movable.map((t) => {
    let target = t.date < today ? today : t.date;
    if (t.topicIds.length === 1) {
      const last = lastByTopic.get(t.topicIds[0]);
      if (last) {
        const minDate = t.type === "review" ? addDays(last, 1) : last;
        if (minDate > target) target = minDate;
      }
    }
    let index = pool.findIndex((d) => d.date >= target && free(d) >= t.minutes);
    if (index < 0) {
      index = pool.length - 1;
      overflow = true;
    }
    pool[index].used += t.minutes;
    if (t.topicIds.length === 1) lastByTopic.set(t.topicIds[0], pool[index].date);
    return { ...t, date: pool[index].date };
  });
  const warnings = overflow ? ["Bis zur Prüfung reicht die eingetragene Lernzeit nicht für alles Offene."] : [];
  return { tasks: sortTasks([...fixed, ...moved]), warnings };
}

/** Plant für schwache Themen eine Zusatzwiederholung in den nächsten Tagen ein. */
export function addExtraReviews(
  plan: StudyPlan,
  weakTopicIds: string[],
  fromDate: string,
  makeId: () => string,
): PlanTask[] {
  const tasks = [...plan.tasks];
  const days = studyDays(addDays(fromDate, 1), plan.examDate, plan.minutesPerWeekday);
  if (days.length === 0) return tasks;
  for (const d of days) d.used = tasks.filter((t) => t.date === d.date && t.status !== "skipped").reduce((s, t) => s + t.minutes, 0);
  const soon = addDays(fromDate, 4);
  for (const id of weakTopicIds) {
    const topic = plan.topics.find((t) => t.id === id);
    if (!topic) continue;
    const planned = tasks.some(
      (t) => t.status === "open" && t.type === "review" && t.topicIds.includes(id) && t.date > fromDate && t.date <= soon,
    );
    if (planned) continue;
    const minutes = 20;
    const day = days.find((d) => free(d) >= minutes) ?? days[0];
    day.used += minutes;
    tasks.push({
      id: makeId(),
      date: day.date,
      type: "review",
      topicIds: [id],
      title: `Zusatzwiederholung: ${topic.name}`,
      minutes,
      status: "open",
      extra: true,
    });
  }
  return sortTasks(tasks);
}

// ---------- Themenstand ----------

/** Ordnet einen Thema-Namen aus einer Frage einem Plan-Thema zu. */
export function matchTopic(name: string, topics: PlanTopic[]): PlanTopic | undefined {
  const n = normalizeText(name);
  if (!n) return undefined;
  return (
    topics.find((t) => normalizeText(t.name) === n) ??
    topics.find((t) => {
      const tn = normalizeText(t.name);
      return tn.length > 2 && (n.includes(tn) || tn.includes(n));
    })
  );
}

/** Ergebnis eines Durchlaufs pro Plan-Thema in Prozent. */
export function attemptTopicPercents(attempt: Attempt, test: Test, topics: PlanTopic[]): Map<string, number> {
  const sums = new Map<string, { score: number; max: number }>();
  for (const q of test.questions) {
    if (!attempt.questionIds.includes(q.id)) continue;
    const topic = matchTopic(q.topic, topics);
    const rec = attempt.answers[q.id];
    if (!topic || !rec?.checked || !rec.verdict) continue;
    const s = sums.get(topic.id) ?? { score: 0, max: 0 };
    s.score += rec.score;
    s.max += q.points;
    sums.set(topic.id, s);
  }
  return new Map([...sums].filter(([, s]) => s.max > 0).map(([id, s]) => [id, Math.round((s.score / s.max) * 100)]));
}

export interface TopicStatus {
  percent: number | null;
  /** Woher der Wert stammt: Einstufungstest oder Übung. */
  source: "placement" | "practice" | null;
  learned: boolean;
}

/** Aktueller Stand pro Thema: das jüngste Testergebnis zu diesem Thema. */
export function topicStatus(plan: StudyPlan, tests: Test[], attempts: Attempt[]): Map<string, TopicStatus> {
  // Der Einstufungstest steckt bereits in placementPercent.
  const planTests = new Map(
    tests.filter((t) => t.planId === plan.id && t.id !== plan.placementTestId).map((t) => [t.id, t]),
  );
  const finished = attempts
    .filter((a) => a.status === "finished" && planTests.has(a.testId))
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  const latest = new Map<string, number>();
  for (const a of finished) {
    for (const [id, pct] of attemptTopicPercents(a, planTests.get(a.testId)!, plan.topics)) latest.set(id, pct);
  }
  const result = new Map<string, TopicStatus>();
  for (const t of plan.topics) {
    const learned = plan.tasks.some((k) => k.type === "learn" && k.topicIds.includes(t.id)) &&
      plan.tasks.filter((k) => k.type === "learn" && k.topicIds.includes(t.id)).every((k) => k.status === "done");
    if (latest.has(t.id)) result.set(t.id, { percent: latest.get(t.id)!, source: "practice", learned });
    else if (t.placementPercent !== null) result.set(t.id, { percent: t.placementPercent, source: "placement", learned });
    else result.set(t.id, { percent: null, source: null, learned });
  }
  return result;
}

export function formatLongDate(iso: string): string {
  return parseISO(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
