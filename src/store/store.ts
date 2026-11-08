import { useSyncExternalStore } from "react";
import { backend } from "@platform-impl";
import type { Attempt, Material, StudyPlan, Subject, Test } from "../types";
import { TABLES, type StorageMode, type TableName, type Tables } from "./types";

/**
 * Zentrale Datenhaltung im Speicher. Alle Seiten lesen hieraus; Änderungen
 * werden sofort angezeigt und im Hintergrund dauerhaft gespeichert.
 */

export interface StoreState {
  ready: boolean;
  error: string | null;
  /** Wo die Daten liegen (erst nach dem Laden bekannt). */
  storageMode: StorageMode | null;
  subjects: Subject[];
  materials: Material[];
  tests: Test[];
  attempts: Attempt[];
  plans: StudyPlan[];
}

let state: StoreState = {
  ready: false,
  error: null,
  storageMode: null,
  subjects: [],
  materials: [],
  tests: [],
  attempts: [],
  plans: [],
};
const listeners = new Set<() => void>();
const loaded = new Set<TableName>();

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getState(): StoreState {
  return state;
}

export function useStore(): StoreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getState,
    getState,
  );
}

// ---------- Schreib-Warteschlange ----------
// Pro Datensatz läuft höchstens ein Schreibvorgang gleichzeitig; schnelle
// Folgeänderungen werden zusammengefasst (nur der letzte Stand wird geschrieben).

type Pending = { table: TableName; id: string; record: Tables[TableName] | null };
const desired = new Map<string, Pending>();
const running = new Set<string>();

function keyOf(table: TableName, id: string) {
  return `${table}/${id}`;
}

function schedule(table: TableName, id: string, record: Tables[TableName] | null) {
  const key = keyOf(table, id);
  desired.set(key, { table, id, record });
  if (!running.has(key)) void run(key);
}

async function run(key: string) {
  running.add(key);
  try {
    while (desired.has(key)) {
      const op = desired.get(key)!;
      try {
        if (op.record) await backend.put(op.table, op.record as never);
        else await backend.remove(op.table, op.id);
        if (desired.get(key) === op) desired.delete(key);
      } catch (e) {
        if (desired.get(key) === op) desired.delete(key);
        setState({ error: `Speichern fehlgeschlagen: ${errorText(e)}` });
      }
    }
  } finally {
    running.delete(key);
  }
}

function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Übernimmt Daten aus dem Speicher und legt noch nicht geschriebene lokale Änderungen darüber. */
function applyRemote<T extends TableName>(table: T, records: Tables[T][]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const p of desired.values()) {
    if (p.table !== table) continue;
    if (p.record) byId.set(p.id, p.record as Tables[T]);
    else byId.delete(p.id);
  }
  loaded.add(table);
  setState({
    [table]: sortRecords(table, [...byId.values()]),
    ready: TABLES.every((t) => loaded.has(t)),
  } as Partial<StoreState>);
}

function sortRecords<T extends TableName>(table: T, records: Tables[T][]): Tables[T][] {
  const key = table === "attempts" ? "startedAt" : "createdAt";
  return records.sort(
    (a, b) => ((a as unknown as Record<string, number>)[key] ?? 0) - ((b as unknown as Record<string, number>)[key] ?? 0),
  );
}

let started = false;
export function startStore(): void {
  if (started) return;
  started = true;
  backend
    .start(applyRemote, (message) => setState({ error: message }))
    .then(() => setState({ storageMode: backend.mode() }))
    .catch((e) => {
      setState({ error: errorText(e) });
    });
}

export function dismissError(): void {
  setState({ error: null });
}

// ---------- Änderungen ----------

function upsert<T extends TableName>(table: T, record: Tables[T]) {
  const list = state[table] as Tables[T][];
  const exists = list.some((r) => r.id === record.id);
  const next = exists ? list.map((r) => (r.id === record.id ? record : r)) : [...list, record];
  setState({ [table]: next } as Partial<StoreState>);
  schedule(table, record.id, record);
}

