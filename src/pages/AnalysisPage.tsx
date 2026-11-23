import platform from "@platform-impl";
import { useEffect, useRef, useState } from "react";
import { ERROR_KIND_LABELS } from "../ai/prompts";
import { confirmDialog, promptDialog } from "../components/Dialogs";
import Markdown from "../components/Markdown";
import MaterialList from "../components/MaterialList";
import MaterialPreview from "../components/MaterialPreview";
import MaterialRow from "../components/MaterialRow";
import { formatDate, summarize } from "../lib/attempts";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  cancelExamJob,
  clearExamJob,
  practiceJobKey,
  practicePlan,
  scorePercent,
  startPractice,
  useExamJob,
  type PracticeTarget,
} from "../lib/examAnalysis";
import { navigate } from "../router";
import { repo, useStore } from "../store/store";
import type { ExamAnalysis, ExamTaskStatus, Importance, Material } from "../types";

const PRIORITY_CHIP: Record<Importance, string> = { high: "chip-wrong", medium: "chip-partial", low: "chip-soft" };
const STATUS_CHIP: Record<ExamTaskStatus, string> = {
  correct: "chip-correct",
  partial: "chip-partial",
  wrong: "chip-wrong",
  missing: "chip-wrong",
  unknown: "chip-soft",
};

function points(achieved: number | null, max: number | null): string | null {
  const f = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (achieved !== null && max !== null) return `${f(achieved)}/${f(max)} P.`;
  if (achieved !== null) return `${f(achieved)} P.`;
  return null;
}

