import type { Difficulty, GenerationSettings, QuestionType } from "../types";

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
Materialien mit der Rolle „Lernmaterial / Referenz“ dienen nur als Hintergrund für Erklärungen.${focus ? `\nBeschränke dich auf Aufgaben zu: ${focus}` : ""}`;
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
Trage in "source" ein, auf welchen Teil des Materials sich die Aufgabe bezieht. "solution_from_material" ist immer false.${focus ? `\nSchwerpunkt: ${focus}` : ""}`;
}

export const GRADING_SYSTEM_PROMPT = `Du bewertest die Antwort eines Lernenden auf eine Übungsaufgabe anhand der Musterlösung.

- Bewerte inhaltlich: Ein anderer, korrekter Lösungsweg oder eine andere Formulierung ist genauso richtig.
- Vergib Teilpunkte für teilweise richtige Antworten (z. B. richtiger Ansatz, aber Rechenfehler). Halbe Punkte sind erlaubt.
- verdict: "correct" bei voller Punktzahl, "wrong" bei 0 Punkten, sonst "partial".
- feedback: 1–4 Sätze in der Sprache der Aufgabe, direkt an den Lernenden („du“). Nenne konkret, was stimmt und was fehlt oder falsch ist. Die Musterlösung wird separat angezeigt – wiederhole sie nicht vollständig.
- Ist ein Foto einer handschriftlichen Lösung beigefügt, bewerte den Inhalt des Fotos. Ist es unleserlich, sag das im Feedback.
- Leere oder themenfremde Antworten bekommen 0 Punkte.`;
