import type { Difficulty, GenerationSettings, Question, QuestionType } from "../types";

export const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "Single Choice",
  multiple_choice: "Multiple Choice",
  short_answer: "Kurzantwort",
  numeric: "Zahlenergebnis",
  free_text: "Freitext / Rechenweg",
};

export const DIFFICULTY_LABELS: Record<Difficulty | "mixed", string> = {
  easy: "leicht",
  medium: "mittel",
  hard: "schwer",
  mixed: "gemischt",
};

export const GENERATION_SYSTEM_PROMPT = `Du bist ein erfahrener Tutor. Du erstellst aus dem Lernmaterial eines Lernenden einen interaktiven Übungstest, den eine Lern-App anzeigt und auswertet.

Jedes Material ist mit einer Rolle beschriftet: „Aufgaben“, „Lösungen“, „Aufgaben + Lösungen“ oder „Lernmaterial / Referenz“.

Aufgabenformate (Feld "type"):
- single_choice: genau eine richtige Option. 3–5 Optionen in "options", Index der richtigen in "correct_options".
- multiple_choice: eine oder mehrere richtige Optionen; schreibe „(mehrere Antworten möglich)“ in die Aufgabenstellung.
- numeric: eindeutiges Zahlenergebnis in "numeric_answer", sinnvolle absolute Toleranz für Rundungen in "numeric_tolerance", Einheit in "unit". Die Aufgabenstellung sagt, worauf gerundet werden soll.
- short_answer: ein Begriff, Name oder sehr kurzer Ausdruck; alle gängigen Schreibweisen in "accepted_answers".
- free_text: offene Aufgaben wie Herleitungen, Beweise, Erklärungen oder mehrschrittige Rechnungen. Die Antwort wird später von einer KI anhand der Musterlösung bewertet.

Für jede Aufgabe:
- Die Aufgabenstellung ist für sich allein verständlich. Die App kann keine Bilder aus dem Material anzeigen: Werden Abbildungen, Tabellen oder Diagramme gebraucht, gib die nötigen Informationen als Text, Markdown-Tabelle oder LaTeX wieder.
- "model_solution" ist eine vollständige, nachvollziehbare Musterlösung mit Lösungsweg; "explanation" erklärt kurz, warum das richtig ist und welche Fehler typisch sind; "hint" gibt einen Denkanstoß, ohne die Lösung zu verraten.
- Bei Auswahlfragen sind die falschen Optionen plausibel (typische Fehler, Verwechslungen) und die Position der richtigen Option variiert.
- Formatierung: Markdown; Formeln in LaTeX mit $...$ (inline) und $$...$$ (abgesetzt).
- Sprache: die Sprache des Materials.
- Prüfe jede Lösung sorgfältig, bevor du sie einträgst.

In "notes" schreibst du kurz Hinweise an den Lernenden, falls etwas auffällt (unlesbare Seiten, Aufgaben ohne Lösung, Widersprüche zwischen Aufgabe und Lösung). Sonst bleibt "notes" leer.`;

