import { useSyncExternalStore } from "react";
import { coerceGeneratedTest, coerceGrading, coerceTopicAnalysis } from "../../ai/coerce";
import { countJsonKey, countQuestions, describeCorrectAnswer, normalizeQuestions } from "../../ai/normalize";
import {
  GENERATION_SYSTEM_PROMPT,
  GRADING_JSON_FORMAT,
  GRADING_SYSTEM_PROMPT,
  TEST_JSON_FORMAT,
  TOPIC_JSON_FORMAT,
  TOPIC_SYSTEM_PROMPT,
  buildTaskInstruction,
  buildTopicInstruction,
  gradingUserText,
} from "../../ai/prompts";
import type { TopicAnalysis } from "../../ai/schemas";
import { ROLE_LABELS } from "../../lib/files";
import { verdictFromScore } from "../../lib/grading";
import { newId } from "../../lib/ids";
import { closePdf, openPdf, pageText, renderPage } from "../../lib/pdf";
import { TIERS, getSettings } from "../../settings";
import type { AnswerResponse, Material, Question, Test } from "../../types";
import { formatLongDate } from "../../lib/planner";
import type { AiGrade, AiStatus, GenerateParams, TopicAnalysisParams } from "../types";
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
  text: string;
  images: Blob[];
}

async function prepareMaterials(materials: Material[]): Promise<PreparedMaterials> {
  const parts: string[] = [];
  const images: Blob[] = [];

  for (const [index, m] of materials.entries()) {
    const label = `Material ${index + 1}: „${m.name}“ – Rolle: ${ROLE_LABELS[m.role]}`;
    if (m.kind === "text") {
      const text = m.text ?? (await (await artifactBackend.loadMaterialBlob(m))?.text()) ?? "";
      parts.push(`<material titel="${label}">\n${text}\n</material>`);
      continue;
    }
    const blob = await artifactBackend.loadMaterialBlob(m);
    if (!blob) throw new AiResponseError(`„${m.name}“ konnte nicht geladen werden.`);
    if (m.kind === "image") {
      images.push(blob);
      parts.push(`<material titel="${label}">\n[Bild ${images.length} – siehe beigefügte Bilder]\n</material>`);
      continue;
    }
    // PDF: Text auslesen, eingescannte Seiten als Bild.
    let doc;
    try {
      doc = await openPdf(blob);
    } catch {
      throw new AiResponseError(`Die PDF „${m.name}“ konnte nicht gelesen werden.`);
    }
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const text = await pageText(doc, p);
      if (text.replace(/\s/g, "").length >= SCANNED_PAGE_TEXT_LIMIT) {
        pages.push(`--- Seite ${p} ---\n${text}`);
      } else {
        images.push(await renderPage(doc, p));
        pages.push(`--- Seite ${p} ---\n[eingescannte Seite: Bild ${images.length} – siehe beigefügte Bilder]`);
      }
    }
    await closePdf(doc);
    parts.push(`<material titel="${label}">\n${pages.join("\n\n")}\n</material>`);
  }
  return { text: parts.join("\n\n"), images };
}

// ---------- Test erstellen ----------

export async function generateTest(params: GenerateParams): Promise<Test> {
  const { materials, settings, signal, onProgress } = params;
  if (materials.length === 0) throw new AiResponseError("Bitte mindestens ein Material auswählen.");
  const sample = await requireSample();
  const tier = getSettings().generationTier;

  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const prepared = await prepareMaterials(materials);

  const prompt = `${GENERATION_SYSTEM_PROMPT}

${TEST_JSON_FORMAT}

<materialien>
${prepared.text}
</materialien>
${prepared.images.length ? `\nDazu sind ${prepared.images.length} Bilder beigefügt, nummeriert in der Reihenfolge, in der sie oben erwähnt werden.\n` : ""}
${buildTaskInstruction(settings)}`;
  await checkLimits(sample, prompt, prepared.images.length);

  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });
  const raw = await sample.json(prompt, {
    modelTier: tier,
    images: prepared.images.length ? prepared.images : undefined,
    cache: false,
    signal,
    onText: ({ text }) => onProgress?.({ phase: "writing", questionsSoFar: countQuestions(text) }),
  });

  const parsed = coerceGeneratedTest(raw);
  const questions = normalizeQuestions(parsed.questions, {
    forceAiSolutions: settings.mode === "generated",
    makeId: newId,
  });
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
    title: parsed.title || "Neuer Test",
    mode: settings.mode,
    materialIds: materials.map((m) => m.id),
    settings,
    questions,
    notes: parsed.notes,
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
  const prepared = await prepareMaterials(materials);
  const instruction = buildTopicInstruction({
    examDateLabel: formatLongDate(params.examDate),
    daysUntilExam: params.daysUntilExam,
    availableMinutes: params.availableMinutes,
    focus: params.focus,
    givenTopics: params.givenTopics,
    hasMaterials: materials.length > 0,
  });
  const materialPart = materials.length ? `\n<materialien>\n${prepared.text}\n</materialien>\n` : "";
  const imagePart = prepared.images.length
    ? `\nDazu sind ${prepared.images.length} Bilder beigefügt, nummeriert in der Reihenfolge, in der sie oben erwähnt werden.\n`
    : "";
  const prompt = `${TOPIC_SYSTEM_PROMPT}\n\n${TOPIC_JSON_FORMAT}\n${materialPart}${imagePart}\n${instruction}`;
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
  invalid_json: "Die Antwort von Claude war unvollständig. Bitte erneut versuchen – oder weniger Fragen auf einmal.",
};

export function describeError(error: unknown): string {
  if (error instanceof AiResponseError) return error.message;
  if (isSampleError(error)) {
    return ERROR_TEXT[error.code] ?? "Claude ist gerade nicht erreichbar. Bitte erneut versuchen.";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
