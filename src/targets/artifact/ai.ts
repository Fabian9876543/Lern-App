import { useSyncExternalStore } from "react";
import { coerceExamAnalysis, coerceGrading, coerceMaterialName, coerceNoteFix, coerceTopicAnalysis } from "../../ai/coerce";
import { countJsonKey, countQuestions, describeCorrectAnswer, normalizeQuestions, orderQuestions } from "../../ai/normalize";
import { CONTINUATION_RESERVE, generateInParts, partsNote } from "../../ai/rounds";
import {
  GRADING_JSON_FORMAT,
  GRADING_SYSTEM_PROMPT,
  MATERIAL_NAME_JSON_FORMAT,
  MATERIAL_NAME_PROMPT,
  materialNameUserText,
  TEST_JSON_FORMAT,
  TOPIC_JSON_FORMAT,
  MATERIAL_NOTE_SYSTEM_PROMPT,
  STUDY_NOTE_SYSTEM_PROMPT,
  buildMaterialNoteInstruction,
  splitNoteTitle,
  TOPIC_SYSTEM_PROMPT,
  buildStudyNoteInstruction,
  buildTaskInstruction,
  buildTopicInstruction,
  buildExplainTask,
  buildNoteFixTask,
  NOTE_FIX_JSON_FORMAT,
  NOTE_FIX_SYSTEM_PROMPT,
  buildExamAnalysisInstruction,
  EXAM_ANALYSIS_JSON_FORMAT,
  EXAM_ANALYSIS_SYSTEM_PROMPT,
  cleanStudyNote,
  explainHistoryText,
  explainSystemPrompt,
  generationSystemPrompt,
  gradingUserText,
  splitTranscript,
  transcribePrompt,
} from "../../ai/prompts";
import type { GeneratedExamAnalysis, TopicAnalysis } from "../../ai/schemas";
import { ROLE_LABELS } from "../../lib/files";
import { verdictFromScore } from "../../lib/grading";
import { newId } from "../../lib/ids";
import { ModuleLoadError } from "../../lib/lazyImport";
import { closePdf, openPdf, pageText, renderPage } from "../../lib/pdf";
import { assembleTranscript, chooseForTranscription, inBatches, type Segment } from "../../lib/transcribe";
import { byteLength, makeExcerpt, wrapMaterial, type ExcerptStrategy, type SourceMaterial } from "../../lib/excerpt";
import { TIERS, getSettings } from "../../settings";
import type { AnswerResponse, Material, Question, Test } from "../../types";
import { formatLongDate } from "../../lib/planner";
import { parseExplanation } from "../../lib/noteMarks";
import type { MaterialRole } from "../../types";
import type {
  AiGrade,
  AiStatus,
  ExamAnalysisParams,
  ExplainParams,
  ExplainResult,
  NoteFix,
  NoteFixParams,
  GenerateParams,
  GenerationProgress,
  MaterialNameParams,
  MaterialNoteParams,
  StudyNoteParams,
  TopicAnalysisParams,
} from "../types";
import { artifactBackend } from "./storage";
import { isSampleError, useCapability, type SampleFn } from "./claude";

export class AiResponseError extends Error {}

// ---------- Verfügbarkeit ----------

let status: AiStatus = { state: "checking" };
const listeners = new Set<() => void>();
let samplePromise: Promise<SampleFn | null> | null = null;

function getSample(): Promise<SampleFn | null> {
  samplePromise ??= useCapability("sample").then((s) => {
    status = s
      ? { state: "ready" }
      : {
          state: "unavailable",
          reason: "Claude ist hier nicht verfügbar. Öffne die Lern-App angemeldet in claude.ai.",
        };
    listeners.forEach((l) => l());
    return s;
  });
  return samplePromise;
}

export function aiStatus(): AiStatus {
  void getSample();
  return status;
}

export function useAiStatus(): AiStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void getSample();
      return () => listeners.delete(l);
    },
    () => status,
  );
}

async function requireSample(): Promise<SampleFn> {
  const sample = await getSample();
  if (!sample) throw new AiResponseError(status.reason ?? "Claude ist hier nicht verfügbar.");
  return sample;
}

// ---------- Material aufbereiten ----------

