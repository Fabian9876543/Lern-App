import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { MATERIAL_NAME_PROMPT, materialNameUserText } from "../../ai/prompts";
import { MaterialNameSchema } from "../../ai/schemas";
import { blobToBase64 } from "../../lib/files";
import { getSettings } from "../../settings";
import type { MaterialRole } from "../../types";
import type { MaterialNameParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function suggestMaterialName(params: MaterialNameParams): Promise<{ name: string; role: MaterialRole | null }> {
  const client = getClient();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: materialNameUserText(params.fileName, params.text) },
  ];
  if (!params.text?.trim() && params.image && IMAGE_TYPES.has(params.image.type)) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: params.image.type as "image/jpeg", data: await blobToBase64(params.image) },
    });
  }
  const stream = client.beta.messages.stream(
    {
      model: getSettings().gradingModel,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: MATERIAL_NAME_PROMPT,
      output_config: { effort: "low", format: betaZodOutputFormat(MaterialNameSchema) },
      messages: [{ role: "user", content }],
    },
    { signal: params.signal },
  );
  const message = await stream.finalMessage();
  const parsed = message.stop_reason === "refusal" ? null : message.parsed_output;
  if (!parsed) throw new AiResponseError("Für das Material konnte kein Name ermittelt werden.");
  return { name: parsed.name, role: parsed.role };
}
