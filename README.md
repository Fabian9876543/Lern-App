# Lern-App

Eine persönliche Lern-App: Du lädst deine Lernmaterialien hoch, und die App macht daraus interaktive Tests.

- **Meine Aufgaben abfragen** – Lade Aufgabenblätter und Lösungen hoch. Die KI übernimmt genau diese Aufgaben
  (gleiche Zahlen, gleiche Formulierung) samt deiner Lösungen und baut daraus einen Test.
- **Neue Aufgaben erzeugen** – Lade Material als Referenz hoch (Skript, Folien, Altklausuren). Die KI erstellt neue,
  andere Aufgaben zum gleichen Stoff – in Anzahl, Schwierigkeit und Format nach Wahl.

## Zwei Varianten

| | claude.ai-Version | Web-Version |
| --- | --- | --- |
| KI | über dein Claude-Abo (Pro/Max) – keine API-Kosten | über einen Claude-API-Schlüssel (Abrechnung nach Verbrauch) |
| Läuft | als Artifact in claude.ai (Web, Desktop, App) | eigenständig im Browser, z. B. über GitHub Pages |
| Daten | privat im Artifact gespeichert, auf allen Geräten gleich (Gäste: nur im eigenen Browser) | lokal im Browser (IndexedDB) |
| PDFs | Text wird im Browser ausgelesen; eingescannte Seiten und Fotos gehen als Bild an Claude (verkleinert auf ca. 1,2 MP). Sind es mehr, als claude.ai pro Anfrage erlaubt, schreibt Claude sie einmal ab – der Text wird gespeichert und danach verwendet | Claude liest PDFs direkt (bis ca. 30 MB pro Test) |
| Modellwahl | Stufen: Am stärksten / Standard / Schnell | konkrete Modelle (Opus, Sonnet, Haiku) |

### Die claude.ai-Version teilen

Wer das Artifact über einen geteilten Link öffnet, nutzt die App im **Gastmodus**: Claude läuft über das eigene
Claude-Konto, Fächer, Materialien und Ergebnisse werden nur im eigenen Browser gespeichert (nicht auf anderen Geräten,
für niemanden sonst sichtbar; Backup über die Einstellungen). Deine eigenen Daten bleiben privat. Wer per E-Mail als
Bearbeiter eingeladen ist, speichert wie du im Artifact – kann dann aber auch die App selbst verändern und die
hochgeladenen Dateien des Artifacts sehen. Ob Claude-Aufrufe aus Artifacts mit dem kostenlosen Claude-Abo funktionieren,
legt claude.ai fest; die App zeigt eine Meldung, wenn Claude für ein Konto nicht verfügbar ist.

Beide Varianten entstehen aus demselben Code (`src/targets/artifact` bzw. `src/targets/web`). Über
**Einstellungen → Backup** lassen sich die Daten zwischen den Varianten umziehen.

## Funktionen

- Fächer mit beliebig vielen Materialien (PDF, Fotos/Bilder, Excel, Word, Textdateien oder eingefügter Text)
- **Ganze Ordner hochladen:** per „Ordner hochladen“ oder einfach hineinziehen – mit allen Unterordnern. Die Ordner
  bleiben als aufklappbare Gruppen erhalten (anfangs zugeklappt) und lassen sich als Ganzes für einen Test oder Lernplan auswählen, abwählen
  oder löschen. Die Rolle wird auch aus dem Ordnernamen erkannt („Lösungen/Scan 3.pdf“ → Lösungen). Systemdateien
  (.DS_Store, ~$-Sperrdateien …) werden ausgelassen; Formate, die die App nicht lesen kann (z. B. Word), werden mit einem
  Tipp genannt (z. B. PowerPoint → als PDF exportieren). Dateien, die nur in der Cloud liegen (OneDrive, iCloud), meldet die App, statt sie leer zu speichern.
  Nach dem Hochladen zeigt ein Bericht jede Datei, die nicht hochgeladen wurde, mit Grund. Wird derselbe Ordner noch
  einmal hochgeladen, überspringt die App, was schon da ist – so lässt sich Fehlendes einfach ergänzen.