/** PDF-Seiten mit weniger Text gelten als eingescannt und werden als Bild geschickt. */
const SCANNED_PAGE_TEXT_LIMIT = 40;

interface PreparedMaterials {
  sources: SourceMaterial[];
  images: Blob[];
}

/** Höchstens so viele Bilder pro Abschreib-Anfrage – kleinere Portionen halten die Antworten vollständig. */
const TRANSCRIBE_BATCH = 6;

interface PrepareOptions {
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

interface TranscribeOptions extends PrepareOptions {
  batchSize: number;
  onPages: (n: number) => void;
}

/** Zerlegt ein Material in Text- und Bildabschnitte (abgeschriebener Text ersetzt die Bilder). */
async function segmentsOf(m: Material): Promise<Segment[]> {
  const stored = m.kind === "text" ? null : await loadTranscript(m);
  if (stored) return [{ kind: "text", text: stored }];
  if (m.kind === "text") {
    const text = m.text ?? (await (await artifactBackend.loadMaterialBlob(m))?.text());
    if (text === undefined) throw new AiResponseError(`„${m.name}“ konnte nicht geladen werden.`);
    return [{ kind: "text", text }];
  }
  const blob = await artifactBackend.loadMaterialBlob(m);
  if (!blob) throw new AiResponseError(`„${m.name}“ konnte nicht geladen werden.`);
  if (m.kind === "image") return [{ kind: "image", image: blob }];
  // PDF: Text auslesen, eingescannte Seiten als Bild.
  let doc;
  try {
    doc = await openPdf(blob);
  } catch (e) {
    if (e instanceof ModuleLoadError) throw new AiResponseError(e.message);
    throw new AiResponseError(`Die PDF „${m.name}“ konnte nicht gelesen werden.`);
  }
  const segments: Segment[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const text = await pageText(doc, p);
    if (text.replace(/\s/g, "").length >= SCANNED_PAGE_TEXT_LIMIT) segments.push({ kind: "text", text, page: p });
    else segments.push({ kind: "image", image: await renderPage(doc, p), page: p });
  }
  await closePdf(doc);
  return segments;
}

async function loadTranscript(m: Material): Promise<string | null> {
  if (m.transcript !== undefined) return m.transcript;
  if (!m.transcriptAssetId) return null;
  const blob = await artifactBackend.loadMaterialBlob({ ...m, kind: "text", assetId: m.transcriptAssetId, text: undefined });
  return blob ? blob.text() : null;
}

/** Lässt Claude die Bilder eines Materials abschreiben – in Portionen, bei abgeschnittener Antwort kleiner. */
async function transcribeImages(
  sample: SampleFn,
  m: Material,
  images: { image: Blob; page?: number }[],
  opts: TranscribeOptions,
): Promise<string[]> {
  const out: string[] = [];
  const run = async (batch: { image: Blob; page?: number }[]): Promise<string[]> => {
    const result = await sample(transcribePrompt(m.name, batch.map((b) => b.page)), {
      modelTier: "default",
      images: batch.map((b) => b.image),
      signal: opts.signal,
    });
    if (result.truncated && batch.length > 1) {
      const half = Math.ceil(batch.length / 2);
      return [...(await run(batch.slice(0, half))), ...(await run(batch.slice(half)))];
    }
    opts.onPages(batch.length);
    return splitTranscript(result.text, batch.length);
  };
  for (const batch of inBatches(images, opts.batchSize)) out.push(...(await run(batch)));
  return out;
}

/**
 * Bereitet die Materialien für eine Anfrage auf. Passen die Bilder nicht in
 * eine Anfrage, werden die bildreichsten Materialien vorher abgeschrieben und
 * der Text am Material gespeichert – danach gehen beliebig viele Seiten.
 */
async function prepareMaterials(sample: SampleFn, materials: Material[], opts: PrepareOptions = {}): Promise<PreparedMaterials> {
  // Nacheinander – viele PDFs gleichzeitig zu öffnen kostet unnötig Speicher.
  const all: { m: Material; segments: Segment[] }[] = [];
  for (const m of materials) all.push({ m, segments: await segmentsOf(m) });
  const imageCount = (segs: Segment[]) => segs.filter((s) => s.kind === "image").length;
  const total = all.reduce((sum, x) => sum + imageCount(x.segments), 0);

  if (total > 0) {
    const limits = await sample.limits().catch(() => null);
    const maxImages = limits?.images?.maxCount ?? 0;
    if (maxImages === 0) {
      throw new AiResponseError(
        "In dieser Ansicht können keine Bilder an Claude geschickt werden. Nutze PDFs mit Text oder Textdateien.",
      );
    }
    const chosen = new Set(chooseForTranscription(all.map((x) => ({ id: x.m.id, images: imageCount(x.segments) })), maxImages));
    if (chosen.size) {
      const { repo } = await import("../../store/store");
      const pagesTotal = all.filter((x) => chosen.has(x.m.id)).reduce((sum, x) => sum + imageCount(x.segments), 0);
      let pagesDone = 0;
      opts.onProgress?.({ phase: "transcribing", questionsSoFar: 0, pagesDone, pagesTotal });
      for (const x of all) {
        if (!chosen.has(x.m.id)) continue;
        const images = x.segments.filter((s): s is Extract<Segment, { kind: "image" }> => s.kind === "image");
        const texts = await transcribeImages(sample, x.m, images, {
          ...opts,
          batchSize: Math.min(TRANSCRIBE_BATCH, maxImages),
          onPages: (n) => {
            pagesDone += n;
            opts.onProgress?.({ phase: "transcribing", questionsSoFar: 0, pagesDone, pagesTotal });
          },
        });
        const transcript = assembleTranscript(x.segments, texts);
        await repo.saveTranscript(x.m.id, transcript);
        x.segments = [{ kind: "text", text: transcript }];
      }
    }
  }

  const sources: SourceMaterial[] = [];
  const images: Blob[] = [];
  for (const [index, { m, segments }] of all.entries()) {
    const label = `Material ${index + 1}: „${m.name}“ – Rolle: ${ROLE_LABELS[m.role]}`;
    const body = segments
      .map((s) => {
        let content: string;
        if (s.kind === "text") content = s.text;
        else {
          images.push(s.image);
          content =
            s.page !== undefined
              ? `[eingescannte Seite: Bild ${images.length} – siehe beigefügte Bilder]`
              : `[Bild ${images.length} – siehe beigefügte Bilder]`;
        }
        return s.page !== undefined ? `--- Seite ${s.page} ---\n${content}` : content;
      })
      .join("\n\n");
    sources.push({ label, role: m.role, body });
  }
  return { sources, images };
}

/** Puffer für die Hinweiszeile zum Auszug und Rundung. */
const SECTION_RESERVE = 2048;

/**
 * Baut den Prompt mit dem Material-Teil. Passt die Auswahl nicht in eine
 * Anfrage (256 KB Text), kommt ein Auszug hinein – ausgewählt nach `strategy`.
 */
async function promptWithMaterials(
  sample: SampleFn,
  prepared: PreparedMaterials,
  build: (section: string) => string,
  strategy: ExcerptStrategy,
  /** Platz, der für spätere Zusätze frei bleiben muss (z. B. Fortsetzungs-Anweisungen) */
  reserve = 0,
): Promise<{ prompt: string; section: string; note: string | null }> {
  if (prepared.sources.length === 0) return { prompt: build(""), section: "", note: null };
  const limits = await sample.limits().catch(() => null);
  const maxBytes = limits?.maxPromptBytes ?? 262_144;
  const imageLine = prepared.images.length
    ? `\nDazu sind ${prepared.images.length} Bilder beigefügt, nummeriert in der Reihenfolge, in der sie oben erwähnt werden.\n`
    : "";
  const section = (parts: { label: string; body: string }[], note: string | null) =>
    `<materialien>\n${note ? `Hinweis: ${note} „[…]“ markiert ausgelassene Stellen.\n\n` : ""}${parts
      .map((p) => wrapMaterial(p.label, p.body))
      .join("\n\n")}\n</materialien>\n${imageLine}\n`;
  const budget = maxBytes - byteLength(build(section([], null))) - SECTION_RESERVE - reserve;
  const excerpt = makeExcerpt(prepared.sources, budget, strategy);
  const text = section(excerpt.parts, excerpt.note);
  return { prompt: build(text), section: text, note: excerpt.note };
}

/** Wie der Auszug für einen Test gewählt wird. */
function testStrategy(settings: GenerateParams["settings"]): ExcerptStrategy {
  if (settings.mode === "exact") return { kind: "prefix" };
  const query = [...(settings.topicNames ?? []), settings.focus].join(" ").trim();
  if (query) return { kind: "relevance", query, seed: Date.now() };
  return { kind: "sample", seed: Date.now() };
}

// ---------- Test erstellen ----------

export async function generateTest(params: GenerateParams): Promise<Test> {
  const { materials, settings, signal, onProgress } = params;
  const hasMaterials = materials.length > 0;
  if (!hasMaterials && settings.mode === "exact") {
    throw new AiResponseError("Für „Meine Aufgaben abfragen“ bitte Material mit Aufgaben auswählen.");
  }
  const sample = await requireSample();
  const tier = getSettings().generationTier;

  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const prepared = await prepareMaterials(sample, materials, { signal, onProgress });
  const head = `${generationSystemPrompt(hasMaterials)}\n\n${TEST_JSON_FORMAT}\n\n`;
  const task = buildTaskInstruction(settings, { hasMaterials, subjectName: params.subjectName });
  const { section, note } = await promptWithMaterials(
    sample,
    prepared,
    (section) => `${head}${section}${task}`,
    testStrategy(settings),
    CONTINUATION_RESERVE,
  );
  const promptFor = (instruction: string) => `${head}${section}${task}${instruction ? `\n\n${instruction}` : ""}`;
  await checkLimits(sample, promptFor(""), prepared.images.length);

  // Viele Aufgaben holt die App in mehreren Teilen ab (eine Antwort hat eine Längen- und Zeitgrenze).
  const result = await generateInParts(settings, async (instruction, { part, done }) => {
    onProgress?.(part === 1 ? { phase: "analyzing", questionsSoFar: 0 } : { phase: "writing", questionsSoFar: done, part });
    const reply = await sample(promptFor(instruction), {
      modelTier: tier,
      images: prepared.images.length ? prepared.images : undefined,
      cache: false,
      signal,
      onText: ({ text }) => onProgress?.({ phase: "writing", questionsSoFar: done + countQuestions(text), part }),
    });
    return { text: reply.text, truncated: reply.truncated };
  }, { signal, describeError });

  const normalized = normalizeQuestions(result.questions, {
    forceAiSolutions: settings.mode === "generated",
    makeId: newId,
  });
  // Originalaufgaben bleiben in der Reihenfolge des Materials; neue Aufgaben nach Themen und Schwierigkeit.
  const questions = settings.mode === "generated" ? orderQuestions(normalized, settings.topicNames) : normalized;
  if (questions.length === 0) {
    throw new AiResponseError(
      settings.mode === "exact"
        ? "Im Material wurden keine Aufgaben gefunden. Sind die Rollen der Dateien richtig gesetzt?"
        : "Claude hat keine Fragen erstellt. Bitte erneut versuchen.",
    );
  }
  return {
    id: newId(),
    subjectId: params.subjectId,
    title: result.title || "Neuer Test",
    mode: settings.mode,
    materialIds: materials.map((m) => m.id),
    settings,
    questions,
    notes: [note ? `Hinweis der App: ${note}` : "", partsNote(result), result.notes].filter(Boolean).join("\n\n"),
    createdAt: Date.now(),
    model: `claude.ai – ${TIERS.find((t) => t.id === tier)?.label ?? tier}`,
  };
}

/** Prüft Textmenge und Bildanzahl gegen die Grenzen dieser Ansicht. */
async function checkLimits(sample: SampleFn, prompt: string, imageCount: number): Promise<void> {
  const limits = await sample.limits().catch(() => null);
  if (imageCount > 0) {
    const max = limits?.images?.maxCount ?? 0;
    if (max === 0) {
      throw new AiResponseError(
        "In dieser Ansicht können keine Bilder an Claude geschickt werden. Nutze PDFs mit Text oder Textdateien.",
      );
    }
    if (imageCount > max) {
      throw new AiResponseError(
        `Die Auswahl enthält ${imageCount} Bilder bzw. eingescannte Seiten – pro Anfrage gehen höchstens ${max}. Bitte weniger Material auswählen.`,
      );
    }
  }
  const maxBytes = limits?.maxPromptBytes ?? 262_144;
  const bytes = new TextEncoder().encode(prompt).length;
  if (bytes > maxBytes) {
    throw new AiResponseError(
      `Das Material ist zu umfangreich (${Math.round(bytes / 1024)} KB Text, höchstens ${Math.round(maxBytes / 1024)} KB pro Anfrage). Bitte weniger Dateien auswählen.`,
    );
  }
}

// ---------- Lernplan: Themen ----------

export async function analyzeTopics(params: TopicAnalysisParams): Promise<TopicAnalysis> {
  const { materials, signal, onProgress } = params;
  const sample = await requireSample();
  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const prepared = await prepareMaterials(sample, materials, { signal, onProgress });
  const instruction = buildTopicInstruction({
    subjectName: params.subjectName,
    examDateLabel: formatLongDate(params.examDate),
    daysUntilExam: params.daysUntilExam,
    availableMinutes: params.availableMinutes,
    focus: params.focus,
    givenTopics: params.givenTopics,
    hasMaterials: materials.length > 0,
  });
  const { prompt, note } = await promptWithMaterials(
    sample,
    prepared,
    (section) => `${TOPIC_SYSTEM_PROMPT}\n\n${TOPIC_JSON_FORMAT}\n\n${section}${instruction}`,
    { kind: "coverage" },
  );
  await checkLimits(sample, prompt, prepared.images.length);
  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });
  const raw = await sample.json(prompt, {
    modelTier: getSettings().generationTier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
    onText: ({ text }) => onProgress?.({ phase: "writing", questionsSoFar: countJsonKey(text, "name") }),
  });
  const parsed = coerceTopicAnalysis(raw);
  if (parsed.topics.length === 0) throw new AiResponseError("Claude hat keine Themen gefunden. Bitte erneut versuchen.");
  return note ? { ...parsed, notes: [`Hinweis der App: ${note}`, parsed.notes].filter(Boolean).join("\n\n") } : parsed;
}

