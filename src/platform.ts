/**
 * Die App wird in zwei Varianten gebaut:
 * - "web": eigenständige Web-App, KI über die Claude-API (eigener API-Schlüssel),
 *   Daten in IndexedDB.
 * - "artifact": läuft als Artifact in claude.ai, KI über das Claude-Konto der
 *   nutzenden Person (Abo), Daten im Speicher des Artifacts.
 */
export const IS_ARTIFACT = import.meta.env.VITE_TARGET === "artifact";
