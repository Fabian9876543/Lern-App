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

/** Ein Teil der Aufgaben, wenn ein Test in mehreren Anfragen abgeholt wird. */
export const GeneratedTestPartSchema = GeneratedTestSchema.extend({
  more: z.boolean().describe("true, wenn noch weitere Aufgaben folgen, die in dieser Antwort nicht mehr übernommen wurden"),
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

// ---------- Klausur-Analyse ----------

export const ERROR_KINDS = ["understanding", "method", "calculation", "careless", "incomplete", "terminology", "form", "other"] as const;
export const EXAM_TASK_STATUSES = ["correct", "partial", "wrong", "missing", "unknown"] as const;

export const ExamAnalysisSchema = z.object({
  title: z.string().describe("Kurzer Titel, z. B. 'Klausur Analysis – November'"),
  points_achieved: z.number().nullable().describe("Erreichte Gesamtpunkte, nur wenn sie auf der Klausur stehen, sonst null"),
  points_max: z.number().nullable().describe("Mögliche Gesamtpunkte, nur wenn sie erkennbar sind, sonst null"),
  grade: z.string().nullable().describe("Note genau wie auf der Klausur, z. B. '3+' oder '8 Punkte', sonst null"),
  summary: z.string().describe("Gesamteindruck in 2–4 Sätzen, direkt an den Lernenden"),
  strengths: z.array(z.string()).describe("Was gut lief, 1–4 kurze Punkte"),
  weaknesses: z
    .array(
      z.object({
        topic: z.string().describe("Thema, kurz (2–6 Wörter)"),
        priority: z.enum(["high", "medium", "low"]),
        problem: z.string().describe("Was genau nicht sitzt – konkret"),
        advice: z.string().describe("Worauf achten und wie üben, 1–2 Sätze"),
        tasks: z.array(z.string()).describe("Betroffene Aufgaben, z. B. 'Aufgabe 2b'"),
        points_lost: z.number().nullable().describe("Dadurch verlorene Punkte oder null"),
      }),
    )
    .describe("Schwachstellen, nach Priorität sortiert"),
  error_patterns: z
    .array(z.object({ kind: z.enum(ERROR_KINDS), description: z.string().describe("Wie sich der Fehler zeigt, konkret") }))
    .describe("Wiederkehrende Fehlerarten"),
  tasks: z
    .array(
      z.object({
        label: z.string().describe("z. B. 'Aufgabe 3b'"),
        topic: z.string(),
        points_achieved: z.number().nullable(),
        points_max: z.number().nullable(),
        status: z.enum(EXAM_TASK_STATUSES),
        mistake: z.string().describe("Was konkret schiefging; leer, wenn alles stimmt"),
        correction: z.string().describe("So wäre es richtig, kurz, Markdown"),
        error_kinds: z.array(z.enum(ERROR_KINDS)),
      }),
    )
    .describe("Alle Aufgaben der Klausur in ihrer Reihenfolge"),
  notes: z.string().describe("Hinweise, z. B. unleserliche Seiten oder fehlende Korrektur; sonst leer"),
});

export type GeneratedExamAnalysis = z.infer<typeof ExamAnalysisSchema>;
