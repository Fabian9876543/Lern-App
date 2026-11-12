import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatMonth,
  monthGrid,
  addDays,
  addExtraReviews,
  attemptTopicPercents,
  daysBetween,
  effectiveMinutes,
  finalPhaseLength,
  matchTopic,
  orderTopics,
  redistribute,
  schedulePlan,
  weekdayOf,
} from "../src/lib/planner";
import type { Attempt, PlanTopic, Question, StudyPlan, Test } from "../src/types";

let n = 0;
const makeId = () => `id${++n}`;

function topic(id: string, partial: Partial<PlanTopic> = {}): PlanTopic {
  return {
    id,
    name: `Thema ${id}`,
    description: "",
    estimatedMinutes: 60,
    importance: "medium",
    prerequisites: [],
    sources: "",
    placementPercent: null,
    ...partial,
  };
}

// Mo–Fr 60 Min., Sa 120, So frei
const WEEK = [0, 60, 60, 60, 60, 60, 120];

describe("Datum", () => {
  it("rechnet mit lokalen Kalendertagen", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // Zeitumstellung
    expect(daysBetween("2026-11-08", "2026-12-01")).toBe(23);
    expect(weekdayOf("2026-11-08")).toBe(0); // Sonntag
  });
});

describe("Einstufung", () => {
  it("verkürzt die Lernzeit bei guten Ergebnissen", () => {
    expect(effectiveMinutes(topic("a", { placementPercent: null }))).toBe(60);
    expect(effectiveMinutes(topic("a", { placementPercent: 90 }))).toBe(20);
    expect(effectiveMinutes(topic("a", { placementPercent: 70 }))).toBe(35);
    expect(effectiveMinutes(topic("a", { placementPercent: 20 }))).toBe(60);
  });
});

