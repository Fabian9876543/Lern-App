import type { Difficulty, ErrorKind, GenerationSettings, MarkLevel, NoteLength, Question, QuestionType } from "../types";

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

/**
 * Rechnungswesen: Buchungssätze, Konten und Beträge so, dass man sie auf einen
 * Blick lesen kann (statt „4400 11.900 an 2800 11.662, 6002 200“).
 */
export const ACCOUNTING_RULES = `Buchungssätze, Konten und Beträge (nur falls sie vorkommen, z. B. in Rechnungswesen, Buchführung oder BwR):
- Jeden Buchungssatz als eigene Markdown-Tabelle mit den Spalten „Konto | Soll | Haben“, Betragsspalten rechtsbündig: zuerst die Soll-Konten, dann die Haben-Konten mit vorangestelltem „an“, jeder Betrag in der Spalte seiner Seite. Nie als Fließtext-Zeile wie „4400 11.900 an 2800 11.662, 6002 200“ und nie kursiv. Beispiel:

| Konto | Soll | Haben |
|---|---:|---:|
| 4400 Verbindlichkeiten aus Lieferungen und Leistungen | 11.900,00 € | |
| an 2800 Bank | | 11.662,00 € |
| an 6002 Nachlässe für Rohstoffe | | 200,00 € |
| an 2600 Vorsteuer | | 38,00 € |

- Mehrere Buchungssätze: über jeder Tabelle eine kurze fette Zeile mit Nummer und Geschäftsfall, z. B. „**2.** Zahlung an den Lieferanten unter Abzug von Skonto“.
- Kontonummern immer zusammen mit dem Kontonamen – auch im Fließtext und in T-Konten, z. B. „2800 Bank“. Kontenrahmen, Kontonamen und Abkürzungen so wie im Material; benutzt das Material Abkürzungen, schreib sie in Klammern dazu, z. B. „4400 Verbindlichkeiten aus Lieferungen und Leistungen (VE)“.
- Beträge immer mit Tausenderpunkt, zwei Nachkommastellen und Währung, z. B. „11.900,00 €“.`;

const QUESTION_RULES = `Aufgabenformate (Feld "type"):
- single_choice: genau eine richtige Option. 3–5 Optionen in "options", Index der richtigen in "correct_options".
- multiple_choice: eine oder mehrere richtige Optionen; schreibe „(mehrere Antworten möglich)“ in die Aufgabenstellung.
- numeric: eindeutiges Zahlenergebnis in "numeric_answer", sinnvolle absolute Toleranz für Rundungen in "numeric_tolerance", Einheit in "unit". Die Aufgabenstellung sagt, worauf gerundet werden soll.
- short_answer: ein Begriff, Name oder sehr kurzer Ausdruck; alle gängigen Schreibweisen in "accepted_answers".
- free_text: offene Aufgaben wie Herleitungen, Beweise, Erklärungen oder mehrschrittige Rechnungen. Die Antwort wird später von einer KI anhand der Musterlösung bewertet.

Für jede Aufgabe:
- Die Aufgabenstellung ist für sich allein verständlich. Die App kann keine Bilder anzeigen: Werden Abbildungen, Tabellen oder Diagramme gebraucht, gib die nötigen Informationen als Text, Markdown-Tabelle oder LaTeX wieder.
- "model_solution" ist eine vollständige, nachvollziehbare Musterlösung mit Lösungsweg; "explanation" erklärt kurz, warum das richtig ist und welche Fehler typisch sind; "hint" gibt einen Denkanstoß, ohne die Lösung zu verraten.
- Bei Auswahlfragen sind die falschen Optionen plausibel (typische Fehler, Verwechslungen) und die Position der richtigen Option variiert.
- Formatierung: Markdown; Formeln in LaTeX mit $...$ (inline) und $$...$$ (abgesetzt).

${ACCOUNTING_RULES}`;

export const GENERATION_SYSTEM_PROMPT = `Du bist ein erfahrener Tutor. Du erstellst aus dem Lernmaterial eines Lernenden einen interaktiven Übungstest, den eine Lern-App anzeigt und auswertet.

Jedes Material ist mit einer Rolle beschriftet: „Aufgaben“, „Lösungen“, „Aufgaben + Lösungen“ oder „Lernmaterial / Referenz“.

${QUESTION_RULES}
- Sprache: die Sprache des Materials.
- Prüfe jede Lösung sorgfältig, bevor du sie einträgst.

In "notes" schreibst du kurz Hinweise an den Lernenden, falls etwas auffällt (unlesbare Seiten, Aufgaben ohne Lösung, Widersprüche zwischen Aufgabe und Lösung). Sonst bleibt "notes" leer.`;

