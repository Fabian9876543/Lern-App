import { useEffect, useState } from "react";
import { describeError, getClient } from "../ai/client";
import { db } from "../db";
import { downloadBlob, exportBackup, importBackup } from "../lib/backup";
import { formatBytes } from "../lib/files";
import { MODELS, saveSettings, useSettings } from "../settings";

export default function SettingsPage() {
  const settings = useSettings();
  const [keyInput, setKeyInput] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(`${formatBytes(e.usage ?? 0)} von ca. ${formatBytes(e.quota ?? 0)} belegt`))
      .catch(() => {});
  }, []);

  function saveKey() {
    saveSettings({ apiKey: keyInput.trim() });
    setStatus({ kind: "ok", text: "API-Schlüssel gespeichert." });
  }

  async function testConnection() {
    saveSettings({ apiKey: keyInput.trim() });
    setTesting(true);
    setStatus(null);
    try {
      const model = await getClient().models.retrieve(settings.generationModel);
      setStatus({ kind: "ok", text: `Verbindung klappt ✓ (${model.display_name} verfügbar)` });
    } catch (e) {
      setStatus({ kind: "error", text: describeError(e) });
    } finally {
      setTesting(false);
    }
  }

  async function doExport() {
    const blob = await exportBackup();
    downloadBlob(blob, `lern-app-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function doImport(file: File) {
    try {
      const result = await importBackup(file);
      setStatus({ kind: "ok", text: `Backup importiert: ${result.subjects} Fächer, ${result.tests} Tests.` });
    } catch (e) {
      setStatus({ kind: "error", text: describeError(e) });
    }
  }

  async function wipe() {
    if (!confirm("Wirklich ALLE Fächer, Materialien, Tests und Ergebnisse löschen? Das kann nicht rückgängig gemacht werden."))
      return;
    await Promise.all([db.subjects.clear(), db.materials.clear(), db.tests.clear(), db.attempts.clear()]);
    setStatus({ kind: "info", text: "Alle Daten wurden gelöscht." });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href="#/" className="back-link">
          ← Übersicht
        </a>
        <h1>Einstellungen</h1>
      </div>

      {status && <div className={`callout callout-${status.kind === "ok" ? "ok" : status.kind === "error" ? "error" : ""}`}>{status.text}</div>}

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
        <div className="row-wrap">
          <input
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
          <button className="btn btn-primary" onClick={saveKey}>
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

      <section className="card stack-sm">
        <h2>Daten</h2>
        <p className="muted small">
          Alle Fächer, Materialien, Tests und Ergebnisse liegen lokal in diesem Browser{usage ? ` (${usage})` : ""}.
          Erstelle ab und zu ein Backup – z. B. bevor du Browserdaten löschst oder das Gerät wechselst.
        </p>
        <div className="row-wrap">
          <button className="btn btn-ghost" onClick={doExport}>
            ⬇️ Backup herunterladen
          </button>
          <label className="btn btn-ghost file-btn">
            ⬆️ Backup importieren
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) doImport(file);
              }}
            />
          </label>
          <button className="btn btn-ghost btn-danger" onClick={wipe}>
            Alle Daten löschen
          </button>
        </div>
      </section>
    </div>
  );
}
