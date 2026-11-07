import { blobToDataUrl } from "../../lib/files";
import { TABLES, type Backend, type TableName } from "../../store/types";
import { blobUrl, useCapability, type Db, type DocRef } from "./claude";

/**
 * Speicherung in claude.ai: Datensätze im Artifact-Speicher (db) unter dem
 * privaten Bereich der nutzenden Person, Dateien als Artifact-Assets.
 * Dadurch sind die Daten auf allen Geräten gleich, auf denen du claude.ai nutzt.
 */

/** Text bis zu dieser Größe wird direkt im Datensatz gespeichert. */
const INLINE_TEXT_LIMIT = 150_000;

let root: DocRef | null = null;

async function getRoot(): Promise<{ db: Db; root: DocRef }> {
  const [db, user] = await Promise.all([useCapability("db"), useCapability("user")]);
  if (!db || !user) {
    throw new Error("Der Speicher ist nicht verfügbar. Öffne die Lern-App angemeldet in claude.ai.");
  }
  const uid = await user.id();
  if (!uid) throw new Error("Du bist nicht angemeldet – ohne Anmeldung kann die Lern-App nichts speichern.");
  root = db.doc(`data/users/${uid}/lernapp`);
  return { db, root };
}

function collection(table: TableName) {
  if (!root) throw new Error("Speicher noch nicht bereit.");
  return root.collection(table);
}

/** Entfernt undefined-Werte und Binärdaten, damit der Datensatz reines JSON ist. */
function toJson(record: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record, (k, v) => (k === "blob" ? undefined : v)));
}

export const artifactBackend: Backend = {
  async start(onData, onError) {
    await getRoot();
    let pending = new Set<TableName>(TABLES);
    const timer = window.setTimeout(() => {
      if (pending.size > 0) onError("Deine Daten konnten noch nicht geladen werden. Prüfe deine Verbindung.");
    }, 10_000);
    for (const table of TABLES) {
      collection(table).onSnapshot(
        (snap) => {
          onData(table, snap.docs.filter((d) => d.exists).map((d) => structuredClone(d.data())) as never);
          if (!snap.metadata.fromCache && pending.delete(table) && pending.size === 0) window.clearTimeout(timer);
        },
        (e) => {
          pending = new Set();
          window.clearTimeout(timer);
          onError(
            e.code === "revoked"
              ? "Der Zugriff auf den Speicher wurde beendet."
              : `Der Speicher ist nicht erreichbar (${e.code}). Bitte lade die Seite neu.`,
          );
        },
      );
    }
  },

  async put(table, record) {
    try {
      await collection(table).doc(record.id).set(toJson(record));
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "invalid_argument") throw new Error("Der Eintrag ist zu groß für den Speicher.");
      if (code === "quota_exceeded") throw new Error("Der Speicher ist voll. Lösche alte Tests oder Materialien.");
      throw e;
    }
  },

  async remove(table, id) {
    await collection(table).doc(id).delete();
  },

  async storeMaterialContent({ blob, text, mimeType }) {
    if (!blob && (text ?? "").length <= INLINE_TEXT_LIMIT) return { text: text ?? "" };
    const assets = await useCapability("assets");
    if (!assets) throw new Error("Dateien können hier nicht gespeichert werden (nur als Besitzer:in des Artifacts).");
    const data = blob ?? new Blob([text ?? ""], { type: "text/plain" });
    const type = blob ? mimeType : "text/plain";
    try {
      const result = await assets.upload(data, { type });
      return { assetId: result.id };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "too_large") throw new Error("Die Datei ist zu groß (max. 20 MB).");
      if (code === "unsupported_type") throw new Error("Dieser Dateityp kann nicht gespeichert werden.");
      if (code === "quota_or_state") throw new Error("Der Dateispeicher ist voll. Lösche alte Materialien.");
      throw new Error(`Die Datei konnte nicht gespeichert werden (${code ?? "Fehler"}).`);
    }
  },

  async loadMaterialBlob(m) {
    if (m.assetId) {
      const res = await fetch(blobUrl(m.assetId));
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.type ? blob : new Blob([blob], { type: m.mimeType });
    }
    if (m.text !== undefined) return new Blob([m.text], { type: "text/plain;charset=utf-8" });
    return null;
  },

  async deleteMaterialContent(m) {
    if (!m.assetId) return;
    const assets = await useCapability("assets");
    await assets?.delete(m.assetId);
  },

  async storeAnswerImage(blob) {
    const assets = await useCapability("assets");
    if (assets) {
      try {
        const result = await assets.upload(blob, { type: blob.type || "image/jpeg" });
        return blobUrl(result.id);
      } catch {
        // Rückfall: Bild direkt im Datensatz
      }
    }
    return blobToDataUrl(blob);
  },
};