- **Excel-Dateien (.xlsx, .xlsm und alte .xls):** Alle Tabellenblätter werden als Tabellen mit Zeilennummern und
  Spaltenbuchstaben übernommen – mit Zahlenformaten (Datum, Prozent, Euro) und bei .xlsx mit einer Liste der Formeln,
  sodass sich Aufgaben auf Zellen beziehen können (bei .xls nur die Ergebnisse der Formeln). Gespeichert wird der
  Inhalt, nicht die Originaldatei; Diagramme und Bilder darin werden nicht übernommen, sehr große Blätter gekürzt.
- **Word-Dateien (.docx und alte .doc):** Der Text wird übernommen – bei .docx mit Überschriften, Aufzählungen und
  Tabellen, bei .doc mit Tabellen als Zeilen; Fußnoten, Kopfzeilen und Textfelder kommen dazu. Bilder werden nicht
  übernommen; wer sie braucht, speichert das Dokument als PDF. Passwortgeschützte oder sehr alte Dateien (Word/Excel
  95) meldet die App.
- **Material pro Test:** Neues Material steht oben in „Neues Material“ und kann auch direkt auf der Seite „Neuer
  Test“ hochgeladen werden. Sobald daraus ein Test erstellt ist, wandert es zu diesem Test – die Liste ist wieder
  frei für den nächsten. Früheres Material lässt sich bei Bedarf wieder dazunehmen.
- **Automatische Namen:** Dateien mit nichtssagendem Namen („IMG_2041.jpg“, „Scan 3.pdf“, eingefügter Text) benennt
  Claude anhand des Inhalts (z. B. „Übungsblatt 3 – Integralrechnung“) und schlägt die Rolle vor; ohne Claude gibt es
  einen Ersatznamen aus der ersten Textzeile oder dem Datum. Abschaltbar in den Einstellungen; Material lässt sich
  jederzeit umbenennen.
- Jede Datei bekommt eine Rolle: *Aufgaben*, *Lösungen*, *Aufgaben + Lösungen* oder *Lernmaterial / Referenz*
  (wird anhand des Dateinamens vorgeschlagen)
- Aufgabenformate: Single Choice, Multiple Choice, Zahlenergebnis (mit Toleranz, Komma oder Punkt), Kurzantwort und
  Freitext/Rechenweg
- **Übungsmodus** mit sofortigem Feedback, Tipps und Musterlösung – oder **Prüfungsmodus** mit Auswertung am Ende
- Auswahlfragen, Zahlen und exakte Kurzantworten wertet die App selbst aus; offene Antworten bewertet die KI anhand
  der Musterlösung (mit Teilpunkten). Du kannst jede Bewertung selbst korrigieren.
- Handschriftliche Lösung? Einfach ein Foto an die Antwort hängen – die KI bewertet das Foto.
- **Viele eingescannte Seiten:** claude.ai erlaubt pro Anfrage nur eine begrenzte Zahl an Bildern. Wird sie
  überschritten, lässt die App die bildreichsten Materialien in kleinen Portionen abschreiben (mit Formeln, Tabellen
  und kurzen Bildbeschreibungen) und speichert den Text am Material – jede Seite wird nur einmal abgeschrieben. Die
  Abschrift lässt sich in der Vorschau ansehen; die Vorschau zeigt PDFs jetzt komplett („Weitere Seiten anzeigen“).
- **Viel Material auf einmal:** claude.ai nimmt pro Anfrage höchstens 256 KB Text. Ist die Auswahl größer, stellt
  die App selbst einen Auszug zusammen – ohne zusätzliche Anfragen: für Lernplan-Themen von jeder Seite der Anfang
  (Überblick über alles), für Übungstests zu einem Thema und Lernzettel die passendsten Abschnitte, für neue Aufgaben
  ohne Thema zufällig verteilte Abschnitte (jede neue Variante nimmt andere) und für „Meine Aufgaben abfragen“ von
  jeder Datei den Anfang, damit Aufgaben und Lösungen zusammenpassen. Ein Hinweis beim Test bzw. Plan sagt, wie
  groß der Auszug war.
