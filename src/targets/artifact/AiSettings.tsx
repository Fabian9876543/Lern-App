import { TIERS, saveSettings, useSettings, type ModelTier } from "../../settings";
import { useAiStatus } from "./ai";

/** Einstellungen der claude.ai-Version: Modellstufen. */
export default function AiSettings() {
  const settings = useSettings();
  const status = useAiStatus();

  return (
    <section className="card stack-sm">
      <h2>Claude</h2>
      <p className="muted small">
        Diese Version läuft in claude.ai und nutzt dein eigenes Claude-Konto. Testerstellung und Bewertung zählen
        gegen die Nutzungslimits deines Abos – es fallen keine API-Kosten an. Beim ersten Mal fragt claude.ai, ob die
        Lern-App Claude nutzen darf.
      </p>
      {status.state === "unavailable" && <div className="callout callout-warn">{status.reason}</div>}
      <div className="form-grid">
        <label className="field">
          <span>Tests erstellen</span>
          <select
            id="generation-tier"
            className="select"
            value={settings.generationTier}
            onChange={(e) => saveSettings({ generationTier: e.target.value as ModelTier })}
          >
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} – {t.hint}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Antworten bewerten</span>
          <select
            id="grading-tier"
            className="select"
            value={settings.gradingTier}
            onChange={(e) => saveSettings({ gradingTier: e.target.value as ModelTier })}
          >
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} – {t.hint}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        „Am stärksten“ liefert die besten Tests, verbraucht aber mehr von deinem Nutzungslimit. Steht eine Stufe in
        deinem Abo nicht zur Verfügung, nimmt claude.ai automatisch die nächstpassende.
        Auswahlfragen, Zahlen und exakte Kurzantworten wertet die App ohne Claude aus.
      </p>
    </section>
  );
}