// ---------- Lernplan: Lernzettel ----------

export async function createStudyNote(params: StudyNoteParams): Promise<{ content: string; model: string }> {
  const { materials, signal, onText } = params;
  const sample = await requireSample();
  const tier = getSettings().generationTier;
  const prepared = await prepareMaterials(sample, materials, { signal });
  const { prompt, note } = await promptWithMaterials(
    sample,
    prepared,
    (section) =>
      `${STUDY_NOTE_SYSTEM_PROMPT}\n\n${section}${buildStudyNoteInstruction({ ...params, hasMaterials: materials.length > 0 })}`,
    { kind: "relevance", query: `${params.topic.name} ${params.topic.description}` },
  );
  await checkLimits(sample, prompt, prepared.images.length);
  const result = await sample(prompt, {
    modelTier: tier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
    onText: ({ text }) => onText?.(text),
  });
  const cleaned = cleanStudyNote(result.text);
  if (!cleaned) throw new AiResponseError("Claude hat keinen Lernzettel geliefert. Bitte erneut versuchen.");
  const content = note ? `${cleaned}\n\n---\n\n*Hinweis der App: ${note}*` : cleaned;
  return { content, model: `claude.ai – ${TIERS.find((t) => t.id === tier)?.label ?? tier}` };
}

// ---------- Lernzettel aus Material ----------

