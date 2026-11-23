import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NOTE_FIX_SYSTEM_PROMPT, buildNoteFixTask } from "../../ai/prompts";
import { NoteFixSchema } from "../../ai/schemas";
import { getSettings } from "../../settings";
import type { NoteFix, NoteFixParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

/** Korrekturvorschlag für eine markierte Stelle im Lernzettel. */
export async function fixNotePassage(params: NoteFixParams): Promise<NoteFix> {
  const { materials, signal } = params;
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Das Material dieses Lernzettels ist zusammen zu groß (max. ca. 30 MB).");
  }
  const client = getClient();
  const blocks = materials.length ? await materialsToContent(materials) : [];
  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: NOTE_FIX_SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(NoteFixSchema) },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: buildNoteFixTask(params) }] }],
    },
    { signal },
  );
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Antwort der KI konnte nicht gelesen werden. Bitte erneut versuchen.");
  return { old: parsed.old, replacement: parsed.new, reason: parsed.reason.trim() };
}