/** Systemprompt, wenn kein Material vorliegt (z. B. Lernplan ohne Material). */
export const GENERATION_SYSTEM_PROMPT_NO_MATERIAL = `Du bist ein erfahrener Tutor. Du erstellst zu einem Fach einen interaktiven Übungstest, den eine Lern-App anzeigt und auswertet. Es liegt kein Lernmaterial vor: Du stützt dich auf dein Fachwissen über den Stoff, wie er in diesem Fach üblicherweise gelehrt und geprüft wird.

${QUESTION_RULES}
- Verwende gängige Bezeichnungen und Schreibweisen des Fachs.
- Sprache: die Sprache von Fachname, Themen und Hinweisen; im Zweifel Deutsch.
- Prüfe jede Lösung sorgfältig, bevor du sie einträgst – der Lernende hat kein Material, mit dem er sie vergleichen könnte.

In "notes" schreibst du kurz Hinweise an den Lernenden, falls etwas auffällt (z. B. wenn ein Thema je nach Lehrbuch oder Hochschule unterschiedlich behandelt wird). Sonst bleibt "notes" leer.`;

export function generationSystemPrompt(hasMaterials: boolean): string {
  return hasMaterials ? GENERATION_SYSTEM_PROMPT : GENERATION_SYSTEM_PROMPT_NO_MATERIAL;
}

export function buildTaskInstruction(
  settings: GenerationSettings,
  context: { hasMaterials?: boolean; subjectName?: string } = {},
): string {
  const hasMaterials = context.hasMaterials ?? true;
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
  if (!hasMaterials) {
    const subject = context.subjectName?.trim();
    return `Modus: NEUE AUFGABEN OHNE MATERIAL.${subject ? `\nFach: „${subject}“` : ""}
Erstelle genau ${count} Aufgaben aus deinem Fachwissen – so, wie sie in Übungen und Prüfungen zu diesem Fach typischerweise vorkommen.
Decke die genannten Themen ausgewogen ab, statt dich auf ein Detail zu konzentrieren.
Schwierigkeit: ${difficulty}.
Erlaubte Formate: ${typeList}. Nutze eine sinnvolle Mischung dieser Formate, passend zum Stoff.
${orderRule(settings)}
"source" ist immer null, "solution_from_material" ist immer false.${focus ? `\nSchwerpunkt: ${focus}` : ""}${topicRule(settings)}`;
  }
  return `Modus: NEUE AUFGABEN.
Erstelle genau ${count} neue Aufgaben, die die Inhalte und Fähigkeiten aus dem Material abprüfen.
Die Aufgaben dürfen nicht mit Aufgaben im Material übereinstimmen: verwende neue Zahlen, neue Beispiele und andere Fragestellungen – aber denselben Stoff und ein vergleichbares Niveau. Wenn das Material Übungs- oder Klausuraufgaben enthält, orientiere dich an deren Stil und Anspruch.
Decke die wichtigsten Themen des Materials ausgewogen ab, statt dich auf ein Detail zu konzentrieren.
Schwierigkeit: ${difficulty}.
Erlaubte Formate: ${typeList}. Nutze eine sinnvolle Mischung dieser Formate, passend zum Stoff.
${orderRule(settings)}
Trage in "source" ein, auf welchen Teil des Materials sich die Aufgabe bezieht. "solution_from_material" ist immer false.${focus ? `\nSchwerpunkt: ${focus}` : ""}${topicRule(settings)}`;
}