export async function createMaterialNote(
  params: MaterialNoteParams,
): Promise<{ title: string | null; content: string; model: string }> {
  const { materials, signal, onText } = params;
  if (materials.length === 0) throw new AiResponseError("Bitte mindestens ein Material auswählen.");
  const sample = await requireSample();
  const tier = getSettings().generationTier;
  const prepared = await prepareMaterials(sample, materials, { signal });
  const { prompt, note } = await promptWithMaterials(
    sample,
    prepared,
    (section) => `${MATERIAL_NOTE_SYSTEM_PROMPT}\n\n${section}${buildMaterialNoteInstruction(params)}`,
    params.focus.trim() ? { kind: "relevance", query: params.focus } : { kind: "coverage" },
  );
  await checkLimits(sample, prompt, prepared.images.length);
  const result = await sample(prompt, {
    modelTier: tier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
    onText: ({ text }) => onText?.(text),
  });
  const { title, body } = splitNoteTitle(result.text);
  const cleaned = cleanStudyNote(body);
  if (!cleaned) throw new AiResponseError("Claude hat keinen Lernzettel geliefert. Bitte erneut versuchen.");
  const content = note ? `${cleaned}\n\n---\n\n*Hinweis der App: ${note}*` : cleaned;
  return { title, content, model: `claude.ai – ${TIERS.find((t) => t.id === tier)?.label ?? tier}` };
}

