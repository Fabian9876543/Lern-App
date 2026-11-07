import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "../settings";

export class MissingApiKeyError extends Error {
  constructor() {
    super("Kein API-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.");
  }
}

export class AiResponseError extends Error {}

/**
 * Die App läuft komplett im Browser: Der API-Schlüssel bleibt lokal auf deinem
 * Gerät und wird nur direkt an api.anthropic.com gesendet.
 */
export function getClient(): Anthropic {
  const { apiKey } = getSettings();
  if (!apiKey.trim()) throw new MissingApiKeyError();
  return new Anthropic({
    apiKey: apiKey.trim(),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
}

/** Server-seitiger Fallback, falls ein Modell eine Anfrage ablehnt. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function describeError(error: unknown): string {
  if (error instanceof MissingApiKeyError || error instanceof AiResponseError) return error.message;
  if (error instanceof Anthropic.APIUserAbortError) return "Abgebrochen.";
  if (error instanceof Anthropic.AuthenticationError) {
    return "Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "Der API-Schlüssel hat keine Berechtigung für dieses Modell.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    const msg = error.message || "";
    if (/credit balance/i.test(msg)) return "Dein API-Guthaben ist aufgebraucht. Bitte in der Anthropic Console aufladen.";
    if (/too long|too large|exceed|maximum/i.test(msg)) {
      return "Die Materialien sind zu groß für eine Anfrage. Bitte weniger oder kleinere Dateien auswählen.";
    }
    return `Die Anfrage wurde abgelehnt: ${msg}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Keine Verbindung zur KI. Bitte Internetverbindung prüfen.";
  }
  if (error instanceof Anthropic.InternalServerError) {
    return "Die KI ist gerade überlastet oder nicht erreichbar. Bitte später erneut versuchen.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Fehler der KI-Schnittstelle (${error.status ?? "?"}): ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
