import { useState } from "react";
import { MODELS, saveSettings, useSettings } from "../../settings";
import { describeError, getClient } from "./client";

/** Einstellungen der Web-Version: API-Schlüssel und Modelle. */
export default function AiSettings() {
  const settings = useSettings();
  const [keyInput, setKeyInput] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    saveSettings({ apiKey: keyInput.trim() });
    setTesting(true);
    setStatus(null);
    try {
      const model = await getClient().models.retrieve(settings.generationModel);
      setStatus({ ok: true, text: `Verbindung klappt ✓ (${model.display_name} verfügbar)` });
    } catch (e) {
      setStatus({ ok: false, text: describeError(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <section className="card stack-sm">
        <h2>Claude-API-Schlüssel</h2>
        <p className="muted small">
          Die App nutzt Claude, um Tests aus deinem Material zu erstellen und offene Antworten zu bewerten. Einen
          Schlüssel bekommst du in der{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            Anthropic Console
          </a>
          . Die Nutzung wird dort nach Verbrauch abgerechnet.
        </p>
        {status && <div className={`callout ${status.ok ? "callout-ok" : "callout-error"}`}>{status.text}</div>}
        <div className="row-wrap">
          <input
            id="api-key"
            className="input grow"
            type={showKey ? "text" : "password"}
            placeholder="sk-ant-…"
            value={keyInput}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKeyInput(e.target.value)}
            aria-label="API-Schlüssel"
          />
          <button className="btn btn-ghost" onClick={() => setShowKey((s) => !s)}>
            {showKey ? "Verbergen" : "Anzeigen"}
          </button>
        </div>
        <div className="row-wrap">
          <button
            className="btn btn-primary"
            onClick={() => {
              saveSettings({ apiKey: keyInput.trim() });
              setStatus({ ok: true, text: "API-Schlüssel gespeichert." });
            }}
          >
            Speichern
          </button>
          <button className="btn btn-ghost" onClick={testConnection} disabled={!keyInput.trim() || testing}>
            {testing ? "Teste …" : "Verbindung testen"}
          </button>
        </div>
        <p className="muted small">
          🔒 Der Schlüssel wird nur in diesem Browser gespeichert und direkt an api.anthropic.com gesendet – es gibt
          keinen eigenen Server. Nutze die App nur auf deinem eigenen Gerät.
        </p>
      </section>

      <section className="card stack-sm">
        <h2>KI-Modelle</h2>
        <div className="form-grid">
          <label className="field">
            <span>Tests erstellen</span>
            <select
              id="generation-model"
              className="select"
              value={settings.generationModel}
              onChange={(e) => saveSettings({ generationModel: e.target.value })}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} – {m.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Antworten bewerten</span>
            <select
              id="grading-model"
              className="select"
              value={settings.gradingModel}
              onChange={(e) => saveSettings({ gradingModel: e.target.value })}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} – {m.hint}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          Für das Bewerten offener Antworten reicht oft ein günstigeres Modell. Auswahlfragen, Zahlen und exakte
          Kurzantworten werden ohne KI direkt in der App ausgewertet.
        </p>
      </section>
    </>
  );
}
