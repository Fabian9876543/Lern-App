import type { AnswerResponse } from "../types";

/**
 * Antwortentwurf zwischen Geräten abgleichen (z. B. Aufgabe am MacBook offen,
 * Foto der Lösung am iPad hochgeladen). Drei-Wege-Abgleich je Feld: Was nur
 * auf dem anderen Gerät geändert wurde, wird übernommen; was man hier gerade
 * selbst ändert, bleibt.
 */

const FIELDS = ["selected", "text", "number", "image"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function sameResponse(a: AnswerResponse, b: AnswerResponse): boolean {
  return FIELDS.every((f) => same(a[f], b[f]));
}

/**
 * @param base   Stand, den dieses Gerät zuletzt gespeichert bzw. geladen hat
 * @param local  aktueller Entwurf auf diesem Gerät
 * @param remote gespeicherter Stand (evtl. vom anderen Gerät geändert)
 */
export function mergeResponse(base: AnswerResponse, local: AnswerResponse, remote: AnswerResponse): AnswerResponse {
  const out: AnswerResponse = { ...local };
  for (const f of FIELDS) {
    if (!same(remote[f], base[f]) && same(local[f], base[f])) {
      if (remote[f] === undefined) delete out[f];
      else (out as Record<string, unknown>)[f] = remote[f];
    }
  }
  return out;
}