export function buildTaskInstruction(settings: GenerationSettings): string {
  const typeList = settings.allowedTypes.map((t) => `${t} (${TYPE_LABELS[t]})`).join(", ");
  const focus = settings.focus.trim();

  if (settings.mode === "exact") {
    const formatRule =
      settings.exactFormat === "auto_checkable"
        ? `Wandle Aufgaben in automatisch auswertbare Formate um, wo das ohne inhaltliche Änderung geht: Rechenaufgaben mit eindeutigem Ergebnis als numeric, Begriffsfragen als short_answer, Wissens- und Verständnisfragen als single_choice oder multiple_choice mit plausiblen Distraktoren. Beweise, Herleitungen und Erklärungen bleiben free_text.`
        : `Wähle das Format, das der Originalaufgabe entspricht: Auswahlaufgaben bleiben Auswahlaufgaben, Rechenaufgaben mit eindeutigem Zahlenergebnis werden numeric, alles Offene wird free_text.`;
    return `Modus: ORIGINALAUFGABEN.
Übernimm die Aufgaben aus den Materialien mit der Rolle „Aufgaben“ oder „Aufgaben + Lösungen“ möglichst wortgetreu – gleiche Zahlen, gleiche Formulierungen, gleiche Reihenfolge. Erfinde keine eigenen Aufgaben dazu.
Teilaufgaben (a, b, c …) werden einzelne Fragen; nimm den gemeinsamen Aufgabenkontext in jede Teilfrage auf. Trage in "source" ein, woher die Aufgabe stammt (z. B. „Blatt 2, Aufgabe 3b“).
Übernimm die Lösungen aus den Lösungsmaterialien und setze dann "solution_from_material" auf true. Fehlt zu einer Aufgabe die Lösung, löse sie selbst sorgfältig, setze "solution_from_material" auf false und erwähne das in "notes".
${formatRule}
Materialien mit der Rolle „Lernmaterial / Referenz“ dienen nur als Hintergrund für Erklärungen.${focus ? `\nBeschränke dich auf Aufgaben zu: ${focus}` : ""}${topicRule(settings)}`;
  }

  const count = settings.questionCount ?? 10;
  const difficulty =
    settings.difficulty === "mixed"
      ? "gemischt – etwa ein Drittel leicht, die Hälfte mittel, der Rest schwer"
      : DIFFICULTY_LABELS[settings.difficulty];
  return `Modus: NEUE AUFGABEN.
Erstelle genau ${count} neue Aufgaben, die die Inhalte und Fähigkeiten aus dem Material abprüfen.
Die Aufgaben dürfen nicht mit Aufgaben im Material übereinstimmen: verwende neue Zahlen, neue Beispiele und andere Fragestellungen – aber denselben Stoff und ein vergleichbares Niveau. Wenn das Material Übungs- oder Klausuraufgaben enthält, orientiere dich an deren Stil und Anspruch.
Decke die wichtigsten Themen des Materials ausgewogen ab, statt dich auf ein Detail zu konzentrieren.
Schwierigkeit: ${difficulty}.
Erlaubte Formate: ${typeList}. Nutze eine sinnvolle Mischung dieser Formate, passend zum Stoff.
Trage in "source" ein, auf welchen Teil des Materials sich die Aufgabe bezieht. "solution_from_material" ist immer false.${focus ? `\nSchwerpunkt: ${focus}` : ""}${topicRule(settings)}`;
}

function topicRule(settings: GenerationSettings): string {
  if (!settings.topicNames?.length) return "";
  return `\nOrdne jede Aufgabe genau einem dieser Themen zu und schreibe den Namen exakt so in "topic": ${settings.topicNames.map((t) => `„${t}“`).join(", ")}.`;
}

export const GRADING_SYSTEM_PROMPT = `Du bewertest die Antwort eines Lernenden auf eine Übungsaufgabe anhand der Musterlösung.

- Bewerte inhaltlich: Ein anderer, korrekter Lösungsweg oder eine andere Formulierung ist genauso richtig.
- Vergib Teilpunkte für teilweise richtige Antworten (z. B. richtiger Ansatz, aber Rechenfehler). Halbe Punkte sind erlaubt.
- verdict: "correct" bei voller Punktzahl, "wrong" bei 0 Punkten, sonst "partial".
- feedback: 1–4 Sätze in der Sprache der Aufgabe, direkt an den Lernenden („du“). Nenne konkret, was stimmt und was fehlt oder falsch ist. Die Musterlösung wird separat angezeigt – wiederhole sie nicht vollständig.
- Ist ein Foto einer handschriftlichen Lösung beigefügt, bewerte den Inhalt des Fotos. Ist es unleserlich, sag das im Feedback.
- Leere oder themenfremde Antworten bekommen 0 Punkte.`;

