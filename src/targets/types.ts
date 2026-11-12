import type { ComponentType } from "react";
import type { Backend } from "../store/types";
import type { TopicAnalysis } from "../ai/schemas";
import type { AnswerResponse, GenerationSettings, Material, MaterialRole, Question, Test, Verdict } from "../types";

export type GenerationPhase = "preparing" | "analyzing" | "writing";

export interface GenerationProgress {
  phase: GenerationPhase;
  questionsSoFar: number;
}

export interface GenerateParams {
  subjectId: string;
  materials: Material[];
  settings: GenerationSettings;
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

export interface TopicAnalysisParams {
  materials: Material[];
  examDate: string;
  daysUntilExam: number;
  availableMinutes: number;
  focus: string;
  /** Vom Lernenden vorgegebene Themen – nur ergänzen, keine neuen. */
  givenTopics?: string[];
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

export interface MaterialNameParams {
  fileName: string;
  /** Textauszug des Materials (z. B. erste PDF-Seiten). */
  text?: string;
  /** Bild des Materials bzw. der ersten Seite, wenn es keinen Text gibt. */
  image?: Blob;
  signal?: AbortSignal;
}

export interface AiGrade {
  score: number;
  verdict: Verdict;
  feedback: string;
}

export interface AiStatus {
  /** "ready": KI nutzbar; "checking": wird noch geprüft; "unavailable": nicht nutzbar. */
  state: "ready" | "checking" | "unavailable";
  /** Erklärung für die Oberfläche, wenn die KI nicht nutzbar ist. */
  reason?: string;
}

/** Was sich zwischen Web-Version und claude.ai-Version unterscheidet. */
export interface PlatformImpl {
  backend: Backend;
  generateTest(params: GenerateParams): Promise<Test>;
  gradeWithAi(question: Question, response: AnswerResponse, signal?: AbortSignal): Promise<AiGrade>;
  /** Lernplan: Themen aus dem Material ermitteln oder vorgegebene Themen ergänzen. */
  analyzeTopics(params: TopicAnalysisParams): Promise<TopicAnalysis>;
  /** Schlägt für ein Material mit nichtssagendem Dateinamen Name und Rolle vor. */
  suggestMaterialName(params: MaterialNameParams): Promise<{ name: string; role: MaterialRole | null }>;
  describeError(error: unknown): string;
  /** Synchroner Schnappschuss des KI-Status (für Code außerhalb von Komponenten). */
  aiStatus(): AiStatus;
  useAiStatus(): AiStatus;
  /** Name des Modells / der Modellstufe für die Testerstellung. */
  useGenerationModelLabel(): string;
  /** Einstellungsbereich für die KI (API-Schlüssel bzw. Modellstufen). */
  AiSettingsSection: ComponentType;
  /** Bietet eine Datei zum Speichern an (Backup). */
  saveFile(blob: Blob, fileName: string): Promise<void>;
  /** Kurzer Hinweis zu Kosten/Abrechnung für die Oberfläche. */
  usageNote: string;
}
