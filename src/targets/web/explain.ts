import Anthropic from "@anthropic-ai/sdk";
import { buildExplainFollowUp, buildExplainTask, explainSystemPrompt } from "../../ai/prompts";
import { parseExplanation } from "../../lib/noteMarks";
import { getSettings } from "../../settings";
import type { MarkBasis } from "../../types";
import type { ExplainParams, ExplainResult } from "../types";
import { AiResponseError, FALLBACK_BETA, getClient } from "./client";
import { MAX_REQUEST_BYTES, estimateRequestBytes, materialsToContent } from "./materials";

/** Höchstens so viele Suchanfragen pro Erklärung. */
const MAX_SEARCHES = 3;
/** Wie oft eine unterbrochene Antwort (pause_turn) fortgesetzt wird. */
const MAX_CONTINUATIONS = 2;

/** Die neuen Suchwerkzeuge (mit Filterung) gibt es nicht für Haiku; dort die einfache Variante. */
function webSearchTool(model: string): Anthropic.Beta.BetaToolUnion {
  return model.startsWith("claude-haiku")
    ? { type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }
    : { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES };
}

/** Erklärt eine markierte Stelle – aus dem Material, Claudes Fachwissen und bei Bedarf mit Internetsuche. */
export async function explainPassage(params: ExplainParams): Promise<ExplainResult> {
  const { materials, signal, onText, history } = params;
  if (estimateRequestBytes(materials) > MAX_REQUEST_BYTES) {
    throw new AiResponseError("Das Material dieses Lernzettels ist zusammen zu groß (max. ca. 30 MB).");
  }
  const client = getClient();
  const model = getSettings().generationModel;
  const blocks = materials.length ? await materialsToContent(materials) : [];
  const task = buildExplainTask({ ...params, hasMaterials: materials.length > 0 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: [...blocks, { type: "text", text: task }] },
    ...history.map(
      (m): Anthropic.Beta.BetaMessageParam =>
        m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: buildExplainFollowUp(m.content) },
    ),
  ];

  const run = async (webSearch: boolean) => {
    let conversation = messages;
    const soFar: Anthropic.Beta.BetaContentBlock[] = [];
    let text = "";
    const links = new Map<string, string>();
    let searched = false;
    for (let round = 0; ; round++) {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          system: explainSystemPrompt({ webSearch }),
          output_config: { effort: "medium" },
          tools: webSearch ? [webSearchTool(model)] : undefined,
          messages: conversation,
        },
        { signal },
      );
      const before = text;
      let current = "";
      stream.on("text", (delta) => {
        current += delta;
        onText?.(before + current);
      });
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") throw new AiResponseError("Die KI hat die Anfrage abgelehnt.");
      for (const block of message.content) {
        if (block.type === "text") {
          for (const c of block.citations ?? []) {
            if (c.type === "web_search_result_location" && !links.has(c.url)) links.set(c.url, c.title ?? "");
          }
        } else if (block.type === "web_search_tool_result") searched = true;
      }
      text = before + message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      // Hat der Server die Runde unterbrochen (lange Suche), dort weitermachen.
      if (message.stop_reason !== "pause_turn" || round >= MAX_CONTINUATIONS) return { text, links, searched, model: message.model };
      soFar.push(...message.content);
      conversation = [...messages, { role: "assistant", content: soFar }];
    }
  };

  let result;
  try {
    result = await run(true);
  } catch (e) {
    // Ist die Websuche für das Konto nicht freigeschaltet, ohne Suche erklären.
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    result = await run(false);
  }

  const { content, basis } = parseExplanation(result.text);
  if (!content) throw new AiResponseError("Die KI hat keine Erklärung geliefert. Bitte erneut versuchen.");
  const links = [...result.links].map(([url, title]) => ({ url, title }));
  let finalBasis: MarkBasis[] | undefined = basis;
  if (links.length && result.searched && !finalBasis?.includes("internet")) finalBasis = [...(finalBasis ?? []), "internet"];
  return { content, basis: finalBasis, links: links.length ? links : undefined, model: result.model };
}
