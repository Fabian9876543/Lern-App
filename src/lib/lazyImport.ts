/**
 * Nachladen von Programmteilen (PDF-Leser, PDF-Export, Office-Leser), die erst
 * bei Bedarf geholt werden. Bricht die Verbindung dabei kurz ab oder war die
 * App sehr lange offen, schlägt das Nachladen fehl – dann wird es automatisch
 * wiederholt, auch unter einer frischen Adresse (Browser merken sich
 * fehlgeschlagene Module sonst bis zum Neuladen der Seite).
 */

export class ModuleLoadError extends Error {
  constructor(what: string, cause?: unknown) {
    super(
      `${what} konnte nicht geladen werden – vermutlich war die Verbindung kurz weg. ` +
        "Versuch es gleich noch einmal. Klappt es dann immer noch nicht, lade die Seite neu – deine Eingaben bleiben gespeichert.",
      { cause },
    );
    this.name = "ModuleLoadError";
  }
}

const LOAD_FAILURE =
  /dynamically imported module|importing a module script failed|module script|failed to fetch|load failed|networkerror|unable to preload/i;

/** Ist das ein Fehler beim Nachladen (und nicht einer im geladenen Programmteil)? */
export function isModuleLoadError(error: unknown): boolean {
  if (error instanceof ModuleLoadError) return true;
  if (!(error instanceof Error)) return false;
  return (error instanceof TypeError || error.name === "TypeError" || /preload/i.test(error.message)) && LOAD_FAILURE.test(error.message);
}

/** Adresse der Datei aus der Fehlermeldung (Chrome und Firefox nennen sie, Safari nicht). */
export function failedModuleUrl(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = /(https?:\/\/\S+?\.m?js)(?:[?#]\S*)?\s*$/.exec(error.message.trim());
  return match ? match[1] : null;
}

/** Dieselbe Adresse mit einem Zusatz, damit der Browser sie neu holt. */
export function retryUrl(url: string, attempt: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}retry=${Date.now().toString(36)}${attempt}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pausen vor den Wiederholungen (insgesamt höchstens drei Versuche). */
export const RETRY_DELAYS = [600, 1800];

/**
 * Lädt einen Programmteil nach und wiederholt das bei Verbindungsfehlern.
 * @param load z. B. `() => import("./pdfExport")`
 * @param what Name für die Fehlermeldung, z. B. „Der PDF-Leser“
 */
export async function loadModule<T>(load: () => Promise<T>, what: string, delays: number[] = RETRY_DELAYS): Promise<T> {
  let lastError: unknown;
  let url: string | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await wait(delays[attempt - 1]);
    try {
      return url ? ((await import(/* @vite-ignore */ retryUrl(url, attempt))) as T) : await load();
    } catch (e) {
      if (!isModuleLoadError(e)) throw e;
      lastError = e;
      url ??= failedModuleUrl(e);
    }
  }
  throw new ModuleLoadError(what, lastError);
}
