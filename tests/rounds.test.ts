import { describe, expect, it } from "vitest";
import { parseListReply } from "../src/ai/partialJson";
import {
  CONTINUATION_RESERVE,
  QUESTIONS_PER_PART,
  doneList,
  generateInParts,
  partInstruction,
  partsNote,
  PartsError,
} from "../src/ai/rounds";
import type { GeneratedQuestion } from "../src/ai/schemas";
import { MAX_TEST_BYTES, splitTest } from "../src/lib/testParts";
import type { Question, Test } from "../src/types";

const raw = (n: number, extra: Record<string, unknown> = {}) => ({
  type: "free_text",
  prompt: `Aufgabe ${n}: Bilde den Buchungssatz für Geschäftsfall ${n}. $\\frac{${n}}{2}$`,
  options: [],
  correct_options: [],
  numeric_answer: null,
  numeric_tolerance: null,
  unit: null,
  accepted_answers: [],
  model_solution: `Lösung ${n}`,
  explanation: "",
  hint: null,
  topic: "Buchungssätze",
  difficulty: "medium",
  points: 2,
  source: `Übung ${Math.ceil(n / 10)}, Aufgabe ${n}`,
  solution_from_material: true,
  ...extra,
});

const reply = (from: number, to: number, fields: Record<string, unknown> = {}) =>
  JSON.stringify({ title: "SuK – Übungen", notes: "", ...fields, questions: range(from, to).map((n) => raw(n)) }, null, 2);

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Simuliert Claude: liefert ab der ersten noch fehlenden Aufgabe höchstens 25, bei `cut` abgeschnitten. */
function fakeClaude(total: number, opts: { cutFirst?: number } = {}) {
  const calls: string[] = [];
  const ask = async (instruction: string) => {
    calls.push(instruction);
    const done = [...instruction.matchAll(/Aufgabe (\d+)\b/g)].map((m) => Number(m[1]));
    const from = done.length ? Math.max(...done) + 1 : 1;
    const to = Math.min(total, from + QUESTIONS_PER_PART - 1);
    const text = reply(from, to, { more: to < total });
    if (calls.length === 1 && opts.cutFirst) return { text: text.slice(0, opts.cutFirst), truncated: true };
    return { text, truncated: false };
  };
  return { ask, calls };
}

describe("parseListReply", () => {
  it("liest vollständiges JSON, auch mit Code-Zaun", () => {
    const r = parseListReply("Hier:\n```json\n" + reply(1, 3) + "\n```", "questions");
    expect(r.complete).toBe(true);
    expect(r.items).toHaveLength(3);
    expect(r.fields.title).toBe("SuK – Übungen");
  });

  it("rettet bei abgeschnittener Antwort alle vollständigen Aufgaben", () => {
    const text = reply(1, 10, { more: true });
    const cut = text.slice(0, text.indexOf('"Aufgabe 8') + 30);
    const r = parseListReply(cut, "questions");
    expect(r.complete).toBe(false);
    expect(r.items.map((q) => Number(/Aufgabe (\d+)/.exec((q as { prompt: string }).prompt)![1]))).toEqual(range(1, 7));
    expect(r.fields.title).toBe("SuK – Übungen");
    expect(r.fields.more).toBe(true);
    // LaTeX bleibt erhalten
    expect((r.items[0] as { prompt: string }).prompt).toContain("\\frac{1}{2}");
  });

  it("repariert ungültige Backslashes und überspringt kaputte Einträge", () => {
    const text = `{"title":"T","questions":[{"prompt":"$\\sum_i x_i$"},{"prompt": "kaputt" "x"},{"prompt":"ok \\\\alpha"}]`;
    const r = parseListReply(text, "questions");
    expect(r.items.map((q) => (q as { prompt: string }).prompt)).toEqual(["$\\sum_i x_i$", "ok \\alpha"]);
  });

  it("nimmt auch eine reine Liste", () => {
    expect(parseListReply('[{"prompt":"a"},{"prompt":"b"},{"pro', "questions").items).toHaveLength(2);
  });
});

