import { useState, type CSSProperties } from "react";
import { addMonths, daysBetween, formatDay, formatLongDate, formatMinutes, formatMonth, monthGrid, todayISO } from "../lib/planner";
import { setTaskStatus } from "../lib/plans";
import { navigate } from "../router";
import type { PlanTask, StudyPlan, Subject } from "../types";
import { TaskRow } from "./PlanParts";

const WEEK_HEAD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const FALLBACK_COLOR = "#64748b";

interface DayPlan {
  plan: StudyPlan;
  subject?: Subject;
  tasks: PlanTask[];
}

const colorVar = (subject?: Subject) => ({ "--c": subject?.color ?? FALLBACK_COLOR }) as CSSProperties;

function untilText(today: string, date: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  return d > 0 ? `in ${d} Tagen` : "vorbei";
}

/** Monatskalender mit den Lernaufgaben aller Lernpläne und den Prüfungsterminen. */
export default function StudyCalendar({ plans, subjects }: { plans: StudyPlan[]; subjects: Subject[] }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const subjectOf = (p: StudyPlan) => subjects.find((s) => s.id === p.subjectId);

  const tasksByDate = new Map<string, DayPlan[]>();
  for (const plan of plans) {
    if (plan.status !== "active") continue;
    const byDate = new Map<string, PlanTask[]>();
    for (const t of plan.tasks) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
    for (const [date, tasks] of byDate) {
      tasksByDate.set(date, [...(tasksByDate.get(date) ?? []), { plan, subject: subjectOf(plan), tasks }]);
    }
  }
  const examsByDate = new Map<string, StudyPlan[]>();
  for (const p of plans) examsByDate.set(p.examDate, [...(examsByDate.get(p.examDate) ?? []), p]);
  const upcoming = plans.filter((p) => p.examDate >= today).sort((a, b) => a.examDate.localeCompare(b.examDate));

  function select(date: string) {
    setSelected(date);
    if (!date.startsWith(month)) setMonth(date.slice(0, 7));
  }

  const dayEntries = tasksByDate.get(selected) ?? [];
  const dayExams = examsByDate.get(selected) ?? [];
  const overdue =
    selected === today
      ? plans
          .filter((p) => p.status === "active")
          .map((p) => ({ plan: p, count: p.tasks.filter((t) => t.status === "open" && t.date < today).length }))
          .filter((o) => o.count > 0)
      : [];

  return (
    <section className="card stack-sm calendar">
      <div className="row-between">
        <h2>Kalender</h2>
        <div className="cal-nav">
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Vorheriger Monat" onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </button>
          <strong className="cal-month" aria-live="polite">
            {formatMonth(month)}
          </strong>
          <button className="btn btn-ghost btn-icon btn-sm" aria-label="Nächster Monat" onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={month === today.slice(0, 7) && selected === today}
            onClick={() => select(today)}
          >
            Heute
          </button>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="row-wrap cal-upcoming">
          {upcoming.map((p) => (
            <button key={p.id} className="cal-exam-chip" style={colorVar(subjectOf(p))} onClick={() => select(p.examDate)}>
              🎓 {subjectOf(p)?.name ?? p.title}: {formatDay(p.examDate)} · {untilText(today, p.examDate)}
            </button>
          ))}
        </div>
      )}

      <div className="cal-grid" role="group" aria-label={`Kalender ${formatMonth(month)}`}>
        {WEEK_HEAD.map((d) => (
          <div key={d} className="cal-head" aria-hidden="true">
            {d}
          </div>
        ))}
        {monthGrid(month).map((date) => {
          const entries = tasksByDate.get(date) ?? [];
          const exams = examsByDate.get(date) ?? [];
          const all = entries.flatMap((e) => e.tasks);
          const open = all.filter((t) => t.status === "open").length;
          const label = [
            formatLongDate(date),
            ...exams.map((p) => `Prüfung ${subjectOf(p)?.name ?? p.title}`),
            all.length ? `${all.length} ${all.length === 1 ? "Lernaufgabe" : "Lernaufgaben"}, ${open} offen` : "",
          ]
            .filter(Boolean)
            .join(", ");
          const classes = [
            "cal-day",
            date.startsWith(month) ? "" : "other",
            date === today ? "today" : "",
            date === selected ? "selected" : "",
          ].join(" ");
          return (
            <button key={date} className={classes} onClick={() => select(date)} aria-pressed={date === selected} aria-label={label}>
              <span className="cal-num">{Number(date.slice(8))}</span>
              <span className="cal-items" aria-hidden="true">
                {exams.map((p) => (
                  <span key={`e-${p.id}`} className="cal-item cal-exam" style={colorVar(subjectOf(p))}>
                    <span className="cal-text">🎓 {subjectOf(p)?.name ?? p.title}</span>
                  </span>
                ))}
                {entries.map(({ plan, subject, tasks }) => {
                  const openHere = tasks.filter((t) => t.status === "open").length;
                  const state = openHere === 0 ? "done" : date < today ? "overdue" : "";
                  return (
                    <span key={plan.id} className={`cal-item cal-task ${state}`} style={colorVar(subject)}>
                      <span className="cal-text">
                        {openHere === 0 && "✓ "}
                        {formatMinutes(tasks.reduce((s, t) => s + t.minutes, 0))} · {subject?.name ?? plan.title}
                      </span>
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
      <p className="muted small cal-legend">
        <span className="cal-legend-dot" /> Lernaufgaben · <span className="cal-legend-exam" /> Prüfung · Tippe auf einen Tag
        für Details.
      </p>

      <div className="cal-detail stack-sm" aria-live="polite">
        <h3>
          {formatLongDate(selected)}
          {selected === today && " · heute"}
        </h3>
        {dayExams.map((p) => (
          <a key={p.id} className="cal-exam-row" href={`#/plan/${p.id}`} style={colorVar(subjectOf(p))}>
            <strong>🎓 Prüfung {subjectOf(p)?.name ?? ""}</strong>
            <span className="muted small">{p.title}</span>
          </a>
        ))}
        {overdue.map(({ plan, count }) => (
          <p key={plan.id} className="callout callout-warn small">
            {count === 1 ? "1 Aufgabe" : `${count} Aufgaben`} aus vergangenen Tagen in „{plan.title}“{" "}
            {count === 1 ? "ist" : "sind"} noch offen – <a href={`#/plan/${plan.id}`}>im Plan neu verteilen</a>
          </p>
        ))}
        {dayEntries.map(({ plan, subject, tasks }) => (
          <div key={plan.id} className="stack-xs">
            <div className="row-between">
              <a className="cal-plan-link" href={`#/plan/${plan.id}`}>
                <span className="subject-dot" style={{ background: subject?.color ?? FALLBACK_COLOR }} />
                {plan.title}
              </a>
              <span className="muted small">
                {formatMinutes(tasks.reduce((s, t) => s + t.minutes, 0))} · Prüfung {untilText(selected, plan.examDate)}
              </span>
            </div>
            <ul className="task-list">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  busy={false}
                  onToggle={() => setTaskStatus(plan.id, t.id, t.status === "done" ? "open" : "done")}
                  onOpen={() => navigate(`/plan/${plan.id}?task=${t.id}`)}
                />
              ))}
            </ul>
          </div>
        ))}
        {dayEntries.length === 0 && dayExams.length === 0 && (
          <p className="muted small">
            {plans.some((p) => p.status === "active") ? "An diesem Tag ist nichts geplant." : "Sobald ein Lernplan erstellt ist, stehen hier seine Aufgaben."}
          </p>
        )}
      </div>
    </section>
  );
}
