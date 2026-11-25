import { useState } from "react";
import { confirmDialog, promptDialog } from "../components/Dialogs";
import MaterialList from "../components/MaterialList";
import MaterialPreview from "../components/MaterialPreview";
import { formatFolder } from "../lib/folders";
import MaterialRow from "../components/MaterialRow";
import MaterialUpload from "../components/MaterialUpload";
import { formatDate, summarize } from "../lib/attempts";
import { scorePercent } from "../lib/examAnalysis";
import { splitMaterials } from "../lib/materialNames";
import { daysBetween, formatDay, todayISO } from "../lib/planner";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";
import type { Material } from "../types";

export default function SubjectPage({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const [preview, setPreview] = useState<Material | null>(null);

  const subject = store.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    return (
      <div className="card">
        <p>Dieses Fach existiert nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  const materials = store.materials.filter((m) => m.subjectId === subjectId);
  const allTests = store.tests.filter((t) => t.subjectId === subjectId).sort((a, b) => b.createdAt - a.createdAt);
  const tests = allTests.filter((t) => !t.planId);
  const planTestCount = allTests.length - tests.length;
  const plans = store.plans.filter((p) => p.subjectId === subjectId).sort((a, b) => a.examDate.localeCompare(b.examDate));
  const analyses = store.analyses.filter((a) => a.subjectId === subjectId).sort((a, b) => b.createdAt - a.createdAt);
  const { fresh, used } = splitMaterials(materials, tests, plans, analyses);
  const notes = store.notes.filter((n) => n.subjectId === subjectId).sort((a, b) => b.createdAt - a.createdAt);
  const attempts = store.attempts.filter((a) => a.subjectId === subjectId);

  async function deleteFolder(folder: string, items: Material[]) {
    const ok = await confirmDialog(
      `Den Ordner „${formatFolder(folder)}“ mit ${items.length === 1 ? "1 Datei" : `${items.length} Dateien`} löschen?`,
      { title: "Ordner löschen", confirmLabel: "Löschen", danger: true },
    );
    if (ok) items.forEach((m) => repo.deleteMaterial(m.id));
  }

  async function rename() {
    const name = await promptDialog("Fach umbenennen", { label: "Name", initial: subject!.name });
    if (name) repo.updateSubject(subjectId, { name });
  }

  async function remove() {
    const ok = await confirmDialog(`„${subject!.name}“ mit allen Materialien, Tests und Ergebnissen löschen?`, {
      title: "Fach löschen",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    repo.deleteSubject(subjectId);
    navigate("/", { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href="#/" className="crumb">
          Fächer
        </a>
        <div className="row-between">
          <h1>
            <span className="subject-dot" style={{ background: subject.color }} />
            {subject.name}
          </h1>
          <div className="row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={rename}>
              Umbenennen
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
      </div>

      <section className="card stack-sm">
        <h2>Neues Material</h2>
        <p className="muted small">
          Lade das Material für deinen nächsten Test hoch – Aufgabenblätter, Lösungen, Skripte oder Altklausuren. Sobald
          du daraus einen Test erstellst, wandert es zu diesem Test, und die Liste ist wieder frei für neues Material.
        </p>
        <MaterialUpload subjectId={subjectId} />
        {fresh.length > 0 ? (
          <MaterialList
            materials={fresh}
            row={(m) => <MaterialRow key={m.id} material={m} onPreview={setPreview} />}
            folderActions={(folder, items) => (
              <button
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Ordner ${folder} löschen`}
                title="Ordner löschen"
                onClick={() => deleteFolder(folder, items)}
              >
                🗑
              </button>
            )}
          />
        ) : (
          <p className="muted small">Gerade kein neues Material.</p>
        )}
        {fresh.length > 0 && (
          <div className="row-wrap right">
            <button className="btn btn-ghost" onClick={() => navigate(`/subject/${subjectId}/new-note`)}>
              Lernzettel daraus erstellen
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/subject/${subjectId}/new-test`)}>
              Test aus diesem Material erstellen
            </button>
          </div>
        )}
        {used.length > 0 && (
          <details className="used-materials">
            <summary className="small">Schon verwendetes Material ({used.length})</summary>
            <MaterialList
              materials={used.map((u) => u.material)}
              row={(material) => {
                const { tests: usedBy, plans: inPlans, analyses: inAnalyses } = used.find((u) => u.material.id === material.id)!;
                return (
                <MaterialRow
                  key={material.id}
                  material={material}
                  onPreview={setPreview}
                  extra={
                    <>
                      {" · "}
                      {[
                        ...usedBy.map((t) => ({ id: t.id, href: `#/test/${t.id}`, title: t.title })),
                        ...inPlans.map((p) => ({ id: p.id, href: `#/plan/${p.id}`, title: `Lernplan „${p.title}“` })),
                        ...inAnalyses.map((a) => ({ id: a.id, href: `#/analysis/${a.id}`, title: `Klausur-Analyse „${a.title}“` })),
                      ].map((link, i) => (
                        <span key={link.id}>
                          {i > 0 && ", "}
                          <a href={link.href}>{link.title}</a>
                        </span>
                      ))}
                    </>
                  }
                />
                );
              }}
            />
          </details>
        )}
      </section>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Lernpläne</h2>
          <button className="btn btn-ghost" onClick={() => navigate(`/subject/${subjectId}/new-plan`)}>
            + Lernplan
          </button>
        </div>
        {plans.length === 0 && (
          <p className="muted">
            Ein Lernplan verteilt die Themen bis zur Prüfung auf deine Lerntage – mit Übungstests, Wiederholungen und
            Probeklausur.
          </p>
        )}
        <div className="stack-sm">
          {plans.map((p) => {
            const done = p.tasks.filter((t) => t.status === "done").length;
            const days = daysBetween(todayISO(), p.examDate);
            return (
              <a key={p.id} className="card card-link card-inner row-between" href={`#/plan/${p.id}`}>
                <div>
                  <strong>{p.title}</strong>
                  <div className="muted small">
                    Prüfung {formatDay(p.examDate)}
                    {days >= 0 ? ` · noch ${days} Tage` : " · vorbei"}
                  </div>
                </div>
                {p.status === "draft" ? (
                  <span className="chip chip-soft">Entwurf</span>
                ) : (
                  <span className="score-pill">
                    {done}/{p.tasks.length} <span className="muted small">erledigt</span>
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </section>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Klausuren auswerten</h2>
          <button className="btn btn-ghost" onClick={() => navigate(`/subject/${subjectId}/new-analysis`)}>
            + Klausur auswerten
          </button>
        </div>
        {analyses.length === 0 ? (
          <p className="muted">
            Lade deine korrigierte Klausur hoch (Fotos oder PDF): Claude zeigt dir, was nicht gut lief, und erstellt dir
            gezielt Übungsaufgaben zu deinen Schwachstellen.
          </p>
        ) : (
          <div className="stack-sm">
            {analyses.map((a) => {
              const percent = scorePercent(a);
              const high = a.weaknesses.filter((w) => w.priority === "high").length;
              return (
                <a key={a.id} className="card card-link card-inner row-between" href={`#/analysis/${a.id}`}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className="muted small">
                      {a.weaknesses.length === 1 ? "1 Schwachstelle" : `${a.weaknesses.length} Schwachstellen`}
                      {high > 0 && ` (${high} wichtig)`} · {formatDate(a.createdAt)}
                    </div>
                  </div>
                  {a.grade ? (
                    <span className="score-pill">Note {a.grade}</span>
                  ) : percent !== null ? (
                    <span className="score-pill">{percent}%</span>
                  ) : (
                    <span aria-hidden="true">›</span>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Lernzettel</h2>
          <button className="btn btn-ghost" onClick={() => navigate(`/subject/${subjectId}/new-note`)}>
            + Lernzettel
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="muted">
            Claude fasst dein Material zu einem Lernzettel zusammen – mit dem Wichtigsten, vorgerechneten Beispielen,
            typischen Fehlern und einem Selbstcheck.
          </p>
        ) : (
          <div className="stack-sm">
            {notes.map((n) => {
              const plan = n.planId ? plans.find((p) => p.id === n.planId) : undefined;
              const href = n.planId && n.topicId ? `#/plan/${n.planId}/note/${n.topicId}` : `#/note/${n.id}`;
              const count = n.materialIds?.length ?? 0;
              return (
                <a key={n.id} className="card card-link card-inner row-between" href={href}>
                  <span>
                    <strong>{n.topicName}</strong>
                    <span className="muted small">
                      {" · "}
                      {plan ? `Lernplan „${plan.title}“` : count === 1 ? "aus 1 Material" : `aus ${count} Materialien`}
                      {" · "}
                      {new Date(n.createdAt).toLocaleDateString("de-DE")}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack-sm">
        <div className="row-between">
          <h2>Tests</h2>
          <button className="btn btn-ghost" onClick={() => navigate(`/subject/${subjectId}/new-test`)}>
            + Neuer Test
          </button>
        </div>
        {tests.length === 0 && <p className="muted">Noch keine Tests erstellt.</p>}
        {planTestCount > 0 && (
          <p className="muted small">
            Dazu {planTestCount} {planTestCount === 1 ? "Test" : "Tests"} aus Lernplänen – zu finden im jeweiligen Plan.
          </p>
        )}
        <div className="stack-sm">
          {tests.map((t) => {
            const finished = attempts
              .filter((a) => a.testId === t.id && a.status === "finished")
              .sort((a, b) => b.startedAt - a.startedAt);
            const last = finished[0];
            const best = finished.reduce((m, a) => Math.max(m, summarize(a, t).percent), -1);
            return (
              <a key={t.id} className="card card-link card-inner row-between" href={`#/test/${t.id}`}>
                <div>
                  <strong>{t.title}</strong>
                  <div className="muted small">
                    {t.analysisId ? "Übung zur Klausur" : t.fromAttemptId ? "Übung zu deinen Fehlern" : t.mode === "exact" ? "Originalaufgaben" : "Neue Aufgaben"} · {t.questions.length} Fragen ·{" "}
                    {formatDate(t.createdAt)}
                  </div>
                </div>
                {last ? (
                  <div className="score-pill" title="Letztes / bestes Ergebnis">
                    {summarize(last, t).percent}% <span className="muted small">(best {best}%)</span>
                  </div>
                ) : (
                  <span className="chip chip-soft">neu</span>
                )}
              </a>
            );
          })}
        </div>
      </section>

      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