describe("orderTopics", () => {
  it("stellt Voraussetzungen nach vorne und behält sonst die Reihenfolge", () => {
    const order = orderTopics([topic("c", { prerequisites: ["b"] }), topic("a"), topic("b", { prerequisites: ["a"] })]);
    expect(order.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("kommt mit zirkulären Voraussetzungen zurecht", () => {
    const order = orderTopics([topic("a", { prerequisites: ["b"] }), topic("b", { prerequisites: ["a"] })]);
    expect(order.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });
});

describe("schedulePlan", () => {
  const base = { startDate: "2026-11-09", examDate: "2026-12-07", minutesPerWeekday: WEEK, makeId };

  it("plant Lernen, Übung, Wiederholungen und Schlussphase innerhalb der Lernzeit", () => {
    const result = schedulePlan({ ...base, topics: [topic("a"), topic("b"), topic("c")] });
    expect(result.warnings).toEqual([]);
    const types = result.tasks.map((t) => t.type);
    expect(types.filter((t) => t === "learn").length).toBeGreaterThanOrEqual(3);
    expect(types.filter((t) => t === "practice")).toHaveLength(3);
    expect(types.filter((t) => t === "review").length).toBeGreaterThanOrEqual(6);
    expect(types).toContain("mock_exam");
    // keine Aufgabe an Sonntagen oder am Prüfungstag
    for (const t of result.tasks) {
      expect(weekdayOf(t.date)).not.toBe(0);
      expect(t.date < base.examDate).toBe(true);
    }
    // Tageskapazität wird eingehalten
    const perDay = new Map<string, number>();
    for (const t of result.tasks) perDay.set(t.date, (perDay.get(t.date) ?? 0) + t.minutes);
    for (const [date, minutes] of perDay) expect(minutes).toBeLessThanOrEqual(WEEK[weekdayOf(date)]);
  });

  it("legt Übung nach dem Lernen und Wiederholungen mit Abstand", () => {
    const result = schedulePlan({ ...base, topics: [topic("a")] });
    const learnEnd = result.tasks.filter((t) => t.type === "learn").map((t) => t.date).sort().pop()!;
    const practice = result.tasks.find((t) => t.type === "practice")!;
    const reviews = result.tasks.filter((t) => t.type === "review" && t.title.startsWith("Wiederholung: "));
    expect(practice.date >= learnEnd).toBe(true);
    const offsets = reviews.map((r) => daysBetween(learnEnd, r.date));
    expect(offsets[0]).toBe(2);
    // +6 fällt auf einen Sonntag ohne Lernzeit → nächster Lerntag
    expect(offsets[1]).toBe(7);
    expect(offsets[2]).toBeGreaterThanOrEqual(13);
  });

  it("verteilt die Themen bei viel Zeit über den ganzen Zeitraum", () => {
    const result = schedulePlan({ ...base, topics: [topic("a"), topic("b"), topic("c"), topic("d")] });
    const learnDates = result.tasks.filter((t) => t.type === "learn").map((t) => t.date).sort();
    // Das letzte Thema beginnt erst in der zweiten Hälfte des Zeitraums.
    expect(daysBetween(base.startDate, learnDates[learnDates.length - 1])).toBeGreaterThan(10);
    // Es bleibt Zeit für eine dritte Wiederholung.
    const reviewsA = result.tasks.filter((t) => t.title === "Wiederholung: Thema a");
    expect(reviewsA).toHaveLength(3);
  });

  it("teilt lange Themen auf mehrere Tage auf", () => {
    const result = schedulePlan({ ...base, topics: [topic("a", { estimatedMinutes: 150 })] });
    const parts = result.tasks.filter((t) => t.type === "learn");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].title).toContain("Teil 1/");
    expect(parts.reduce((s, t) => s + t.minutes, 0)).toBe(150);
  });

  it("warnt bei zu wenig Zeit und kürzt", () => {
    const topics = Array.from({ length: 10 }, (_, i) => topic(`t${i}`, { estimatedMinutes: 180 }));
    const result = schedulePlan({ ...base, examDate: "2026-11-16", topics });
    expect(result.warnings.join(" ")).toContain("Zeit ist knapp");
    expect(result.requiredMinutes).toBeGreaterThan(result.availableMinutes);
  });

  it("meldet fehlende Lernzeit", () => {
    const result = schedulePlan({ ...base, minutesPerWeekday: [0, 0, 0, 0, 0, 0, 0], topics: [topic("a")] });
    expect(result.tasks).toEqual([]);
    expect(result.warnings[0]).toContain("keine Lernzeit");
  });

  it("reserviert die Schlussphase passend zur Länge", () => {
    expect(finalPhaseLength(2)).toBe(0);
    expect(finalPhaseLength(5)).toBe(1);
    expect(finalPhaseLength(24)).toBe(3);
  });
});

function plan(partial: Partial<StudyPlan>): StudyPlan {
  return {
    id: "p",
    subjectId: "s",
    title: "Plan",
    examDate: "2026-12-07",
    startDate: "2026-11-09",
    minutesPerWeekday: WEEK,
    materialIds: [],
    focus: "",
    topics: [topic("a"), topic("b")],
    tasks: [],
    status: "active",
    notes: "",
    warnings: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("redistribute", () => {
  it("verschiebt verpasste Aufgaben ab heute und lässt Erledigtes stehen", () => {
    const p = plan({});
    const scheduled = schedulePlan({ ...p, topics: p.topics, makeId }).tasks;
    const done = { ...scheduled[0], status: "done" as const };
    const tasks = [done, ...scheduled.slice(1)];
    const today = "2026-11-16";
    const result = redistribute({ ...p, tasks }, today);
    expect(result.tasks.find((t) => t.id === done.id)!.date).toBe(done.date);
    for (const t of result.tasks.filter((t) => t.status === "open")) expect(t.date >= today).toBe(true);
    expect(result.tasks).toHaveLength(tasks.length);
    const mock = result.tasks.find((t) => t.type === "mock_exam")!;
    expect(mock.date).toBe(scheduled.find((t) => t.type === "mock_exam")!.date);
  });

  it("zählt heute Erledigtes mit und überfüllt keinen Tag", () => {
    const today = "2026-11-10"; // Dienstag, 60 Min.
    const p = plan({
      tasks: [
        { id: "d", date: today, type: "learn", topicIds: ["a"], title: "a lernen", minutes: 40, status: "done" },
        { id: "o1", date: "2026-11-09", type: "learn", topicIds: ["b"], title: "b lernen", minutes: 30, status: "open" },
        { id: "o2", date: "2026-11-09", type: "practice", topicIds: ["b"], title: "Übung b", minutes: 15, status: "open" },
      ],
    });
    const result = redistribute(p, today);
    const perDay = new Map<string, number>();
    for (const t of result.tasks) perDay.set(t.date, (perDay.get(t.date) ?? 0) + t.minutes);
    expect(perDay.get(today)).toBeLessThanOrEqual(60);
    expect(result.tasks.find((t) => t.id === "o1")!.date).toBe("2026-11-11");
    expect(result.tasks.find((t) => t.id === "o2")!.date >= "2026-11-11").toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("behält künftige Termine und legt Wiederholungen desselben Themas nie auf einen Tag", () => {
    const p = plan({ examDate: "2026-12-07" });
    const scheduled = schedulePlan({ ...p, topics: p.topics, makeId }).tasks;
    const today = "2026-11-12";
    const result = redistribute({ ...p, tasks: scheduled }, today);
    // Aufgaben nach heute, die schon passten, bleiben, wo sie waren (es sei denn, Verpasstes braucht ihren Platz).
    const futureUnchanged = scheduled
      .filter((t) => t.date > "2026-11-20")
      .every((t) => result.tasks.find((r) => r.id === t.id)!.date === t.date);
    expect(futureUnchanged).toBe(true);
    for (const id of ["a", "b"]) {
      const dates = result.tasks.filter((t) => t.type === "review" && t.topicIds.length === 1 && t.topicIds[0] === id).map((t) => t.date);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
});

describe("addExtraReviews", () => {
  it("ergänzt eine Wiederholung für schwache Themen, aber nicht doppelt", () => {
    const p = plan({ tasks: [] });
    const once = addExtraReviews(p, ["a"], "2026-11-10", makeId);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ type: "review", extra: true, topicIds: ["a"] });
    expect(once[0].date > "2026-11-10").toBe(true);
    const twice = addExtraReviews({ ...p, tasks: once }, ["a"], "2026-11-10", makeId);
    expect(twice).toHaveLength(1);
  });
});

describe("Themenstand", () => {
  const topics = [topic("a", { name: "Ableitungen" }), topic("b", { name: "Integrale" })];

  it("ordnet Themennamen tolerant zu", () => {
    expect(matchTopic("ableitungen", topics)?.id).toBe("a");
    expect(matchTopic("Integrale (bestimmt)", topics)?.id).toBe("b");
    expect(matchTopic("Vektoren", topics)).toBeUndefined();
  });

  it("berechnet Prozent pro Thema aus einem Durchlauf", () => {
    const q = (id: string, t: string, points: number) => ({ id, topic: t, points }) as Question;
    const test = { id: "t", questions: [q("1", "Ableitungen", 2), q("2", "Ableitungen", 2), q("3", "Integrale", 1)] } as Test;
    const rec = (score: number, max: number) => ({ response: {}, checked: true, score, maxScore: max, verdict: score === max ? "correct" : "wrong" }) as const;
    const attempt = {
      questionIds: ["1", "2", "3"],
      answers: { "1": rec(2, 2), "2": rec(0, 2), "3": rec(1, 1) },
    } as unknown as Attempt;
    const result = attemptTopicPercents(attempt, test, topics);
    expect(result.get("a")).toBe(50);
    expect(result.get("b")).toBe(100);
  });
});

describe("Kalender", () => {
  it("zeigt volle Wochen von Montag bis Sonntag", () => {
    const nov = monthGrid("2026-11"); // 1.11.2026 ist ein Sonntag
    expect(nov[0]).toBe("2026-10-26");
    expect(nov.at(-1)).toBe("2026-12-06");
    expect(nov).toHaveLength(42);
    const feb = monthGrid("2027-02"); // 1.2.2027 ist ein Montag, 28.2. ein Sonntag
    expect(feb[0]).toBe("2027-02-01");
    expect(feb.at(-1)).toBe("2027-02-28");
    expect(feb).toHaveLength(28);
  });

  it("blättert über Jahresgrenzen", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(formatMonth("2026-11")).toBe("November 2026");
  });
});
