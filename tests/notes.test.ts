import { describe, expect, it } from "vitest";
import { numberedItems, splitNotes } from "../src/lib/notes";

const REAL =
  "1) Arbeitsblatt Verjährung (Material 2): Die Seite enthält die Antworten direkt in der Tabelle. Hinweis: Nach aktueller Rechtslage (seit 2010) verjähren die meisten Ansprüche in 3 Jahren. 2) Übungsaufgabe 142: Die Aufgabe nennt 157,27 EUR, die Lösung rechnet aber mit 157,66 EUR. 3) Übung 02, Aufgabe 5 aa/ab: Die Erzeugnisstruktur (Grafik) fehlt im Material. 4) Übung 03, Aufgabe 2.3.2: Der Kontext (Aufgaben 2.1–2.3.1) fehlt. Skonto 1,5 %. 5) Übung 05, Aufgabe 2 (Bestellverfahren): Die grafische Darstellung fehlt. 6) Zu Übung 02 (b) gibt es keine Lösungen im Material.";

describe("Hinweise von Claude", () => {
  it("nummerierte Hinweise werden zur Liste", () => {
    const items = numberedItems(REAL);
    expect(items).toHaveLength(6);
    expect(items[0]).toBe(
      "Arbeitsblatt Verjährung (Material 2): Die Seite enthält die Antworten direkt in der Tabelle. Hinweis: Nach aktueller Rechtslage (seit 2010) verjähren die meisten Ansprüche in 3 Jahren.",
    );
    expect(items[3]).toBe("Übung 03, Aufgabe 2.3.2: Der Kontext (Aufgaben 2.1–2.3.1) fehlt. Skonto 1,5 %.");
    expect(items[5]).toBe("Zu Übung 02 (b) gibt es keine Lösungen im Material.");
  });

  it("Zahlen außer der Reihe bleiben im Text", () => {
    expect(numberedItems("1) Erstens, siehe Aufgabe 4) unten. 2) Zweitens.")).toEqual(["Erstens, siehe Aufgabe 4) unten.", "Zweitens."]);
    expect(numberedItems("1. Eins. 2. Zwei.")).toEqual(["Eins.", "Zwei."]);
  });

  it("ohne Nummerierung ein einziger Punkt", () => {
    expect(numberedItems("Zu Aufgabe 3 fehlt die Lösung.")).toEqual(["Zu Aufgabe 3 fehlt die Lösung."]);
    expect(numberedItems("1) Nur ein Punkt.")).toEqual(["1) Nur ein Punkt."]);
    expect(numberedItems("  ")).toEqual([]);
  });

  it("Hinweise der App getrennt", () => {
    expect(splitNotes("Hinweis der App: Auszug verwendet.\n\n1) A 2) B\n\nNoch was")).toEqual({
      app: ["Auszug verwendet."],
      claude: "1) A 2) B Noch was",
    });
  });
});