/** Ergebnis einer Klausur-Analyse: Schwachstellen, Fehlerarten, Aufgabe für Aufgabe – und gezielt üben. */
export default function AnalysisPage({ analysisId }: { analysisId: string }) {
  const store = useStore();
  const [preview, setPreview] = useState<Material | null>(null);
  const analysis = store.analyses.find((a) => a.id === analysisId);

  if (!analysis) {
    return (
      <div className="card">
        <p>Diese Klausur-Analyse gibt es nicht (mehr).</p>
        <a href="#/">Zur Übersicht</a>
      </div>
    );
  }
  const a = analysis;
  const subject = store.subjects.find((s) => s.id === a.subjectId);
  const sources = a.materialIds.map((id) => store.materials.find((m) => m.id === id)).filter((m): m is Material => !!m);
  const percent = scorePercent(a);
  const practiceTests = store.tests.filter((t) => t.analysisId === a.id).sort((x, y) => y.createdAt - x.createdAt);
  const openTasks = a.tasks.filter((t) => t.status !== "correct");

  async function rename() {
    const title = await promptDialog("Analyse umbenennen", { label: "Titel", initial: a.title });
    if (title) repo.updateAnalysis(a.id, { title });
  }

  async function remove() {
    const ok = await confirmDialog(`„${a.title}“ löschen? Übungstests, die du daraus erstellt hast, bleiben erhalten.`, {
      title: "Klausur-Analyse löschen",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    repo.deleteAnalysis(a.id);
    navigate(`/subject/${a.subjectId}`, { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/subject/${a.subjectId}`} className="crumb">
          {subject?.name ?? "Fach"}
        </a>
        <p className="muted small eyebrow">Klausur-Analyse</p>
        <div className="row-between">
          <h1>{a.title}</h1>
          <div className="row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={rename}>
              Umbenennen
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
        {(a.pointsAchieved !== null || a.grade) && (
          <div className="row-wrap analysis-score">
            {a.pointsAchieved !== null && (
              <span className="score-pill">
                {points(a.pointsAchieved, a.pointsMax)}
                {percent !== null && <span className="muted small"> ({percent} %)</span>}
              </span>
            )}
            {a.grade && <span className="score-pill">Note {a.grade}</span>}
          </div>
        )}
      </div>

      {a.notes && <div className="callout callout-warn">{a.notes}</div>}

      <section className="card stack-sm">
        <h2>Kurz gesagt</h2>
        {a.summary && <Markdown>{a.summary}</Markdown>}
        {a.strengths.length > 0 && (
          <div className="stack-xs">
            <strong className="small">Das lief gut</strong>
            <ul className="analysis-strengths">
              {a.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card stack-sm practice-card">
        <h2>Gezielt üben</h2>
        <p className="muted small">
          Claude erstellt neue Aufgaben genau zu dem, was nicht gut lief – im Stil deiner Klausur, mit neuen Zahlen. Unten
          bei jeder Schwachstelle und jeder Aufgabe geht das auch einzeln.
        </p>
        <PracticeButton analysis={a} target={{ kind: "all" }} primary label="Übungstest zu allen Schwachstellen" />
        {practiceTests.length > 0 && (
          <div className="stack-sm">
            <strong className="small">Deine Übungen dazu</strong>
            {practiceTests.map((t) => {
              const finished = store.attempts
                .filter((x) => x.testId === t.id && x.status === "finished")
                .sort((x, y) => y.startedAt - x.startedAt);
              const best = finished.reduce((m, x) => Math.max(m, summarize(x, t).percent), -1);
              return (
                <a key={t.id} className="card card-link card-inner row-between" href={`#/test/${t.id}`}>
                  <div>
                    <strong>{t.title}</strong>
                    <div className="muted small">
                      {t.questions.length} Aufgaben · {formatDate(t.createdAt)}
                    </div>
                  </div>
                  {finished.length ? (
                    <span className="score-pill" title="Bestes Ergebnis">
                      {best}%
                    </span>
                  ) : (
                    <span className="chip chip-soft">neu</span>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </section>

      {a.weaknesses.length > 0 && (
        <section className="stack-sm" aria-labelledby="weak-title">
          <h2 id="weak-title">Was nicht gut lief</h2>
          {a.weaknesses.map((w) => (
            <article key={w.topic} className={`card stack-sm weakness weakness-${w.priority}`}>
              <div className="row-between weakness-head">
                <h3>{w.topic}</h3>
                <span className={`chip ${PRIORITY_CHIP[w.priority]}`}>Priorität {PRIORITY_LABELS[w.priority]}</span>
              </div>
              {w.problem && <Markdown>{w.problem}</Markdown>}
              {w.advice && (
                <div className="weakness-advice">
                  <strong className="small">So übst du:</strong> <Markdown>{w.advice}</Markdown>
                </div>
              )}
              {(w.tasks.length > 0 || w.pointsLost !== null) && (
                <p className="muted small">
                  {w.tasks.length > 0 && <>In der Klausur: {w.tasks.join(", ")}</>}
                  {w.tasks.length > 0 && w.pointsLost !== null && " · "}
                  {w.pointsLost !== null && <>{w.pointsLost.toLocaleString("de-DE")} Punkte verloren</>}
                </p>
              )}
              <PracticeButton analysis={a} target={{ kind: "weakness", topic: w.topic }} label="Übungsaufgaben dazu" />
            </article>
          ))}
        </section>
      )}

      {a.errorPatterns.length > 0 && (
        <section className="card stack-sm">
          <h2>Wiederkehrende Fehler</h2>
          <ul className="error-patterns">
            {a.errorPatterns.map((e, i) => (
              <li key={i}>
                <span className="chip chip-soft">{ERROR_KIND_LABELS[e.kind]}</span>
                <span>{e.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.tasks.length > 0 && (
        <section className="card stack-sm">
          <div className="row-between">
            <h2>Aufgabe für Aufgabe</h2>
            <span className="muted small">
              {openTasks.length === 0 ? "alles richtig" : `${openTasks.length} von ${a.tasks.length} mit Fehlern`}
            </span>
          </div>
          <div className="task-results">
            {a.tasks.map((t, i) => (
              <details key={`${t.label}-${i}`} className={`task-result task-${t.status}`}>
                <summary>
                  <span className="task-result-label">
                    <strong>{t.label}</strong>
                    {t.topic && <span className="muted small"> · {t.topic}</span>}
                  </span>
                  <span className="task-result-meta">
                    {points(t.pointsAchieved, t.pointsMax) && <span className="small">{points(t.pointsAchieved, t.pointsMax)}</span>}
                    <span className={`chip ${STATUS_CHIP[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                  </span>
                </summary>
                <div className="stack-sm task-result-body">
                  {t.mistake && (
                    <div>
                      <strong className="small">Was schiefging</strong>
                      <Markdown>{t.mistake}</Markdown>
                    </div>
                  )}
                  {t.correction && (
                    <div>
                      <strong className="small">{t.status === "correct" ? "Lösung" : "So wäre es richtig"}</strong>
                      <Markdown className="study-note">{t.correction}</Markdown>
                    </div>
                  )}
                  {t.errorKinds.length > 0 && (
                    <div className="row-wrap">
                      {t.errorKinds.map((k) => (
                        <span key={k} className="chip chip-soft">
                          {ERROR_KIND_LABELS[k]}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.status !== "correct" && <PracticeButton analysis={a} target={{ kind: "task", label: t.label }} label="Ähnliche Aufgaben üben" />}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <details className="card note-sources">
        <summary>
          <strong>Grundlage</strong>
          <span className="muted small">
            {" · "}
            {a.materialIds.length === 1 ? "1 Datei" : `${a.materialIds.length} Dateien`}
            {a.materialIds.length > sources.length && ` (${a.materialIds.length - sources.length} inzwischen gelöscht)`}
          </span>
        </summary>
        <div className="stack-sm note-sources-body">
          {a.remarks && <p className="small">Deine Hinweise: {a.remarks}</p>}
          {sources.length > 0 ? (
            <MaterialList
              materials={sources}
              row={(m) => <MaterialRow key={m.id} material={m} onPreview={setPreview} actions={false} role={false} />}
            />
          ) : (
            <p className="muted small">Die Dateien sind inzwischen gelöscht – Übungsaufgaben entstehen dann ohne die Klausur als Vorlage.</p>
          )}
        </div>
      </details>
      <p className="muted small">
        Ausgewertet von Claude · {new Date(a.createdAt).toLocaleDateString("de-DE")} · {a.model}. Claude kann sich beim Lesen
        von Handschrift irren – im Zweifel gilt die Korrektur deiner Lehrkraft.
      </p>
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** Knopf „Übungsaufgaben erstellen“ samt Fortschritt; fertig → zum neuen Test. */
function PracticeButton({
  analysis,
  target,
  label,
  primary = false,
}: {
  analysis: ExamAnalysis;
  target: PracticeTarget;
  label: string;
  primary?: boolean;
}) {
  const ai = platform.useAiStatus();
  const key = practiceJobKey(analysis.id, target);
  const job = useExamJob(key);
  const watching = useRef(false);
  const count = practicePlan(analysis, target).settings.questionCount;

  if (job && !job.done) watching.current = true;
  useEffect(() => {
    if (!job?.done) return;
    // Nur weiterleiten, wenn man beim Erstellen auf der Seite war – sonst steht der Test einfach in der Liste.
    if (job.resultId && watching.current) navigate(`/test/${job.resultId}`);
    if (!job.error) clearExamJob(key);
    watching.current = false;
  }, [job?.done, job?.resultId, job?.error, key]);

  if (job && !job.done) {
    const p = job.progress;
    return (
      <div className="practice-progress" aria-live="polite" aria-busy="true">
        <div className="spinner spinner-sm" />
        <span className="small">
          {p.phase === "writing" && p.questionsSoFar > 0
            ? `${p.questionsSoFar} von ${count} Aufgaben erstellt …`
            : p.phase === "transcribing"
              ? "Claude liest deine Klausur …"
              : "Claude erstellt Übungsaufgaben …"}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => cancelExamJob(key)}>
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <div className="stack-xs practice-action">
      <div>
        <button
          className={`btn ${primary ? "btn-primary" : "btn-ghost"} ${primary ? "" : "btn-sm"}`}
          disabled={ai.state !== "ready"}
          title={ai.state === "unavailable" ? ai.reason : ""}
          onClick={() => {
            clearExamJob(key);
            startPractice(analysis.id, target);
          }}
        >
          {label} ({count})
        </button>
      </div>
      {job?.error && <p className="error-text small">{job.error}</p>}
    </div>
  );
}
