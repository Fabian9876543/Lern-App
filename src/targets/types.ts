import type { ComponentType } from "react";
import type { Backend } from "../store/types";
import type { GeneratedExamAnalysis, SolutionCheckResult, TopicAnalysis } from "../ai/schemas";
import type {
  AnswerResponse,
  GenerationSettings,
  MarkBasis,
  MarkLevel,
  Material,
  MaterialRole,
  NoteLength,
  Question,
  Test,
  Verdict,
} from "../types";

export type GenerationPhase = "preparing" | "transcribing" | "analyzing" | "writing";

export interface GenerationProgress {
  phase: GenerationPhase;
  questionsSoFar: number;
  /** Beim Abschreiben eingescannter Seiten: erledigt / insgesamt. */
  pagesDone?: number;
  pagesTotal?: number;
  /** Bei sehr vielen Aufgaben: der wievielte Teil gerade abgeholt wird (ab 2). */
  part?: number;
}

export interface GenerateParams {
  subjectId: string;
  /** Name des Fachs – wichtig, wenn ohne Material erzeugt wird. */
  subjectName?: string;
  /** Ohne Material (nur Modus „generated“) entstehen die Aufgaben aus Claudes Fachwissen. */
  materials: Material[];
  settings: GenerationSettings;
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

export interface TopicAnalysisParams {
  subjectName: string;
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

export interface StudyNoteParams {
  subjectName: string;
  topic: { name: string; description: string; sources: string };
  /** Namen aller Themen des Plans in Lernreihenfolge. */
  planTopics: string[];
  /** Geplante Lernzeit für das Thema in Minuten. */
  minutes: number;
  focus: string;
  /** Material des Plans; leer = aus Claudes Fachwissen. */
  materials: Material[];
  signal?: AbortSignal;
  /** Bisher geschriebener Text (für die Live-Anzeige). */
  onText?: (text: string) => void;
}

export interface MaterialNoteParams {
  subjectName: string;
  /** Thema oder Schwerpunkt – leer für den ganzen Stoff. */
  focus: string;
  length: NoteLength;
  materials: Material[];
  signal?: AbortSignal;
  /** Bisher geschriebener Text (für die Live-Anzeige). */
  onText?: (text: string) => void;
}

export interface ExamAnalysisParams {
  subjectName: string;
  /** Korrigierte Klausur und ggf. Aufgabenblatt, Lösung, Erwartungshorizont. */
  materials: Material[];
  /** Hinweise der lernenden Person (z. B. „Note 4, Rechenwege zu knapp“). */
  remarks: string;
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

export interface ResultAnalysisParams {
  subjectName: string;
  /** Der Testdurchlauf als Text: Fragen, Antworten, Bewertung, Rückmeldung. */
  transcript: string;
  signal?: AbortSignal;
  onProgress?: (p: GenerationProgress) => void;
}

export interface NoteFixParams {
  subjectName: string;
  noteTitle: string;
  noteContent: string;
  quote: string;
  /** Was laut der lernenden Person falsch ist (optional). */
  request: string;
  /** Bisherige Erklärungen und Nachfragen zur Stelle. */
  history: { role: "user" | "assistant"; content: string }[];
  materials: Material[];
  signal?: AbortSignal;
}

export interface NoteFix {
  /** Zu ersetzender Ausschnitt; leer, wenn die Stelle stimmt. */
  old: string;
  replacement: string;
  reason: string;
}

export interface SolutionCheckParams {
  subjectName: string;
  question: Question;
  /** Antwort der lernenden Person als Text (leer = keine). */
  answer: string;
  /** Rückmeldung zur Bewertung, falls vorhanden. */
  feedback: string;
  /** Was laut der lernenden Person falsch ist (optional). */
  request: string;
  /** Material des Tests; leer = aus Claudes Fachwissen. */
  materials: Material[];
  signal?: AbortSignal;
}

export interface ExplainParams {
  subjectName: string;
  noteTitle: string;
  /** Der ganze Lernzettel (Markdown) als Zusammenhang. */
  noteContent: string;
  /** Markierte Stelle, Formeln als LaTeX. */
  quote: string;
  level: MarkLevel;
  /** Material des Lernzettels; leer = aus Claudes Fachwissen. */
  materials: Material[];
  /** Bisheriges Gespräch zur Stelle; leer bei der ersten Erklärung, sonst endet es mit einer Nachfrage. */
  history: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  /** Bisher geschriebener Text (für die Live-Anzeige). */
  onText?: (text: string) => void;
}

export interface ExplainResult {
  content: string;
  basis: MarkBasis[] | undefined;
  /** Seiten aus der Internetsuche. */
  links?: { url: string; title: string }[];
  model: string;
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
  /** Schreibt einen Lernzettel (Markdown) zu einem Thema des Lernplans. */
  createStudyNote(params: StudyNoteParams): Promise<{ content: string; model: string }>;
  /** Schreibt einen Lernzettel (Markdown, mit Titel) direkt aus ausgewähltem Material. */
  createMaterialNote(params: MaterialNoteParams): Promise<{ title: string | null; content: string; model: string }>;
  /** Wertet eine korrigierte Klausur aus: Fehler je Aufgabe, Schwachstellen, Fehlerarten. */
  analyzeExam(params: ExamAnalysisParams): Promise<{ analysis: GeneratedExamAnalysis; model: string }>;
  /** Wertet ein Testergebnis aus der App aus: Schwachstellen, Muster, Übungstipps. */
  analyzeResult(params: ResultAnalysisParams): Promise<{ analysis: GeneratedExamAnalysis; model: string }>;
  /** Erklärt eine markierte Stelle eines Lernzettels (und beantwortet Nachfragen dazu). */
  explainPassage(params: ExplainParams): Promise<ExplainResult>;
  /** Schlägt eine Korrektur für eine markierte Stelle im Lernzettel vor. */
  fixNotePassage(params: NoteFixParams): Promise<NoteFix>;
  /** Prüft die hinterlegte Lösung einer Aufgabe und liefert ggf. die korrigierte Lösung. */
  checkSolution(params: SolutionCheckParams): Promise<SolutionCheckResult>;
  /** Kann Claude beim Erklären im Internet suchen? */
  canSearchWeb: boolean;
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