/** Aufgabe, Musterlösung und Antwort für die KI-Bewertung. */
export function gradingUserText(
  question: Pick<Question, "type" | "prompt" | "modelSolution" | "acceptedAnswers" | "points">,
  correctAnswer: string,
  answerText: string,
  hasImage: boolean,
): string {
  const accepted =
    question.type === "short_answer" && question.acceptedAnswers.length
      ? `\n\nAkzeptierte Antworten (Beispiele): ${question.acceptedAnswers.join(" | ")}`
      : "";
  return `<aufgabe>\n${question.prompt}\n</aufgabe>\n\n<musterloesung>\n${question.modelSolution || correctAnswer}\n</musterloesung>${accepted}\n\nMaximalpunktzahl: ${question.points}\n\n<antwort_des_lernenden>\n${answerText || "(keine Textantwort)"}\n</antwort_des_lernenden>${hasImage ? "\n\nDas beigefügte Bild ist ein Foto der handschriftlichen Lösung des Lernenden." : ""}`;
}

/**
 * Formatbeschreibung für Umgebungen ohne erzwungenes JSON-Schema
 * (claude.ai-Version). Die Felder entsprechen GeneratedTestSchema.
 */
export const TEST_JSON_FORMAT = `Antworte ausschließlich mit einem JSON-Objekt in genau dieser Form (keine weiteren Texte):
{
  "title": "Kurzer Titel für den Test",
  "notes": "Hinweise an den Lernenden oder leerer String",
  "questions": [
    {
      "type": "single_choice" | "multiple_choice" | "short_answer" | "numeric" | "free_text",
      "prompt": "Aufgabenstellung (Markdown, LaTeX)",
      "options": ["…"],                 // nur bei Auswahlfragen, sonst []
      "correct_options": [0],           // 0-basierte Indizes, sonst []
      "numeric_answer": 3.14 | null,
      "numeric_tolerance": 0.01 | null,
      "unit": "m/s" | null,
      "accepted_answers": ["…"],        // nur bei short_answer, sonst []
      "model_solution": "Vollständige Musterlösung mit Lösungsweg",
      "explanation": "Kurze Erklärung und typische Fehler",
      "hint": "Denkanstoß" | null,
      "topic": "Kurzes Thema",
      "difficulty": "easy" | "medium" | "hard",
      "points": 1 bis 10,
      "source": "Herkunft im Material" | null,
      "solution_from_material": true | false
    }
  ]
}
Die Kommentare oben dienen nur der Erklärung – schreibe gültiges JSON ohne Kommentare. Achtung: In JSON-Strings muss jeder Backslash verdoppelt werden, also z. B. "$\\\\frac{1}{2}$" für $\\frac{1}{2}$.`;

export const GRADING_JSON_FORMAT = `Antworte ausschließlich mit einem JSON-Objekt: {"verdict": "correct" | "partial" | "wrong", "score": Zahl zwischen 0 und der Maximalpunktzahl, "feedback": "1–4 Sätze"}`;

// ---------- Lernplan ----------

export const TOPIC_SYSTEM_PROMPT = `Du bist ein erfahrener Tutor und hilfst einem Lernenden bei der Vorbereitung auf eine Prüfung. Du erstellst die Liste der prüfungsrelevanten Themen; eine Lern-App verteilt sie anschließend auf die Tage bis zur Prüfung.

Jedes Material ist mit einer Rolle beschriftet: „Aufgaben“, „Lösungen“, „Aufgaben + Lösungen“ oder „Lernmaterial / Referenz“. Altklausuren und Übungsblätter zeigen, was in der Prüfung drankommt.

Für jedes Thema:
- name: kurz und eindeutig (2–6 Wörter), wie in einem Inhaltsverzeichnis.
- description: 1–2 Sätze, was man zu diesem Thema können muss.
- estimated_minutes: realistische Zeit, um das Thema zu verstehen und typische Aufgaben selbst zu lösen – inklusive Durcharbeiten der Beispiele, ohne Übungstests. Zwischen 20 und 300.
- importance: "high", wenn das Thema in Klausuren oder Übungen häufig vorkommt oder Grundlage für vieles andere ist; "low" für Randthemen; sonst "medium".
- prerequisites: Namen anderer Themen aus deiner Liste, die man vorher verstanden haben sollte – genau so geschrieben wie dort.
- sources: wo das Thema im Material steht (Dateiname und Seiten, Kapitel oder Aufgaben).

Ordne die Themen in einer sinnvollen Lernreihenfolge. Fasse sehr kleine Punkte zusammen und teile sehr große Themen auf, sodass meist 6 bis 20 Themen entstehen.
title: kurzer Name für den Lernplan, z. B. „Klausur Analysis 1“.
notes: kurze Hinweise an den Lernenden, etwa wenn das Material Lücken hat oder die Zeit sehr knapp ist; sonst leer.
Sprache: die Sprache des Materials.`;

