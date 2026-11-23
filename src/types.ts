export type MaterialRole = "tasks" | "solutions" | "tasks_with_solutions" | "reference";
export type MaterialKind = "pdf" | "image" | "text";

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Material {
  id: string;
  subjectId: string;
  name: string;
  /** Ursprünglicher Dateiname, wenn der Name automatisch vergeben wurde. */
  originalName?: string;
  kind: MaterialKind;
  mimeType: string;
  role: MaterialRole;
  /** Binärdaten (PDF / Bild) – nur in der Web-Version (IndexedDB). */
  blob?: Blob;
  /** Verweis auf die gespeicherte Datei – nur in der claude.ai-Version. */
  assetId?: string;
  /** Inhalt bei Text-Materialien (bei Excel-Dateien die Tabellen als Markdown). */
  text?: string;
  /** Ordnerpfad, wenn das Material als Teil eines Ordners hochgeladen wurde, z. B. „Analysis 1/Übungsblätter“. */
  folder?: string;
  /** Dateiname beim Hochladen – bleibt auch nach dem Umbenennen, damit ein Ordner erneut hochgeladen werden kann. */
  fileName?: string;
  /**
   * Von Claude abgeschriebener Text eingescannter Seiten bzw. Fotos (einmal
   * erstellt, danach statt der Bilder verwendet). Lange Texte liegen als Datei
   * (`transcriptAssetId`).
   */
  transcript?: string;
  transcriptAssetId?: string;
  size: number;
  createdAt: number;
}

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "short_answer"
  | "numeric"
  | "free_text";

export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: string;
  type: QuestionType;
  /** Aufgabenstellung (Markdown + LaTeX). */
  prompt: string;
  /** Antwortmöglichkeiten bei Auswahlfragen. */
  options: string[];
  /** Indizes der richtigen Antwortmöglichkeiten. */
  correctOptions: number[];
  /** Richtige Zahl bei numerischen Fragen. */
  numericAnswer: number | null;
  /** Erlaubte absolute Abweichung bei numerischen Fragen. */
  numericTolerance: number | null;
  unit: string | null;
  /** Akzeptierte Antworten bei Kurzantworten. */
  acceptedAnswers: string[];
  /** Vollständige Musterlösung (Markdown + LaTeX). */
  modelSolution: string;
  /** Kurze Erklärung, warum die Lösung stimmt / typische Fehler. */
  explanation: string;
  hint: string | null;
  topic: string;
  difficulty: Difficulty;
  points: number;
  /** Herkunft, z. B. "Blatt 3, Aufgabe 2a" oder "Skript Kap. 4". */
  source: string | null;
  /** true, wenn die Lösung aus dem hochgeladenen Material stammt. */
  solutionFromMaterial: boolean;
}

export type TestMode = "exact" | "generated";

export interface GenerationSettings {
  mode: TestMode;
  questionCount: number | null;
  difficulty: Difficulty | "mixed";
  allowedTypes: QuestionType[];
  focus: string;
  exactFormat: "original" | "auto_checkable";
  /** Lernplan: Fragen genau diesen Themen zuordnen (Feld topic). */
  topicNames?: string[];
}

export interface Test {
  id: string;
  subjectId: string;
  title: string;
  mode: TestMode;
  materialIds: string[];
  settings: GenerationSettings;
  questions: Question[];
  notes: string;
  createdAt: number;
  model: string;
  /** Gehört zu diesem Lernplan (Übung, Wiederholung, Probeklausur, Einstufung). */
  planId?: string;
  /** Übung zu den Schwachstellen einer Klausur-Analyse. */
  analysisId?: string;
}

export type Verdict = "correct" | "partial" | "wrong";

export interface AnswerResponse {
  selected?: number[];
  text?: string;
  number?: string;
  /** Foto einer handschriftlichen Lösung (data-URL oder Datei-URL). */
  image?: string;
}

export interface AnswerRecord {
  response: AnswerResponse;
  checked: boolean;
  score: number;
  maxScore: number;
  verdict: Verdict | null;
  feedback?: string;
  gradedBy?: "auto" | "ai" | "self";
  usedHint?: boolean;
}

export type AttemptMode = "practice" | "exam";

export interface Attempt {
  id: string;
  testId: string;
  subjectId: string;
  mode: AttemptMode;
  questionIds: string[];
  answers: Record<string, AnswerRecord>;
  currentIndex: number;
  status: "in_progress" | "finished";
  startedAt: number;
  finishedAt: number | null;
  label: string;
}

// ---------- Lernplan ----------

export type Importance = "high" | "medium" | "low";

export interface PlanTopic {
  id: string;
  name: string;
  description: string;
  /** Geschätzte Lernzeit in Minuten (ohne Übungstests). */
  estimatedMinutes: number;
  importance: Importance;
  /** IDs der Themen, die vorher verstanden sein sollten. */
  prerequisites: string[];
  /** Fundstelle im Material, z. B. „Skript S. 12–18“. */
  sources: string;
  /** Ergebnis im Einstufungstest in Prozent; null = nicht geprüft. */
  placementPercent: number | null;
}

export type PlanTaskType = "learn" | "practice" | "review" | "mock_exam" | "buffer";

export interface PlanTask {
  id: string;
  /** Datum im Format JJJJ-MM-TT. */
  date: string;
  type: PlanTaskType;
  topicIds: string[];
  title: string;
  minutes: number;
  status: "open" | "done" | "skipped";
  /** Zur Aufgabe gehörender Test (Übung, Wiederholung, Probeklausur). */
  testId?: string;
  /** Abgeschlossener Durchlauf, der die Aufgabe erledigt hat. */
  attemptId?: string;
  /** Automatisch ergänzt, weil ein Thema noch nicht sitzt. */
  extra?: boolean;
}