// ---------- Klausur-Analyse ----------

export async function analyzeExam(params: ExamAnalysisParams): Promise<{ analysis: GeneratedExamAnalysis; model: string }> {
  const { materials, signal, onProgress } = params;
  if (materials.length === 0) throw new AiResponseError("Bitte deine korrigierte Klausur auswählen.");
  const sample = await requireSample();
  const tier = getSettings().generationTier;
  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const prepared = await prepareMaterials(sample, materials, { signal, onProgress });
  const { prompt, note } = await promptWithMaterials(
    sample,
    prepared,
    (section) => `${EXAM_ANALYSIS_SYSTEM_PROMPT}\n\n${EXAM_ANALYSIS_JSON_FORMAT}\n\n${section}${buildExamAnalysisInstruction(params)}`,
    { kind: "prefix" },
  );
  await checkLimits(sample, prompt, prepared.images.length);
  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });
  const raw = await sample.json(prompt, {
    modelTier: tier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
    onText: ({ text }) => onProgress?.({ phase: "writing", questionsSoFar: countJsonKey(text, "label") }),
  });
  const analysis = coerceExamAnalysis(raw);
  if (analysis.tasks.length === 0 && analysis.weaknesses.length === 0) {
    throw new AiResponseError("Claude hat in der Auswahl keine bearbeitete Klausur erkannt. Sind die richtigen Dateien ausgewählt?");
  }
  if (note) analysis.notes = [`Hinweis der App: ${note}`, analysis.notes].filter(Boolean).join("\n\n");
  return { analysis, model: `claude.ai – ${TIERS.find((t) => t.id === tier)?.label ?? tier}` };
}

