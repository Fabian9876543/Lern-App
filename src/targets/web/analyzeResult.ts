import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { countJsonKey } from "../../ai/normalize";
import { RESULT_ANALYSIS_SYSTEM_PROMPT, buildResultAnalysisInstruction } from "../../ai/prompts";
import { ExamAnalysisSchema, type GeneratedExamAnalysis } from "../../ai/schemas";
import { getSettings } from "../../settings";
import type { ResultAnalysisParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";

/** Wertet ein Testergebnis aus der App aus (nur Text: Fragen, Antworten, Bewertung). */
export async function analyzeResult(params: ResultAnalysisParams): Promise<{ analysis: GeneratedExamAnalysis; model: string }> {
  const { signal, onProgress } = params;
  const client = getClient();
  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });
  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: RESULT_ANALYSIS_SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(ExamAnalysisSchema) },
      messages: [{ role: "user", content: buildResultAnalysisInstruction(params) }],
    },
    { signal },
  );
  stream.on("text", (_delta, snapshot) => onProgress?.({ phase: "writing", questionsSoFar: countJsonKey(snapshot, "label") }));
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  if (message.stop_reason === "max_tokens") throw new AiResponseError("Die Auswertung wurde zu lang. Bitte noch einmal versuchen.");
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Antwort der KI konnte nicht gelesen werden. Bitte erneut versuchen.");
  if (!parsed.summary.trim() && parsed.weaknesses.length === 0) {
    throw new AiResponseError("Die KI hat keine Auswertung geliefert. Bitte noch einmal versuchen.");
  }
  return { analysis: parsed, model: message.model };
}
