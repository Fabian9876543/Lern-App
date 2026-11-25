import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles.css";
import App from "./App";
import { preloadPdf } from "./lib/pdf";
import { startStore } from "./store/store";

// In claude.ai fehlt die Sprachangabe der Seite – wichtig für Silbentrennung und Vorlesen.
if (!document.documentElement.lang) document.documentElement.lang = "de";

startStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PDF-Leser kurz nach dem Start im Hintergrund vorladen: So lassen sich PDFs auch
// dann noch lesen, wenn die Verbindung später kurz weg ist oder die App lange offen bleibt.
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
if (!saveData) {
  setTimeout(() => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => void preloadPdf(), { timeout: 5000 });
    else void preloadPdf();
  }, 2500);
}
