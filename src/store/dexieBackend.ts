import Dexie, { type EntityTable } from "dexie";
import { blobToDataUrl } from "../lib/files";
import type { Attempt, Material, Subject, Test } from "../types";
import { TABLES, type Backend } from "./types";

/** Speicherung im Browser (IndexedDB) – für die eigenständige Web-Version. */

const db = new Dexie("lern-app") as Dexie & {
  subjects: EntityTable<Subject, "id">;
  materials: EntityTable<Material, "id">;
  tests: EntityTable<Test, "id">;
  attempts: EntityTable<Attempt, "id">;
};

db.version(1).stores({
  subjects: "id, createdAt",
  materials: "id, subjectId, createdAt",
  tests: "id, subjectId, createdAt",
  attempts: "id, testId, subjectId, startedAt, status",
});

export const dexieBackend: Backend = {
  async start(onData) {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {
      // nicht kritisch
    }
    for (const table of TABLES) {
      onData(table, (await db.table(table).toArray()) as never);
    }
  },
  async put(table, record) {
    await db.table(table).put(record);
  },
  async remove(table, id) {
    await db.table(table).delete(id);
  },
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
