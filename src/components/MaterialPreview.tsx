import { useEffect, useRef, useState } from "react";
import { closePdf, openPdf, renderPage } from "../lib/pdf";
import { repo } from "../store/store";
import type { Material } from "../types";
import Modal from "./Modal";

const MAX_PDF_PAGES = 15;

/** Zeigt ein Material direkt in der App an (Bild, Text oder PDF-Seiten). */
export default function MaterialPreview({ material, onClose }: { material: Material; onClose: () => void }) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; text: string } | { kind: "text"; text: string } | { kind: "images"; urls: string[]; more: number }
  >({ kind: "loading" });
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (material.kind === "text" && material.text !== undefined) {
          setState({ kind: "text", text: material.text });
          return;
        }
        const blob = await repo.loadMaterialBlob(material);
        if (!blob) throw new Error("Die Datei konnte nicht geladen werden.");
        if (material.kind === "text") {
          setState({ kind: "text", text: await blob.text() });
        } else if (material.kind === "image") {
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          setState({ kind: "images", urls: [url], more: 0 });
        } else {
          const doc = await openPdf(blob);
          const count = Math.min(doc.numPages, MAX_PDF_PAGES);
          const pages: string[] = [];
          for (let p = 1; p <= count && !cancelled; p++) {
            const url = URL.createObjectURL(await renderPage(doc, p, 1200));
            urls.current.push(url);
            pages.push(url);
            setState({ kind: "images", urls: [...pages], more: doc.numPages - count });
          }
          await closePdf(doc);
        }
      } catch (e) {
        if (!cancelled) setState({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, [material]);

  return (
    <Modal title={material.name} onClose={onClose}>
      {state.kind === "loading" && <p className="muted">Wird geladen …</p>}
      {state.kind === "error" && <p className="error-text">{state.text}</p>}
      {state.kind === "text" && <pre className="text-preview">{state.text}</pre>}
      {state.kind === "images" && (
        <div className="stack-sm">
          {state.urls.map((u, i) => (
            <img key={u} className="page-preview" src={u} alt={`Seite ${i + 1}`} />
          ))}
          {state.more > 0 && <p className="muted small">… und {state.more} weitere Seiten</p>}
        </div>
      )}
    </Modal>
  );
}
