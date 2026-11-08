import { getState, repo } from "../store/store";
import type { Attempt, Material, StudyPlan, Subject, Test } from "../types";
import { blobToDataUrl } from "./files";

/** Backup aller Daten als JSON – auch zum Umziehen zwischen Web- und claude.ai-Version. */

interface BackupMaterial extends Omit<Material, "blob" | "assetId"> {
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
  plans?: StudyPlan[];
}

export async function exportBackup(): Promise<Blob> {
  const { subjects, materials, tests, attempts, plans } = getState();
  const backupMaterials: BackupMaterial[] = [];
  for (const m of materials) {
    const { blob: _blob, assetId: _assetId, ...rest } = m;
    if (m.kind === "text" && m.text !== undefined) {
      backupMaterials.push(rest);
      continue;
    }
    const blob = await repo.loadMaterialBlob(m);
    if (m.kind === "text") backupMaterials.push({ ...rest, text: (await blob?.text()) ?? "" });
    else backupMaterials.push(blob ? { ...rest, blobDataUrl: await blobToDataUrl(blob) } : rest);
  }
  // Antwort-Fotos, die als Datei gespeichert sind, werden eingebettet.
  const portableAttempts: Attempt[] = [];
  for (const a of attempts) {
    const answers: Attempt["answers"] = {};
    for (const [qid, rec] of Object.entries(a.answers)) {
      const image = rec.response.image;
      if (image && !image.startsWith("data:")) {
        const res = await fetch(image).catch(() => null);
        const dataUrl = res?.ok ? await blobToDataUrl(await res.blob()) : undefined;
        answers[qid] = { ...rec, response: { ...rec.response, image: dataUrl } };
      } else answers[qid] = rec;
    }
    portableAttempts.push({ ...a, answers });
  }
  const backup: Backup = {
    app: "lern-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects,
    materials: backupMaterials,
    tests,
    attempts: portableAttempts,
    plans,
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
  data.subjects.forEach((s) => repo.addSubject(s));
  for (const m of data.materials ?? []) {
    const { blobDataUrl, text, ...meta } = m;
    const blob = blobDataUrl ? await (await fetch(blobDataUrl)).blob() : undefined;
    await repo.addMaterial(meta, { blob, text });
  }
  (data.tests ?? []).forEach((t) => repo.addTest(t));
  for (const a of data.attempts ?? []) {
    const answers: Attempt["answers"] = {};
    for (const [qid, rec] of Object.entries(a.answers)) {
      const image = rec.response.image;
      if (image?.startsWith("data:")) {
        const blob = await (await fetch(image)).blob();
        answers[qid] = { ...rec, response: { ...rec.response, image: await repo.storeAnswerImage(blob) } };
      } else answers[qid] = rec;
    }
    repo.addAttempt({ ...a, answers });
  }
  (data.plans ?? []).forEach((p) => repo.addPlan(p));
  return { subjects: data.subjects.length, tests: data.tests?.length ?? 0 };
}