- **Sehr viele Aufgaben auf einmal:** Eine einzelne Antwort von Claude hat eine Längen- und Zeitgrenze. Bei vielen
  Aufgaben (z. B. „Meine Aufgaben abfragen“ mit allen Übungsblättern) holt die App sie deshalb in mehreren Teilen ab –
  höchstens 25 pro Antwort; jede weitere Anfrage nennt die schon übernommenen Aufgaben, und Claude macht mit der
  nächsten weiter. Bricht eine Antwort doch mittendrin ab, bleiben alle fertigen Aufgaben erhalten. Wird der Test
  größer, als ein Eintrag im claude.ai-Speicher sein darf, wird er in gleich große Tests „(Teil 1 von N)“ aufgeteilt.
- Formeln werden mit LaTeX/KaTeX schön dargestellt
- Ergebnisse mit Auswertung nach Thema, Verlauf pro Test und **„Fehler wiederholen“**
- „Neue Variante“: zum selben Material einen neuen Test mit anderen Aufgaben erzeugen
- Fragen nachträglich bearbeiten, löschen oder eigene hinzufügen
- **Lernplan pro Fach:** Prüfungsdatum und Lernzeit pro Wochentag angeben, Themen von Claude aus dem Material
  ermitteln lassen oder selbst eingeben (optional von Claude um Zeitbedarf, Wichtigkeit und Fundstellen ergänzt),
  optionaler Einstufungstest. Die App verteilt Lernen, Übungstests, Wiederholungen (nach ca. 2, 6 und 13 Tagen) und
  eine Probeklausur auf die Tage bis zur Prüfung, zeigt den Themenstand, plant bei schwachen Themen Zusatz-
  wiederholungen ein und verteilt Verpasstes neu. Ein Klick auf eine Aufgabe zeigt, was zu tun ist, um welche Themen
  es geht und wie dein Stand ist. Material lässt sich auch nachträglich hinzufügen – alles, was danach entsteht, nutzt es.
- **Kalender auf der Startseite:** Monatsansicht mit den Lernaufgaben aller Lernpläne (in der Farbe des Fachs) und den
  Prüfungsterminen. Ein Tag zeigt seine Aufgaben zum Abhaken; ein Klick öffnet die Aufgabe im Plan.
- **Lernzettel aus Material:** Auf der Fachseite („+ Lernzettel“, „Lernzettel daraus erstellen“) oder aus der Vorschau
  einer Datei: Material auswählen (ganze Ordner mit einem Häkchen), optional ein Thema bzw. einen Schwerpunkt angeben
  und den Umfang wählen (Spickzettel, normal, ausführlich). Claude schreibt den Lernzettel mit Überblick, einem
  Abschnitt pro Thema mit Fundstellen und Beispielen, typischen Fehlern und Selbstcheck. Er lässt sich umbenennen,
  neu schreiben, herunterladen (PDF oder Markdown) und löschen; alle Lernzettel eines Fachs stehen auf der Fachseite.
  Woraus er erstellt wurde, steht zugeklappt unter „Quellen“ am Ende der Seite (nach Ordnern, zum Ansehen antippen).
- **Lernzettel als PDF:** Jeder Lernzettel (aus Material oder aus dem Lernplan) lässt sich als A4-PDF herunterladen –
  mit echtem, markierbarem und durchsuchbarem Text, Formeln als Vektorgrafik, Tabellen, Listen und Code wie in der App,
  Titel, Fach und Datum oben und Seitenzahlen unten. Seitenumbrüche zerschneiden keine Zeilen, Formeln oder
  Tabellenzeilen; Überschriften bleiben bei ihrem Text, und lange Tabellen wiederholen ihre Kopfzeile. Das PDF wird
  komplett im Browser erzeugt (nichts geht an einen Server) und ist meist nur 20–100 KB groß.
- **Lernzettel:** Zu jeder Lern-Aufgabe im Plan schreibt Claude auf Knopfdruck einen Lernzettel – das Wichtigste,
  ein Vorgehen für typische Aufgaben, vorgerechnete Beispiele, typische Fehler und ein kurzer Selbstcheck. Er wird
  gespeichert und ist auch über den Themenstand erreichbar.
