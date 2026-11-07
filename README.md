# Lern-App

Eine persönliche Lern-App: Du lädst deine Lernmaterialien hoch, und die App macht daraus interaktive Tests.

- **Meine Aufgaben abfragen** – Lade Aufgabenblätter und Lösungen hoch. Die KI übernimmt genau diese Aufgaben
  (gleiche Zahlen, gleiche Formulierung) samt deiner Lösungen und baut daraus einen Test.
- **Neue Aufgaben erzeugen** – Lade Material als Referenz hoch (Skript, Folien, Altklausuren). Die KI erstellt neue,
  andere Aufgaben zum gleichen Stoff – in Anzahl, Schwierigkeit und Format nach Wahl.

## Funktionen

- Fächer mit beliebig vielen Materialien (PDF, Fotos/Bilder, Textdateien oder eingefügter Text)
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
- Backup als JSON-Datei exportieren/importieren
- Funktioniert auf Handy und Desktop; kann auf dem Handy zum Startbildschirm hinzugefügt werden

## Starten

Voraussetzung: [Node.js](https://nodejs.org/) ab Version 20.

```bash
npm install
npm run dev
```

Dann im Browser die angezeigte Adresse öffnen (meist http://localhost:5173).

Für eine fertige Version: `npm run build` erzeugt den Ordner `dist/`, den du auf jedem statischen Webhoster
ablegen kannst.

### Online über GitHub Pages

Der Workflow `.github/workflows/deploy.yml` baut die App bei jedem Push auf `main` und veröffentlicht sie über
GitHub Pages. Einmalig nötig: im Repository unter **Settings → Pages → Source** „GitHub Actions“ auswählen.
(Bei privaten Repositories setzt GitHub Pages einen kostenpflichtigen GitHub-Plan voraus.)

## API-Schlüssel und Kosten

Die App nutzt Claude von Anthropic. Du brauchst einen API-Schlüssel aus der
[Anthropic Console](https://console.anthropic.com/settings/keys) und trägst ihn in der App unter **Einstellungen**
ein. Abgerechnet wird nach Verbrauch über dein Anthropic-Konto. Ein Test aus einigen Seiten Material kostet grob
geschätzt einige Cent bis wenige Dutzend Cent, je nach Umfang und Modell; das Bewerten einer Antwort liegt meist
unter einem Cent. In den Einstellungen kannst du für das Erstellen und das Bewerten jeweils ein günstigeres Modell
wählen.

## Datenschutz

- Es gibt keinen eigenen Server. Alle Fächer, Materialien, Tests und Ergebnisse werden lokal im Browser gespeichert
  (IndexedDB).
- Der API-Schlüssel liegt nur im Browser (localStorage) und wird ausschließlich an `api.anthropic.com` gesendet.
  Nutze die App deshalb nur auf deinem eigenen Gerät.
- Materialien werden nur dann an die Claude-API geschickt, wenn du einen Test erstellst.

## Entwicklung

```bash
npm test          # Unit-Tests (Vitest)
npm run typecheck # TypeScript prüfen
npm run build     # Produktions-Build
```

Aufbau:

| Pfad | Inhalt |
| --- | --- |
| `src/ai/` | Claude-Anbindung: Prompts, JSON-Schemas, Testerstellung, Bewertung |
| `src/lib/` | Auswertung, Dateiverarbeitung, Durchläufe, Backup |
| `src/pages/` | Seiten (Übersicht, Fach, Test erstellen, Test, Durchlauf, Ergebnis, Einstellungen) |
| `src/components/` | Wiederverwendbare Bausteine (Antwortfelder, Feedback, Markdown/LaTeX, Editor) |
| `src/db.ts` | Lokale Datenbank (Dexie/IndexedDB) |
