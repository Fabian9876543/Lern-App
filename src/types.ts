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
  /** Inhalt bei Text-Materialien. */
  text?: string;
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
export interface StudyNote {
  id: string;
  subjectId: string;
  planId: string;
  topicId: string;
  /** Themenname zum Zeitpunkt der Erstellung. */
  topicName: string;
  /** Markdown mit LaTeX. */
  content: string;
  /** true: aus dem Material des Plans; false: aus Claudes Fachwissen. */
  fromMaterial: boolean;
  model: string;
  createdAt: number;
}
