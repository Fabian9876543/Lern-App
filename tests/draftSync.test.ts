import { describe, expect, it } from "vitest";
import { mergeResponse, sameResponse } from "../src/lib/draftSync";

describe("Antwortentwurf zwischen Geräten abgleichen", () => {
  it("übernimmt, was nur auf dem anderen Gerät geändert wurde", () => {
    // Mac hat nichts eingegeben, iPad lädt ein Foto hoch
    expect(mergeResponse({}, {}, { image: "/_blob/1" })).toEqual({ image: "/_blob/1" });
  });

  it("behält eigene Eingaben und nimmt fremde Felder dazu", () => {
    // Mac tippt gerade Text (noch nicht gespeichert), iPad lädt Foto hoch
    expect(mergeResponse({}, { text: "Rechenweg" }, { image: "/_blob/1" })).toEqual({ text: "Rechenweg", image: "/_blob/1" });
  });

  it("bei gleichzeitiger Änderung desselben Feldes gewinnt die eigene Eingabe", () => {
    expect(mergeResponse({ text: "a" }, { text: "ab" }, { text: "ax" })).toEqual({ text: "ab" });
  });

  it("auf dem anderen Gerät entfernt → auch hier weg", () => {
    expect(mergeResponse({ text: "t", image: "/_blob/1" }, { text: "t", image: "/_blob/1" }, { text: "t" })).toEqual({ text: "t" });
  });

  it("Auswahl bei Multiple Choice", () => {
    expect(mergeResponse({ selected: [0] }, { selected: [0] }, { selected: [0, 2] })).toEqual({ selected: [0, 2] });
  });

  it("vergleicht nur Antwortfelder", () => {
    expect(sameResponse({ text: "a" }, { text: "a" })).toBe(true);
    expect(sameResponse({}, { text: undefined })).toBe(true);
    expect(sameResponse({ selected: [1] }, { selected: [2] })).toBe(false);
  });
});
