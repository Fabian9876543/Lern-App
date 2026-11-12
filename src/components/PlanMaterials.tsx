import { useState } from "react";
import { addPlanMaterials, removePlanMaterial } from "../lib/plans";
import { useStore } from "../store/store";
import type { Material, StudyPlan } from "../types";
import MaterialPreview from "./MaterialPreview";
import MaterialRow from "./MaterialRow";
import MaterialUpload from "./MaterialUpload";

/**
 * Material eines Lernplans – auch nachträglich ergänzbar. Neue Tests und
 * Lernzettel nutzen es; bereits erstellte bleiben, wie sie sind.
 */
export default function PlanMaterials({ plan }: { plan: StudyPlan }) {
  const store = useStore();
  const subjectMaterials = store.materials.filter((m) => m.subjectId === plan.subjectId);
  const inPlan = subjectMaterials.filter((m) => plan.materialIds.includes(m.id));
  const others = subjectMaterials.filter((m) => !plan.materialIds.includes(m.id));
  const [adding, setAdding] = useState(inPlan.length === 0);
  const [added, setAdded] = useState(0);
  const [preview, setPreview] = useState<Material | null>(null);
  const notesWithoutMaterial = store.notes.filter((n) => n.planId === plan.id && !n.fromMaterial).length;

  function add(ids: string[]) {
    addPlanMaterials(plan.id, ids);
    setAdded((n) => n + ids.length);
  }

  return (
    <section className="card stack-sm" id="plan-material">
      <div className="row-between">
        <h2>Material</h2>
        {inPlan.length > 0 && !adding && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            + Material hinzufügen
          </button>
        )}
      </div>
      <p className="muted small">
        {inPlan.length > 0
          ? "Übungstests, Wiederholungen, Probeklausur und Lernzettel, die ab jetzt entstehen, stützen sich auf dieses Material."
          : "Noch kein Material – Claude arbeitet aus seinem Fachwissen. Du kannst jederzeit Material ergänzen, z. B. Skript, Übungsblätter oder Altklausuren. Alles, was danach entsteht, nutzt es."}
      </p>

      {added > 0 && (
        <div className="callout callout-ok small" role="status">
          {added === 1 ? "1 Datei" : `${added} Dateien`} hinzugefügt. Neue Tests und Lernzettel nutzen das Material ab jetzt;
          bereits erstellte Tests bleiben, wie sie sind.
          {notesWithoutMaterial > 0 &&
            ` ${notesWithoutMaterial === 1 ? "Ein Lernzettel wurde" : `${notesWithoutMaterial} Lernzettel wurden`} ohne Material geschrieben – auf seiner Seite kannst du ihn neu schreiben lassen.`}
        </div>
      )}

      {inPlan.length > 0 && (
        <ul className="material-list">
          {inPlan.map((m) => (
            <MaterialRow
              key={m.id}
              material={m}
              onPreview={setPreview}
              actions={false}
              trailing={
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={`${m.name} aus dem Lernplan nehmen`}
                  title="Aus dem Lernplan nehmen (die Datei bleibt im Fach)"
                  onClick={() => removePlanMaterial(plan.id, m.id)}
                >
                  ✕
                </button>
              }
            />
          ))}
        </ul>
      )}

      {adding && (
        <div className="stack-sm plan-material-add">
          <MaterialUpload subjectId={plan.subjectId} onAdded={add} />
          {others.length > 0 && (
            <details className="used-materials">
              <summary className="small">Material aus dem Fach übernehmen ({others.length})</summary>
              <ul className="material-list">
                {others.map((m) => (
                  <MaterialRow
                    key={m.id}
                    material={m}
                    onPreview={setPreview}
                    actions={false}
                    trailing={
                      <button className="btn btn-ghost btn-sm" onClick={() => add([m.id])} aria-label={`${m.name} zum Lernplan hinzufügen`}>
                        Hinzufügen
                      </button>
                    }
                  />
                ))}
              </ul>
            </details>
          )}
          {inPlan.length > 0 && (
            <div className="right">
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                Fertig
              </button>
            </div>
          )}
        </div>
      )}
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
