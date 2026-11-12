import type { TopicStatus } from "../lib/planner";
import { formatLongDate, formatMinutes, todayISO } from "../lib/planner";
import { WEAK_PERCENT, taskQuestionCount, usableSource } from "../lib/plans";
import type { PlanTask, PlanTopic, StudyPlan, Test } from "../types";
import Modal from "./Modal";
import { IMPORTANCE_LABELS, TASK_LABELS } from "./PlanParts";

/** Ab so vielen Themen werden nur Namen und Stand gezeigt, ohne Beschreibung. */
const COMPACT_FROM = 4;

/** Was bei dieser Aufgabe zu tun ist – ein paar Sätze für die Detailansicht. */
export function taskGuidance(
  task: PlanTask,
  ctx: { hasMaterial: boolean; hasNote: boolean; hasSource: boolean; topicCount: number },
): string {
  const count = taskQuestionCount(task);
  const from = ctx.hasMaterial ? "aus deinem Material" : "aus seinem Fachwissen";
  switch (task.type) {
    case "learn":
      return [
        `Arbeite das Thema in Ruhe durch – ${ctx.hasNote ? "mit deinem Lernzettel" : "am besten mit einem Lernzettel, den Claude dir schreibt"}${
          ctx.hasSource ? " und mit der Fundstelle im Material" : ""
        }.`,
        "Rechne die Beispiele selbst nach, beantworte den Selbstcheck und hake die Aufgabe danach ab. Den Übungstest zum Thema machst du an einem der nächsten Tage.",
      ].join(" ");
    case "practice":
      return `Ein kurzer Test mit etwa ${count} Fragen zu diesem Thema, im Übungsmodus mit Feedback nach jeder Frage. Claude erstellt ihn beim ersten Start ${from}. Das Ergebnis geht in den Themenstand ein; unter ${WEAK_PERCENT} % plant die App automatisch eine Zusatzwiederholung.`;
    case "review":
      return `${
        ctx.topicCount > 1
          ? "Du wiederholst die Themen, bei denen du gerade am unsichersten bist."
          : "Wiederholen mit ein paar Tagen Abstand festigt das Gelernte."
      } Die App nimmt dafür zuerst Fragen, die du in früheren Tests falsch hattest; gibt es zu wenige, erstellt Claude etwa ${count} neue ${from}.`;
    case "mock_exam":
      return `Eine Probeklausur über alle Themen mit etwa ${count} Fragen im Prüfungsmodus – die Auswertung kommt erst am Ende. Nimm dir die Zeit am Stück und nutze nur, was in der echten Prüfung erlaubt ist. Danach siehst du im Themenstand, wo du noch nacharbeiten solltest.`;
    case "buffer":
      return "Zeitpuffer kurz vor der Prüfung: Hol Verpasstes nach, wiederhole deine schwächsten Themen oder geh deine Lernzettel noch einmal durch. Wenn alles sitzt, hast du frei.";
  }
}

function statusLabel(task: PlanTask): { text: string; className: string } {
  const today = todayISO();
  if (task.status === "done") return { text: "erledigt", className: "chip-correct" };
  if (task.status === "skipped") return { text: "übersprungen", className: "chip-soft" };
  if (task.date < today) return { text: "überfällig", className: "chip-wrong" };
  if (task.date === today) return { text: "heute", className: "chip-partial" };
  return { text: "geplant", className: "chip-soft" };
}

function percentText(s: TopicStatus | undefined): string {
  if (!s || s.percent === null) return "noch kein Test";
  return `${s.percent} %${s.source === "placement" ? " (Einstufung)" : ""}`;
}

export default function TaskDetails({
  plan,
  task,
  status,
  test,
  hasMaterial,
  hasNote,
  resultPercent,
  action,
  onToggle,
  onResult,
  onClose,
}: {
  plan: StudyPlan;
  task: PlanTask;
  status: Map<string, TopicStatus>;
  /** Bereits erstellter Test zur Aufgabe. */
  test?: Test;
  hasMaterial: boolean;
  hasNote: boolean;
  resultPercent: number | null;
  /** Hauptaktion (Lernzettel, Test starten …). */
  action?: { label: string; run: () => void };
  onToggle: () => void;
  onResult?: () => void;
  onClose: () => void;
}) {
  const topics = plan.topics.filter((t) => task.topicIds.includes(t.id));
  const compact = topics.length >= COMPACT_FROM;
  const state = statusLabel(task);
  const done = task.status === "done";
  const hasSource = topics.length === 1 && !!usableSource(topics[0].sources);
  const nameOf = (id: string) => plan.topics.find((t) => t.id === id)?.name;

  return (
    <Modal
      title={task.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onToggle}>
            {done ? "Wieder öffnen" : "Als erledigt markieren"}
          </button>
          {action && (
            <button
              className="btn btn-primary"
              onClick={() => {
                onClose();
                action.run();
              }}
            >
              {action.label}
            </button>
          )}
        </>
      }
    >
      <div className="stack-sm task-details">
        <div className="row-wrap">
          <span className={`chip ${state.className}`}>{state.text}</span>
          <span className="muted small">
            {formatLongDate(task.date)} · {TASK_LABELS[task.type]} · {formatMinutes(task.minutes)}
          </span>
        </div>
        {task.extra && (
          <p className="callout callout-warn small">
            Zusätzlich eingeplant, weil du in einem Test bei diesem Thema unter {WEAK_PERCENT} % lagst.
          </p>
        )}

        <section className="stack-xs">
          <h3>So gehst du vor</h3>
          <p>{taskGuidance(task, { hasMaterial, hasNote, hasSource, topicCount: topics.length })}</p>
          {test && (
            <p className="muted small">
              Der Test ist schon erstellt ({test.questions.length} Fragen) – du kannst ihn beliebig oft wiederholen.
            </p>
          )}
          {resultPercent !== null && onResult && (
            <p className="small">
              Dein Ergebnis:{" "}
              <button
                className="link-btn"
                onClick={() => {
                  onClose();
                  onResult();
                }}
              >
                {resultPercent} % – Auswertung ansehen
              </button>
            </p>
          )}
        </section>

        {topics.length > 0 && (
          <section className="stack-xs">
            <h3>{topics.length === 1 ? "Thema" : `Themen (${topics.length})`}</h3>
            <ul className={`detail-topics ${compact ? "compact" : ""}`}>
              {topics.map((t) => (
                <TopicInfo key={t.id} topic={t} status={status.get(t.id)} compact={compact} nameOf={nameOf} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

function TopicInfo({
  topic: t,
  status,
  compact,
  nameOf,
}: {
  topic: PlanTopic;
  status?: TopicStatus;
  compact: boolean;
  nameOf: (id: string) => string | undefined;
}) {
  const source = usableSource(t.sources);
  const prereqs = t.prerequisites.map(nameOf).filter(Boolean);
  return (
    <li>
      <div className="row-between">
        <strong>
          {t.name}
          {t.importance !== "medium" && <span className="chip chip-soft">{IMPORTANCE_LABELS[t.importance]}</span>}
        </strong>
        <span className="muted small">{percentText(status)}</span>
      </div>
      {!compact && (
        <>
          {t.description && <p className="small">{t.description}</p>}
          {source && <p className="muted small">Im Material: {source}</p>}
          {prereqs.length > 0 && <p className="muted small">Baut auf: {prereqs.join(", ")}</p>}
        </>
      )}
    </li>
  );
}