// ---------- Stelle im Lernzettel korrigieren ----------

export async function fixNotePassage(params: NoteFixParams): Promise<NoteFix> {
  const { materials, signal } = params;
  const sample = await requireSample();
  const prepared = await prepareMaterials(sample, materials, { signal });
  const { prompt } = await promptWithMaterials(
    sample,
    prepared,
    (section) => `${NOTE_FIX_SYSTEM_PROMPT}\n\n${NOTE_FIX_JSON_FORMAT}\n\n${section}${buildNoteFixTask(params)}`,
    { kind: "relevance", query: `${params.quote} ${params.request}` },
  );
  await checkLimits(sample, prompt, prepared.images.length);
  const raw = await sample.json(prompt, {
    modelTier: getSettings().generationTier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
  });
  const fix = coerceNoteFix(raw);
  if (!fix.reason && !fix.old.trim()) throw new AiResponseError("Claude hat keinen Vorschlag geliefert. Bitte erneut versuchen.");
  return { old: fix.old, replacement: fix.new, reason: fix.reason };
}

// ---------- Markierte Stelle erklären ----------

export async function explainPassage(params: ExplainParams): Promise<ExplainResult> {
  const { materials, signal, onText, history } = params;
  const sample = await requireSample();
  const tier = getSettings().generationTier;
  const prepared = await prepareMaterials(sample, materials, { signal });
  const task = buildExplainTask({ ...params, hasMaterials: materials.length > 0 });
  const past = explainHistoryText(history);
  const closing = past
    ? "Beantworte jetzt die letzte Nachfrage der lernenden Person – gleiche Regeln, letzte Zeile wieder „GRUNDLAGE: …“."
    : "";
  const lastQuestion = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const { prompt } = await promptWithMaterials(
    sample,
    prepared,
    (section) => [`${explainSystemPrompt({ webSearch: false })}\n\n${section}${task}`, past, closing].filter(Boolean).join("\n\n"),
    { kind: "relevance", query: `${params.quote} ${lastQuestion}` },
  );
  await checkLimits(sample, prompt, prepared.images.length);
  const result = await sample(prompt, {
    modelTier: tier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
    onText: ({ text }) => onText?.(text),
  });
  const { content, basis } = parseExplanation(result.text);
  if (!content) throw new AiResponseError("Claude hat keine Erklärung geliefert. Bitte erneut versuchen.");
  return { content, basis, model: `claude.ai – ${TIERS.find((t) => t.id === tier)?.label ?? tier}` };
}

