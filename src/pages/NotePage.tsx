import platform from "@platform-impl";
import { useEffect, useReducer, useRef, useState } from "react";
import { confirmDialog } from "../components/Dialogs";
import Markdown from "../components/Markdown";
import { formatMinutes } from "../lib/planner";
import { createStudyNote, noteFor, planHasMaterials, setTaskStatus } from "../lib/plans";
import { navigate, routeQuery } from "../router";
import { useStore } from "../store/store";

/**
 * Lernzettel, die gerade geschrieben werden. Liegt außerhalb der Seite, damit
 * das Schreiben weiterläuft (und gespeichert wird), wenn man die Seite verlässt,
 * und beim Zurückkommen der Fortschritt wieder erscheint.
 */
interface Job {
  text: string;
  controller: AbortController;
  done: boolean;
  error?: string;
}
const jobs = new Map<string, Job>();

function startJob(planId: string, topicId: string): void {
  const job: Job = { text: "", controller: new AbortController(), done: false };
  jobs.set(`${planId}/${topicId}`, job);
  createStudyNote(planId, topicId, { signal: job.controller.signal, onText: (t) => (job.text = t) })
    .catch((e) => {
      if (!job.controller.signal.aborted) job.error = platform.describeError(e);
    })
    .finally(() => {
      job.done = true;
    });
}

export default function NotePage({ planId, topicId }: { planId: string; topicId: string }) {
  const store = useStore();
  const ai = platform.useAiStatus();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [error, setError] = useState<string | null>(null);
  const query = useRef(routeQuery()).current;
  const autoCreate = useRef(query.get("create") === "1");
  const key = `${planId}/${topicId}`;
  const job = jobs.get(key);

  const plan = store.plans.find((p) => p.id === planId);
  const topic = plan?.topics.find((t) => t.id === topicId);
  const note = noteFor(store.notes, planId, topicId);
  const task = plan?.tasks.find((t) => t.id === query.get("task"));

  // Fortschritt eines laufenden Auftrags anzeigen.
  useEffect(() => {
    if (!job) return;
    const timer = window.setInterval(() => {
      if (job.done) {
        window.clearInterval(timer);
        if (jobs.get(key) === job) jobs.delete(key);
        if (job.error) setError(job.error);
      }
      rerender();
    }, 250);
    return () => window.clearInterval(timer);
  }, [job, key]);

  // Über „Lernzettel erstellen“ geöffnet: direkt loslegen.
  useEffect(() => {
    if (!autoCreate.current || note || jobs.has(key) || !topic || ai.state !== "ready") return;
    autoCreate.current = false;
    write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.state]);

  if (!plan || !topic) {
    return (
      <div className="card">
        <p>Dieses Thema gibt es im Lernplan nicht (mehr).</p>
        <a href={plan ? `#/plan/${plan.id}` : "#/"}>{plan ? "Zum Lernplan" : "Zur Übersicht"}</a>
      </div>
    );
  }

  function write() {
    setError(null);
    startJob(planId, topicId);
    rerender();
  }

  async function rewrite() {
    const ok = await confirmDialog("Claude schreibt den Lernzettel neu; der jetzige wird ersetzt.", {
      title: "Lernzettel neu schreiben?",
      confirmLabel: "Neu schreiben",
    });
    if (ok) write();
  }

  function cancel() {
    job?.controller.abort();
    jobs.delete(key);
    rerender();
  }

  function markLearned() {
    if (task) setTaskStatus(plan!.id, task.id, "done");
    navigate(`/plan/${plan!.id}`);
  }

  const withMaterial = planHasMaterials(plan);
  const writing = !!job && !job.done;
  const liveText = job?.text ?? "";

  return (
    <div className="stack">
      <div className="page-header">
        <a href={`#/plan/${plan.id}`} className="back-link">
          ← {plan.title}
        </a>
        <p className="muted small eyebrow">Lernzettel</p>
        <h1>{topic.name}</h1>
        {topic.description && <p className="muted">{topic.description}</p>}
      </div>

      {error && <div className="callout callout-error">{error}</div>}

      {writing ? (
        <section className="card stack-sm" aria-live="polite" aria-busy="true">
          <div className="row-between">
            <div className="note-writing">
              <div className="spinner spinner-sm" />
              <strong>Claude schreibt den Lernzettel …</strong>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={cancel}>
              Abbrechen
            </button>
          </div>
          {liveText ? (
            <Markdown className="study-note">{liveText}</Markdown>
          ) : (
            <p className="muted small">
              {withMaterial ? "Claude liest dein Material und legt gleich los." : "Gleich geht's los."} Du kannst die Seite
              verlassen – der Lernzettel wird trotzdem fertig geschrieben und gespeichert.
            </p>
          )}
        </section>
      ) : note ? (
        <>
          <article className="card">
            <Markdown className="study-note">{note.content}</Markdown>
          </article>
          <p className="muted small">
            {note.fromMaterial
              ? "Von Claude aus deinem Material geschrieben."
              : "Von Claude aus seinem Fachwissen geschrieben, ohne dein Material – kann vom Stoff deiner Veranstaltung abweichen."}{" "}
            {new Date(note.createdAt).toLocaleDateString("de-DE")} · {note.model}
            {note.topicName !== topic.name && <> · geschrieben für „{note.topicName}“</>}
          </p>
          <div className="row-between">
            <button className="btn btn-ghost" onClick={rewrite} disabled={ai.state === "unavailable"}>
              Neu schreiben
            </button>
            {task && task.status === "open" ? (
              <button className="btn btn-primary" onClick={markLearned}>
                Gelernt – abhaken ({formatMinutes(task.minutes)})
              </button>
            ) : (
              <a className="btn btn-primary" href={`#/plan/${plan.id}`}>
                Zurück zum Plan
              </a>
            )}
          </div>
        </>
      ) : (
        <section className="card stack-sm">
          <h2>Noch kein Lernzettel</h2>
          <p>
            Claude schreibt dir zu diesem Thema einen Lernzettel: das Wichtigste, ein Vorgehen für typische Aufgaben,
            vorgerechnete Beispiele, typische Fehler und ein kurzer Selbstcheck.
          </p>
          <p className="muted small">
            {withMaterial
              ? "Grundlage ist das Material deines Lernplans."
              : "Dein Lernplan hat kein Material – Claude schreibt aus seinem Fachwissen. Das kann vom Stoff deiner Veranstaltung abweichen."}{" "}
            {platform.usageNote}
          </p>
          <div className="row-wrap">
            <button className="btn btn-primary" onClick={write} disabled={ai.state !== "ready"}>
              Lernzettel schreiben lassen
            </button>
            {ai.state === "unavailable" && <span className="muted small">{ai.reason}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
