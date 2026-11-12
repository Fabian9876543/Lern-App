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
| PDFs | Text wird im Browser ausgelesen; eingescannte Seiten und Fotos gehen als Bild an Claude (verkleinert auf ca. 1,2 MP, begrenzte Anzahl pro Test) | Claude liest PDFs direkt (bis ca. 30 MB pro Test) |
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

- Fächer mit beliebig vielen Materialien (PDF, Fotos/Bilder, Textdateien oder eingefügter Text)
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
- Formeln werden mit LaTeX/KaTeX schön dargestellt
- Ergebnisse mit Auswertung nach Thema, Verlauf pro Test und **„Fehler wiederholen“**
- „Neue Variante“: zum selben Material einen neuen Test mit anderen Aufgaben erzeugen
- Fragen nachträglich bearbeiten, löschen oder eigene hinzufügen
- **Lernplan pro Fach:** Prüfungsdatum und Lernzeit pro Wochentag angeben, Themen von Claude aus dem Material
  ermitteln lassen oder selbst eingeben (optional von Claude um Zeitbedarf, Wichtigkeit und Fundstellen ergänzt),
  optionaler Einstufungstest. Die App verteilt Lernen, Übungstests, Wiederholungen (nach ca. 2, 6 und 13 Tagen) und
  eine Probeklausur auf die Tage bis zur Prüfung, zeigt den Themenstand, plant bei schwachen Themen Zusatz-
  wiederholungen ein und verteilt Verpasstes neu. Die Aufgaben des Tages stehen auf der Startseite.
- Backup als JSON-Datei exportieren/importieren
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
- Materialien werden nur dann an Claude geschickt, wenn du einen Test erstellst.

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
| `src/pages/` | Seiten (Übersicht, Fach, Test erstellen, Test, Durchlauf, Ergebnis, Einstellungen) |
| `src/components/` | Wiederverwendbare Bausteine (Antwortfelder, Feedback, Markdown/LaTeX, Editor) |
