import { describe, expect, it } from "vitest";
import { buildExplainFollowUp, buildExplainTask, explainHistoryText, explainSystemPrompt } from "../src/ai/prompts";
import {
  basisLabel,
  locateAnchor,
  makeAnchor,
  marksAppendix,
  parseExplanation,
  sameAnchor,
  streamingText,
} from "../src/lib/noteMarks";
import type { NoteMark } from "../src/types";

describe("Stellen wiederfinden", () => {
  const text = "Die AfA ist linear. Später: Die AfA ist degressiv. Am Ende: Die AfA ist linear.";

  it("findet eine eindeutige Stelle", () => {
    const start = text.indexOf("linear");
    const a = makeAnchor(text, start, start + 6);
    expect(locateAnchor(text, a)).toEqual({ start, end: start + 6 });
  });

  it("unterscheidet gleiche Stellen am Text davor und danach", () => {
    const second = text.lastIndexOf("Die AfA ist linear");
    const a = makeAnchor(text, second, second + 18);
    expect(locateAnchor(text, a)).toEqual({ start: second, end: second + 18 });
    const first = text.indexOf("Die AfA ist linear");
    expect(locateAnchor(text, makeAnchor(text, first, first + 18))).toEqual({ start: first, end: first + 18 });
  });

  it("findet die Stelle auch, wenn sich die Umgebung geändert hat", () => {
    const start = text.indexOf("degressiv");
    const a = makeAnchor(text, start, start + 9);
    const changed = `Neuer Anfang. ${text.replace("Später:", "Danach:")}`;
    expect(changed.slice(locateAnchor(changed, a)!.start, locateAnchor(changed, a)!.end)).toBe("degressiv");
  });

  it("ignoriert geänderten Leerraum", () => {
    const original = "Eins\nzwei drei";
    const a = makeAnchor(original, 0, original.length);
    const now = "Vorher. Eins zwei  drei. Nachher.";
    const at = locateAnchor(now, a)!;
    expect(now.slice(at.start, at.end)).toBe("Eins zwei  drei");
  });

  it("liefert null, wenn es die Stelle nicht mehr gibt", () => {
    expect(locateAnchor("ganz anderer Text", makeAnchor(text, 0, 7))).toBeNull();
    expect(locateAnchor(text, { exact: "  ", prefix: "", suffix: "" })).toBeNull();
  });

  it("erkennt dieselbe Stelle", () => {
    const a = makeAnchor(text, 4, 7);
    expect(sameAnchor(a, makeAnchor(text, 4, 7))).toBe(true);
    expect(sameAnchor(a, makeAnchor(text, 32, 35))).toBe(false);
  });
});

describe("Claudes Erklärung auswerten", () => {
  it("liest die Grundlage und entfernt die Zeile", () => {
    const r = parseExplanation("**Kurz gesagt:** Kosten verteilen.\n\nBeispiel …\n\nGRUNDLAGE: material, wissen");
    expect(r.content).toBe("**Kurz gesagt:** Kosten verteilen.\n\nBeispiel …");
    expect(r.basis).toEqual(["material", "wissen"]);
  });

  it("versteht Varianten (fett, Großschreibung, Internet, Trennlinie davor)", () => {
    const r = parseExplanation("Text\n\n---\n\n**Grundlage:** Wissen + Internet");
    expect(r.content).toBe("Text");
    expect(r.basis).toEqual(["wissen", "internet"]);
  });

  it("ohne Grundlage-Zeile bleibt der Text unverändert", () => {
    expect(parseExplanation("```markdown\nNur Text\n```")).toEqual({ content: "Nur Text", basis: undefined });
  });

  it("blendet die angefangene Grundlage-Zeile beim Schreiben aus", () => {
    expect(streamingText("Erklärung\n\nGRUND")).toBe("Erklärung");
    expect(streamingText("Erklärung\n\nGRUNDLAGE: mat")).toBe("Erklärung");
    expect(streamingText("Erklärung\n\nGrund genug")).toBe("Erklärung\n\nGrund genug");
    expect(streamingText("Erklärung\n\n---\nGR")).toBe("Erklärung");
  });

  it("beschreibt die Herkunft", () => {
    expect(basisLabel(["material"])).toEqual({ text: "Aus deinem Material", tone: "material" });
    expect(basisLabel(["material", "wissen", "internet"])?.text).toBe("Aus deinem Material, ergänzt mit Claudes Wissen und Internetsuche");
    expect(basisLabel(["wissen"])).toEqual({ text: "Nicht aus deinem Material – aus Claudes Fachwissen", tone: "other" });
    expect(basisLabel(["internet"])?.text).toBe("Nicht aus deinem Material – aus dem Internet");
    expect(basisLabel(undefined)).toBeNull();
  });
});

