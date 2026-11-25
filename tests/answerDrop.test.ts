import { describe, expect, it } from "vitest";
import { isAnswerFile } from "../src/lib/files";
import { hasDraggedFiles } from "../src/lib/useWindowFileDrop";

describe("Lösung per Drag & Drop", () => {
  it("nimmt Fotos, Bilder und PDFs an", () => {
    expect(isAnswerFile({ name: "Lösung.png", type: "image/png" })).toBe(true);
    expect(isAnswerFile({ name: "IMG_0412.HEIC", type: "" })).toBe(true);
    expect(isAnswerFile({ name: "Notiz GoodNotes.pdf", type: "application/pdf" })).toBe(true);
    expect(isAnswerFile({ name: "scan.PDF", type: "" })).toBe(true);
  });

  it("lehnt Ordner und andere Dateien ab", () => {
    expect(isAnswerFile({ name: "Lösungen", type: "" })).toBe(false);
    expect(isAnswerFile({ name: "Aufgabe.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe(false);
    expect(isAnswerFile({ name: "notizen.txt", type: "text/plain" })).toBe(false);
  });

  it("reagiert nur auf gezogene Dateien, nicht auf gezogenen Text", () => {
    const drag = (...types: string[]) => ({ types }) as unknown as DataTransfer;
    expect(hasDraggedFiles(drag("Files"))).toBe(true);
    expect(hasDraggedFiles(drag("text/plain", "text/html"))).toBe(false);
    expect(hasDraggedFiles(null)).toBe(false);
  });
});
