/**
 * Minimaler Zugriff auf die claude.ai-Laufzeit (window.claude.use). Nur die
 * Teile, die die App nutzt, sind hier typisiert.
 */

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  images?: Blob[];
  modelTier?: "default" | "complex" | "quick";
  effort?: "low" | "medium" | "high";
  cache?: boolean | { gcTime?: number; refresh?: boolean };
}

export interface SampleFn {
  (input: string, options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string, options?: SampleOptions): Promise<T>;
  limits(): Promise<{
    maxPromptBytes: number;
    images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] };
  }>;
}

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface QuerySnapshot {
  docs: DocSnapshot[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface DbError {
  code: string;
  message: string;
}

export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(path: string): CollectionRef;
}

export interface CollectionRef {
  path: string;
  doc(id?: string): DocRef;
  onSnapshot(next: (s: QuerySnapshot) => void, error?: (e: DbError) => void): () => void;
}

export interface Db {
  doc(path: string): DocRef;
  collection(path: string): CollectionRef;
}

export interface UserCap {
  id(): Promise<string | null>;
}

export interface AssetsCap {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; url: string; sizeBytes: number }>;
  delete(ref: string): Promise<unknown>;
}

export interface DownloadsCap {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

interface CapabilityMap {
  sample: SampleFn;
  db: Db;
  user: UserCap;
  assets: AssetsCap;
  downloads: DownloadsCap;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

/** Liefert eine Fähigkeit der claude.ai-Laufzeit oder null, wenn sie nicht verfügbar ist. */
export function useCapability<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> {
  const claude = typeof window !== "undefined" ? window.claude : undefined;
  if (!claude?.use) return Promise.resolve(null);
  return claude.use(name).then(
    (v) => (v ?? null) as CapabilityMap[K] | null,
    () => null,
  );
}

export function blobUrl(assetId: string): string {
  return `/_blob/${assetId}`;
}

export function isSampleError(e: unknown): e is SampleError {
  return !!e && typeof e === "object" && "code" in e && typeof (e as SampleError).code === "string";
}
