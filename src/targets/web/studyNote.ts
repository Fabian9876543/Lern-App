import {
  MATERIAL_NOTE_SYSTEM_PROMPT,
  STUDY_NOTE_SYSTEM_PROMPT,
  buildMaterialNoteInstruction,
  buildStudyNoteInstruction,
  cleanStudyNote,
  splitNoteTitle,
} from "../../ai/prompts";
import { getSettings } from "../../settings";
import type { MaterialNoteParams, StudyNoteParams } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

/** Schreibt einen Lernzettel zu einem Thema – aus dem Material des Plans oder aus Claudes Fachwissen. */
export async function createStudyNote(params: StudyNoteParams): Promise<{ content: string; model: string }> {
  const { materials, signal, onText } = params;
  const hasMaterials = materials.length > 0;
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Das Material des Plans ist zusammen zu groß (max. ca. 30 MB).");
  }
  const client = getClient();
  const blocks = hasMaterials ? await materialsToContent(materials) : [];
  const instruction = buildStudyNoteInstruction({ ...params, hasMaterials });

  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: STUDY_NOTE_SYSTEM_PROMPT,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: instruction }] }],
    },
    { signal },
  );
  stream.on("text", (_delta, snapshot) => onText?.(snapshot));
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const content = cleanStudyNote(text);
  if (!content) throw new AiResponseError("Die KI hat keinen Lernzettel geliefert. Bitte erneut versuchen.");
  return { content, model: message.model };
}

/** Schreibt einen Lernzettel direkt aus ausgewähltem Material. */
export async function createMaterialNote(
  params: MaterialNoteParams,
): Promise<{ title: string | null; content: string; model: string }> {
  const { materials, signal, onText } = params;
  if (materials.length === 0) throw new AiResponseError("Bitte mindestens ein Material auswählen.");
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Die ausgewählten Materialien sind zusammen zu groß (max. ca. 30 MB). Bitte weniger auswählen.");
  }
  const client = getClient();
  const blocks = await materialsToContent(materials);
  const stream = client.beta.messages.stream(
    {
      model: getSettings().generationModel,
      max_tokens: 20000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: MATERIAL_NOTE_SYSTEM_PROMPT,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: buildMaterialNoteInstruction(params) }] }],
    },
    { signal },
  );
  stream.on("text", (_delta, snapshot) => onText?.(snapshot));
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
  const { title, body } = splitNoteTitle(message.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const content = cleanStudyNote(body);
  if (!content) throw new AiResponseError("Die KI hat keinen Lernzettel geliefert. Bitte erneut versuchen.");
  return { title, content, model: message.model };
}
