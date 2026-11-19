import { describe, expect, it } from "vitest";
import { guessRole } from "../src/lib/files";
import {
  collectEntries,
  existingFolderPaths,
  folderOf,
  groupByFolder,
  isJunkPath,
  planUpload,
  shortReason,
  unsupportedReason,
  type EntryLike,
  type PickedFile,
} from "../src/lib/folders";
import type { Material } from "../src/types";

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("Ordner", () => {
  it("liest den Ordner aus dem relativen Pfad", () => {
    expect(folderOf("Analysis 1/Übungen/Blatt 1.pdf")).toBe("Analysis 1/Übungen");
    expect(folderOf("/Analysis 1/Skript.pdf")).toBe("Analysis 1");
    expect(folderOf("Blatt 1.pdf")).toBeUndefined();
  });

  it("erkennt System- und versteckte Dateien", () => {
    for (const p of ["Analysis/.DS_Store", "Analysis/~$Noten.xlsx", "Analysis/Thumbs.db", "__MACOSX/a.pdf", "A/.git/config", "A/desktop.ini"]) {
      expect(isJunkPath(p), p).toBe(true);
    }
    expect(isJunkPath("Analysis 1/Übungen/Blatt 1.pdf")).toBe(false);
  });

  it("sortiert lesbare Dateien und nennt übersprungene mit Tipp", () => {
    const items: PickedFile[] = [
      { file: file("Blatt 10.pdf", "application/pdf"), folder: "Ana/Übungen" },
      { file: file("Blatt 2.pdf", "application/pdf"), folder: "Ana/Übungen" },
      { file: file("Noten.xlsx"), folder: "Ana" },
      { file: file("Vorlesung.pptx"), folder: "Ana" },
      { file: file("Notizen.odt"), folder: "Ana" },
      { file: file("Protokoll.docx"), folder: "Ana" },
      { file: file(".DS_Store"), folder: "Ana" },
      { file: file("Foto.heic"), folder: "Ana/Fotos" },
    ];
    const plan = planUpload(items);
    expect(plan.accepted.map((i) => `${i.folder}/${i.file.name}`)).toEqual([
      "Ana/Noten.xlsx",
      "Ana/Protokoll.docx",
      "Ana/Fotos/Foto.heic",
      "Ana/Übungen/Blatt 2.pdf",
      "Ana/Übungen/Blatt 10.pdf",
    ]);
    expect(plan.junk).toEqual(["Ana/.DS_Store"]);
    expect(plan.unsupported.map((u) => [u.name, unsupportedReason(u.hint)])).toEqual([
      ["Ana/Vorlesung.pptx", "Format nicht lesbar – Präsentationen bitte als PDF exportieren"],
      ["Ana/Notizen.odt", "Format nicht lesbar – Dokumente bitte als PDF exportieren"],
    ]);
  });

  it("überspringt beim erneuten Hochladen, was aus dem Ordner schon da ist", () => {
    const existing = existingFolderPaths([
      { id: "1", folder: "Ana/Übungen", name: "Lösungen zu Blatt 1", originalName: "Scan 3.pdf", fileName: "Scan 3.pdf" },
      { id: "2", folder: "Ana/Übungen", name: "Blatt 2 (umbenannt)", fileName: "Blatt 2.pdf" },
      { id: "3", folder: "Ana", name: "Alt ohne Dateinamen.pdf" },
      { id: "4", name: "Einzeln.pdf" },
    ] as Material[]);
    const plan = planUpload(
      [
        { file: file("Scan 3.pdf", "application/pdf"), folder: "Ana/Übungen" },
        { file: file("Blatt 2.pdf", "application/pdf"), folder: "Ana/Übungen" },
        { file: file("Blatt 3.pdf", "application/pdf"), folder: "Ana/Übungen" },
        { file: file("Alt ohne Dateinamen.pdf", "application/pdf"), folder: "Ana" },
        // Einzelne Dateien werden nie als doppelt übersprungen
        { file: file("Einzeln.pdf", "application/pdf") },
      ],
      existing,
    );
    expect(plan.duplicates).toEqual(["Ana/Übungen/Scan 3.pdf", "Ana/Übungen/Blatt 2.pdf", "Ana/Alt ohne Dateinamen.pdf"]);
    expect(plan.accepted.map((i) => i.file.name)).toEqual(["Einzeln.pdf", "Blatt 3.pdf"]);
  });

  it("kürzt Fehlermeldungen um den Dateinamen", () => {
    expect(shortReason("„Nur online.pdf“ konnte nicht gelesen werden. Liegt die Datei nur in der Cloud?", "Nur online.pdf")).toBe(
      "Konnte nicht gelesen werden. Liegt die Datei nur in der Cloud?",
    );
    expect(shortReason("Die Datei ist zu groß (max. 20 MB).", "Folien.pdf")).toBe("Die Datei ist zu groß (max. 20 MB).");
  });

  it("sammelt gezogene Ordner samt Unterordnern ein", async () => {
    const f = (path: string): EntryLike => ({
      isFile: true,
      isDirectory: false,
      name: path.split("/").pop()!,
      fullPath: path,
      file: (ok) => ok(file(path.split("/").pop()!)),
    });
    const dir = (path: string, entries: EntryLike[]): EntryLike => ({
      isFile: false,
      isDirectory: true,
      name: path.split("/").pop()!,
      fullPath: path,
      // Wie im Browser: Einträge kommen in Portionen, zuletzt eine leere Liste.
      createReader: () => {
        const batches = [entries.slice(0, 1), entries.slice(1), []];
        return { readEntries: (ok) => ok(batches.shift() ?? []) };
      },
    });
    const tree = dir("/Ana", [
      f("/Ana/Skript.pdf"),
      dir("/Ana/Übungen", [f("/Ana/Übungen/Blatt 1.pdf"), f("/Ana/Übungen/Blatt 2.pdf")]),
      dir("/Ana/.git", [f("/Ana/.git/HEAD")]),
      f("/Ana/.DS_Store"),
    ]);
    const picked = await collectEntries([tree, f("/Einzeln.pdf")]);
    // Systemdateien kommen mit (der Bericht zählt sie), versteckte Ordner wie .git nicht
    expect(picked.map((p) => [p.folder, p.file.name])).toEqual([
      ["Ana", "Skript.pdf"],
      ["Ana/Übungen", "Blatt 1.pdf"],
      ["Ana/Übungen", "Blatt 2.pdf"],
      ["Ana", ".DS_Store"],
      [undefined, "Einzeln.pdf"],
    ]);
  });

  it("gruppiert Material: erst einzelne Dateien, dann Ordner in natürlicher Reihenfolge", () => {
    const m = (id: string, folder?: string) => ({ id, folder }) as Material;
    const groups = groupByFolder([m("a", "Ana/Woche 10"), m("b"), m("c", "Ana/Woche 2"), m("d", "Ana/Woche 2")]);
    expect(groups.map((g) => [g.folder, g.items.map((i) => i.id)])).toEqual([
      [null, ["b"]],
      ["Ana/Woche 2", ["c", "d"]],
      ["Ana/Woche 10", ["a"]],
    ]);
  });

  it("schlägt die Rolle über den Ordner vor, wenn der Dateiname nichts verrät", () => {
    expect(guessRole("Scan 3.pdf", "Analysis 1/Lösungen")).toBe("solutions");
    expect(guessRole("IMG_2041.jpg", "Analysis 1/Übungsblätter")).toBe("tasks");
    expect(guessRole("Kapitel 1.pdf", "Mathe Übungen/Skript")).toBe("reference");
    expect(guessRole("Lösungen Blatt 3.pdf", "Analysis 1/Übungen")).toBe("solutions");
    expect(guessRole("Scan 3.pdf", "Analysis 1/Altklausuren")).toBe("tasks");
    expect(guessRole("Scan 3.pdf")).toBe("reference");
  });
});