export function buildTopicInstruction(params: {
  examDateLabel: string;
  daysUntilExam: number;
  availableMinutes: number;
  focus: string;
  givenTopics?: string[];
  hasMaterials: boolean;
}): string {
  const hours = Math.round(params.availableMinutes / 60);
  const lines = [
    `Die Prüfung ist am ${params.examDateLabel}, also in ${params.daysUntilExam} Tagen. Bis dahin sind ca. ${hours} Stunden Lernzeit eingeplant.`,
  ];
  if (!params.hasMaterials) lines.push("Es wurde kein Material ausgewählt – stütze dich auf dein Fachwissen und schreibe in sources „kein Material“.");
  if (params.focus.trim()) lines.push(`Hinweise des Lernenden: ${params.focus.trim()}`);
  if (params.givenTopics?.length) {
    lines.push(
      `Die Themen der Prüfung stehen bereits fest. Verwende genau diese Themen in dieser Reihenfolge und mit genau diesen Namen – füge keine hinzu und lass keine weg. Ergänze die übrigen Felder; findet sich ein Thema nicht im Material, schätze anhand deines Fachwissens und schreibe in sources „nicht im Material“.\n${params.givenTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    );
  } else {
    lines.push("Erstelle die Themenliste aus dem Material.");
  }
  return lines.join("\n\n");
}

export const TOPIC_JSON_FORMAT = `Antworte ausschließlich mit einem JSON-Objekt in genau dieser Form (keine weiteren Texte, keine Kommentare):
{
  "title": "Kurzer Name für den Lernplan",
  "notes": "Hinweise oder leerer String",
  "topics": [
    {
      "name": "Themenname",
      "description": "Was man können muss",
      "estimated_minutes": 90,
      "importance": "high" | "medium" | "low",
      "prerequisites": ["Name eines anderen Themas"],
      "sources": "Fundstelle im Material"
    }
  ]
}`;

// ---------- Material benennen ----------

export const MATERIAL_NAME_PROMPT = `Du benennst eine hochgeladene Lerndatei für eine Lern-App. Der bisherige Dateiname sagt nichts über den Inhalt.

Gib einen kurzen, aussagekräftigen Namen (höchstens 60 Zeichen), so wie man die Datei sinnvoll benennen würde: Art des Dokuments, Nummer und Thema – z. B. „Übungsblatt 3 – Integralrechnung“, „Lösungen zu Blatt 3“, „Skript Kap. 4: Ableitungen“, „Altklausur Analysis WS 24/25“. Ohne Dateiendung und ohne Anführungszeichen. Sprache: die Sprache des Materials.

Bestimme außerdem die Rolle:
- "tasks": Aufgaben ohne Lösungen
- "solutions": nur Lösungen bzw. Musterlösungen
- "tasks_with_solutions": Aufgaben zusammen mit ihren Lösungen
- "reference": Lernmaterial wie Skript, Folien, Mitschrift oder Buchseiten`;

export const MATERIAL_NAME_JSON_FORMAT = `Antworte ausschließlich mit einem JSON-Objekt: {"name": "…", "role": "tasks" | "solutions" | "tasks_with_solutions" | "reference"}`;

export function materialNameUserText(fileName: string, text: string | undefined): string {
  return text?.trim()
    ? `Bisheriger Dateiname: ${fileName}\n\n<inhalt>\n${text.trim()}\n</inhalt>`
    : `Bisheriger Dateiname: ${fileName}\n\nDas beigefügte Bild zeigt das Material (bzw. seine erste Seite).`;
}
