import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { countJsonKey } from "../../ai/normalize";
import { EXAM_ANALYSIS_SYSTEM_PROMPT, buildExamAnalysisInstruction } from "../../ai/prompts";
import { ExamAnalysisSchema, type GeneratedExamAnalysis } from "../../ai/schemas";
import { getSettings } from "../../settings";
import type { ExamAnalysisParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

/** Wertet eine korrigierte Klausur aus (Fotos, Scans oder PDF samt Korrektur). */
export async function analyzeExam(params: ExamAnalysisParams): Promise<{ analysis: GeneratedExamAnalysis; model: string }> {
  const { materials, signal, onProgress } = params;
  if (materials.length === 0) throw new AiResponseError("Bitte deine korrigierte Klausur auswählen.");
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Die ausgewählten Dateien sind zusammen zu groß (max. ca. 30 MB). Bitte weniger oder kleinere Fotos auswählen.");
  }
  const client = getClient();
  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const blocks = await materialsToContent(materials);
  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });
  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 32000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: EXAM_ANALYSIS_SYSTEM_PROMPT,
      output_config: { effort: "high", format: betaZodOutputFormat(ExamAnalysisSchema) },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: buildExamAnalysisInstruction(params) }] }],
    },
    { signal },
  );
  stream.on("text", (_delta, snapshot) => onProgress?.({ phase: "writing", questionsSoFar: countJsonKey(snapshot, "label") }));
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  if (message.stop_reason === "max_tokens") throw new AiResponseError("Die Auswertung wurde zu lang. Bitte weniger Seiten auswählen.");
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Antwort der KI konnte nicht gelesen werden. Bitte erneut versuchen.");
  if (parsed.tasks.length === 0 && parsed.weaknesses.length === 0) {
    throw new AiResponseError("In der Auswahl wurde keine bearbeitete Klausur erkannt. Sind die richtigen Dateien ausgewählt?");
  }
  return { analysis: parsed, model: message.model };
}
