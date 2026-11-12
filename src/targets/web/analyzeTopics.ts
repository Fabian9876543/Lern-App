import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { countJsonKey } from "../../ai/normalize";
import { TOPIC_SYSTEM_PROMPT, buildTopicInstruction } from "../../ai/prompts";
import { TopicAnalysisSchema, type TopicAnalysis } from "../../ai/schemas";
import { formatLongDate } from "../../lib/planner";
import { getSettings } from "../../settings";
import type { TopicAnalysisParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

export async function analyzeTopics(params: TopicAnalysisParams): Promise<TopicAnalysis> {
  const { materials, signal, onProgress } = params;
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Die ausgewählten Materialien sind zusammen zu groß (max. ca. 30 MB). Bitte weniger auswählen.");
  }
  const client = getClient();
  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const blocks = materials.length ? await materialsToContent(materials) : [];
  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });

  const instruction = buildTopicInstruction({
    subjectName: params.subjectName,
    examDateLabel: formatLongDate(params.examDate),
    daysUntilExam: params.daysUntilExam,
    availableMinutes: params.availableMinutes,
    focus: params.focus,
    givenTopics: params.givenTopics,
    hasMaterials: materials.length > 0,
  });

  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 32000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: TOPIC_SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(TopicAnalysisSchema) },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: instruction }] }],
    },
    { signal },
  );
  stream.on("text", (_delta, snapshot) => {
    onProgress?.({ phase: "writing", questionsSoFar: countJsonKey(snapshot, "name") });
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  if (message.stop_reason === "max_tokens") throw new AiResponseError("Die Antwort wurde zu lang. Bitte weniger Material auswählen.");
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Antwort der KI konnte nicht gelesen werden. Bitte erneut versuchen.");
  return parsed;
}
