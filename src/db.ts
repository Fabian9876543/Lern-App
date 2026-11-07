import Dexie, { type EntityTable } from "dexie";
import type { Attempt, Material, Subject, Test } from "./types";

export const db = new Dexie("lern-app") as Dexie & {
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

export function newId(): string {
  return crypto.randomUUID();
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await db.transaction("rw", [db.subjects, db.materials, db.tests, db.attempts], async () => {
    await db.attempts.where("subjectId").equals(subjectId).delete();
    await db.tests.where("subjectId").equals(subjectId).delete();
    await db.materials.where("subjectId").equals(subjectId).delete();
    await db.subjects.delete(subjectId);
  });
}

export async function deleteTest(testId: string): Promise<void> {
  await db.transaction("rw", [db.tests, db.attempts], async () => {
    await db.attempts.where("testId").equals(testId).delete();
    await db.tests.delete(testId);
  });
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // nicht kritisch
  }
}