/** Roter Faden: Reihenfolge neuer Aufgaben. */
function orderRule(settings: GenerationSettings): string {
  return settings.topicNames?.length
    ? "Reihenfolge: nach Themen gruppiert in der Reihenfolge der Themenliste unten, innerhalb eines Themas von leicht nach schwer."
    : "Reihenfolge wie ein roter Faden: nach Themen gruppiert, die Themen in einer sinnvollen Lernreihenfolge (Grundlagen vor dem, was darauf aufbaut – bei Material meist wie im Skript), innerhalb eines Themas von leicht nach schwer.";
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
- Leere oder themenfremde Antworten bekommen 0 Punkte.
- Nennst du im Feedback Konten oder Beträge, dann Kontonummer mit Kontonamen (z. B. „2800 Bank“) und Beträge wie „11.900,00 €“. Das betrifft nur, wie du selbst schreibst.`;

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
  subjectName?: string;
  examDateLabel: string;
  daysUntilExam: number;
  availableMinutes: number;
  focus: string;
  givenTopics?: string[];
  hasMaterials: boolean;
}): string {
  const hours = Math.round(params.availableMinutes / 60);
  const subject = params.subjectName?.trim();
  const lines = [
    `${subject ? `Fach: „${subject}“. ` : ""}Die Prüfung ist am ${params.examDateLabel}, also in ${params.daysUntilExam} Tagen. Bis dahin sind ca. ${hours} Stunden Lernzeit eingeplant.`,
  ];
  if (!params.hasMaterials) {
    lines.push(
      "Es wurde kein Material ausgewählt – stütze dich auf dein Fachwissen über den Stoff, wie er in diesem Fach üblicherweise gelehrt und geprüft wird. Lass sources leer. Sprache: die Sprache von Fachname und Hinweisen; im Zweifel Deutsch.",
    );
  }
  if (params.focus.trim()) lines.push(`Hinweise des Lernenden: ${params.focus.trim()}`);
  if (params.givenTopics?.length) {
    lines.push(
      `Die Themen der Prüfung stehen bereits fest. Verwende genau diese Themen in dieser Reihenfolge und mit genau diesen Namen – füge keine hinzu und lass keine weg. ${
        params.hasMaterials
          ? "Ergänze die übrigen Felder; findet sich ein Thema nicht im Material, schätze anhand deines Fachwissens und schreibe in sources „nicht im Material“."
          : "Ergänze die übrigen Felder anhand deines Fachwissens."
      }\n${params.givenTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    );
  } else if (params.hasMaterials) {
    lines.push("Erstelle die Themenliste aus dem Material.");
  } else {
    lines.push(
      "Erstelle die Themenliste aus deinem Fachwissen: die Themen, die in einer Prüfung zu diesem Fach typischerweise drankommen, passend zu den Hinweisen des Lernenden (z. B. Schule oder Hochschule, Semester, Kapitel). Nenne in notes kurz, wovon du ausgegangen bist, und dass der Lernende die Liste mit der Ankündigung der Prüfung abgleichen sollte.",
    );
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

// ---------- Lernzettel ----------

export const STUDY_NOTE_SYSTEM_PROMPT = `Du bist ein erfahrener Tutor und schreibst einen Lernzettel zu einem Prüfungsthema. Der Lernende arbeitet ihn in seiner Lernzeit durch und soll danach typische Prüfungsaufgaben zu diesem Thema selbst lösen können.

Aufbau (Markdown, Abschnitte mit ##, in dieser Reihenfolge; lass Abschnitte weg, die zum Thema nicht passen):
## Worum geht's – 2–4 Sätze: was das Thema ist und wozu man es braucht.
## Das Wichtigste – Definitionen, Sätze, Formeln und Regeln, knapp und präzise.
## So gehst du vor – ein Schritt-für-Schritt-Vorgehen für typische Aufgaben.
## Beispiele – zwei bis drei vollständig vorgerechnete bzw. ausgeführte Beispiele, vom einfachen zum prüfungsnahen; jeder Schritt nachvollziehbar.
## Typische Fehler – drei bis sechs häufige Fehler oder Verwechslungen und wie man sie vermeidet.
## Selbstcheck – drei bis fünf kurze Fragen zum Selbsttest, nummeriert.
## Lösungen zum Selbstcheck – kurze Antworten zu den Fragen, gleich nummeriert.

Regeln:
- Beginne direkt mit der ersten Überschrift – kein Titel, keine Einleitung wie „Hier ist dein Lernzettel“, kein Schlusswort.
- Bleib beim Thema. Andere Themen des Lernplans bekommen eigene Lernzettel; verweise nur kurz darauf, wenn es nötig ist.
- Schreib verständlich und direkt an den Lernenden („du“), mit kurzen Absätzen, Aufzählungen und Hervorhebungen.
- Formeln in LaTeX mit $...$ (inline) und $$...$$ (abgesetzt). Tabellen als Markdown-Tabelle. Keine Bilder.
- Umfang: so viel, wie in die angegebene Lernzeit passt – meist 500 bis 1200 Wörter.
- Prüfe alle Rechnungen, Beispiele und Lösungen sorgfältig.

${ACCOUNTING_RULES}`;

export function buildStudyNoteInstruction(params: {
  subjectName: string;
  topic: { name: string; description: string; sources: string };
  planTopics: string[];
  minutes: number;
  focus: string;
  hasMaterials: boolean;
}): string {
  const { topic } = params;
  const lines = [
    `Fach: „${params.subjectName}“`,
    `Thema des Lernzettels: „${topic.name}“${topic.description ? `\nWas man dazu können muss: ${topic.description}` : ""}`,
    `Geplante Lernzeit für dieses Thema: ca. ${params.minutes} Minuten.`,
  ];
  if (params.planTopics.length > 1) {
    const position = params.planTopics.indexOf(topic.name);
    lines.push(
      `Alle Themen des Lernplans in Lernreihenfolge:\n${params.planTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}${
        position >= 0
          ? `\n\nDieses Thema ist Nr. ${position + 1}. Was in den Themen davor drankam, darfst du voraussetzen – erinnere nur kurz daran, wo es gebraucht wird. Inhalte späterer Themen nimmst du nicht vorweg.`
          : ""
      }`,
    );
  }
  if (params.focus.trim()) lines.push(`Hinweise des Lernenden zur Prüfung: ${params.focus.trim()}`);
  if (params.hasMaterials) {
    lines.push(
      `Stütze dich auf das Material oben: Verwende dessen Begriffe, Bezeichnungen und Schreibweisen und nenne bei wichtigen Punkten die Fundstelle in Klammern (z. B. „Skript S. 14“).${
        topic.sources ? ` Laut Lernplan steht das Thema hier: ${topic.sources}.` : ""
      } Ergänze aus deinem Fachwissen nur, wo das Material lückenhaft ist, und kennzeichne solche Stellen mit „(ergänzt)“. Sprache: die Sprache des Materials.`,
    );
  } else {
    lines.push(
      "Es liegt kein Material vor – stütze dich auf dein Fachwissen über den Stoff, wie er in diesem Fach üblicherweise gelehrt wird. Verwende gängige Bezeichnungen; wo Definitionen oder Schreibweisen in Lehrbüchern verbreitet voneinander abweichen, sag das kurz. Sprache: die Sprache von Fachname und Thema; im Zweifel Deutsch.",
    );
  }
  return lines.join("\n\n");
}

/** Entfernt eine einleitende Titelzeile oder Code-Umrahmung aus einem Lernzettel. */
export function cleanStudyNote(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) t = fenced[1].trim();
  // Eine H1 am Anfang doppelt den Themennamen, den die App ohnehin anzeigt.
  t = t.replace(/^#\s+[^\n]*\n+/, "");
  return t.trim();
}

// ---------- Eingescannte Seiten abschreiben ----------

/**
 * Bilder (Fotos, eingescannte PDF-Seiten) abschreiben lassen – damit auch mehr
 * Seiten verwendet werden können, als pro Anfrage als Bild an Claude gehen.
 */
export function transcribePrompt(materialName: string, pages: (number | undefined)[]): string {
  const known = pages.filter((p): p is number => p !== undefined);
  const which = known.length === pages.length && known.length ? ` (Seite ${known.join(", ")} des Dokuments)` : "";
  return `Du schreibst Lernmaterial ab, damit eine Lern-App daraus Übungsaufgaben und Lernzettel erstellen kann.
Material: „${materialName}“. Beigefügt ${pages.length === 1 ? "ist 1 Bild" : `sind ${pages.length} Bilder`}${which}.

Schreibe den Inhalt jedes Bildes vollständig und genau ab:
- Beginne jedes Bild mit einer eigenen Zeile „=== Bild k ===“ (k = 1 bis ${pages.length}, in der Reihenfolge der Bilder).
- Übernimm den Text wörtlich – mit Aufgabennummern, Punkten, Randnotizen und Handschrift. Unleserliches markierst du als [unleserlich].
- Ist es eine korrigierte Arbeit, gib die Korrektur gekennzeichnet an der passenden Stelle wieder: [Korrektur: …] für Häkchen, Striche, Anmerkungen und verbesserte Stellen der korrigierenden Person, [Punkte: 3/5] für vergebene Punkte, Note und Gesamtpunktzahl wörtlich.
- Formeln in LaTeX mit $...$ bzw. $$...$$, Tabellen und T-Konten als Markdown-Tabellen.
- Abbildungen, Diagramme und Skizzen beschreibst du kurz in eckigen Klammern, mit allen Zahlen und Beschriftungen, z. B. [Abbildung: Angebots- und Nachfragekurve, Schnittpunkt bei p = 4, x = 120].
- Ist ein Bild leer, schreibe [leere Seite].
- Keine Einleitung, keine Zusammenfassung, keine eigenen Lösungen oder Kommentare.`;
}

/** Teilt Claudes Abschrift an den Markierungen „=== Bild k ===“ auf; fehlende Bilder bleiben leer. */
export function splitTranscript(text: string, count: number): string[] {
  const out = Array.from({ length: count }, () => "");
  const marker = /^[ \t]*={2,}\s*Bild\s+(\d+)\s*={2,}[ \t]*$/gim;
  const hits = [...text.matchAll(marker)];
  if (hits.length === 0) {
    out[0] = text.trim();
    return out;
  }
  hits.forEach((m, i) => {
    const k = Number(m[1]) - 1;
    const end = i + 1 < hits.length ? hits[i + 1].index! : text.length;
    if (k >= 0 && k < count) out[k] = text.slice(m.index! + m[0].length, end).trim();
  });
  return out;
}

// ---------- Lernzettel aus Material ----------

export const NOTE_LENGTH_LABELS: Record<NoteLength, { label: string; hint: string }> = {
  kurz: { label: "Spickzettel", hint: "ca. eine Seite, nur das Wichtigste in Stichpunkten" },
  normal: { label: "Normal", hint: "Wichtigstes, Beispiele, typische Fehler, Selbstcheck" },
  ausfuehrlich: { label: "Ausführlich", hint: "mit mehreren vorgerechneten Beispielen pro Thema" },
};

export const MATERIAL_NOTE_SYSTEM_PROMPT = `Du bist ein erfahrener Tutor und schreibst aus dem Lernmaterial eines Lernenden einen Lernzettel. Der Lernende lernt damit für eine Prüfung und soll danach typische Aufgaben selbst lösen können.

Aufbau (Markdown):
- Erste Zeile: „# “ und ein kurzer, treffender Titel (z. B. „Abschreibungen“ oder „Kapitel 4: Bilanzanalyse“).
- ## Überblick – worum es geht und wie die Themen zusammenhängen, 2–4 Sätze.
- Danach ein Abschnitt (##) pro Thema des Stoffs, in einer sinnvollen Lernreihenfolge – Grundlagen vor dem, was darauf aufbaut, meist so wie im Skript bzw. in der Vorlesung (nicht einfach in der Reihenfolge der Dateien). Übungsblätter und Klausuren ordnest du den passenden Themen zu, statt sie als eigene Abschnitte anzuhängen. Jeder Abschnitt: das Wichtigste (Definitionen, Regeln, Formeln), wo es passt ein kurzes Vorgehen für typische Aufgaben und ein vorgerechnetes Beispiel. Nenne bei wichtigen Punkten die Fundstelle in Klammern (z. B. „Skript S. 14“, „Blatt 3, Aufgabe 2“).
- ## Typische Fehler – häufige Fehler und Verwechslungen.
- ## Selbstcheck – kurze Fragen zum Selbsttest, nummeriert.
- ## Lösungen zum Selbstcheck – kurze Antworten, gleich nummeriert.

Regeln:
- Halte dich an das Material: seine Begriffe, Bezeichnungen und Schreibweisen. Ergänze aus deinem Fachwissen nur, wo das Material lückenhaft ist, und kennzeichne das mit „(ergänzt)“.
- Enthält das Material Aufgaben mit Lösungen, nutze sie als Beispiele und zeige das Lösungsvorgehen.
- Schreib verständlich und direkt an den Lernenden („du“), mit kurzen Absätzen, Aufzählungen und Hervorhebungen. Keine Einleitung wie „Hier ist dein Lernzettel“, kein Schlusswort.
- Formeln in LaTeX mit $...$ (inline) und $$...$$ (abgesetzt). Tabellen und T-Konten als Markdown-Tabelle. Keine Bilder.
- Sprache: die Sprache des Materials.
- Prüfe alle Rechnungen, Beispiele und Lösungen sorgfältig.

${ACCOUNTING_RULES}`;

export function buildMaterialNoteInstruction(params: { subjectName: string; focus: string; length: NoteLength }): string {
  const lengthRule: Record<NoteLength, string> = {
    kurz: "Umfang: ein Spickzettel – höchstens etwa eine Seite (300–500 Wörter), knappe Stichpunkte, nur das Prüfungsrelevante, Beispiele höchstens in einer Zeile, Selbstcheck mit 3 Fragen.",
    normal: "Umfang: etwa 800 bis 1500 Wörter, pro Thema ein kurzes Beispiel, Selbstcheck mit 3 bis 5 Fragen.",
    ausfuehrlich:
      "Umfang: ausführlich, bis etwa 3000 Wörter, pro Thema mehrere vollständig vorgerechnete Beispiele vom einfachen zum prüfungsnahen, Selbstcheck mit 5 bis 8 Fragen.",
  };
  const focus = params.focus.trim();
  return [
    `Fach: „${params.subjectName}“`,
    focus
      ? `Schwerpunkt: ${focus}. Schreibe den Lernzettel nur dazu; anderes Material nutzt du nur, soweit es dafür nötig ist.`
      : "Fasse den gesamten Stoff des Materials zusammen.",
    lengthRule[params.length],
  ].join("\n\n");
}

/** Trennt die Titelzeile („# …“) vom Lernzettel. */
export function splitNoteTitle(text: string): { title: string | null; body: string } {
  const cleaned = text.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/, "$1").trim();
  const m = /^#\s+(.+)\n?/.exec(cleaned);
  if (!m) return { title: null, body: cleaned };
  return { title: m[1].replace(/[*_`#]/g, "").trim().slice(0, 100) || null, body: cleaned.slice(m[0].length).trim() };
}

// ---------- Markierte Stelle im Lernzettel erklären ----------

export function explainSystemPrompt(opts: { webSearch: boolean }): string {
  return `Du bist ein geduldiger, genauer Tutor. Eine lernende Person arbeitet mit ihrem Lernzettel und hat eine Stelle markiert, die sie nicht mehr oder nicht mehr genau weiß. Erkläre ihr genau diese Stelle so, dass sie sie danach versteht und behält.

Woher dein Wissen kommt:
- Stütze dich zuerst auf das Material der lernenden Person, falls beigefügt: seine Begriffe, Definitionen, Schreibweisen und Vorgehensweisen. Nenne die Fundstelle knapp in Klammern, z. B. (Skript, S. 14) oder (Blatt 3, Aufgabe 2). Erfinde keine Fundstellen.
- Steht es dort nicht oder nicht ausreichend, ergänze aus deinem Fachwissen und sag das ausdrücklich, z. B. „Das steht so nicht in deinem Material: …“.${
    opts.webSearch
      ? "\n- Die Websuche nutzt du nur, wenn Material und Fachwissen nicht sicher reichen (z. B. aktuelle Zahlen, Gesetzesstände, sehr spezielle Fakten). Sag dann im Text, was aus dem Internet stammt. Kündige die Suche nicht an."
      : ""
  }
- Ist der Lernzettel an der Stelle falsch oder missverständlich, sag das freundlich und stell es richtig.

Form:
- Sprache: die des Lernzettels (meist Deutsch). Sprich die Person mit „du“ an.
- Markdown; Formeln in LaTeX mit $...$ (im Text) und $$...$$ (abgesetzt).
- Fang direkt mit der Erklärung an – keine Begrüßung, keine Einleitung wie „Gute Frage“, keine Wiederholung der markierten Stelle, kein Schlusswort.
- Keine Überschriften mit # oder ##; gliedere mit kurzen Absätzen, Aufzählungen und **fett gesetzten** Stichworten.
- Erkläre nur diese Stelle und das, was man direkt dafür braucht – nicht den ganzen Lernzettel.
- Prüfe Rechnungen und Beispiele sorgfältig.

${ACCOUNTING_RULES}

Letzte Zeile – allein in der Zeile und genau in dieser Form:
GRUNDLAGE: <Liste>
Die Liste enthält eines oder mehrere der Wörter „material“ (aus dem Material der Person), „wissen“ (aus deinem Fachwissen)${
    opts.webSearch ? " und „internet“ (aus der Websuche)" : ""
  }, durch Komma getrennt – z. B. „GRUNDLAGE: material, wissen“.`;
}

const EXPLAIN_LEVEL: Record<MarkLevel, string> = {
  forgot: `Die Person weiß das nicht mehr. Erkläre es von Grund auf:
1. **Kurz gesagt:** worum es geht, in einem Satz.
2. Die Erklärung Schritt für Schritt – mit der Idee dahinter, nicht nur der Regel. Erkläre Fachbegriffe, die dafür nötig sind.
3. **Beispiel:** ein konkretes, vollständig durchgerechnetes bzw. ausformuliertes Beispiel.
4. **Merkhilfe:** eine Eselsbrücke oder die typische Falle.
Umfang: etwa 150 bis 350 Wörter.`,
  unsure: `Die Person weiß es ungefähr, ist sich aber unsicher. Frisch es kurz und genau auf:
- die Kernaussage präzise in 2 bis 4 Sätzen,
- was man leicht verwechselt oder vergisst,
- ein kurzes Beispiel.
Umfang: höchstens etwa 150 Wörter.`,
};

/** Die eigentliche Bitte um Erklärung: Lernzettel, markierte Stelle, gewünschte Tiefe. */
export function buildExplainTask(params: {
  subjectName: string;
  noteTitle: string;
  noteContent: string;
  quote: string;
  level: MarkLevel;
  hasMaterials: boolean;
}): string {
  return [
    params.subjectName ? `Fach: „${params.subjectName}“` : "",
    `Lernzettel „${params.noteTitle}“:\n<lernzettel>\n${params.noteContent.trim()}\n</lernzettel>`,
    `Markierte Stelle:\n<markiert>\n${params.quote.trim()}\n</markiert>`,
    EXPLAIN_LEVEL[params.level],
    params.hasMaterials
      ? ""
      : "Zu diesem Lernzettel liegt kein Material vor – erkläre aus deinem Fachwissen, wie der Stoff in diesem Fach üblicherweise gelehrt wird.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Eine Nachfrage der lernenden Person zur markierten Stelle. */
export function buildExplainFollowUp(question: string): string {
  return `Nachfrage zur markierten Stelle:\n<nachfrage>\n${question.trim()}\n</nachfrage>\n\nAntworte genau darauf – gleiche Regeln wie oben, eher kürzer, letzte Zeile wieder „GRUNDLAGE: …“.`;
}

/** Bisheriges Gespräch als Text (für Anfragen, die nur aus einem Text bestehen). */
export function explainHistoryText(history: { role: "user" | "assistant"; content: string }[]): string {
  if (history.length === 0) return "";
  const turns = history.map((m) =>
    m.role === "assistant" ? `<deine_antwort>\n${m.content.trim()}\n</deine_antwort>` : buildExplainFollowUp(m.content),
  );
  return `Bisheriges Gespräch zu dieser Stelle:\n\n${turns.join("\n\n")}`;
}

// ---------- Klausur-Analyse ----------

export const ERROR_KIND_LABELS: Record<ErrorKind, string> = {
  understanding: "Verständnis",
  method: "Vorgehen",
  calculation: "Rechenfehler",
  careless: "Flüchtigkeit",
  incomplete: "Unvollständig",
  terminology: "Fachbegriffe",
  form: "Form & Darstellung",
  other: "Sonstiges",
};

export const EXAM_ANALYSIS_SYSTEM_PROMPT = `Du bist ein erfahrener Tutor und wertest eine korrigierte Klausur (bzw. Klassenarbeit, Test oder Übungsblatt) eines Lernenden aus. Ziel: Der Lernende sieht genau, was nicht gut lief, und kann es gezielt üben.

Das Material enthält die bearbeitete und korrigierte Arbeit – meist Fotos oder Scans mit Korrekturzeichen, Randbemerkungen und Punkten der korrigierenden Lehrkraft – und eventuell Aufgabenblatt, Musterlösung oder Erwartungshorizont. In abgeschriebenen Seiten steht die Korrektur als [Korrektur: …] und [Punkte: …].

Vorgehen:
- Geh die Arbeit Aufgabe für Aufgabe durch (Teilaufgaben einzeln, wenn sie einzeln bewertet sind). Die Korrektur ist die wichtigste Quelle dafür, was falsch war. Prüf zusätzlich selbst und benenne den eigentlichen Fehler – z. B. falscher Ansatz, falsch angewandte Regel, fehlender Begründungsschritt, Rechenfehler –, nicht nur das Symptom.
- Ist keine Korrektur erkennbar, vergleich mit der Musterlösung oder löse die Aufgaben selbst – und sag das in "notes".
- Punkte und Note nur angeben, wenn sie auf der Arbeit stehen; erfinde keine Zahlen.
- Fasse die Fehler zu Schwachstellen nach Themen zusammen und sortiere sie nach Priorität: viele verlorene Punkte, prüfungsrelevant oder Grundlage für anderes = "high". Benenne konkret, was nicht sitzt („Vorzeichen beim Umstellen von Ungleichungen“ statt „Algebra“). Themen, die gut liefen, sind keine Schwachstellen.
- Erkenne wiederkehrende Fehlerarten (z. B. oft Flüchtigkeitsfehler, Einheiten vergessen, Aufgaben nicht zu Ende bearbeitet, Fachbegriffe ungenau).
- "correction": so wäre es richtig – kurz, mit dem entscheidenden Schritt bzw. der richtigen Lösung.
- Sei ehrlich, konkret und ermutigend; nenn auch, was gut lief.
- Sprache: die Sprache der Arbeit. Sprich den Lernenden mit „du“ an. Formeln in LaTeX mit $...$.

Fehlerarten ("kind" bzw. "error_kinds"): understanding (Stoff nicht verstanden), method (falsches oder unvollständiges Vorgehen), calculation (Rechenfehler), careless (Flüchtigkeitsfehler, z. B. abgeschrieben, Vorzeichen), incomplete (nicht oder nicht zu Ende bearbeitet), terminology (Fachbegriffe, Definitionen), form (Darstellung, Einheiten, Antwortsatz, Begründung fehlt), other.

${ACCOUNTING_RULES}`;

export const EXAM_ANALYSIS_JSON_FORMAT = `Antworte ausschließlich mit einem JSON-Objekt in genau dieser Form (keine weiteren Texte):
{
  "title": "Kurzer Titel, z. B. „Klausur Analysis – November“",
  "points_achieved": 38 oder null,
  "points_max": 60 oder null,
  "grade": "Note wie auf der Arbeit, z. B. „3+“" oder null,
  "summary": "Gesamteindruck in 2–4 Sätzen",
  "strengths": ["Was gut lief"],
  "weaknesses": [
    {
      "topic": "Thema, 2–6 Wörter",
      "priority": "high" | "medium" | "low",
      "problem": "Was genau nicht sitzt",
      "advice": "Worauf achten und wie üben, 1–2 Sätze",
      "tasks": ["Aufgabe 2b"],
      "points_lost": 4 oder null
    }
  ],
  "error_patterns": [{ "kind": "careless", "description": "Wie sich das zeigt" }],
  "tasks": [
    {
      "label": "Aufgabe 1a",
      "topic": "Thema",
      "points_achieved": 3 oder null,
      "points_max": 5 oder null,
      "status": "correct" | "partial" | "wrong" | "missing" | "unknown",
      "mistake": "Was schiefging, leer wenn alles stimmt",
      "correction": "So wäre es richtig",
      "error_kinds": ["method"]
    }
  ],
  "notes": "Hinweise oder leerer String"
}`;

export function buildExamAnalysisInstruction(params: { subjectName: string; remarks: string }): string {
  return [
    params.subjectName ? `Fach: „${params.subjectName}“` : "",
    params.remarks.trim() ? `Hinweise des Lernenden zur Arbeit: ${params.remarks.trim()}` : "",
    "Werte die korrigierte Arbeit oben aus: alle Aufgaben in ihrer Reihenfolge, dann die Schwachstellen nach Priorität und die wiederkehrenden Fehlerarten.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------- Stelle im Lernzettel korrigieren ----------

export const NOTE_FIX_SYSTEM_PROMPT = `Du korrigierst einen Lernzettel (Markdown mit LaTeX), den eine Lern-App anzeigt. Die lernende Person hat eine Stelle markiert, die falsch, ungenau oder missverständlich ist.

- Prüf die Stelle – anhand des Materials, falls beigefügt, sonst mit deinem Fachwissen. Berücksichtige, was die Person dazu schreibt, aber übernimm nichts Falsches.
- Ändere so wenig wie möglich: nur, was nötig ist, damit die Stelle stimmt und verständlich ist. Behalte Stil, Formatierung, Begriffe und Schreibweisen des Lernzettels bei.
- "old": ein zusammenhängender Ausschnitt aus dem Markdown-Text des Lernzettels, Zeichen für Zeichen kopiert (mit Formatierungszeichen und LaTeX), der ersetzt wird – am besten ganze Sätze, Listenpunkte oder Tabellenzeilen rund um die markierte Stelle.
- "new": der Ersatz für diesen Ausschnitt.
- "reason": 1–2 Sätze an die Person („du“): was falsch war bzw. was geändert wurde.
- Stimmt die Stelle schon, lass "old" und "new" leer und erklär in "reason" kurz, warum sie richtig ist.

${ACCOUNTING_RULES}`;

export const NOTE_FIX_JSON_FORMAT = `Antworte ausschließlich mit einem JSON-Objekt: {"old": "Ausschnitt aus dem Lernzettel", "new": "Ersatz", "reason": "Was falsch war"}`;

export function buildNoteFixTask(params: {
  subjectName: string;
  noteTitle: string;
  noteContent: string;
  quote: string;
  request: string;
  history: { role: "user" | "assistant"; content: string }[];
}): string {
  return [
    params.subjectName ? `Fach: „${params.subjectName}“` : "",
    `Lernzettel „${params.noteTitle}“ (Markdown):\n<lernzettel>\n${params.noteContent.trim()}\n</lernzettel>`,
    `Markierte Stelle (so, wie sie angezeigt wird):\n<markiert>\n${params.quote.trim()}\n</markiert>`,
    params.history.length
      ? `Bisheriges Gespräch zu dieser Stelle:\n${params.history.map((m) => (m.role === "assistant" ? `Claude: ${m.content.trim()}` : `Lernende Person: ${m.content.trim()}`)).join("\n\n")}`
      : "",
    params.request.trim()
      ? `Was laut der lernenden Person falsch ist: ${params.request.trim()}`
      : "Die lernende Person meint, dass die Stelle falsch oder missverständlich ist.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