function removeLocal(table: TableName, ids: string[]) {
  if (ids.length === 0) return;
  const set = new Set(ids);
  setState({ [table]: (state[table] as { id: string }[]).filter((r) => !set.has(r.id)) } as Partial<StoreState>);
  ids.forEach((id) => schedule(table, id, null));
}

function find<T extends TableName>(table: T, id: string): Tables[T] | undefined {
  return (state[table] as Tables[T][]).find((r) => r.id === id);
}

export const repo = {
  getSubject: (id: string) => find("subjects", id),
  getTest: (id: string) => find("tests", id),
  getAttempt: (id: string) => find("attempts", id),
  getMaterial: (id: string) => find("materials", id),
  getPlan: (id: string) => find("plans", id),

  addSubject(s: Subject) {
    upsert("subjects", s);
  },
  updateSubject(id: string, patch: Partial<Subject>) {
    const s = find("subjects", id);
    if (s) upsert("subjects", { ...s, ...patch });
  },
  deleteSubject(id: string) {
    const materials = state.materials.filter((m) => m.subjectId === id);
    materials.forEach((m) => void backend.deleteMaterialContent(m).catch(() => {}));
    removeLocal("attempts", state.attempts.filter((a) => a.subjectId === id).map((a) => a.id));
    removeLocal("plans", state.plans.filter((p) => p.subjectId === id).map((p) => p.id));
    removeLocal("tests", state.tests.filter((t) => t.subjectId === id).map((t) => t.id));
    removeLocal("materials", materials.map((m) => m.id));
    removeLocal("subjects", [id]);
  },

  async addMaterial(meta: Omit<Material, "blob" | "text" | "assetId">, content: { blob?: Blob; text?: string }) {
    const stored = await backend.storeMaterialContent({ ...content, mimeType: meta.mimeType });
    upsert("materials", { ...meta, ...stored });
  },
  updateMaterial(id: string, patch: Partial<Material>) {
    const m = find("materials", id);
    if (m) upsert("materials", { ...m, ...patch });
  },
  deleteMaterial(id: string) {
    const m = find("materials", id);
    if (!m) return;
    void backend.deleteMaterialContent(m).catch(() => {});
    removeLocal("materials", [id]);
  },
  loadMaterialBlob(m: Material): Promise<Blob | null> {
    return backend.loadMaterialBlob(m);
  },

  addTest(t: Test) {
    upsert("tests", t);
  },
  updateTest(id: string, patch: Partial<Test>) {
    const t = find("tests", id);
    if (t) upsert("tests", { ...t, ...patch });
  },
  deleteTest(id: string) {
    removeLocal("attempts", state.attempts.filter((a) => a.testId === id).map((a) => a.id));
    removeLocal("tests", [id]);
  },

  addAttempt(a: Attempt) {
    upsert("attempts", a);
  },
  updateAttempt(id: string, patch: Partial<Attempt> | ((a: Attempt) => Attempt)) {
    const a = find("attempts", id);
    if (!a) return;
    upsert("attempts", typeof patch === "function" ? patch(a) : { ...a, ...patch });
  },

  addPlan(p: StudyPlan) {
    upsert("plans", p);
  },
  updatePlan(id: string, patch: Partial<StudyPlan> | ((p: StudyPlan) => StudyPlan)) {
    const p = find("plans", id);
    if (!p) return;
    const next = typeof patch === "function" ? patch(p) : { ...p, ...patch };
    upsert("plans", { ...next, updatedAt: Date.now() });
  },
  /** Löscht den Plan samt der Tests, die nur für ihn erstellt wurden. */
  deletePlan(id: string) {
    const testIds = state.tests.filter((t) => t.planId === id).map((t) => t.id);
    removeLocal("attempts", state.attempts.filter((a) => testIds.includes(a.testId)).map((a) => a.id));
    removeLocal("tests", testIds);
    removeLocal("plans", [id]);
  },

  clearAll() {
    state.materials.forEach((m) => void backend.deleteMaterialContent(m).catch(() => {}));
    for (const table of TABLES) removeLocal(table, (state[table] as { id: string }[]).map((r) => r.id));
  },

  storeAnswerImage(blob: Blob): Promise<string> {
    return backend.storeAnswerImage(blob);
  },
};
