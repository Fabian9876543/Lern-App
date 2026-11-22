import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { countQuestions, normalizeQuestions } from "../../ai/normalize";
import { buildTaskInstruction, generationSystemPrompt } from "../../ai/prompts";
import { generateInParts, partsNote } from "../../ai/rounds";
import { GeneratedTestPartSchema } from "../../ai/schemas";
import { newId } from "../../lib/ids";
import { getSettings } from "../../settings";
import type { Test } from "../../types";
import type { GenerateParams } from "../types";
import { AiResponseError, FALLBACK_BETA, describeError, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

// Nur das Schema schicken, ohne automatisches Einlesen durch das SDK: Eine abgeschnittene
// Antwort würde sonst einen Fehler werfen, statt dass die fertigen Aufgaben gerettet werden.
const { type: formatType, schema: partSchema } = betaZodOutputFormat(GeneratedTestPartSchema);
const PART_FORMAT = { type: formatType, schema: partSchema };

export async function generateTest(params: GenerateParams): Promise<Test> {
  const { materials, settings, signal, onProgress } = params;
  const hasMaterials = materials.length > 0;
  if (!hasMaterials && settings.mode === "exact") {
    throw new AiResponseError("Für „Meine Aufgaben abfragen“ bitte Material mit Aufgaben auswählen.");
  }
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError(
      "Die ausgewählten Materialien sind zusammen zu groß (max. ca. 30 MB pro Test). Bitte weniger Dateien auswählen.",
    );
  }

  const client = getClient();
  const model = getSettings().generationModel;
  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const materialBlocks = hasMaterials ? await materialsToContent(materials) : [];
  const task = buildTaskInstruction(settings, { hasMaterials, subjectName: params.subjectName });
  let answeredBy = model;

  // Viele Aufgaben holt die App in mehreren Teilen ab; das Material wird dabei aus dem Cache gelesen.
  const result = await generateInParts(settings, async (instruction, { part, done }) => {
    onProgress?.(part === 1 ? { phase: "analyzing", questionsSoFar: 0 } : { phase: "writing", questionsSoFar: done, part });
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: generationSystemPrompt(hasMaterials),
        output_config: { effort: "high", format: PART_FORMAT },
        messages: [
          {
            role: "user",
            content: [...materialBlocks, { type: "text", text: instruction ? `${task}\n\n${instruction}` : task }],
          },
        ],
      },
      { signal },
    );
    stream.on("text", (_delta, snapshot) => {
      onProgress?.({ phase: "writing", questionsSoFar: done + countQuestions(snapshot), part });
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new AiResponseError(
        "Die KI hat die Anfrage abgelehnt. Prüfe, ob die richtigen Materialien ausgewählt sind, und versuche es erneut.",
      );
    }
    answeredBy = message.model;
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, truncated: message.stop_reason === "max_tokens" };
  }, { signal, describeError });

  const questions = normalizeQuestions(result.questions, {
    forceAiSolutions: settings.mode === "generated",
    makeId: newId,
  });
  if (questions.length === 0) {
    throw new AiResponseError(
      settings.mode === "exact"
        ? "Im Material wurden keine Aufgaben gefunden. Sind die Rollen der Dateien richtig gesetzt?"
        : "Die KI hat keine Fragen erstellt. Bitte erneut versuchen.",
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
    notes: [partsNote(result), result.notes].filter(Boolean).join("\n\n"),
    createdAt: Date.now(),
    model: answeredBy,
  };
}

