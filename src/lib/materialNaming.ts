import platform from "@platform-impl";
import { useSyncExternalStore } from "react";
import { getSettings } from "../settings";
import { repo } from "../store/store";
import type { Material } from "../types";
import { cleanSuggestedName, fallbackName, isMeaninglessName } from "./materialNames";
import { closePdf, openPdf, pageText, renderPage } from "./pdf";

/**
 * Benennt Material mit nichtssagendem Dateinamen (z. B. „IMG_2041.jpg“) nach dem
 * Hochladen: Claude liest den Anfang des Inhalts und schlägt Name und Rolle vor.
 * Ohne Claude gibt es einen einfachen Ersatznamen aus dem Text bzw. dem Datum.
 */

const naming = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function changed() {
  snapshot = new Set(naming);
  listeners.forEach((l) => l());
}

/** IDs der Materialien, die gerade benannt werden. */
export function useNamingIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

const TEXT_LIMIT = 4000;

/** Textauszug bzw. Bild der ersten Seite – genug, um das Material zu erkennen. */
async function namingInput(m: Material, content: { blob?: Blob; text?: string }): Promise<{ text?: string; image?: Blob }> {
  if (m.kind === "text") return { text: (content.text ?? "").slice(0, TEXT_LIMIT) };
  if (!content.blob) return {};
  if (m.kind === "image") return { image: content.blob };
  try {
    const doc = await openPdf(content.blob);
    let text = "";
    for (let p = 1; p <= Math.min(2, doc.numPages) && text.length < TEXT_LIMIT; p++) text += (await pageText(doc, p)) + "\n\n";
    const result = text.replace(/\s/g, "").length >= 40 ? { text: text.slice(0, TEXT_LIMIT) } : { image: await renderPage(doc, 1, 1400) };
    await closePdf(doc);
    return result;
  } catch {
    return {};
  }
}

/** Startet das Benennen im Hintergrund, wenn der Name nichtssagend ist. */
export function autoNameMaterial(material: Material, content: { blob?: Blob; text?: string }): void {
  if (!getSettings().autoNameMaterials || !isMeaninglessName(material.name)) return;
  naming.add(material.id);
  changed();
  void (async () => {
    try {
      const input = await namingInput(material, content);
      let suggestion: { name: string; role: Material["role"] | null } | null = null;
      if (input.text?.trim() || input.image) {
        try {
          const s = await platform.suggestMaterialName({ fileName: material.name, ...input });
          const name = cleanSuggestedName(s.name);
          if (name) suggestion = { name, role: s.role };
        } catch {
          // Claude nicht verfügbar oder Antwort unbrauchbar – Ersatzname unten.
        }
      }
      const current = repo.getMaterial(material.id);
      // Nur übernehmen, wenn niemand den Namen inzwischen selbst geändert hat.
      if (!current || current.name !== material.name) return;
      repo.updateMaterial(material.id, {
        name: suggestion?.name ?? fallbackName(material.kind, input.text, material.createdAt),
        originalName: material.name,
        ...(suggestion?.role && current.role === material.role ? { role: suggestion.role } : {}),
      });
    } finally {
      naming.delete(material.id);
      changed();
    }
  })();
}