// ---------- Material benennen ----------

export async function suggestMaterialName(params: MaterialNameParams): Promise<{ name: string; role: MaterialRole | null }> {
  const sample = await requireSample();
  const useImage = !params.text?.trim() && !!params.image;
  if (useImage) {
    const limits = await sample.limits().catch(() => null);
    if (!limits?.images) throw new AiResponseError("Bilder können hier nicht an Claude geschickt werden.");
  }
  const prompt = `${MATERIAL_NAME_PROMPT}\n\n${MATERIAL_NAME_JSON_FORMAT}\n\n${materialNameUserText(params.fileName, params.text)}`;
  const raw = await sample.json(prompt, {
    modelTier: "quick",
    images: useImage ? [params.image!] : undefined,
    signal: params.signal,
  });
  const parsed = coerceMaterialName(raw);
  if (!parsed) throw new AiResponseError("Für das Material konnte kein Name ermittelt werden.");
  return parsed;
}

// ---------- Antworten bewerten ----------

export async function gradeWithAi(question: Question, response: AnswerResponse, signal?: AbortSignal): Promise<AiGrade> {
  const sample = await requireSample();
  const answerText = (response.text ?? response.number ?? "").trim();
  let images: Blob[] | undefined;
  if (response.image) {
    const res = await fetch(response.image);
    if (res.ok) images = [await res.blob()];
  }
  const prompt = `${GRADING_SYSTEM_PROMPT}

${GRADING_JSON_FORMAT}

${gradingUserText(question, describeCorrectAnswer(question), answerText, !!images)}`;

  const raw = await sample.json(prompt, { modelTier: getSettings().gradingTier, images, signal });
  const parsed = coerceGrading(raw);
  if (!parsed) throw new AiResponseError("Die Bewertung von Claude konnte nicht gelesen werden.");
  const score = Math.min(question.points, Math.max(0, Math.round(parsed.score * 2) / 2));
  return { score, verdict: verdictFromScore(score, question.points), feedback: parsed.feedback };
}

// ---------- Fehlermeldungen ----------

const ERROR_TEXT: Record<string, string> = {
  cancelled: "Abgebrochen.",
  not_granted:
    "Du hast der Lern-App nicht erlaubt, Claude zu nutzen. Lade die Seite neu, um die Erlaubnis erneut zu erteilen.",
  sampling_disabled: "Claude ist für dein Konto hier nicht verfügbar.",
  not_declared: "Claude ist für diese Seite nicht freigeschaltet.",
  capability_disabled: "Claude ist in dieser Ansicht nicht nutzbar.",
  capability_removed: "Deine claude.ai-App ist zu alt für diese Funktion. Bitte aktualisieren.",
  rate_limited: "Nutzungslimit erreicht oder zu viele Anfragen. Bitte später erneut versuchen.",
  session_expired: "Bitte melde dich in claude.ai erneut an.",
  prompt_too_large: "Zu viel Material für eine Anfrage. Bitte weniger Dateien auswählen.",
  images_unavailable: "In dieser Ansicht können keine Bilder an Claude geschickt werden.",
  image_rejected: "Ein Bild konnte nicht verarbeitet werden. Bitte als JPEG oder PNG hochladen.",
  refused: "Claude hat die Anfrage abgelehnt. Prüfe, ob die richtigen Materialien ausgewählt sind.",
  empty_completion: "Claude hat keine Antwort geliefert. Bitte erneut versuchen.",
  invalid_json: "Die Antwort von Claude war unvollständig oder nicht lesbar. Bitte erneut versuchen.",
};

export function describeError(error: unknown): string {
  if (error instanceof AiResponseError) return error.message;
  if (isSampleError(error)) {
    return ERROR_TEXT[error.code] ?? "Claude ist gerade nicht erreichbar. Bitte erneut versuchen.";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