export interface StudyPlan {
  id: string;
  subjectId: string;
  title: string;
  examDate: string;
  startDate: string;
  /** Lernzeit in Minuten pro Wochentag, Index 0 = Sonntag … 6 = Samstag. */
  minutesPerWeekday: number[];
  materialIds: string[];
  focus: string;
  topics: PlanTopic[];
  tasks: PlanTask[];
  /** "draft": Themen prüfen / Einstufung; "active": Plan steht. */
  status: "draft" | "active";
  placementTestId?: string;
  notes: string;
  warnings: string[];
  createdAt: number;
  updatedAt: number;
}

/** Lernzettel zu einem Thema eines Lernplans, von Claude geschrieben. */
/** Umfang eines Lernzettels aus Material. */
export type NoteLength = "kurz" | "normal" | "ausfuehrlich";

/**
 * Lernzettel – entweder zu einem Thema eines Lernplans (planId + topicId) oder
 * direkt aus ausgewähltem Material (materialIds).
 */
export interface StudyNote {
  id: string;
  subjectId: string;
  planId?: string;
  topicId?: string;
  /** Titel: bei Lernplan-Zetteln der Themenname zum Zeitpunkt der Erstellung. */
  topicName: string;
  /** Lernzettel aus Material: verwendetes Material, Schwerpunkt und Umfang (für „Neu schreiben“). */
  materialIds?: string[];
  focus?: string;
  length?: NoteLength;
  /** Markdown mit LaTeX. */
  content: string;
  /** true: aus dem Material des Plans; false: aus Claudes Fachwissen. */
  fromMaterial: boolean;
  model: string;
  createdAt: number;
}

// ---------- Markierungen im Lernzettel ----------

/** „unsure“: weiß es nicht mehr genau; „forgot“: weiß es nicht mehr. */
export type MarkLevel = "unsure" | "forgot";

/** Worauf sich eine Erklärung stützt. */
export type MarkBasis = "material" | "wissen" | "internet";

export interface MarkMessage {
  /** "assistant": Erklärung von Claude; "user": Nachfrage der lernenden Person. */
  role: "user" | "assistant";
  content: string;
  basis?: MarkBasis[];
  /** Seiten aus der Internetsuche (nur Web-Version). */
  links?: { url: string; title: string }[];
  model?: string;
  at: number;
}

/** Wiederfinden einer Stelle im angezeigten Text (wie W3C TextQuoteSelector). */
export interface MarkAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

/** Markierte Stelle eines Lernzettels mit Claudes Erklärungen (eigener Datensatz, damit der Lernzettel klein bleibt). */
export interface NoteMark {
  id: string;
  noteId: string;
  subjectId: string;
  /** Markierter Text, Formeln als LaTeX ($…$) – für die Anzeige und für Claude. */
  quote: string;
  anchor: MarkAnchor;
  level: MarkLevel;
  /** Gespräch zur Stelle: Erklärung, Nachfragen, weitere Antworten. */
  messages: MarkMessage[];
  createdAt: number;
}

// ---------- Klausur-Analyse ----------

/** Art eines Fehlers in einer Klausur. */
export type ErrorKind =
  | "understanding"
  | "method"
  | "calculation"
  | "careless"
  | "incomplete"
  | "terminology"
  | "form"
  | "other";

export type ExamTaskStatus = "correct" | "partial" | "wrong" | "missing" | "unknown";

/** Eine Aufgabe der Klausur: wie es lief und was falsch war. */
export interface ExamTaskResult {
  /** z. B. „Aufgabe 3b“ */
  label: string;
  topic: string;
  pointsAchieved: number | null;
  pointsMax: number | null;
  status: ExamTaskStatus;
  /** Was konkret schiefging (leer, wenn alles stimmt). */
  mistake: string;
  /** So wäre es richtig – kurz, Markdown. */
  correction: string;
  errorKinds: ErrorKind[];
}

/** Schwachstelle: ein Thema, das (noch) nicht sitzt. */
export interface ExamWeakness {
  topic: string;
  priority: Importance;
  /** Was genau nicht sitzt. */
  problem: string;
  /** Worauf achten / wie üben. */
  advice: string;
  /** Betroffene Aufgaben, z. B. „Aufgabe 2“. */
  tasks: string[];
  pointsLost: number | null;
}

/** Auswertung einer korrigierten Klausur (bzw. Klassenarbeit, Test). */
export interface ExamAnalysis {
  id: string;
  subjectId: string;
  title: string;
  /** Hochgeladene Klausur (und ggf. Aufgabenblatt, Lösung, Erwartungshorizont). */
  materialIds: string[];
  /** Was die lernende Person dazu angegeben hat. */
  remarks: string;
  pointsAchieved: number | null;
  pointsMax: number | null;
  /** Note, wie sie auf der Klausur steht. */
  grade: string | null;
  /** Gesamteindruck in wenigen Sätzen. */
  summary: string;
  strengths: string[];
  /** Nach Priorität sortiert. */
  weaknesses: ExamWeakness[];
  errorPatterns: { kind: ErrorKind; description: string }[];
  tasks: ExamTaskResult[];
  /** Hinweise, z. B. unleserliche Seiten. */
  notes: string;
  model: string;
  createdAt: number;
}