- **Stellen im Lernzettel erklären lassen:** Text markieren (am Handy lange drücken), dann unten „Bin unsicher“ oder
  „Weiß ich nicht mehr“ wählen. Claude erklärt genau diese Stelle – kurz aufgefrischt bzw. von Grund auf mit Beispiel
  und Merkhilfe –, zuerst aus dem Material des Lernzettels (mit Fundstelle), sonst aus seinem Fachwissen; in der
  Web-Version sucht Claude bei Bedarf auch im Internet und verlinkt die Seiten. Unter jeder Antwort steht, worauf sie
  sich stützt („Aus deinem Material“, „… ergänzt mit Claudes Wissen“, „Nicht aus deinem Material“). Danach kann man
  nachfragen („Einfacher erklären“, „Noch ein Beispiel“, „Typische Prüfungsaufgabe“ oder eine eigene Frage). Die
  Stellen bleiben gelb bzw. rot im Lernzettel, sind gespeichert und stehen unter „Markierte Stellen“; Antippen öffnet
  die Erklärung wieder. Beim Neuschreiben bleiben die Markierungen erhalten, und PDF bzw. Markdown enthalten die
  Erklärungen als Anhang. Die Erklärung läuft weiter, auch wenn man das Fenster schließt.
- **Buchungssätze übersichtlich (Rechnungswesen, BwR):** In Lernzetteln, Tests, Musterlösungen und Erklärungen
  schreibt Claude jeden Buchungssatz als Tabelle „Konto | Soll | Haben“ – Haben-Konten mit „an“, Beträge rechtsbündig
  in ihrer Spalte, immer mit Tausenderpunkt, zwei Nachkommastellen und € (z. B. „11.900,00 €“). Kontonummern stehen
  immer mit dem Kontonamen da (z. B. „2800 Bank“), Namen und Abkürzungen so wie im Material. Auf dem Handy werden lange
  Kontonamen getrennt, damit Soll und Haben ganz sichtbar bleiben. Gilt für neu erstellte Lernzettel und Tests.
- **Lernplan ohne Material:** Ohne hochgeladenes Material schlägt Claude die typischen Prüfungsthemen des Fachs vor
  (am besten mit Hinweisen wie „Uni, 1. Semester, Klausur 90 Min.“) und erstellt Übungstests, Wiederholungen,
  Probeklausur und Lernzettel aus seinem Fachwissen. Die App weist darauf hin, dass das vom Stoff der eigenen
  Veranstaltung abweichen kann.
- Backup als JSON-Datei exportieren/importieren
- **„Zurück“-Knopf** oben in der Kopfleiste (bleibt beim Scrollen sichtbar): führt zur vorherigen Seite – auch in
  claude.ai, wo es keinen Browser-Verlauf für die App gibt – und stellt dort die Scroll-Position wieder her. Gelöschte
  Seiten werden übersprungen; ohne vorherige Seite geht es zur übergeordneten (z. B. vom Test zum Fach). Über der
  Überschrift steht zur Orientierung das Fach bzw. der Test, zu dem die Seite gehört. Antwortentwürfe in einem
  laufenden Test bleiben beim Verlassen erhalten. In der Web-Version gilt derselbe Verlauf wie für die Zurück-Taste
  des Browsers.
- Funktioniert auf Handy und Desktop; kann auf dem Handy zum Startbildschirm hinzugefügt werden

## Starten

### claude.ai-Version

```bash
npm install
npm run build:artifact
```

Das erzeugt `dist-artifact/lern-app.html` (die Seite) und `dist-artifact/publish-files.json` (die Dateien, die
mitveröffentlicht werden). Die aktuelle Version ist als privates Artifact veröffentlicht:
https://claude.ai/artifact/MTV2Uc8zvLPnYHmZyfscWR Veröffentlicht wird das Ganze als Artifact in claude.ai mit den Fähigkeiten
`sample` (mit Bildern), `db`, `user`, `assets` und `downloads`.

### Web-Version

