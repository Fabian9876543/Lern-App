import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles.css";
import App from "./App";
import { startStore } from "./store/store";

// In claude.ai fehlt die Sprachangabe der Seite – wichtig für Silbentrennung und Vorlesen.
if (!document.documentElement.lang) document.documentElement.lang = "de";

startStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
