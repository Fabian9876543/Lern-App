import type { PDFDocumentProxy } from "pdfjs-dist";

/** PDF-Verarbeitung im Browser (pdf.js), wird erst bei Bedarf geladen. */

let libPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadLib() {
  libPromise ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return libPromise;
}

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const lib = await loadLib();
  const data = new Uint8Array(await blob.arrayBuffer());
  return lib.getDocument({ data }).promise;
}

/** Gibt den Speicher eines geöffneten Dokuments frei. */
export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    // nicht kritisch
  }
}

export async function pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  page.cleanup();
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Rendert eine Seite als JPEG mit höchstens `maxEdge` Pixeln an der langen Kante. */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, maxEdge = 1600): Promise<Blob> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = maxEdge / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Seite konnte nicht gerendert werden"))), "image/jpeg", 0.85),
  );
}
