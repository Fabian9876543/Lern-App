import { useEffect, useRef, useState } from "react";
import { isMarkdownMaterial, isSpreadsheet } from "../lib/files";
import { closePdf, openPdf, renderPage } from "../lib/pdf";
import { navigate } from "../router";
import { repo } from "../store/store";
import type { Material } from "../types";
import Markdown from "./Markdown";
import Modal from "./Modal";

/** So viele PDF-Seiten werden auf einmal angezeigt; weitere auf Knopfdruck. */
const PDF_PAGE_STEP = 15;

type State =
  | { kind: "loading" }
  | { kind: "error"; text: string }
  | { kind: "text"; text: string }
  | { kind: "images"; urls: string[]; total: number; loading: boolean };

/** Zeigt ein Material direkt in der App an (Bild, Text oder PDF-Seiten) – auf Wunsch den abgeschriebenen Text. */
export default function MaterialPreview({ material, onClose }: { material: Material; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pageLimit, setPageLimit] = useState(PDF_PAGE_STEP);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const urls = useRef<string[]>([]);
  const hasTranscript = material.transcript !== undefined || !!material.transcriptAssetId;

  // Text und Bilder
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
          setState({ kind: "images", urls: [url], total: 1, loading: false });
        } else {
          // PDF: nur die noch fehlenden Seiten bis zum aktuellen Limit rendern
          const doc = await openPdf(blob);
          const already = urls.current.length;
          const until = Math.min(doc.numPages, pageLimit);
          setState({ kind: "images", urls: [...urls.current], total: doc.numPages, loading: until > already });
          for (let p = already + 1; p <= until && !cancelled; p++) {
            const url = URL.createObjectURL(await renderPage(doc, p, 1200));
            urls.current.push(url);
            setState({ kind: "images", urls: [...urls.current], total: doc.numPages, loading: p < until });
          }
          await closePdf(doc);
        }
      } catch (e) {
        if (!cancelled) setState({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [material, pageLimit]);

  // Bild-URLs erst beim Schließen freigeben
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    },
    [material],
  );

  // Abgeschriebener Text
  useEffect(() => {
    if (!showTranscript || transcript !== null) return;
    let cancelled = false;
    repo
      .loadTranscript(material)
      .then((t) => !cancelled && setTranscript(t ?? ""))
      .catch(() => !cancelled && setTranscript(""));
    return () => {
      cancelled = true;
    };
  }, [showTranscript, transcript, material]);

  const footer = (
    <>
      {hasTranscript && (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowTranscript((s) => !s)}>
          {showTranscript ? "Original anzeigen" : "Abgeschriebenen Text anzeigen"}
        </button>
      )}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          onClose();
          navigate(`/subject/${material.subjectId}/new-note?materials=${material.id}`);
        }}
      >
        Lernzettel daraus erstellen
      </button>
    </>
  );

  return (
    <Modal title={material.name} onClose={onClose} footer={footer}>
      {showTranscript ? (
        <div className="stack-sm">
          <p className="muted small">
            So hat Claude die Fotos bzw. eingescannten Seiten abgeschrieben. Dieser Text wird statt der Bilder verwendet.
          </p>
          {transcript === null ? (
            <p className="muted">Wird geladen …</p>
          ) : (
            <div className="sheet-preview">
              <Markdown>{transcript || "(leer)"}</Markdown>
            </div>
          )}
        </div>
      ) : (
        <>
          {state.kind === "loading" && <p className="muted">Wird geladen …</p>}
          {state.kind === "error" && <p className="error-text">{state.text}</p>}
          {state.kind === "text" &&
            (isMarkdownMaterial(material) ? (
              <div className={`sheet-preview ${isSpreadsheet(material) ? "is-sheet" : ""}`}>
                <Markdown>{state.text}</Markdown>
              </div>
            ) : (
              <pre className="text-preview">{state.text}</pre>
            ))}
          {state.kind === "images" && (
            <div className="stack-sm">
              {state.urls.map((u, i) => (
                <img key={u} className="page-preview" src={u} alt={`Seite ${i + 1}`} />
              ))}
              {state.loading && <p className="muted small">Seiten werden geladen …</p>}
              {!state.loading && state.urls.length < state.total && (
                <button className="btn btn-ghost" onClick={() => setPageLimit((l) => l + PDF_PAGE_STEP)}>
                  Weitere Seiten anzeigen ({state.urls.length} von {state.total})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
