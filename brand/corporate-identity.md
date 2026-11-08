# Lern-App – Corporate Identity

**Version 1.0 · Stand: 8. November 2026**
Abgeleitet aus der Lern-App (Repository `Lern-App`, Code-Stand vom 8. November 2026) und für das Marketing ergänzt.

Diese Datei ist die verbindliche Referenz für alle Inhalte, die für die Lern-App erstellt werden – von Menschen
und von Marketing-Tools. Alle Werte stehen in **Abschnitt 15** zusätzlich maschinenlesbar (JSON und CSS).

**Kennzeichnung:**
- **[App]** – so bereits in der Lern-App umgesetzt; Marketing muss dazu passen.
- **[Neu]** – für das Marketing neu festgelegt; in der App noch nicht (oder anders) umgesetzt.

---

## Inhalt

1. [Markenkern](#1-markenkern)
2. [Produktfakten für das Marketing](#2-produktfakten-für-das-marketing)
3. [Botschaften und Texte](#3-botschaften-und-texte)
4. [Tonalität und Sprache](#4-tonalität-und-sprache)
5. [Logo](#5-logo)
6. [Farben](#6-farben)
7. [Typografie](#7-typografie)
8. [Formen, Raster und Abstände](#8-formen-raster-und-abstände)
9. [Bildsprache](#9-bildsprache)
10. [Icons und Symbole](#10-icons-und-symbole)
11. [UI-Elemente für Mockups](#11-ui-elemente-für-mockups)
12. [Anwendungen und Formate](#12-anwendungen-und-formate)
13. [Barrierefreiheit](#13-barrierefreiheit)
14. [Rechtliche Hinweise](#14-rechtliche-hinweise)
15. [Design-Tokens (maschinenlesbar)](#15-design-tokens-maschinenlesbar)
16. [Checkliste vor der Veröffentlichung](#16-checkliste-vor-der-veröffentlichung)
17. [Dateien und Änderungen](#17-dateien-und-änderungen)

---

## 1. Markenkern

### Name

**Lern-App** – immer mit Bindestrich, „L“ und „A“ groß.
Nicht: „LernApp“, „Lernapp“, „LERN-APP“, „die Lern App“.

> **Hinweis zum Namen:** „Lern-App“ ist ein beschreibender Begriff. Als Marke ist er schwer schützbar und in
> Suchmaschinen schwer zu finden. Vor größeren Kampagnen eine Markenrecherche (DPMA, EUIPO) durchführen und einen
> eigenständigen Namen erwägen. Diese CI ist so aufgebaut, dass dann nur die Wortmarke ersetzt werden muss.

### Claim

| | Text | Status |
| --- | --- | --- |
| Hauptclaim | **Lerne mit Tests aus deinem eigenen Material.** | [App] – Überschrift der Startseite |
| Kurzclaim | **Dein Material. Deine Tests.** | [Neu] – für kleine Formate, Sticker, Social-Profile |

### Mission

Lernende sollen genau das üben können, was in ihrer Prüfung drankommt – mit ihren eigenen Unterlagen statt mit
allgemeinen Fragen aus dem Netz.

### Markenversprechen

Aus deinen Unterlagen wird in wenigen Minuten ein Test, der ehrlich zeigt, wo du stehst – und ein Plan, mit dem du
bis zur Prüfung fertig wirst.

### Zielgruppen

| Zielgruppe | Material | Typische Situation |
| --- | --- | --- |
| **Studierende** (v. a. MINT, Wirtschaft, Medizin) | Übungsblätter mit Lösungen, Skripte, Folien, Altklausuren | Viel Stoff, Klausurphase, Altklausuren nur als PDF |
| **Schüler:innen der Oberstufe** | Arbeitsblätter, Abituraufgaben, Mitschriften | Abiturvorbereitung, Klausuren im Halbjahr |
| **Auszubildende und Weiterbildung** | Lernunterlagen, Prüfungsfragen (z. B. IHK), Zertifikatsmaterial | Prüfung neben Arbeit oder Ausbildung |

Gemeinsam ist allen: eine konkrete Prüfung mit Termin, eigenes Material und wenig Zeit.

### Werte

| Wert | Bedeutung | Zeigt sich in der App |
| --- | --- | --- |
| **Konkret** | Wir arbeiten mit dem Material der Lernenden, nicht mit allgemeinen Fragen. | Modus „Meine Aufgaben abfragen“, Fundstellen im Lernplan |
| **Ehrlich** | Ergebnisse zeigen den echten Stand; Pläne sagen, wenn die Zeit knapp wird. | Teilpunkte, Themenstand, Warnung „Die Zeit ist knapp“ |
| **Ermutigend** | Feedback benennt, was stimmt, und wie es weitergeht. | „Gut – da geht noch was.“, „Fehler wiederholen“ |
| **Privat** | Die Daten gehören den Lernenden. Kein eigener Server, keine Werbung. | Speicherung im Browser bzw. im privaten Bereich in claude.ai |

### Positionierung

Für Lernende mit einer konkreten Prüfung ist die Lern-App der Testgenerator, der aus den eigenen Übungsblättern,
Lösungen und Skripten interaktive Tests und einen Lernplan macht – anders als Karteikarten-Apps oder allgemeine
KI-Chats, die weder die eigenen Aufgaben abfragen noch den Lernstand bis zur Prüfung verfolgen.

### Persönlichkeit

Wie eine gute Tutorin aus einem höheren Semester: kompetent, direkt, geduldig – ohne zu belehren und ohne
falsches Lob.

---

## 2. Produktfakten für das Marketing

Werbeaussagen müssen stimmen. Diese Liste beschreibt, was die Lern-App in Version 1.0 kann.

### Was die App kann

- **Zwei Testarten**
  - *Meine Aufgaben abfragen:* übernimmt die Aufgaben aus hochgeladenen Aufgabenblättern wortgetreu und die
    Lösungen aus den Lösungsdateien. Fehlt eine Lösung, löst Claude die Aufgabe und kennzeichnet das.
  - *Neue Aufgaben erzeugen:* erstellt neue, andere Aufgaben zum gleichen Stoff – 3 bis 40 Fragen, Schwierigkeit
    leicht, mittel, schwer oder gemischt, Formate wählbar.
- **Material:** PDF, Fotos und Bilder, Textdateien oder eingefügter Text. Jede Datei bekommt eine Rolle:
  Aufgaben, Lösungen, Aufgaben + Lösungen oder Lernmaterial / Referenz.
- **Fünf Aufgabenformate:** Single Choice, Multiple Choice, Zahlenergebnis (mit Toleranz, Komma oder Punkt),
  Kurzantwort, Freitext mit Rechenweg.
- **Übungsmodus** mit sofortigem Feedback, Tipp und Musterlösung; **Prüfungsmodus** mit Auswertung am Ende.
- **Bewertung:** Auswahlfragen, Zahlen und exakte Kurzantworten wertet die App selbst aus; offene Antworten
  bewertet Claude anhand der Musterlösung mit Teilpunkten. Ein **Foto der handschriftlichen Lösung** kann
  angehängt und bewertet werden. Jede Bewertung lässt sich selbst korrigieren.
- **Formeln** werden mit LaTeX sauber dargestellt.
- **Auswertung** nach Thema, Verlauf pro Test, „Fehler wiederholen“, neue Variante eines Tests.
- **Lernplan pro Fach:** Prüfungsdatum und Lernzeit pro Wochentag; Themen von Claude aus dem Material oder selbst
  eingegeben; optionaler Einstufungstest; Lernen, Übungstests, Wiederholungen nach etwa 2, 6 und 13 Tagen,
  Probeklausur und Puffertag; Zusatzwiederholung für Themen unter 60 %; verpasste Aufgaben neu verteilen;
  „Heute“-Übersicht auf der Startseite.
- **Zwei Varianten**
  - *claude.ai-Version:* läuft in claude.ai über das eigene Claude-Konto, ohne API-Kosten. Daten im privaten
    Bereich des Artifacts, auf allen Geräten gleich. Wer das Artifact über einen geteilten Link nutzt, speichert
    im eigenen Browser (Gastmodus).
  - *Web-Version:* eigenständig im Browser mit eigenem Claude-API-Schlüssel, Abrechnung nach Verbrauch. Daten im
    Browser.
- Läuft im Browser auf Handy und Computer. Sprache der Oberfläche: Deutsch.
- Backup als Datei; Umzug zwischen beiden Varianten möglich.

### Was nicht behauptet werden darf

| Nicht sagen | Warum | Stattdessen |
| --- | --- | --- |
| „Garantiert bessere Noten“, „90 % bestehen“ | Es gibt keine Daten dazu. | „Übe genau das, was in deiner Prüfung drankommt.“ |
| „Kostenlos“ (ohne Einschränkung) | claude.ai-Version nutzt das Kontingent des eigenen Claude-Kontos; ob kostenlose Claude-Konten unterstützt werden, ist nicht geklärt. Die Web-Version verursacht API-Kosten. | „Ohne Zusatzkosten mit deinem Claude-Abo“ – nur für die claude.ai-Version und nur so formuliert. |
| „Fehlerfrei“, „100 % korrekt“ | Claude kann Aufgaben oder Lösungen falsch übernehmen. | „Du kannst jede Frage prüfen und korrigieren.“ |
| „Funktioniert offline“, „erinnert dich“ | Es gibt keinen Offline-Modus und keine Benachrichtigungen. | „Deine Aufgaben für heute siehst du auf der Startseite.“ |
| „Im App Store“, „Lade die App herunter“ | Die Lern-App läuft im Browser bzw. in claude.ai. | „Öffne die Lern-App im Browser.“ |
| „Offizielle Claude-App“, „Partner von Anthropic“ | Es besteht keine Partnerschaft. | „Nutzt Claude von Anthropic.“ |
| „Liest Word und PowerPoint“ | Nur PDF, Bilder und Text. | „Word und PowerPoint einfach als PDF exportieren.“ |

---

## 3. Botschaften und Texte

### Elevator Pitch (1 Satz)

> Die Lern-App macht aus deinen Übungsblättern, Lösungen und Skripten interaktive Tests – und plant dir die Zeit
> bis zur Prüfung.

### Kurzbeschreibung (ca. 50 Wörter)

> Lade Aufgabenblätter, Lösungen oder Skripte hoch – die Lern-App macht daraus interaktive Tests. Entweder genau
> mit deinen Aufgaben oder mit neuen zum gleichen Stoff. Du bekommst sofort Feedback, auch für deinen Rechenweg,
> und siehst, welche Themen noch nicht sitzen. Der Lernplan verteilt alles bis zur Prüfung.

### Boilerplate (ca. 80 Wörter)

> Die Lern-App ist ein Testgenerator für Lernende mit einer konkreten Prüfung. Aus hochgeladenen Übungsblättern,
> Lösungen, Skripten und Altklausuren erstellt sie mit Claude von Anthropic interaktive Tests – wortgetreu mit
> den eigenen Aufgaben oder mit neuen Aufgaben zum gleichen Stoff. Antworten werden direkt oder anhand der
> Musterlösung bewertet, auch als Foto. Ein Lernplan verteilt Lernen, Übungstests, Wiederholungen und eine
> Probeklausur auf die Tage bis zur Prüfung. Die Daten bleiben bei den Lernenden.

### Kernbotschaften

| # | Botschaft | Beleg in der App |
| --- | --- | --- |
| 1 | **Übe genau das, was drankommt.** | Modus „Meine Aufgaben abfragen“ übernimmt deine Aufgaben wortgetreu. |
| 2 | **Mehr als die bekannten Aufgaben.** | „Neue Aufgaben erzeugen“: neue Zahlen, Beispiele und Fragestellungen zum gleichen Stoff. |
| 3 | **Feedback auch für den Rechenweg.** | Bewertung offener Antworten mit Teilpunkten – auch per Foto deiner Lösung. |
| 4 | **Ein Plan bis zur Prüfung.** | Lernplan mit Themen, Wiederholungen, Probeklausur und Themenstand. |
| 5 | **Deine Daten bleiben bei dir.** | Kein eigener Server; Speicherung im Browser bzw. privat in claude.ai. |

### Überschriften-Bausteine

- Dein Material. Deine Tests.
- Altklausur hochladen. Test starten.
- Aus dem Übungsblatt wird ein Test.
- Weißt du es – oder glaubst du es nur?
- Neue Aufgaben, gleicher Stoff.
- Rechenweg fotografieren, Feedback bekommen.
- Noch 21 Tage. Ein Plan.
- Fehler wiederholen, bis sie sitzen.
- Formeln? Kein Problem.
- Lernen mit dem, was wirklich drankommt.

### Handlungsaufforderungen (CTAs)

Wörtlich wie die Schaltflächen in der App: **„Test erstellen“**, **„Lernplan erstellen“**, **„Los geht's“**,
**„Fehler wiederholen“**. Für Website und Werbung: **„Jetzt ausprobieren“**, **„Lern-App öffnen“**.
Nicht: „Hier klicken“, „Mehr erfahren“ ohne Ziel, „Jetzt kaufen“.

---

## 4. Tonalität und Sprache

### Grundsätze

- **Anrede:** immer „du“, in allen Kanälen. **Sprache:** Deutsch.
- **Direkt statt umständlich.** Kurze Sätze, aktive Verben, die Handlung zuerst.
- **Konkret statt Superlative.** Zeigen, was passiert – nicht „revolutionär“, „smart“, „einzigartig“.
- **Ermutigend, ohne zu beschönigen.** Ehrliches Ergebnis plus nächster Schritt.
- **Erklären statt entschuldigen.** Bei Problemen sagen, was passiert ist und was zu tun ist.
- **Aus Sicht der Lernenden benennen.** „Fach“, „Material“, „Test“ – nicht „Datensatz“, „Upload“, „Instanz“.

### So klingt die Lern-App (Beispiele aus der App) [App]

| Situation | Text |
| --- | --- |
| Ergebnis ab 90 % | „Hervorragend! 🎉“ |
| Ergebnis ab 75 % | „Sehr gut! 💪“ |
| Ergebnis ab 50 % | „Gut – da geht noch was.“ |
| Ergebnis unter 50 % | „Dranbleiben – Wiederholung lohnt sich!“ |
| Fehler | „Die Materialien sind zu groß für eine Anfrage. Bitte weniger oder kleinere Dateien auswählen.“ |
| Lernplan zu knapp | „Die Zeit ist knapp: Für alle Themen wären ca. 22 Std. nötig, eingeplant sind 15 Std. Die Lernzeiten wurden gekürzt.“ |

### Do und Don't

| Do | Don't |
| --- | --- |
| „Lade dein Übungsblatt hoch – in zwei Minuten hast du einen Test.“ | „Unsere innovative KI-Lösung revolutioniert dein Lernen!“ |
| „Du hast 6 von 8 Punkten. Bei Integralen fehlt noch der Rechenweg.“ | „Super gemacht!!! 🚀🚀🚀“ |
| „Die Datei ist zu groß. Exportiere sie mit kleinerer Auflösung.“ | „Ups, da ist etwas schiefgelaufen 😕“ |
| „Übe die Aufgaben, die in der Klausur drankommen.“ | „Bestehe garantiert jede Prüfung.“ |

### Schreibregeln

- **Gendern:** neutrale Begriffe bevorzugen („Lernende“, „Studierende“); wo nötig mit Doppelpunkt
  („Schüler:innen“, „Besitzer:in“) [App].
- **Anführungszeichen:** deutsche Zeichen „…“ [App]. **Gedankenstrich:** „–“ mit Leerzeichen [App].
- **Zahlen und Einheiten:** Dezimalkomma („3,5“), „Min.“ und „Std.“ in der App, „Minuten“/„Stunden“ in
  Fließtext; Prozent mit Leerzeichen („80 %“).
- **Datum:** in der App „Mo, 7.12.“; in Fließtext „7. Dezember 2026“.
- **Emojis:** höchstens eines pro Botschaft und nur mit Funktion (Ergebnis, Hinweis). Bewertungen immer mit Wort.
- **Großschreibung:** keine Wörter in Versalien zur Betonung; Versalien nur für kurze Labels (siehe Typografie).

### Glossar (Begriffe wie in der App) [App]

| Begriff | Bedeutung | Nicht verwenden |
| --- | --- | --- |
| Fach | Sammlung von Materialien, Tests und Lernplänen (z. B. „Analysis 1“) | Kurs, Projekt, Ordner |
| Material | hochgeladene Datei oder eingefügter Text | Upload, Dokument-Asset |
| Rolle | Art des Materials: Aufgaben, Lösungen, Aufgaben + Lösungen, Lernmaterial / Referenz | Typ, Kategorie |
| Test | Fragen, die aus Material erstellt wurden | Quiz (nur in Werbung als Erklärung), Prüfung |
| Meine Aufgaben abfragen | Testart mit den Originalaufgaben | Exakt-Modus |
| Neue Aufgaben erzeugen | Testart mit neuen Aufgaben zum gleichen Stoff | Generator-Modus |
| Übungsmodus / Prüfungsmodus | Feedback sofort / am Ende | Lernmodus, Klausurmodus |
| Musterlösung | vollständige Lösung mit Lösungsweg | Antwortschlüssel |
| Fehler wiederholen | erneuter Test mit den nicht richtigen Fragen | Retry |
| Lernplan | Plan bis zur Prüfung mit Tagesaufgaben | Kalender, Schedule |
| Einstufungstest | kurzer Test vor dem Plan | Assessment, Vortest |
| Probeklausur | Test im Stil der Prüfung am Ende des Plans | Mock Exam |
| Themenstand | Ergebnis pro Thema | Score, Mastery |
| Gastmodus | Nutzung eines geteilten Artifacts mit Speicherung im eigenen Browser | Demo-Modus |

### KI und Claude benennen

- Das KI-Modell heißt **Claude** (von Anthropic). Beschreibend nennen: „nutzt Claude von Anthropic“, „läuft mit
  deinem Claude-Konto“.
- Allgemein darf „KI“ verwendet werden, wenn es um das Prinzip geht: „Die KI bewertet deinen Rechenweg.“
- Nicht: „Claude-App“, „offizielle App von Anthropic“, „powered by Anthropic“ mit Logo, Anthropic- oder
  Claude-Logos.

---

## 5. Logo

### Aufbau

Das Logo besteht aus **Bildmarke** und **Wortmarke**.

- **Bildmarke** [App]: ein Doktorhut mit Quaste auf einem Quadrat mit abgerundeten Ecken in Indigo. Die
  Hutkrempe ist weiß, der Hutkörper Indigo Pastell, die Quaste weiß.
  - Doktorhut: Lernziel und Abschluss.
  - Abgerundetes Quadrat: die App.
  - Quaste nach unten rechts: Bewegung und Fortschritt.
- **Wortmarke** [Neu]: „Lern-App“ in Plus Jakarta Sans ExtraBold (800), Laufweite −1 %, als Vektorpfade.
  In der App selbst wird der Name bisher in der Systemschrift gesetzt.

### Varianten

| Variante | Datei | Einsatz |
| --- | --- | --- |
| Logo farbig | `logo/lern-app-logo.svg`, `logo/lern-app-logo-2120.png` | Standard auf Weiß, Papier und hellen Fotos |
| Logo negativ | `logo/lern-app-logo-negativ.svg`, `logo/lern-app-logo-negativ-2120.png` | auf Indigo und dunklen Flächen |
| Logo einfarbig | `logo/lern-app-logo-mono.svg` | Schwarz-Weiß-Druck, Stempel, Gravur |
| Bildmarke farbig | `logo/lern-app-icon.svg`, `logo/lern-app-icon-1024.png` | App-Icon, Favicon, Profilbild, kleine Formate |
| Bildmarke negativ | `logo/lern-app-icon-negativ.svg` | auf Indigo und dunklen Flächen |
| Bildmarke einfarbig | `logo/lern-app-icon-mono.svg` | einfarbige Anwendungen |
| Wortmarke | `logo/lern-app-wortmarke.svg` | nur wenn die Bildmarke bereits sichtbar ist (z. B. neben dem App-Icon) |

### Konstruktion

- Bildmarke auf einem Raster von 64 × 64 Einheiten, Eckradius 14 Einheiten (≈ 22 %).
- Hutkrempe: Raute von (14|22) über (32|14) und (50|22) bis (32|30).
- Hutkörper: von x = 22 bis 42, oben bei y = 27, unten bei y = 42 gerundet.
- Quaste: Linie von (50|22) nach (50|34), Strichstärke 3, runde Enden.
- Logo: Abstand zwischen Bildmarke und Wortmarke = ¼ der Bildmarkenhöhe; Versalhöhe der Wortmarke = 45 % der
  Bildmarkenhöhe, vertikal mittig; Seitenverhältnis 4,14 : 1.

### Schutzzone

Rund um das Logo mindestens **¼ der Bildmarkenhöhe** frei lassen (bei 64 px Bildmarke: 16 px). In dieser Zone
stehen keine Texte, Bildkanten oder anderen Logos.

### Mindestgrößen

| | Digital | Druck |
| --- | --- | --- |
| Logo (horizontal) | 120 px Breite | 30 mm Breite |
| Bildmarke | 24 px (Favicon ausnahmsweise 16 px) | 8 mm |

### Hintergründe

- Farbiges Logo auf Weiß (#FFFFFF), Papier (#F6F7FB), Indigo Hell (#EEF0FF) und ruhigen, hellen Fotos.
- Negatives Logo auf Indigo (#4F46E5), Indigo Dunkel (#4338CA), Tinte (#1C2033) und ruhigen, dunklen Fotos.
- Nicht auf unruhigen Bildbereichen, Mustern oder Semantikfarben (Grün, Orange, Rot).

### Nicht erlaubt

- Logo verzerren, drehen, neigen oder spiegeln.
- Farben ändern, Verläufe, Schatten, Konturen oder Glanzeffekte hinzufügen.
- Wortmarke in einer anderen Schrift setzen oder Buchstabenabstände ändern.
- Bildmarke ohne abgerundetes Quadrat verwenden (außer in Illustrationen, siehe Bildsprache).
- Bildmarke und Wortmarke neu anordnen (z. B. Wortmarke über der Bildmarke).
- Logo in Fließtext einbauen – im Text heißt es einfach „Lern-App“.

### Bildmarke als Code (SVG)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Lern-App">
  <rect width="64" height="64" rx="14" fill="#4F46E5"/>
  <path d="M14 22l18-8 18 8-18 8z" fill="#FFFFFF"/>
  <path d="M22 27v9c0 3 5 6 10 6s10-3 10-6v-9l-10 4.5z" fill="#C7D2FE"/>
  <path d="M50 22v12" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>
```

---

## 6. Farben

CMYK-Werte sind rechnerische Näherungen. Indigo liegt teilweise außerhalb des CMYK-Farbraums – vor jedem Druck
einen Proof anfordern.

### Markenfarben

| Name | Token | HEX | RGB | CMYK (≈) | Einsatz |
| --- | --- | --- | --- | --- | --- |
| **Indigo** | `brand.indigo` | `#4F46E5` | 79, 70, 229 | 66/69/0/10 | Hauptfarbe: Logo, Hauptschaltflächen, Hervorhebungen [App] |
| Indigo Dunkel | `brand.indigoDark` | `#4338CA` | 67, 56, 202 | 67/72/0/21 | Hover, gedrückte Zustände, Indigo-Text auf Hell [App] |
| Indigo Hell | `brand.indigoLight` | `#EEF0FF` | 238, 240, 255 | 7/6/0/0 | Flächen, ausgewählte Zustände, Hinweise [App] |
| Indigo Pastell | `brand.indigoPastel` | `#C7D2FE` | 199, 210, 254 | 22/17/0/0 | Hutkörper im Logo, Illustrationen [App] |
| Indigo Nacht | `brand.indigoNight` | `#818CF8` | 129, 140, 248 | 48/44/0/3 | Hauptfarbe im dunklen Design [App] |

### Neutrale Farben

| Name | Token | HEX | RGB | CMYK (≈) | Einsatz |
| --- | --- | --- | --- | --- | --- |
| **Tinte** | `neutral.ink` | `#1C2033` | 28, 32, 51 | 45/37/0/80 | Text, Überschriften, Wortmarke [App] |
| Schiefer | `neutral.slate` | `#646B82` | 100, 107, 130 | 23/18/0/49 | Nebentext, Beschriftungen [App] |
| Linie | `neutral.line` | `#E3E6EF` | 227, 230, 239 | 5/4/0/6 | Rahmen, Trennlinien [App] |
| **Papier** | `neutral.paper` | `#F6F7FB` | 246, 247, 251 | 2/2/0/2 | Seitenhintergrund [App] |
| Fläche | `neutral.surface2` | `#F1F3F9` | 241, 243, 249 | 3/2/0/2 | Felder, Listenzeilen [App] |
| Weiß | `neutral.white` | `#FFFFFF` | 255, 255, 255 | 0/0/0/0 | Karten, Inhaltsflächen [App] |

### Statusfarben (nur für Ergebnisse und Hinweise)

| Status | Grundfarbe | Textvariante [Neu] | Fläche | Symbol |
| --- | --- | --- | --- | --- |
| Richtig | `#059669` | `#047857` | `#E7F8F1` | ✓ |
| Teilweise | `#C2790A` | `#B45309` | `#FFF5E1` | ½ |
| Falsch | `#DC2626` | `#B91C1C` | `#FDECEB` | ✗ |
| Hinweis/Warnung | – | Tinte `#1C2033` | `#FFF8E6`, Rand `#F2D38A` | – |

Grundfarben für Flächen, Balken, Symbole und große Schrift; **Textvarianten für Schrift unter 24 px** (siehe
Barrierefreiheit). Statusfarben nie als Dekoration verwenden.

### Materialrollen [App]

| Rolle | Text | Fläche |
| --- | --- | --- |
| Aufgaben | `#2563EB` | `#E8F0FE` |
| Lösungen | `#059669` | `#E7F8F1` |
| Aufgaben + Lösungen | `#7C3AED` | `#F1E9FE` |
| Lernmaterial / Referenz | `#646B82` | `#F1F3F9` |

### Fachfarben (Kategorien) [App]

Jedes Fach bekommt der Reihe nach eine dieser Farben. Im Marketing für Kategorien, Diagramme und Illustrationen –
immer nur eine Fachfarbe pro Motiv zusätzlich zu Indigo.

| # | Name | HEX | Weiße Schrift darauf |
| --- | --- | --- | --- |
| 1 | Indigo | `#4F46E5` | ja (6,29 : 1) |
| 2 | Petrol | `#0891B2` | nur groß (3,68 : 1) |
| 3 | Smaragd | `#059669` | nur groß (3,77 : 1) |
| 4 | Bernstein | `#D97706` | nur groß (3,19 : 1) |
| 5 | Rot | `#DC2626` | ja (4,83 : 1) |
| 6 | Pink | `#DB2777` | ja (4,60 : 1) |
| 7 | Violett | `#7C3AED` | ja (5,70 : 1) |
| 8 | Schiefer | `#475569` | ja (7,58 : 1) |

### Dunkles Design [App]

| Rolle | HEX |
| --- | --- |
| Hintergrund | `#0F1220` |
| Fläche | `#181C2E` |
| Fläche 2 | `#20253A` |
| Linie | `#2C3250` |
| Text | `#E8EAF4` |
| Nebentext | `#9AA1BB` |
| Hauptfarbe | `#818CF8` (Schrift darauf: `#0F1220`) |
| Hauptfarbe hell | `#252A4A` |
| Richtig / Fläche | `#34D399` / `#12302A` |
| Teilweise / Fläche | `#FBBF24` / `#352A12` |
| Falsch / Fläche | `#F87171` / `#3A1B1D` |

### Farbverhältnis

Etwa **60 %** Papier und Weiß, **30 %** Tinte und Schiefer (vor allem Text), **10 %** Indigo. Pro Motiv höchstens
eine Fachfarbe zusätzlich. **Keine Farbverläufe**, keine Neonfarben.

### Kontraste (WCAG 2.1)

| Kombination | Verhältnis | Ergebnis |
| --- | --- | --- |
| Weiß auf Indigo `#4F46E5` | 6,29 : 1 | AA |
| Indigo auf Weiß | 6,29 : 1 | AA |
| Indigo auf Papier | 5,87 : 1 | AA |
| Tinte auf Weiß | 16,11 : 1 | AAA |
| Tinte auf Papier | 15,05 : 1 | AAA |
| Schiefer auf Weiß | 5,29 : 1 | AA |
| Schiefer auf Papier | 4,94 : 1 | AA |
| Indigo Pastell auf Indigo | 4,22 : 1 | nur große Elemente (Logo) |
| Richtig `#059669` auf Weiß | 3,77 : 1 | nur große Schrift |
| Richtig-Text `#047857` auf Fläche `#E7F8F1` | 4,99 : 1 | AA |
| Teilweise `#C2790A` auf Weiß | 3,48 : 1 | nur große Schrift |
| Teilweise-Text `#B45309` auf Fläche `#FFF5E1` | 4,64 : 1 | AA |
| Falsch `#DC2626` auf Weiß | 4,83 : 1 | AA |
| Falsch-Text `#B91C1C` auf Fläche `#FDECEB` | 5,66 : 1 | AA |
| Dunkel: Text auf Hintergrund | 15,52 : 1 | AAA |
| Dunkel: Indigo Nacht auf Hintergrund | 6,24 : 1 | AA |

---

## 7. Typografie

### Schriften

| Einsatz | Schrift | Status |
| --- | --- | --- |
| **Marketing** (Headlines und Text), Wortmarke | **Plus Jakarta Sans** – ExtraBold 800, Bold 700, SemiBold 600, Regular 400 | [Neu] |
| App-Oberfläche | Systemschrift: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | [App] |
| Formeln | KaTeX (LaTeX-Satz) | [App] |

- **Plus Jakarta Sans** ist kostenlos unter der SIL Open Font License 1.1 erhältlich (Google Fonts oder
  Fontsource) und darf auch kommerziell genutzt werden.
- Fallback, wenn die Schrift nicht verfügbar ist: die Systemschrift (siehe oben).
- App-Screenshots zeigen die Systemschrift – das ist gewollt und muss nicht angepasst werden.
- **Formeln als Gestaltungselement:** echte Formeln aus dem Stoff (z. B. ∫₀^π sin x dx = 2) sind ein typisches
  Motiv der Lern-App. Immer korrekt gesetzt, nie als Deko-Kauderwelsch.

### Schriftgrößen für Marketing [Neu]

| Stufe | Größe / Zeilenabstand | Schnitt | Laufweite | Einsatz |
| --- | --- | --- | --- | --- |
| Display | 56 / 60 px | ExtraBold 800 | −1,5 % | Plakate, Hero, Social-Headline |
| H1 | 40 / 48 px | ExtraBold 800 | −1 % | Seitentitel |
| H2 | 28 / 36 px | Bold 700 | −0,5 % | Abschnitte |
| H3 | 20 / 28 px | Bold 700 | 0 | Zwischenüberschriften, Karten |
| Text groß | 18 / 28 px | Regular 400 | 0 | Einleitungen |
| Text | 16 / 24 px | Regular 400 | 0 | Fließtext |
| Klein | 13 / 20 px | Regular 400 | 0 | Bildunterschriften, Fußnoten |
| Label | 12 / 16 px | SemiBold 600, Versalien | +4 % | Rubriken, Kategorien |

Für Druck gelten dieselben Verhältnisse (z. B. Text 10 pt, H1 24 pt).

### Schriftgrößen in der App [App]

Seitentitel 25,6 px (1,6 rem) Bold · Abschnitt 18,4 px (1,15 rem) Bold · Text 16 px · Klein 13,8 px ·
Labels 12,5 px SemiBold/Bold in Versalien mit +4 % Laufweite · Schaltflächen 15 px SemiBold.

### Regeln

- Linksbündig setzen; zentriert nur für sehr kurze Headlines.
- Zeilenlänge 45–75 Zeichen.
- Headlines höchstens zwei Zeilen; keine Punkte am Ende von Headlines (außer Claims).
- Keine Versalien in Fließtext und Headlines; Versalien nur für Labels.
- Keine kursiven Headlines; Hervorhebungen im Text mit SemiBold, nicht mit Farbe allein.
- Zahlen in Tabellen und Ergebnissen mit Tabellenziffern (gleiche Breite).

---

## 8. Formen, Raster und Abstände

| Element | Wert | Status |
| --- | --- | --- |
| Eckradius Karten | 14 px | [App] |
| Eckradius Bedienelemente (Buttons, Felder) | 9 px | [App] |
| Chips, Pillen | vollständig rund | [App] |
| Eckradius App-Icon | 22 % der Kantenlänge | [App] |
| Linien | 1 px, Linie `#E3E6EF` | [App] |
| Akzentstreifen (Ergebnis, Aufgabentyp) | 4 px links | [App] |
| Schatten (leicht) | `0 1px 2px rgba(20,24,50,.05), 0 4px 16px rgba(20,24,50,.05)` | [App] |
| Schatten (Dialog) | `0 20px 60px rgba(0,0,0,.25)` | [App] |
| Maximale Inhaltsbreite (App) | 860 px | [App] |
| Seitenrand mobil | mindestens 16 px | [App] |

**Abstände** auf einem 4-px-Raster: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64 px. Innerhalb von Gruppen 8–12 px,
zwischen Abschnitten 20–32 px [App: 0,5 / 0,75 / 1,25 rem].

**Formensprache:** freundlich und klar – abgerundete Rechtecke, keine spitzen Winkel, keine Schrägen, keine
3D-Effekte.

---

## 9. Bildsprache

### Fotos

- **Motive:** echte Lernsituationen – Schreibtisch, Übungsblatt, Handschrift, Formeln, Laptop oder Handy mit der
  Lern-App. Hände und Arbeitsmaterial statt gestellter Gesichter.
- **Menschen:** natürlich und vielfältig, konzentriert statt übertrieben fröhlich.
- **Licht und Farbe:** hell, Tageslicht, kühl-neutral; Indigo als Akzent (Stift, Notizbuch, Bildschirm).
- **Vermeiden:** Stockfoto-Klischees (geworfene Doktorhüte, Daumen hoch, Jubelposen), Roboter, leuchtende Gehirne
  und andere KI-Symbolbilder, Neonfarben, Verläufe.

### App-Screenshots

- Standard ist das **helle Design**; das dunkle Design nur, wenn es ausdrücklich gezeigt werden soll.
- Realistische Inhalte: echte Aufgaben mit sauber gesetzten Formeln, deutsche Texte, plausible Ergebnisse.
- Keine echten Namen, E-Mail-Adressen oder fremden Unterlagen (siehe Rechtliche Hinweise).
- Schlichter Geräterahmen oder Fenster ohne Effekte; Hintergrund Papier oder Indigo Hell.
- Beispieldaten als solche gestalten (z. B. Fach „Analysis 1“, Plan „Klausur Analysis 1“).

### Illustrationen [Neu]

Flach, mit abgerundeten Formen wie die Bildmarke. Farben: Indigo, Indigo Pastell, Tinte und höchstens eine
Fachfarbe. Linien 2 px mit runden Enden. Wiederkehrende Motive: Blatt Papier, Doktorhut, Häkchen, Kalender, Formel.

---

## 10. Icons und Symbole

- **In der App [App]:** Emojis als funktionale Zeichen – 📄 PDF, 🖼️ Bild, 📝 Text, 📋 Meine Aufgaben abfragen,
  ✨ Neue Aufgaben erzeugen, 💡 Tipp, 📷 Foto der Lösung, 🔁 Wiederholen, ⬆️ Hochladen, ⬇️ Herunterladen,
  🗑 Löschen.
- **Bewertung [App]:** ✓ Richtig · ½ Teilweise · ✗ Falsch – immer Symbol, Farbe und Wort zusammen.
- **Im Marketing [Neu]:** Linien-Icons mit 2 px Strich, runden Enden und Ecken, auf einem 24-px-Raster
  (Empfehlung: Lucide, ISC-Lizenz). Farbe Tinte oder Indigo. Emojis nur als einzelner Akzent.

---

## 11. UI-Elemente für Mockups

Damit Mockups und Grafiken wie die echte App aussehen. Alle Werte [App].

| Element | Gestaltung |
| --- | --- |
| Hauptschaltfläche | Indigo `#4F46E5`, Schrift Weiß, 15 px SemiBold, Innenabstand 10 × 17 px, Radius 9 px; Hover `#4338CA` |
| Zweite Schaltfläche | transparent, Rand 1 px `#E3E6EF`, Schrift Tinte; Hover Fläche `#F1F3F9` |
| Löschen | wie zweite Schaltfläche, Schrift Rot `#DC2626`; im Bestätigungsdialog gefüllt Rot |
| Karte | Weiß, Rand 1 px `#E3E6EF`, Radius 14 px, Innenabstand 18–19 px, leichter Schatten |
| Chip | rund, 12,5 px SemiBold, Fläche Indigo Hell, Schrift Indigo; Varianten in Status- und Rollenfarben |
| Hinweisbox | Fläche Indigo Hell, Rand Indigo 25 %, Radius 9 px |
| Antwortoption | Rand 2 px `#E3E6EF`, Radius 9 px, Buchstabe A/B/C im Kreis; gewählt: Rand Indigo, Fläche Indigo Hell; richtig/falsch: Rand und Fläche in Statusfarben |
| Bewertungsbanner | Fläche in Statusfläche, Text in Statusfarbe, z. B. „✓ Richtig · 2 / 2 Punkte“ |
| Fortschrittsbalken | 6 px hoch, rund, Spur `#E3E6EF`, Füllung Indigo |
| Ergebnisring | Kreis 120 px, Ring Indigo auf `#F1F3F9`, Prozentzahl 25,6 px ExtraBold in der Mitte |
| Aufgabe im Lernplan | Fläche `#F1F3F9`, Akzentstreifen links 4 px: Lernen Blau `#2563EB`, Übungstest Indigo, Wiederholung Orange `#C2790A`, Probeklausur Rot `#DC2626`, Puffer Schiefer |

---

## 12. Anwendungen und Formate

### Social Media

| Format | Größe | Hinweise |
| --- | --- | --- |
| Instagram-Beitrag (hoch) | 1080 × 1350 px | Standardformat für Feature-Motive |
| Quadratisch | 1080 × 1080 px | Instagram, LinkedIn, Facebook |
| Story / Reel | 1080 × 1920 px | oben 250 px und unten 340 px frei lassen (Bedienelemente) |
| LinkedIn-Link | 1200 × 627 px | |
| Link-Vorschau (Open Graph) | 1200 × 630 px | Logo, Claim, Screenshot |
| YouTube-Vorschaubild | 1280 × 720 px | |

**Layoutregeln für Social Media:**
- Seitenrand mindestens 72 px bei 1080 px Breite; Inhalte auf einem 12-Spalten-Raster.
- Eine Botschaft pro Motiv; Headline höchstens acht Wörter.
- Logo unten links oder oben links mit Schutzzone; auf Indigo das negative Logo.
- Hintergrund Papier, Weiß oder Indigo – keine Fotos hinter Text ohne ruhige Fläche.
- Bildelement: App-Screenshot, Formel oder Ergebnisring.

### Motivtypen

1. **Feature:** Papier-Hintergrund, Label (z. B. „LERNPLAN“), Headline in Tinte, Screenshot im Geräterahmen,
   Logo unten.
2. **Tipp:** Indigo-Hintergrund, weiße Headline („Wiederhole nach 2, 6 und 13 Tagen.“), kurzer Erklärtext,
   negatives Logo.
3. **Ergebnis:** Weiß, großer Ergebnisring mit Prozentzahl, Satz aus der App („Gut – da geht noch was.“),
   Aufforderung „Fehler wiederholen“.

### Website und Landingpage

1. Kopfbereich: Hauptclaim, ein Satz Erklärung, Schaltfläche „Jetzt ausprobieren“, Screenshot.
2. So funktioniert's in drei Schritten: Fach anlegen → Material hochladen → Test erstellen.
3. Die beiden Testarten nebeneinander.
4. Lernplan.
5. Datenschutz („Deine Daten bleiben bei dir“).
6. Häufige Fragen – vor allem zu Kosten und den beiden Varianten, ehrlich nach Abschnitt 2.

### Präsentationen

16 : 9; Titelfolie auf Indigo mit negativem Logo; Inhaltsfolien auf Weiß oder Papier, Headline H1 in Tinte, Logo
klein unten rechts; höchstens eine Kernaussage pro Folie.

### Druck

| Produkt | Format | Hinweise |
| --- | --- | --- |
| Flyer | A6 (105 × 148 mm) oder A5 | Vorderseite Indigo mit Claim, Rückseite drei Schritte und Link |
| Plakat | A3 / A2 | Display-Headline, ein Screenshot, Link bzw. QR-Code |
| Sticker | rund 50 mm oder Bildmarke 40 × 40 mm | Bildmarke allein oder mit Kurzclaim |

3 mm Beschnitt, Texte mindestens 5 mm vom Rand, Schrift mindestens 9 pt.

---

## 13. Barrierefreiheit

- **Kontrast:** Text mindestens 4,5 : 1 (WCAG AA), große Schrift (ab 24 px bzw. 18,7 px fett) mindestens 3 : 1.
  Statusfarben (Grün, Orange) in kleiner Schrift nur als Textvariante (Abschnitt 6).
- **Nie nur Farbe:** Status immer zusätzlich mit Symbol und Wort (✓ Richtig, ½ Teilweise, ✗ Falsch).
- **Schriftgröße:** digital mindestens 14 px, Druck mindestens 9 pt.
- **Bilder:** aussagekräftige Alternativtexte; Text in Bildern zusätzlich im Beitragstext.
- **Videos:** Untertitel; keine schnell blinkenden Effekte.
- **Bewegung:** Animationen sparsam; Inhalte auch ohne Animation verständlich.

> **Hinweis für die App:** Die Bewertungslabels in Grün und Orange erreichen in der App derzeit nur 3,4–3,8 : 1.
> Empfehlung: die Textvarianten `#047857` und `#B45309` aus dieser CI in der App übernehmen.

---

## 14. Rechtliche Hinweise

- **Claude und Anthropic** sind Marken der Anthropic PBC. Nur beschreibend nennen („nutzt Claude von
  Anthropic“), keine Logos verwenden, keine Partnerschaft oder Empfehlung andeuten.
- **Schrift:** Plus Jakarta Sans steht unter der SIL Open Font License 1.1 – frei nutzbar, auch kommerziell; die
  Schriftdateien dürfen nicht für sich allein verkauft werden.
- **Icons:** Lucide steht unter der ISC-Lizenz.
- **Name:** vor einer Markenanmeldung oder großen Kampagne Markenrecherche durchführen (siehe Abschnitt 1).
- **Material Dritter:** Skripte, Folien und Altklausuren von Hochschulen, Schulen oder Verlagen sind meist
  urheberrechtlich geschützt. In Werbung und Screenshots nur eigenes oder ausdrücklich freigegebenes Material
  zeigen.
- **Personenbezogene Daten:** keine echten Namen, E-Mail-Adressen oder Ergebnisse realer Personen ohne
  Einwilligung.
- **Werbeaussagen** müssen wahr und belegbar sein (Abschnitt 2).

---

## 15. Design-Tokens (maschinenlesbar)

### JSON

```json
{
  "brand": {
    "name": "Lern-App",
    "claim": "Lerne mit Tests aus deinem eigenen Material.",
    "shortClaim": "Dein Material. Deine Tests.",
    "language": "de",
    "address": "du"
  },
  "color": {
    "brand": {
      "indigo": "#4F46E5",
      "indigoDark": "#4338CA",
      "indigoLight": "#EEF0FF",
      "indigoPastel": "#C7D2FE",
      "indigoNight": "#818CF8"
    },
    "neutral": {
      "ink": "#1C2033",
      "slate": "#646B82",
      "line": "#E3E6EF",
      "paper": "#F6F7FB",
      "surface2": "#F1F3F9",
      "white": "#FFFFFF"
    },
    "status": {
      "correct": { "base": "#059669", "text": "#047857", "surface": "#E7F8F1", "symbol": "✓" },
      "partial": { "base": "#C2790A", "text": "#B45309", "surface": "#FFF5E1", "symbol": "½" },
      "wrong": { "base": "#DC2626", "text": "#B91C1C", "surface": "#FDECEB", "symbol": "✗" },
      "warning": { "surface": "#FFF8E6", "border": "#F2D38A" }
    },
    "role": {
      "tasks": { "text": "#2563EB", "surface": "#E8F0FE" },
      "solutions": { "text": "#059669", "surface": "#E7F8F1" },
      "tasksWithSolutions": { "text": "#7C3AED", "surface": "#F1E9FE" },
      "reference": { "text": "#646B82", "surface": "#F1F3F9" }
    },
    "category": ["#4F46E5", "#0891B2", "#059669", "#D97706", "#DC2626", "#DB2777", "#7C3AED", "#475569"],
    "dark": {
      "background": "#0F1220",
      "surface": "#181C2E",
      "surface2": "#20253A",
      "line": "#2C3250",
      "text": "#E8EAF4",
      "textMuted": "#9AA1BB",
      "primary": "#818CF8",
      "onPrimary": "#0F1220",
      "primarySoft": "#252A4A",
      "correct": "#34D399",
      "correctSurface": "#12302A",
      "partial": "#FBBF24",
      "partialSurface": "#352A12",
      "wrong": "#F87171",
      "wrongSurface": "#3A1B1D"
    }
  },
  "typography": {
    "marketing": {
      "family": "Plus Jakarta Sans",
      "fallback": "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      "license": "SIL Open Font License 1.1",
      "weights": { "regular": 400, "semibold": 600, "bold": 700, "extrabold": 800 }
    },
    "app": "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    "scale": {
      "display": { "size": 56, "lineHeight": 60, "weight": 800, "letterSpacing": "-0.015em" },
      "h1": { "size": 40, "lineHeight": 48, "weight": 800, "letterSpacing": "-0.01em" },
      "h2": { "size": 28, "lineHeight": 36, "weight": 700, "letterSpacing": "-0.005em" },
      "h3": { "size": 20, "lineHeight": 28, "weight": 700, "letterSpacing": "0" },
      "bodyLarge": { "size": 18, "lineHeight": 28, "weight": 400, "letterSpacing": "0" },
      "body": { "size": 16, "lineHeight": 24, "weight": 400, "letterSpacing": "0" },
      "small": { "size": 13, "lineHeight": 20, "weight": 400, "letterSpacing": "0" },
      "label": { "size": 12, "lineHeight": 16, "weight": 600, "letterSpacing": "0.04em", "transform": "uppercase" }
    }
  },
  "radius": { "card": 14, "control": 9, "pill": 999, "appIcon": "22%" },
  "spacing": [4, 8, 12, 16, 20, 24, 32, 48, 64],
  "shadow": {
    "soft": "0 1px 2px rgba(20,24,50,0.05), 0 4px 16px rgba(20,24,50,0.05)",
    "dialog": "0 20px 60px rgba(0,0,0,0.25)"
  },
  "logo": {
    "clearSpace": "0.25 × Höhe der Bildmarke",
    "minWidthPx": 120,
    "minWidthMm": 30,
    "iconMinPx": 24,
    "iconMinMm": 8,
    "aspectRatio": 4.14,
    "files": {
      "logo": "logo/lern-app-logo.svg",
      "logoNegative": "logo/lern-app-logo-negativ.svg",
      "logoMono": "logo/lern-app-logo-mono.svg",
      "icon": "logo/lern-app-icon.svg",
      "iconNegative": "logo/lern-app-icon-negativ.svg",
      "iconMono": "logo/lern-app-icon-mono.svg",
      "wordmark": "logo/lern-app-wortmarke.svg"
    }
  },
  "voice": {
    "principles": ["direkt", "konkret", "ermutigend ohne zu beschönigen", "erklären statt entschuldigen"],
    "avoid": ["Superlative", "Erfolgsgarantien", "mehr als ein Emoji pro Botschaft", "Versalien zur Betonung"],
    "ctas": ["Test erstellen", "Lernplan erstellen", "Los geht's", "Fehler wiederholen", "Jetzt ausprobieren"]
  }
}
```

### CSS-Variablen

```css
:root {
  --la-indigo: #4f46e5;
  --la-indigo-dark: #4338ca;
  --la-indigo-light: #eef0ff;
  --la-indigo-pastel: #c7d2fe;
  --la-ink: #1c2033;
  --la-slate: #646b82;
  --la-line: #e3e6ef;
  --la-paper: #f6f7fb;
  --la-surface-2: #f1f3f9;
  --la-white: #ffffff;
  --la-correct: #059669;
  --la-correct-text: #047857;
  --la-correct-surface: #e7f8f1;
  --la-partial: #c2790a;
  --la-partial-text: #b45309;
  --la-partial-surface: #fff5e1;
  --la-wrong: #dc2626;
  --la-wrong-text: #b91c1c;
  --la-wrong-surface: #fdeceb;
  --la-font-marketing: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --la-font-app: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --la-radius-card: 14px;
  --la-radius-control: 9px;
  --la-shadow-soft: 0 1px 2px rgba(20, 24, 50, 0.05), 0 4px 16px rgba(20, 24, 50, 0.05);
}
```

---

## 16. Checkliste vor der Veröffentlichung

- [ ] Aussage stimmt mit den Produktfakten überein (Abschnitt 2), keine Garantie- oder Kostenversprechen.
- [ ] Anrede „du“, deutsche Anführungszeichen, Begriffe wie im Glossar.
- [ ] Logo in der richtigen Variante, mit Schutzzone und über der Mindestgröße.
- [ ] Nur Farben aus Abschnitt 6; Indigo als einzige Akzentfarbe, höchstens eine Fachfarbe zusätzlich.
- [ ] Text-Kontrast mindestens 4,5 : 1; Status nicht nur über Farbe.
- [ ] Schrift Plus Jakarta Sans (bzw. Systemschrift in Screenshots), Größen aus der Skala.
- [ ] Screenshots im hellen Design, mit realistischen Inhalten, ohne personenbezogene Daten und ohne fremdes
      Material.
- [ ] Claude/Anthropic nur beschreibend genannt, keine fremden Logos.
- [ ] Eine Botschaft pro Motiv, Headline höchstens acht Wörter, klare Handlungsaufforderung.

---

## 17. Dateien und Änderungen

### Dateien im Ordner `brand/`

| Datei | Inhalt |
| --- | --- |
| `corporate-identity.md` | diese Referenz (Markdown) |
| `corporate-identity.pdf` | gestaltete Fassung zum Ansehen und Weitergeben |
| `logo/*.svg` | Logo, Bildmarke und Wortmarke als Vektoren (Wortmarke in Pfaden) |
| `logo/*.png` | Logo und Bildmarke als PNG mit transparentem Hintergrund |

### Änderungen

| Version | Datum | Änderung |
| --- | --- | --- |
| 1.0 | 8. November 2026 | Erste Fassung, abgeleitet aus der Lern-App; Marketing-Schrift, Textvarianten der Statusfarben, Wortmarke, Bildsprache und Formate neu festgelegt. |
