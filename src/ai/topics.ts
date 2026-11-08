import type { PlanTopic } from "../types";
import { matchTopic } from "../lib/planner";
import type { GeneratedTopic } from "./schemas";

/** Wandelt Claudes Themenliste in Plan-Themen um (Voraussetzungen als IDs). */
export function toPlanTopics(generated: GeneratedTopic[], makeId: () => string): PlanTopic[] {
  const seen = new Set<string>();
  const topics: PlanTopic[] = [];
  for (const g of generated) {
    const name = g.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    topics.push({
      id: makeId(),
      name,
      description: g.description.trim(),
      estimatedMinutes: Math.min(600, Math.max(15, Math.round((g.estimated_minutes || 60) / 5) * 5)),
      importance: g.importance,
      prerequisites: [],
      sources: g.sources.trim(),
      placementPercent: null,
    });
  }
  const resolved = new Set<string>();
  generated.forEach((g) => {
    const topic = topics.find((t) => t.name === g.name.trim());
    // Doppelte Einträge überschreiben die Voraussetzungen des ersten nicht.
    if (!topic || resolved.has(topic.id)) return;
    resolved.add(topic.id);
    topic.prerequisites = g.prerequisites
      .map((p) => matchTopic(p, topics)?.id)
      .filter((id): id is string => !!id && id !== topic.id);
  });
  return topics;
}

/** Themen ohne KI: aus einer Liste von Namen (eine Zeile pro Thema, optional „Name – Beschreibung“). */
export function manualTopics(lines: string[], makeId: () => string): PlanTopic[] {
  return toPlanTopics(
    lines
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
      .filter(Boolean)
      .map((l) => {
        const [name, ...rest] = l.split(/\s+[–-]\s+/);
        return {
          name,
          description: rest.join(" – "),
          estimated_minutes: 60,
          importance: "medium" as const,
          prerequisites: [],
          sources: "",
        };
      }),
    makeId,
  );
}

/** Zerlegt die manuelle Eingabe in Themennamen (für die KI-Ergänzung). */
export function parseTopicLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}
