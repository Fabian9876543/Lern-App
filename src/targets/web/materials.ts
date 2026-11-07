import type Anthropic from "@anthropic-ai/sdk";
import type { Material } from "../../types";
import { ROLE_LABELS, blobToBase64 } from "../../lib/files";

type ContentBlock =
  | Anthropic.Beta.BetaRequestDocumentBlock
  | Anthropic.Beta.BetaImageBlockParam
  | Anthropic.Beta.BetaTextBlockParam;

/** Wandelt die Materialien in Content-Blöcke für die Messages API um. */
export async function materialsToContent(materials: Material[]): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  for (const [index, m] of materials.entries()) {
    const label = `Material ${index + 1}: „${m.name}“ – Rolle: ${ROLE_LABELS[m.role]}`;
    if (m.kind === "pdf" && m.blob) {
      blocks.push({
        type: "document",
        title: label,
        source: { type: "base64", media_type: "application/pdf", data: await blobToBase64(m.blob) },
      });
    } else if (m.kind === "image" && m.blob) {
      blocks.push({ type: "text", text: label });
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: m.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: await blobToBase64(m.blob),
        },
      });
    } else if (m.kind === "text") {
      blocks.push({
        type: "document",
        title: label,
        source: { type: "text", media_type: "text/plain", data: m.text ?? "" },
      });
    }
  }
  // Cache-Breakpoint hinter dem Material: Wird kurz danach eine weitere
  // Variante aus demselben Material erzeugt, wird das Material günstiger gelesen.
  const last = blocks[blocks.length - 1];
  if (last) last.cache_control = { type: "ephemeral" };
  return blocks;
}

/** Grobe Größe der Anfrage in Bytes (Base64 vergrößert Binärdaten um ~33 %). */
export function estimateRequestBytes(materials: Material[]): number {
  return materials.reduce((sum, m) => sum + (m.blob ? Math.ceil(m.blob.size * 1.34) : (m.text?.length ?? 0)), 0);
}

export const MAX_REQUEST_BYTES = 31 * 1024 * 1024;
