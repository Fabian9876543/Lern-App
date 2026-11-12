import platform from "@platform-impl";
import { useEffect, useState } from "react";
import { confirmDialog } from "../components/Dialogs";
import { exportBackup, importBackup } from "../lib/backup";
import { formatBytes } from "../lib/files";
import { IS_ARTIFACT } from "../platform";
import { saveSettings, useSettings } from "../settings";
import { repo, useStore } from "../store/store";

export default function SettingsPage() {
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { storageMode } = useStore();
  const settings = useSettings();

  useEffect(() => {
    if (storageMode !== "local") return;
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(`${formatBytes(e.usage ?? 0)} von ca. ${formatBytes(e.quota ?? 0)} belegt`))
      .catch(() => {});
  }, [storageMode]);

  async function doExport() {
    setBusy(true);
    try {
      const blob = await exportBackup();
      await platform.saveFile(blob, `lern-app-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function doImport(file: File) {
    setBusy(true);
    try {
      const result = await importBackup(file);
      setStatus({ kind: "ok", text: `Backup importiert: ${result.subjects} Fächer, ${result.tests} Tests.` });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    const ok = await confirmDialog(
      "Alle Fächer, Materialien, Tests und Ergebnisse werden gelöscht. Das kann nicht rückgängig gemacht werden.",
      { title: "Alle Daten löschen?", confirmLabel: "Alles löschen", danger: true },
    );
    if (!ok) return;
    repo.clearAll();
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

      <platform.AiSettingsSection />

      <section className="card stack-sm">
        <h2>Material</h2>
        <label className="check">
          <input
            id="auto-name-materials"
            type="checkbox"
            checked={settings.autoNameMaterials}
            onChange={(e) => saveSettings({ autoNameMaterials: e.target.checked })}
          />
          Unklare Dateinamen automatisch benennen
        </label>
        <p className="muted small">
          Heißt eine Datei zum Beispiel „IMG_2041.jpg“ oder „Scan 3.pdf“, liest Claude den Anfang und gibt ihr einen
          passenden Namen wie „Übungsblatt 3 – Integralrechnung“ – samt passender Rolle. Das ist ein kurzer, sparsamer
          Aufruf pro Datei. Ist Claude nicht verfügbar, nimmt die App die erste Textzeile oder das Datum.
        </p>
      </section>

      <section className="card stack-sm">
        <h2>Daten</h2>
        {status && (
          <div
            className={`callout ${status.kind === "ok" ? "callout-ok" : status.kind === "error" ? "callout-error" : ""}`}
          >
            {status.text}
          </div>
        )}
        <p className="muted small">
          {storageMode === "cloud"
            ? "Deine Fächer, Materialien, Tests und Ergebnisse werden in deinem privaten Bereich dieses Artifacts gespeichert und sind auf allen Geräten verfügbar, auf denen du claude.ai nutzt. Andere Personen sehen sie nicht."
            : storageMode === "memory"
              ? "Dieser Browser lässt die Lern-App nichts speichern – nach dem Neuladen ist alles weg. Lade vorher ein Backup herunter."
              : `${IS_ARTIFACT ? "Gastmodus: " : ""}Alle Fächer, Materialien, Tests und Ergebnisse liegen nur in diesem Browser${usage ? ` (${usage})` : ""}. Erstelle ab und zu ein Backup – z. B. bevor du Browserdaten löschst oder das Gerät wechselst.`}{" "}
          Ein Backup kannst du auch in die jeweils andere Version der Lern-App (Web bzw. claude.ai) importieren.
        </p>
        <div className="row-wrap">
          <button className="btn btn-ghost" onClick={doExport} disabled={busy}>
            ⬇️ Backup herunterladen
          </button>
          <label className={`btn btn-ghost file-btn ${busy ? "disabled" : ""}`}>
            ⬆️ Backup importieren
            <input
              id="backup-import"
              type="file"
              accept="application/json,.json"
              hidden
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) doImport(file);
              }}
            />
          </label>
          <button className="btn btn-ghost btn-danger" onClick={wipe} disabled={busy}>
            Alle Daten löschen
          </button>
        </div>
      </section>
    </div>
  );
}
