import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SOLUTION_CHECK_SYSTEM_PROMPT, buildSolutionCheckTask } from "../../ai/prompts";
import { SolutionCheckSchema, type SolutionCheckResult } from "../../ai/schemas";
import { getSettings } from "../../settings";
import type { SolutionCheckParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

/** Prüft die hinterlegte Lösung einer Aufgabe („Lösung stimmt nicht?“). */
export async function checkSolution(params: SolutionCheckParams): Promise<SolutionCheckResult> {
  const { materials, signal } = params;
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Das Material dieses Tests ist zusammen zu groß (max. ca. 30 MB).");
  }
  const client = getClient();
  const blocks = materials.length ? await materialsToContent(materials) : [];
  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: SOLUTION_CHECK_SYSTEM_PROMPT,
      output_config: { effort: "high", format: betaZodOutputFormat(SolutionCheckSchema) },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: buildSolutionCheckTask(params) }] }],
    },
    { signal },
  );
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  if (message.stop_reason === "max_tokens") throw new AiResponseError("Die Antwort der KI war zu lang. Bitte erneut versuchen.");
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Antwort der KI konnte nicht gelesen werden. Bitte erneut versuchen.");
  return { ...parsed, reason: parsed.reason.trim() };
}
