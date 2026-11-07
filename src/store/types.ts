import type { Attempt, Material, Subject, Test } from "../types";

export interface Tables {
  subjects: Subject;
  materials: Material;
  tests: Test;
  attempts: Attempt;
}

export type TableName = keyof Tables;
export const TABLES: TableName[] = ["subjects", "materials", "tests", "attempts"];

/** Wo und wie Daten dauerhaft gespeichert werden (IndexedDB oder claude.ai). */
export interface Backend {
  /**
   * Lädt alle Daten. `onData` wird für jede Tabelle mindestens einmal aufgerufen,
   * bei Live-Speichern auch später bei Änderungen (z. B. von einem anderen Gerät).
   */
  start(
    onData: <T extends TableName>(table: T, records: Tables[T][]) => void,
    onError: (message: string) => void,
  ): Promise<void>;
  put<T extends TableName>(table: T, record: Tables[T]): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Speichert den Inhalt eines Materials und gibt die passenden Felder zurück. */
  storeMaterialContent(content: { blob?: Blob; text?: string; mimeType: string }): Promise<Pick<Material, "blob" | "text" | "assetId">>;
  /** Liest die Binärdaten eines Materials. */
  loadMaterialBlob(material: Material): Promise<Blob | null>;
  deleteMaterialContent(material: Material): Promise<void>;
  /** Speichert ein Antwort-Foto und liefert eine URL für <img>. */
  storeAnswerImage(blob: Blob): Promise<string>;
}
