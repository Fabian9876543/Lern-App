import { blobToDataUrl } from "../lib/files";
import { TABLES, type Backend } from "./types";

/** Notlösung, wenn der Browser nichts speichern lässt: Daten gelten nur bis zum Neuladen. */
export const memoryBackend: Backend = {
  mode: () => "memory",
  async start(onData) {
    for (const table of TABLES) onData(table, []);
  },
  async put() {},
  async remove() {},
  async storeMaterialContent({ blob, text }) {
    return blob ? { blob } : { text: text ?? "" };
  },
  async loadMaterialBlob(m) {
    if (m.blob) return m.blob;
    if (m.text !== undefined) return new Blob([m.text], { type: "text/plain;charset=utf-8" });
    return null;
  },
  async deleteMaterialContent() {},
  storeAnswerImage(blob) {
    return blobToDataUrl(blob);
  },
};
