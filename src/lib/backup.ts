import { db } from "../db";
import type { Attempt, Material, Subject, Test } from "../types";
import { blobToDataUrl } from "./files";

interface BackupMaterial extends Omit<Material, "blob"> {
  blobDataUrl?: string;
}

interface Backup {
  app: "lern-app";
  version: 1;
  exportedAt: string;
  subjects: Subject[];
  materials: BackupMaterial[];
  tests: Test[];
  attempts: Attempt[];
}

export async function exportBackup(): Promise<Blob> {
  const [subjects, materials, tests, attempts] = await Promise.all([
    db.subjects.toArray(),
    db.materials.toArray(),
    db.tests.toArray(),
    db.attempts.toArray(),
  ]);
  const backupMaterials: BackupMaterial[] = [];
  for (const m of materials) {
    const { blob, ...rest } = m;
    backupMaterials.push(blob ? { ...rest, blobDataUrl: await blobToDataUrl(blob) } : rest);
  }
  const backup: Backup = {
    app: "lern-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects,
    materials: backupMaterials,
    tests,
    attempts,
  };
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

export async function importBackup(file: File): Promise<{ subjects: number; tests: number }> {
  let data: Backup;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Die Datei ist kein gültiges Backup.");
  }
  if (data?.app !== "lern-app" || !Array.isArray(data.subjects)) {
    throw new Error("Die Datei ist kein Backup dieser Lern-App.");
  }
  const materials: Material[] = [];
  for (const m of data.materials ?? []) {
    const { blobDataUrl, ...rest } = m;
    materials.push(blobDataUrl ? { ...rest, blob: await (await fetch(blobDataUrl)).blob() } : rest);
  }
  await db.transaction("rw", [db.subjects, db.materials, db.tests, db.attempts], async () => {
    await db.subjects.bulkPut(data.subjects);
    await db.materials.bulkPut(materials);
    await db.tests.bulkPut(data.tests ?? []);
    await db.attempts.bulkPut(data.attempts ?? []);
  });
  return { subjects: data.subjects.length, tests: data.tests?.length ?? 0 };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
