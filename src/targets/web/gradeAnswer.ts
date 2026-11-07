import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeCorrectAnswer } from "../../ai/normalize";
import { GRADING_SYSTEM_PROMPT, gradingUserText } from "../../ai/prompts";
import { GradingSchema } from "../../ai/schemas";
import { dataUrlToBase64 } from "../../lib/files";
import { verdictFromScore } from "../../lib/grading";
import { getSettings } from "../../settings";
import type { AnswerResponse, Question } from "../../types";
import type { AiGrade } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";

export async function gradeWithAi(question: Question, response: AnswerResponse, signal?: AbortSignal): Promise<AiGrade> {
  const client = getClient();
  const model = getSettings().gradingModel;
  const answerText = (response.text ?? response.number ?? "").trim();

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: gradingUserText(question, describeCorrectAnswer(question), answerText, !!response.image),
    },
  ];
  if (response.image) {
    const { mediaType, data } = dataUrlToBase64(response.image);
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType as "image/jpeg", data },
    });
  }

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: GRADING_SYSTEM_PROMPT,
      output_config: { effort: "low", format: betaZodOutputFormat(GradingSchema) },
      messages: [{ role: "user", content }],
    },
    { signal },
  );
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Bewertung abgelehnt.");
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Bewertung der KI konnte nicht gelesen werden.");

  const score = Math.min(question.points, Math.max(0, Math.round(parsed.score * 2) / 2));
  return { score, verdict: verdictFromScore(score, question.points), feedback: parsed.feedback.trim() };
}
