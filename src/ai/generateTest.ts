import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { newId } from "../db";
import { getSettings } from "../settings";
import type { GenerationSettings, Material, Test } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";
import { normalizeQuestions } from "./normalize";
import { GENERATION_SYSTEM_PROMPT, buildTaskInstruction } from "./prompts";
import { GeneratedTestSchema } from "./schemas";

export type GenerationPhase = "preparing" | "analyzing" | "writing";

export interface GenerationProgress {
  phase: GenerationPhase;
  questionsSoFar: number;
}

export async function generateTest(params: {
  subjectId: string;
  materials: Material[];
  settings: GenerationSettings;
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}): Promise<Test> {
  const { materials, settings, signal, onProgress } = params;
  if (materials.length === 0) throw new AiResponseError("Bitte mindestens ein Material auswählen.");
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError(
      "Die ausgewählten Materialien sind zusammen zu groß (max. ca. 30 MB pro Test). Bitte weniger Dateien auswählen.",
    );
  }

  const client = getClient();
  const model = getSettings().generationModel;
  onProgress?.({ phase: "preparing", questionsSoFar: 0 });
  const materialBlocks = await materialsToContent(materials);
  onProgress?.({ phase: "analyzing", questionsSoFar: 0 });

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 64000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: GENERATION_SYSTEM_PROMPT,
      output_config: { effort: "high", format: betaZodOutputFormat(GeneratedTestSchema) },
      messages: [
        {
          role: "user",
          content: [...materialBlocks, { type: "text", text: buildTaskInstruction(settings) }],
        },
      ],
    },
    { signal },
  );

  stream.on("text", (_delta, snapshot) => {
    onProgress?.({ phase: "writing", questionsSoFar: countOccurrences(snapshot, '"prompt"') });
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new AiResponseError(
      "Die KI hat die Anfrage abgelehnt. Prüfe, ob die richtigen Materialien ausgewählt sind, und versuche es erneut.",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiResponseError(
      "Die Antwort wurde zu lang. Bitte weniger Fragen oder weniger Material auf einmal verwenden.",
    );
  }
  const parsed = message.parsed_output;
  if (!parsed) throw new AiResponseError("Die Antwort der KI konnte nicht gelesen werden. Bitte erneut versuchen.");

  const questions = normalizeQuestions(parsed.questions, {
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
    title: parsed.title.trim() || "Neuer Test",
    mode: settings.mode,
    materialIds: materials.map((m) => m.id),
    settings,
    questions,
    notes: parsed.notes.trim(),
    createdAt: Date.now(),
    model: message.model,
  };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}
