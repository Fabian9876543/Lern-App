import { useState } from "react";
import type { TopicStatus } from "../lib/planner";
import { WEEKDAYS_LONG, effectiveMinutes, formatMinutes } from "../lib/planner";
import { newId } from "../lib/ids";
import type { Importance, PlanTask, PlanTopic } from "../types";

export const IMPORTANCE_LABELS: Record<Importance, string> = { high: "wichtig", medium: "normal", low: "Randthema" };

export const TASK_LABELS: Record<PlanTask["type"], string> = {
  learn: "Lernen",
  practice: "Übungstest",
  review: "Wiederholung",
  mock_exam: "Probeklausur",
  buffer: "Puffer",
};

/** Montag zuerst; Index entspricht Date.getDay(). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function WeekdayMinutesInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="weekday-grid">
      {WEEK_ORDER.map((day) => (
        <label key={day} className="weekday-field">
          <span>{WEEKDAYS_LONG[day].slice(0, 2)}</span>
          <input
            id={`weekday-${day}`}
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={720}
            step={15}
            value={value[day] || ""}
            placeholder="0"
            aria-label={`Lernzeit ${WEEKDAYS_LONG[day]} in Minuten`}
            onChange={(e) => {
              const next = [...value];
              next[day] = Math.max(0, Math.min(720, Number(e.target.value) || 0));
              onChange(next);
            }}
          />
          <small className="muted">Min.</small>
        </label>
      ))}
    </div>
  );
}

/** Bearbeitbare Themenliste für den Plan-Entwurf. */
export function TopicEditor({ topics, onChange }: { topics: PlanTopic[]; onChange: (t: PlanTopic[]) => void }) {
  const update = (id: string, patch: Partial<PlanTopic>) =>
    onChange(topics.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id: string) =>
    onChange(topics.filter((t) => t.id !== id).map((t) => ({ ...t, prerequisites: t.prerequisites.filter((p) => p !== id) })));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...topics];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    onChange(next);
  };
  const add = () =>
    onChange([
      ...topics,
      {
        id: newId(),
        name: "",
        description: "",
        estimatedMinutes: 60,
        importance: "medium",
        prerequisites: [],
        sources: "",
        placementPercent: null,
      },
    ]);

  return (
    <div className="stack-sm">
      <ol className="topic-editor">
        {topics.map((t, i) => (
          <li key={t.id} className="topic-row">
            <div className="topic-main">
              <span className="q-number">{i + 1}</span>
              <input
                id={`topic-name-${t.id}`}
                className="input grow"
                value={t.name}
                placeholder="Themenname"
                aria-label="Themenname"
                onChange={(e) => update(t.id, { name: e.target.value })}
              />
              <label className="topic-minutes">
                <input
                  id={`topic-minutes-${t.id}`}
                  className="input"
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  value={t.estimatedMinutes}
                  aria-label={`Lernzeit für ${t.name || "Thema"} in Minuten`}
                  onChange={(e) => update(t.id, { estimatedMinutes: Math.max(5, Number(e.target.value) || 5) })}
                />
                <small className="muted">Min.</small>
              </label>
              <select
                id={`topic-importance-${t.id}`}
                className={`select select-sm importance-${t.importance}`}
                value={t.importance}
                aria-label="Wichtigkeit"
                onChange={(e) => update(t.id, { importance: e.target.value as Importance })}
              >
                {(Object.keys(IMPORTANCE_LABELS) as Importance[]).map((imp) => (
                  <option key={imp} value={imp}>
                    {IMPORTANCE_LABELS[imp]}
                  </option>
                ))}
              </select>
              <div className="topic-actions">
                <button className="btn btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
                  ↑
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  disabled={i === topics.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Nach unten"
                >
                  ↓
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(t.id)} aria-label={`${t.name || "Thema"} entfernen`}>
                  🗑
                </button>
              </div>
            </div>
            {t.placementPercent !== null && (
              <p className={`placement-note ${t.placementPercent >= 65 ? "good" : t.placementPercent >= 40 ? "mid" : "low"}`}>
                Einstufung: {t.placementPercent} %
                {effectiveMinutes(t) < t.estimatedMinutes
                  ? ` → eingeplant werden ${formatMinutes(effectiveMinutes(t))} statt ${formatMinutes(t.estimatedMinutes)}`
                  : " → volle Lernzeit"}
              </p>
            )}
            <details className="topic-details">
              <summary className="muted small">
                Details{t.sources ? ` · ${t.sources}` : ""}
                {t.prerequisites.length > 0 ? ` · baut auf ${t.prerequisites.length} Thema/Themen auf` : ""}
              </summary>
              <div className="stack-sm">
                <label className="field">
                  <span>Was man können muss</span>
                  <textarea
                    id={`topic-desc-${t.id}`}
                    className="textarea"
                    rows={2}
                    value={t.description}
                    onChange={(e) => update(t.id, { description: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Fundstelle im Material</span>
                  <input
                    id={`topic-sources-${t.id}`}
                    className="input"
                    value={t.sources}
                    placeholder="z. B. Skript S. 12–18"
                    onChange={(e) => update(t.id, { sources: e.target.value })}
                  />
                </label>
                {topics.length > 1 && (
                  <div className="field">
                    <span>Baut auf diesen Themen auf</span>
                    <div className="row-wrap">
                      {topics
                        .filter((o) => o.id !== t.id)
                        .map((o) => (
                          <label key={o.id} className="check chip-check">
                            <input
                              type="checkbox"
                              checked={t.prerequisites.includes(o.id)}
                              onChange={(e) =>
                                update(t.id, {
                                  prerequisites: e.target.checked
                                    ? [...t.prerequisites, o.id]
                                    : t.prerequisites.filter((p) => p !== o.id),
                                })
                              }
                            />
                            {o.name || "(ohne Namen)"}
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
      <button className="btn btn-ghost btn-sm" onClick={add}>
        + Thema hinzufügen
      </button>
    </div>
  );
}

export function TopicStatusList({
  topics,
  status,
  noteHref,
}: {
  topics: PlanTopic[];
  status: Map<string, TopicStatus>;
  /** Link zum Lernzettel eines Themas, falls es einen gibt. */
  noteHref?: (topicId: string) => string | null;
}) {
  return (
    <ul className="topic-list">
      {topics.map((t) => {
        const s = status.get(t.id);
        const pct = s?.percent ?? null;
        return (
          <li key={t.id}>
            <span className="topic-name">
              {s?.learned && <span title="Gelernt">✓ </span>}
              {t.name}
              {t.importance === "high" && <span className="chip chip-soft">wichtig</span>}
              {noteHref?.(t.id) && (
                <a className="small note-link" href={noteHref(t.id)!} aria-label={`Lernzettel zu ${t.name}`}>
                  Lernzettel
                </a>
              )}
            </span>
            <span className="score-bar-wrap" title={s?.source === "placement" ? "aus dem Einstufungstest" : "aus deinen Übungen"}>
              {pct === null ? (
                <span className="muted small">noch kein Test</span>
              ) : (
                <>
                  <span className={`score-bar ${pct < 50 ? "low" : pct < 80 ? "mid" : "high"}`}>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <strong>{pct}%</strong>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TaskRow({
  task,
  topics,
  showDate,
  actionLabel,
  resultPercent,
  busy,
  onToggle,
  onAction,
  onResult,
}: {
  task: PlanTask;
  topics: PlanTopic[];
  showDate?: string;
  actionLabel?: string;
  resultPercent?: number | null;
  busy: boolean;
  onToggle: () => void;
  onAction?: () => void;
  onResult?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const related = topics.filter((t) => task.topicIds.includes(t.id));
  const single = related.length === 1 ? related[0] : null;
  const done = task.status === "done";
  return (
    <li className={`task-row task-${task.type} ${done ? "done" : ""}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={done}
        onChange={onToggle}
        aria-label={`${task.title} ${done ? "als offen markieren" : "als erledigt markieren"}`}
      />
      <div className="task-body">
        <div className="task-title">
          <span>{task.title}</span>
          {task.extra && <span className="chip chip-partial">zusätzlich</span>}
        </div>
        <div className="muted small">
          {showDate && <>{showDate} · </>}
          {TASK_LABELS[task.type]} · {formatMinutes(task.minutes)}
          {single?.sources && task.type === "learn" && <> · {single.sources}</>}
          {single?.description && task.type === "learn" && (
            <>
              {" · "}
              <button className="link-btn small" onClick={() => setOpen((o) => !o)}>
                {open ? "weniger" : "worum geht's?"}
              </button>
            </>
          )}
        </div>
        {open && single?.description && <p className="small">{single.description}</p>}
      </div>
      <div className="task-actions">
        {resultPercent !== undefined && resultPercent !== null && onResult && (
          <button className="btn btn-ghost btn-sm" onClick={onResult}>
            {resultPercent} %
          </button>
        )}
        {actionLabel && onAction && (
          <button className={`btn btn-sm ${done ? "btn-ghost" : "btn-primary"}`} onClick={onAction} disabled={busy}>
            {actionLabel}
          </button>
        )}
      </div>
    </li>
  );
}