Voraussetzung: [Node.js](https://nodejs.org/) ab Version 20.

```bash
npm install
npm run dev
```

Dann im Browser die angezeigte Adresse öffnen (meist http://localhost:5173).

Für eine fertige Version: `npm run build` erzeugt den Ordner `dist/`, den du auf jedem statischen Webhoster
ablegen kannst.

### Optional: online über GitHub Pages

Derzeit nicht eingerichtet. Der Workflow `.github/workflows/deploy.yml` könnte die Web-Version bei jedem Push auf
`main` über GitHub Pages veröffentlichen (Adresse dann `https://fabian9876543.github.io/Lern-App/`). Dafür einmalig in
den Repository-Einstellungen den Standard-Branch auf `main` stellen und unter **Settings → Pages → Source** „GitHub
Actions“ wählen. (Bei privaten Repositories setzt GitHub Pages einen kostenpflichtigen GitHub-Plan voraus.)

## API-Schlüssel und Kosten (Web-Version)

Die claude.ai-Version braucht keinen Schlüssel: Sie nutzt dein Claude-Abo, Testerstellung und Bewertung zählen
gegen dessen Nutzungslimits.

Die Web-Version nutzt die Claude-API. Du brauchst einen API-Schlüssel aus der
[Anthropic Console](https://console.anthropic.com/settings/keys) und trägst ihn in der App unter **Einstellungen**
ein. Abgerechnet wird nach Verbrauch über dein Anthropic-Konto. Ein Test aus einigen Seiten Material kostet grob
geschätzt einige Cent bis wenige Dutzend Cent, je nach Umfang und Modell; das Bewerten einer Antwort liegt meist
unter einem Cent. In den Einstellungen kannst du für das Erstellen und das Bewerten jeweils ein günstigeres Modell
wählen.

## Datenschutz

- claude.ai-Version: Deine Daten liegen in deinem privaten Bereich des Artifacts; andere Personen, mit denen du das
  Artifact teilst, sehen sie nicht (sie bekommen ihren eigenen leeren Bereich).
- Web-Version: Es gibt keinen eigenen Server. Alle Fächer, Materialien, Tests und Ergebnisse werden lokal im Browser gespeichert
  (IndexedDB).
- Web-Version: Der API-Schlüssel liegt nur im Browser (localStorage) und wird ausschließlich an `api.anthropic.com` gesendet.
  Nutze die App deshalb nur auf deinem eigenen Gerät.
- Materialien werden nur dann an Claude geschickt, wenn du einen Test, die Themen eines Lernplans oder einen Lernzettel
  erstellen oder eine markierte Stelle erklären lässt – und beim automatischen Benennen ein Auszug der Datei.
- Web-Version: Beim Erklären markierter Stellen kann Claude im Internet suchen (über die Websuche der Claude-API,
  höchstens 3 Suchen pro Erklärung, kostet extra). Ist sie für dein API-Konto nicht freigeschaltet, erklärt Claude ohne
  Suche.

## Entwicklung

```bash
npm test          # Unit-Tests (Vitest)
npm run typecheck # TypeScript prüfen
npm run build            # Web-Version → dist/
npm run build:artifact   # claude.ai-Version → dist-artifact/
```

Aufbau:

| Pfad | Inhalt |
| --- | --- |
| `src/ai/` | Gemeinsame KI-Logik: Prompts, JSON-Schemas, Einlesen und Prüfen der Antworten |
| `src/targets/web/` | Web-Version: Claude-API, IndexedDB |
| `src/targets/artifact/` | claude.ai-Version: Claude über das Abo, Artifact-Speicher, PDF-Auslesen |
| `src/store/` | Datenhaltung (gemeinsam für beide Varianten) |
| `src/lib/` | Auswertung, Dateiverarbeitung, PDF, Durchläufe, Backup, Lernplan (`planner.ts`: Kalender ohne KI, `plans.ts`: Aktionen) |
| `src/lib/pdfExport/` | Lernzettel als PDF: im Browser unsichtbar setzen (`layout.tsx`), Seiten aufteilen (`paginate.ts`), mit pdf-lib zeichnen (`paint.ts`) |
| `src/assets/pdf-fonts/` | Eingebettete Schriften für den PDF-Export (Inter, DejaVu Sans, JetBrains Mono; erzeugt mit `scripts/make-pdf-fonts.py`, Lizenzen in `LICENSES.md`) |
| `src/pages/` | Seiten (Übersicht, Fach, Test erstellen, Test, Durchlauf, Ergebnis, Lernplan, Lernzettel, Einstellungen) |
| `src/components/` | Wiederverwendbare Bausteine (Antwortfelder, Feedback, Markdown/LaTeX, Editor) |
