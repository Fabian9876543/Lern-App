import { z } from "zod";

export const GeneratedQuestionSchema = z.object({
  type: z
    .enum(["single_choice", "multiple_choice", "short_answer", "numeric", "free_text"])
    .describe("Aufgabenformat"),
  prompt: z.string().describe("Aufgabenstellung in Markdown, Formeln in LaTeX ($...$ bzw. $$...$$)"),
  options: z.array(z.string()).describe("Antwortmöglichkeiten bei single_choice/multiple_choice, sonst leer"),
  correct_options: z.array(z.number().int()).describe("0-basierte Indizes der richtigen Optionen, sonst leer"),
  numeric_answer: z.number().nullable().describe("Richtiges Zahlenergebnis bei numeric, sonst null"),
  numeric_tolerance: z.number().nullable().describe("Erlaubte absolute Abweichung bei numeric, sonst null"),
  unit: z.string().nullable().describe("Einheit des Ergebnisses bei numeric, sonst null"),
  accepted_answers: z.array(z.string()).describe("Akzeptierte Varianten bei short_answer, sonst leer"),
  model_solution: z.string().describe("Vollständige Musterlösung mit Lösungsweg"),
  explanation: z.string().describe("Kurze Erklärung der Lösung und typischer Fehler"),
  hint: z.string().nullable().describe("Hilfreicher Tipp, der die Lösung nicht verrät"),
  topic: z.string().describe("Kurzes Thema, z. B. 'Ableitungen'"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  points: z.number().int().describe("Punkte entsprechend dem Aufwand, 1 bis 10"),
  source: z.string().nullable().describe("Herkunft im Material, z. B. 'Blatt 3, Aufgabe 2a'"),
  solution_from_material: z.boolean().describe("true, wenn die Lösung aus dem Lösungsmaterial übernommen wurde"),
});

export const GeneratedTestSchema = z.object({
  title: z.string().describe("Kurzer Titel für den Test"),
  notes: z.string().describe("Hinweise an den Lernenden, z. B. unlesbare Seiten oder fehlende Lösungen; sonst leer"),
  questions: z.array(GeneratedQuestionSchema),
});

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type GeneratedTest = z.infer<typeof GeneratedTestSchema>;

export const GradingSchema = z.object({
  verdict: z.enum(["correct", "partial", "wrong"]),
  score: z.number().describe("Erreichte Punkte zwischen 0 und der Maximalpunktzahl"),
  feedback: z.string().describe("Kurzes, konkretes Feedback an den Lernenden"),
});

export type GradingResult = z.infer<typeof GradingSchema>;

export const GeneratedTopicSchema = z.object({
  name: z.string().describe("Kurzer, eindeutiger Themenname"),
  description: z.string().describe("Was man zu diesem Thema können muss, 1–2 Sätze"),
  estimated_minutes: z.number().int().describe("Lernzeit in Minuten ohne Übungstests, 20 bis 300"),
  importance: z.enum(["high", "medium", "low"]),
  prerequisites: z.array(z.string()).describe("Namen anderer Themen aus der Liste, die vorher sitzen sollten"),
  sources: z.string().describe("Fundstelle im Material, z. B. 'Skript S. 12–18'"),
});

export const TopicAnalysisSchema = z.object({
  title: z.string().describe("Kurzer Name für den Lernplan"),
  notes: z.string().describe("Hinweise an den Lernenden oder leerer String"),
  topics: z.array(GeneratedTopicSchema),
});

export type GeneratedTopic = z.infer<typeof GeneratedTopicSchema>;
export type TopicAnalysis = z.infer<typeof TopicAnalysisSchema>;

export const MaterialNameSchema = z.object({
  name: z.string().describe("Kurzer, aussagekräftiger Name, höchstens 60 Zeichen, ohne Dateiendung"),
  role: z.enum(["tasks", "solutions", "tasks_with_solutions", "reference"]),
});

export type MaterialNameSuggestion = z.infer<typeof MaterialNameSchema>;
