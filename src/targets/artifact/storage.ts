import { dexieBackend } from "../../store/dexieBackend";
import { memoryBackend } from "../../store/memoryBackend";
import type { Backend, StorageMode } from "../../store/types";
import { canUseCloudStorage, cloudBackend } from "./backend";

/**
 * Speicher der claude.ai-Version:
 * - Wer im Artifact speichern darf (du als Besitzer:in, eingeladene Bearbeiter),
 *   speichert im Artifact-Speicher – auf allen Geräten gleich.
 * - Alle anderen (z. B. über einen geteilten Link) nutzen den Gastmodus:
 *   Daten nur in ihrem Browser. Lässt der Browser auch das nicht zu, gelten die
 *   Daten nur bis zum Neuladen.
 */

let active: Backend | null = null;
let mode: StorageMode = "cloud";

function current(): Backend {
  if (!active) throw new Error("Speicher noch nicht bereit.");
  return active;
}

export const artifactBackend: Backend = {
  mode: () => mode,
  async start(onData, onError) {
    if (await canUseCloudStorage()) {
      active = cloudBackend;
      mode = "cloud";
      return cloudBackend.start(onData, onError);
    }
    try {
      await dexieBackend.start(onData, onError);
      active = dexieBackend;
      mode = "local";
    } catch {
      active = memoryBackend;
      mode = "memory";
      await memoryBackend.start(onData, onError);
    }
  },
  put: (table, record) => current().put(table, record),
  remove: (table, id) => current().remove(table, id),
  storeMaterialContent: (content) => current().storeMaterialContent(content),
  loadMaterialBlob: (m) => current().loadMaterialBlob(m),
  deleteMaterialContent: (m) => current().deleteMaterialContent(m),
  storeAnswerImage: (blob) => current().storeAnswerImage(blob),
};