describe("Anhang für den Download", () => {
  const mark = (over: Partial<NoteMark>): NoteMark => ({
    id: "m",
    noteId: "n1",
    subjectId: "s1",
    quote: "Stelle",
    anchor: { exact: "Stelle", prefix: "", suffix: "" },
    level: "forgot",
    messages: [],
    createdAt: 0,
    ...over,
  });

  it("enthält nur erklärte Stellen, mit Nachfragen, Herkunft und Links", () => {
    const md = marksAppendix([
      mark({
        quote: "Zeile 1\nZeile 2",
        messages: [
          { role: "assistant", content: "Erklärung A", basis: ["material"], at: 1 },
          { role: "user", content: "Und\nwarum?", at: 2 },
          { role: "assistant", content: "Antwort B", basis: ["internet"], links: [{ url: "https://x.de/a", title: "" }], at: 3 },
        ],
      }),
      mark({ id: "n", level: "unsure", messages: [] }),
      mark({ id: "o", level: "unsure", quote: "$a^2$", messages: [{ role: "assistant", content: "Erklärung C", at: 4 }] }),
    ]);
    expect(md).toBe(
      [
        "## Deine markierten Stellen",
        "",
        "### 1. Weiß ich nicht mehr",
        "",
        "> Zeile 1\n> Zeile 2",
        "",
        "Erklärung A",
        "",
        "*Aus deinem Material*",
        "",
        "**Deine Nachfrage:** Und warum?",
        "",
        "Antwort B",
        "",
        "*Nicht aus deinem Material – aus dem Internet*",
        "",
        "- [https://x.de/a](https://x.de/a)",
        "",
        "### 2. Bin unsicher",
        "",
        "> $a^2$",
        "",
        "Erklärung C",
      ].join("\n"),
    );
  });

  it("ist leer ohne erklärte Stellen", () => {
    expect(marksAppendix([])).toBe("");
    expect(marksAppendix([mark({})])).toBe("");
  });
});

describe("Prompts zum Erklären", () => {
  const params = { subjectName: "ReWe", noteTitle: "AfA", noteContent: "# AfA\n\nText", quote: "Text", hasMaterials: true };

  it("Tiefe je nach Markierung", () => {
    expect(buildExplainTask({ ...params, level: "forgot" })).toContain("Die Person weiß das nicht mehr");
    expect(buildExplainTask({ ...params, level: "unsure" })).toContain("ist sich aber unsicher");
    expect(buildExplainTask({ ...params, level: "unsure" })).toContain("<markiert>\nText\n</markiert>");
  });

  it("ohne Material aus Fachwissen", () => {
    expect(buildExplainTask({ ...params, level: "forgot", hasMaterials: false })).toContain("kein Material vor");
    expect(buildExplainTask({ ...params, level: "forgot" })).not.toContain("kein Material vor");
  });

  it("Websuche nur, wenn verfügbar", () => {
    expect(explainSystemPrompt({ webSearch: true })).toContain("Websuche");
    expect(explainSystemPrompt({ webSearch: false })).not.toMatch(/Websuche|internet/);
  });

  it("bisheriges Gespräch als Text", () => {
    expect(explainHistoryText([])).toBe("");
    const h = explainHistoryText([
      { role: "assistant", content: "Erklärung" },
      { role: "user", content: "Warum?" },
    ]);
    expect(h).toContain("<deine_antwort>\nErklärung\n</deine_antwort>");
    expect(h).toContain(buildExplainFollowUp("Warum?"));
  });
});