describe("generateInParts", () => {
  it("holt viele Originalaufgaben in mehreren Teilen ab – vollständig, in Reihenfolge, ohne Doppelte", async () => {
    const claude = fakeClaude(62, { cutFirst: reply(1, 25).indexOf('"Aufgabe 19') });
    const progress: number[] = [];
    const result = await generateInParts({ mode: "exact", questionCount: null }, async (instruction, state) => {
      progress.push(state.part);
      return claude.ask(instruction);
    });
    expect(result.questions.map((q) => Number(/Aufgabe (\d+)/.exec(q.prompt)![1]))).toEqual(range(1, 62));
    expect(result.incomplete).toBe(false);
    expect(result.title).toBe("SuK – Übungen");
    // 18 gerettete + 25 + 19
    expect(progress).toEqual([1, 2, 3]);
    // Teil 1 begrenzt den Umfang, ab Teil 2 steht die Fortsetzung mit den letzten Aufgaben drin
    expect(claude.calls[0]).toContain(`höchstens ${QUESTIONS_PER_PART} Aufgaben`);
    expect(claude.calls[1]).toContain("FORTSETZUNG (Teil 2)");
    expect(claude.calls[1]).toContain("Übung 2, Aufgabe 18");
    expect(partsNote(result)).toBe("");
  });

  it("ein Teil reicht, wenn Claude alles auf einmal liefert", async () => {
    const claude = fakeClaude(12);
    const result = await generateInParts({ mode: "exact", questionCount: null }, claude.ask);
    expect(result.parts).toBe(1);
    expect(result.questions).toHaveLength(12);
  });

  it("hört auf, wenn ein Teil nichts Neues bringt, und sagt das", async () => {
    let n = 0;
    const result = await generateInParts({ mode: "exact", questionCount: null }, async () => {
      n++;
      return { text: reply(1, 5, { more: true }), truncated: false };
    });
    expect(n).toBe(2);
    expect(result.questions).toHaveLength(5);
    expect(result.incomplete).toBe(true);
    expect(partsNote(result)).toContain("Übung 1, Aufgabe 5");
  });

  it("scheitert ein späterer Teil (z. B. Nutzungslimit), bleiben die fertigen Aufgaben erhalten", async () => {
    const claude = fakeClaude(80);
    const result = await generateInParts(
      { mode: "exact", questionCount: null },
      async (instruction, { part }) => {
        if (part === 3) throw { code: "rate_limited", message: "limit" };
        return claude.ask(instruction);
      },
      { describeError: () => "Nutzungslimit erreicht." },
    );
    expect(result.questions).toHaveLength(50);
    expect(result.incomplete).toBe(true);
    expect(partsNote(result)).toContain("Grund: Nutzungslimit erreicht.");
  });

  it("Abbrechen bricht wirklich ab", async () => {
    const claude = fakeClaude(80);
    const ctl = new AbortController();
    await expect(
      generateInParts(
        { mode: "exact", questionCount: null },
        async (instruction, { part }) => {
          if (part === 2) {
            ctl.abort();
            throw { code: "cancelled", message: "cancelled" };
          }
          return claude.ask(instruction);
        },
        { signal: ctl.signal },
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("neue Aufgaben: 40 Stück in zwei Teilen", async () => {
    const calls: string[] = [];
    const result = await generateInParts({ mode: "generated", questionCount: 40 }, async (instruction, { done }) => {
      calls.push(instruction);
      // Teil 2 liefert zwei zu viel – die werden abgeschnitten
      return { text: reply(done + 1, done === 0 ? 25 : done + 17), truncated: false };
    });
    expect(result.questions).toHaveLength(40);
    expect(calls[0]).toContain("zunächst nur 25 der 40");
    expect(calls[1]).toContain("15 weitere");
  });

  it("neue Aufgaben bis 25: wie bisher eine Anfrage ohne Zusatz", async () => {
    expect(partInstruction({ mode: "generated", questionCount: 10 }, [], 1)).toBe("");
  });

  it("unlesbare erste Antwort ergibt eine verständliche Fehlermeldung", async () => {
    await expect(
      generateInParts({ mode: "exact", questionCount: null }, async () => ({ text: "Entschuldigung, …", truncated: false })),
    ).rejects.toBeInstanceOf(PartsError);
  });
});

describe("doneList", () => {
  it("bleibt bei sehr vielen Aufgaben im Rahmen und nennt die letzten", () => {
    const done = range(1, 400).map((n) => raw(n)) as GeneratedQuestion[];
    const text = partInstruction({ mode: "exact", questionCount: null }, done, 5);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(CONTINUATION_RESERVE);
    expect(text).toContain("Übung 40, Aufgabe 400");
    expect(text).toContain("frühere Aufgaben");
    expect(doneList(done.slice(0, 3), 5000).split("\n")).toHaveLength(3);
  });
});

describe("splitTest", () => {
  const question = (n: number): Question => ({
    id: `q${n}`,
    type: "free_text",
    prompt: `Aufgabe ${n} ` + "Ausführlicher Aufgabentext. ".repeat(30),
    options: [],
    correctOptions: [],
    numericAnswer: null,
    numericTolerance: null,
    unit: null,
    acceptedAnswers: [],
    modelSolution: "Musterlösung mit Rechenweg. ".repeat(40),
    explanation: "",
    hint: null,
    topic: "Bilanz",
    difficulty: "medium",
    points: 2,
    source: `Aufgabe ${n}`,
    solutionFromMaterial: true,
  });
  const test = (count: number): Test => ({
    id: "t1",
    subjectId: "s1",
    title: "SuK – Übungen",
    mode: "exact",
    materialIds: [],
    settings: { mode: "exact", questionCount: null, difficulty: "mixed", allowedTypes: [], focus: "", exactFormat: "original" },
    questions: range(1, count).map(question),
    notes: "",
    createdAt: 1000,
    model: "x",
  });

  it("lässt normale Tests unverändert", () => {
    const t = test(20);
    expect(splitTest(t, () => "neu")).toEqual([t]);
  });

  it("eine einzelne riesige Frage bleibt ein Test", () => {
    const t = { ...test(1), questions: [{ ...test(1).questions[0], modelSolution: "x".repeat(300_000) }] };
    expect(splitTest(t, () => "neu")).toEqual([t]);
  });

  it("teilt sehr große Tests in Teile unter der Speichergrenze", () => {
    let id = 0;
    const parts = splitTest(test(300), () => `neu${++id}`);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThanOrEqual(MAX_TEST_BYTES);
    expect(parts.flatMap((p) => p.questions.map((q) => q.id))).toEqual(range(1, 300).map((n) => `q${n}`));
    expect(parts[0].id).toBe("t1");
    expect(parts[0].title).toBe(`SuK – Übungen (Teil 1 von ${parts.length})`);
    // Neueste zuerst: Teil 1 steht oben
    expect([...parts].sort((a, b) => b.createdAt - a.createdAt)[0].id).toBe("t1");
    const sizes = parts.map((p) => p.questions.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(parts.length);
  });
});
