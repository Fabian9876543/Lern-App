import platform from "@platform-impl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addMark,
  askFollowUp,
  cancelExplain,
  clearExplainError,
  marksOf,
  needsAnswer,
  noteMaterials,
  removeMark,
  startExplain,
  useExplainJob,
} from "../lib/explain";
import { expandToFormulas, markAt, quoteOf, rangeAt, rangeOffsets, supportsHighlights, textMap } from "../lib/noteDom";
import {
  MARK_LEVELS,
  MAX_MARK_LENGTH,
  MAX_MARK_MESSAGES,
  basisLabel,
  locateAnchor,
  makeAnchor,
  streamingText,
} from "../lib/noteMarks";
import { applyFix, findInSource } from "../lib/noteEdit";
import { getState, repo, useStore } from "../store/store";
import type { NoteFix } from "../targets/types";
import type { MarkAnchor, MarkLevel, NoteMark, StudyNote } from "../types";
import Markdown from "./Markdown";
import Modal from "./Modal";

/**
 * Lernzettel, in dem man Stellen markieren kann, die man nicht mehr (genau)
 * weiß. Claude erklärt sie – aus dem Material, sonst aus seinem Wissen. Die
 * Markierungen bleiben farbig im Text und sind gespeichert.
 */

interface Candidate {
  quote: string;
  anchor: MarkAnchor;
  tooLong: boolean;
}

interface Located {
  id: string;
  level: MarkLevel;
  range: Range;
  start: number;
  length: number;
}

const HIGHLIGHT_NAMES: Record<MarkLevel, string> = { unsure: "lern-mark-unsure", forgot: "lern-mark-forgot" };

export function MarkableNote({
  note,
  hasMaterials,
  onEdit,
  children,
}: {
  note: StudyNote;
  /** Gibt es Material zum Lernzettel? (nur für den Hinweistext) */
  hasMaterials: boolean;
  /** Lernzettel bearbeiten – optional an einer bestimmten (markierten) Stelle. */
  onEdit?: (quote?: string) => void;
  /** Steht zwischen Lernzettel und markierten Stellen; als Funktion bekommt es die Markierungen in Textreihenfolge. */
  children?: ReactNode | ((ordered: NoteMark[]) => ReactNode);
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const located = useRef<Located[]>([]);
  const barBusy = useRef(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fixQuote, setFixQuote] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, number>>(() => new Map());
  const allMarks = useStore().marks;
  const marks = useMemo(() => marksOf(allMarks, note.id), [allMarks, note.id]);

  // Auswahl im Lernzettel verfolgen.
  useEffect(() => {
    let timer = 0;
    const read = (): Candidate | null => {
      const root = rootRef.current;
      const sel = document.getSelection();
      if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return null;
      const expanded = expandToFormulas(range);
      const map = textMap(root);
      const at = rangeOffsets(map, expanded);
      if (!at) return null;
      const exact = map.text.slice(at.start, at.end);
      if (exact.replace(/\s/g, "").length < 2) return null;
      return { quote: quoteOf(expanded), anchor: makeAnchor(map.text, at.start, at.end), tooLong: exact.length > MAX_MARK_LENGTH };
    };
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = read();
        // Tippt man auf die Leiste, verschwindet auf dem Handy die Auswahl – die Leiste bleibt dann stehen.
        if (next || !barBusy.current) setCandidate(next);
      }, 180);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.clearTimeout(timer);
    };
  }, []);

  // Markierungen im Text wiederfinden und einfärben.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const map = textMap(root);
    const list: Located[] = [];
    for (const m of marks) {
      const at = locateAnchor(map.text, m.anchor);
      const range = at && rangeAt(map, at.start, at.end);
      if (at && range) list.push({ id: m.id, level: m.level, range, start: at.start, length: at.end - at.start });
    }
    located.current = list;
    setPositions((prev) => {
      const next = new Map(list.map((l) => [l.id, l.start]));
      const same = prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v);
      return same ? prev : next;
    });
    if (!supportsHighlights()) return;
    for (const level of ["unsure", "forgot"] as const) {
      CSS.highlights.set(HIGHLIGHT_NAMES[level], new Highlight(...list.filter((l) => l.level === level).map((l) => l.range)));
    }
    return () => {
      CSS.highlights.delete(HIGHLIGHT_NAMES.unsure);
      CSS.highlights.delete(HIGHLIGHT_NAMES.forgot);
    };
  }, [note.content, marks]);

  const ordered = useMemo(
    () =>
      [...marks].sort((a, b) => {
        const pa = positions.get(a.id);
        const pb = positions.get(b.id);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return a.createdAt - b.createdAt;
      }),
    [marks, positions],
  );

  function hit(e: React.MouseEvent): string | null {
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) return null;
    return markAt(located.current, e.clientX, e.clientY);
  }

  function mark(level: MarkLevel) {
    if (!candidate || candidate.tooLong) return;
    const id = addMark(note.id, { quote: candidate.quote, anchor: candidate.anchor, level });
    document.getSelection()?.removeAllRanges();
    barBusy.current = false;
    setCandidate(null);
    if (id) setOpenId(id);
  }

  function dismiss() {
    document.getSelection()?.removeAllRanges();
    barBusy.current = false;
    setCandidate(null);
  }

  const source = hasMaterials ? "aus deinem Material" : "aus seinem Fachwissen";

  function edit() {
    const quote = candidate?.quote;
    dismiss();
    onEdit?.(quote);
  }

  function fix() {
    const quote = candidate?.quote;
    dismiss();
    if (quote) setFixQuote(quote);
  }

  return (
    <>
      <div className="note-toolbar">
        {marks.length === 0 ? (
          <p className="muted small mark-hint">
            <MarkerIcon /> Markiere eine Stelle, die du nicht mehr (genau) weißt – Claude erklärt sie dir {source}
            {platform.canSearchWeb ? " und sucht bei Bedarf im Internet" : ""}.
          </p>
        ) : (
          <span />
        )}
        {onEdit && (
          <button className="btn btn-ghost btn-sm note-edit-btn" onClick={() => onEdit()}>
            <PencilIcon /> Bearbeiten
          </button>
        )}
      </div>
      <article className="card">
        <div
          ref={rootRef}
          className="note-marks-root"
          onClick={(e) => {
            const id = hit(e);
            if (id) setOpenId(id);
          }}
          onMouseMove={(e) => {
            if (located.current.length) e.currentTarget.style.cursor = hit(e) ? "pointer" : "";
          }}
        >
          <Markdown className="study-note">{note.content}</Markdown>
        </div>
      </article>
      {typeof children === "function" ? children(ordered) : children}
      {marks.length > 0 && <MarkList marks={ordered} positions={positions} onOpen={setOpenId} />}
      {candidate && (
        <SelectionBar
          candidate={candidate}
          onMark={mark}
          onDismiss={dismiss}
          onEdit={onEdit ? edit : undefined}
          onFix={fix}
          onPointerDown={() => {
            barBusy.current = true;
            window.setTimeout(() => {
              barBusy.current = false;
              // Nur auf die Leiste getippt (kein Knopf) und die Auswahl ist weg: Leiste schließen.
              if (document.getSelection()?.isCollapsed ?? true) setCandidate(null);
            }, 800);
          }}
        />
      )}
      {fixQuote && (
        <FixDialog
          note={note}
          quote={fixQuote}
          onClose={() => setFixQuote(null)}
          onEdit={
            onEdit &&
            ((quote) => {
              setFixQuote(null);
              onEdit(quote);
            })
          }
        />
      )}
      {openId && (
        <MarkPanel
          markId={openId}
          onClose={() => setOpenId(null)}
          onEdit={
            onEdit &&
            ((quote) => {
              setOpenId(null);
              onEdit(quote);
            })
          }
        />
      )}
    </>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarkerIcon() {
  return (
    <svg className="mark-hint-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M15.5 4.5l4 4L10 18H6v-4l9.5-9.5zM4 21h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Stelle für kurze Vorschauen: eine Zeile, abgesetzte Formeln im Text (KaTeX setzt sie dann kleiner). */
function inlineQuote(quote: string): string {
  return quote
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => "$" + tex.trim() + "$")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

// ---------- Leiste zur Auswahl ----------

function SelectionBar({
  candidate,
  onMark,
  onDismiss,
  onEdit,
  onFix,
  onPointerDown,
}: {
  candidate: Candidate;
  onMark: (level: MarkLevel) => void;
  onDismiss: () => void;
  onEdit?: () => void;
  onFix: () => void;
  onPointerDown: () => void;
}) {
  const ai = platform.useAiStatus();
  return (
    <div
      className="mark-bar"
      role="region"
      aria-label="Ausgewählte Stelle"
      onPointerDown={onPointerDown}
      // Klick auf die Knöpfe soll die Auswahl nicht aufheben (Desktop).
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mark-bar-inner">
        <div className="mark-bar-text">
          <span className="mark-bar-label">Was ist mit dieser Stelle?</span>
          <Markdown className="mark-bar-quote">{inlineQuote(candidate.quote)}</Markdown>
        </div>
        {candidate.tooLong ? (
          <p className="small mark-bar-warn">Zum Erklären bitte eine kürzere Stelle markieren – höchstens etwa einen Absatz.</p>
        ) : (
          <div className="mark-bar-actions">
            <button className="btn btn-sm mark-btn mark-btn-unsure" onClick={() => onMark("unsure")}>
              {MARK_LEVELS.unsure.label}
            </button>
            <button className="btn btn-sm mark-btn mark-btn-forgot" onClick={() => onMark("forgot")}>
              {MARK_LEVELS.forgot.label}
            </button>
          </div>
        )}
        <div className="mark-bar-fix">
          <button
            className="btn btn-ghost btn-sm"
            onClick={onFix}
            disabled={ai.state === "unavailable"}
            title="Claude prüft die Stelle und schlägt eine Korrektur vor"
          >
            <PencilIcon /> Korrigieren lassen
          </button>
          {onEdit && (
            <button className="btn btn-ghost btn-sm" onClick={onEdit} title="Diese Stelle selbst im Lernzettel ändern">
              Selbst ändern
            </button>
          )}
        </div>
        <div className="mark-bar-tools">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onDismiss} aria-label="Nicht markieren">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Liste der markierten Stellen ----------

function MarkList({ marks, positions, onOpen }: { marks: NoteMark[]; positions: Map<string, number>; onOpen: (id: string) => void }) {
  return (
    <section className="card stack-sm mark-list" aria-labelledby="mark-list-title">
      <div className="row-between">
        <h2 id="mark-list-title">Markierte Stellen</h2>
        <span className="muted small">{marks.length}</span>
      </div>
      <ul className="mark-items">
        {marks.map((m) => (
          <MarkListItem key={m.id} mark={m} inText={positions.has(m.id)} onOpen={() => onOpen(m.id)} />
        ))}
      </ul>
      <p className="muted small">Antippen, um die Erklärung zu lesen oder nachzufragen. Im Lernzettel kannst du die farbigen Stellen auch direkt antippen.</p>
    </section>
  );
}

function MarkListItem({ mark, inText, onOpen }: { mark: NoteMark; inText: boolean; onOpen: () => void }) {
  const job = useExplainJob(mark.id);
  const running = !!job && !job.done;
  const questions = mark.messages.filter((x) => x.role === "user").length;
  const status = running
    ? "Claude erklärt …"
    : job?.error
      ? "Fehler – antippen"
      : needsAnswer(mark)
        ? "Noch nicht erklärt"
        : `Erklärung ansehen${questions ? ` · ${questions === 1 ? "1 Nachfrage" : `${questions} Nachfragen`}` : ""}`;
  return (
    <li>
      <button className={`mark-item mark-item-${mark.level}`} onClick={onOpen}>
        <Markdown className="mark-item-quote">{inlineQuote(mark.quote)}</Markdown>
        <span className="mark-item-meta">
          {MARK_LEVELS[mark.level].short} · {status}
          {mark.fixedAt ? " · im Lernzettel korrigiert" : !inText && " · steht so nicht mehr im Lernzettel"}
        </span>
      </button>
    </li>
  );
}

// ---------- Erklärung ----------

const FOLLOW_UPS = [
  { label: "Einfacher erklären", question: "Erklär es mir bitte noch einfacher – in kleinen Schritten, gern mit einem Vergleich aus dem Alltag." },
  { label: "Noch ein Beispiel", question: "Zeig mir bitte noch ein anderes, vollständig durchgerechnetes bzw. ausformuliertes Beispiel." },
  {
    label: "Typische Prüfungsaufgabe",
    question: "Wie könnte das in einer Prüfung drankommen? Gib mir eine typische Aufgabe dazu – erst die Aufgabe, darunter die Lösung.",
  },
];

function MarkPanel({ markId, onClose, onEdit }: { markId: string; onClose: () => void; onEdit?: (quote: string) => void }) {
  const mark = useStore().marks.find((m) => m.id === markId);
  const job = useExplainJob(markId);
  const ai = platform.useAiStatus();
  const [question, setQuestion] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mark) onClose();
  }, [mark, onClose]);
  if (!mark) return null;

  const running = !!job && !job.done;
  const failed = job?.done ? job.error : undefined;
  const waiting = needsAnswer(mark) && !running && !failed;
  const answered = !needsAnswer(mark) && !running;
  const full = mark.messages.length >= MAX_MARK_MESSAGES;

  function ask(q: string) {
    if (!q.trim()) return;
    askFollowUp(mark!.id, q);
    setQuestion("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
  }

  function retry() {
    clearExplainError(mark!.id);
    startExplain(mark!.id);
  }

  const footer = confirmDelete ? (
    <>
      <span className="small muted mark-footer-start">Markierung samt Erklärung löschen?</span>
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
        Behalten
      </button>
      <button
        className="btn btn-danger-solid btn-sm"
        onClick={() => {
          removeMark(mark.id);
          onClose();
        }}
      >
        Löschen
      </button>
    </>
  ) : (
    <>
      <button className="btn btn-ghost btn-danger btn-sm mark-footer-start" onClick={() => setConfirmDelete(true)}>
        Markierung löschen
      </button>
      <button className="btn btn-primary" onClick={onClose}>
        Fertig
      </button>
    </>
  );

  return (
    <Modal title="Erklärung" onClose={onClose} footer={footer}>
      <div className={`mark-quote mark-quote-${mark.level}`}>
        <span className={`chip mark-chip mark-chip-${mark.level}`}>{MARK_LEVELS[mark.level].label}</span>
        <Markdown className="mark-quote-text">{mark.quote}</Markdown>
      </div>

      {mark.messages.map((msg, i) =>
        msg.role === "user" ? (
          <div key={i} className="mark-question">
            <span className="muted small">Deine Nachfrage</span>
            <p>{msg.content}</p>
          </div>
        ) : (
          <MarkAnswer key={i} content={msg.content} basis={msg.basis} links={msg.links} />
        ),
      )}

      {running && (
        <div className="mark-answer stack-sm" aria-live="polite" aria-busy="true">
          <div className="row-between">
            <div className="note-writing">
              <div className="spinner spinner-sm" />
              <strong>Claude erklärt …</strong>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => cancelExplain(mark.id)}>
              Abbrechen
            </button>
          </div>
          {job.text ? (
            <Markdown className="study-note">{streamingText(job.text)}</Markdown>
          ) : (
            <p className="muted small">
              {mark.messages.length === 0 ? "Claude schaut sich die Stelle und dein Material an. " : ""}
              Du kannst das Fenster schließen – die Erklärung wird trotzdem gespeichert.
            </p>
          )}
        </div>
      )}

      {failed && (
        <div className="callout callout-error stack-sm">
          <span>{failed}</span>
          <div>
            <button className="btn btn-sm btn-ghost" onClick={retry} disabled={ai.state === "unavailable"}>
              Erneut versuchen
            </button>
          </div>
        </div>
      )}

      {waiting && (
        <div className="callout stack-sm">
          <span>
            {ai.state === "unavailable"
              ? ai.reason
              : mark.messages.length === 0
                ? "Diese Stelle ist noch nicht erklärt."
                : "Deine Nachfrage ist noch nicht beantwortet."}
          </span>
          <div>
            <button className="btn btn-sm btn-primary" onClick={retry} disabled={ai.state !== "ready"}>
              Erklären lassen
            </button>
          </div>
        </div>
      )}

      {answered &&
        (full ? (
          <p className="muted small">
            Zu dieser Stelle hast du schon viel nachgefragt. Markiere sie neu, wenn du weiterfragen möchtest.
          </p>
        ) : (
          <div className="mark-followup stack-sm">
            <span className="small muted">Noch nicht klar?</span>
            <div className="row-wrap">
              {FOLLOW_UPS.map((f) => (
                <button key={f.label} className="btn btn-ghost btn-sm" onClick={() => ask(f.question)} disabled={ai.state !== "ready"}>
                  {f.label}
                </button>
              ))}
            </div>
            <form
              className="mark-ask"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <textarea
                className="textarea"
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    ask(question);
                  }
                }}
                placeholder="Eigene Frage zu dieser Stelle …"
                aria-label="Eigene Frage zu dieser Stelle"
                maxLength={1000}
              />
              <button className="btn btn-primary" type="submit" disabled={!question.trim() || ai.state !== "ready"}>
                Fragen
              </button>
            </form>
          </div>
        ))}
      {!running && <FixSection mark={mark} onEdit={onEdit} />}
      <div ref={endRef} />
    </Modal>
  );
}

// ---------- Stelle im Lernzettel korrigieren ----------

type FixPhase = "idle" | "asking" | "running" | "proposal" | "done";

/** Korrektur zu einer markierten Stelle (im Erklärungsfenster). */
function FixSection({ mark, onEdit }: { mark: NoteMark; onEdit?: (quote: string) => void }) {
  return (
    <FixFlow
      noteId={mark.noteId}
      quote={mark.quote}
      history={mark.messages.map((m) => ({ role: m.role, content: m.content }))}
      fixed={!!mark.fixedAt}
      onApplied={() => repo.updateMark(mark.id, (m) => ({ ...m, fixedAt: Date.now() }))}
      onEdit={onEdit}
    />
  );
}

/** Direkt aus der Leiste: Stelle korrigieren lassen, ohne Erklärung und ohne Markierung. */
function FixDialog({
  note,
  quote,
  onClose,
  onEdit,
}: {
  note: StudyNote;
  quote: string;
  onClose: () => void;
  onEdit?: (quote: string) => void;
}) {
  return (
    <Modal title="Stelle korrigieren" onClose={onClose}>
      <div className="mark-quote mark-quote-fix">
        <Markdown className="mark-quote-text">{quote}</Markdown>
      </div>
      <p className="muted small">
        Claude prüft die Stelle{" "}
        {noteMaterials(note).length ? "anhand deines Materials" : "mit seinem Fachwissen"} und schlägt eine möglichst kleine
        Korrektur vor. Der Lernzettel ändert sich erst, wenn du sie übernimmst.
      </p>
      <FixFlow noteId={note.id} quote={quote} history={[]} startAsking onClose={onClose} onEdit={onEdit} />
    </Modal>
  );
}

function FixFlow({
  noteId,
  quote,
  history,
  fixed = false,
  startAsking = false,
  onApplied,
  onClose,
  onEdit,
}: {
  noteId: string;
  quote: string;
  history: { role: "user" | "assistant"; content: string }[];
  fixed?: boolean;
  /** Gleich mit dem Eingabefeld beginnen (eigenes Fenster). */
  startAsking?: boolean;
  onApplied?: () => void;
  /** Eigenes Fenster: Abbrechen/Verwerfen/Fertig schließen es. */
  onClose?: () => void;
  onEdit?: (quote: string) => void;
}) {
  const store = useStore();
  const note = store.notes.find((n) => n.id === noteId);
  const ai = platform.useAiStatus();
  const [phase, setPhase] = useState<FixPhase>(fixed ? "done" : startAsking ? "asking" : "idle");
  const [request, setRequest] = useState("");
  const [fix, setFix] = useState<NoteFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (!note) return null;

  async function propose() {
    setError(null);
    setPhase("running");
    const c = new AbortController();
    controller.current = c;
    try {
      const result = await platform.fixNotePassage({
        subjectName: store.subjects.find((x) => x.id === note!.subjectId)?.name ?? "",
        noteTitle: note!.topicName,
        noteContent: note!.content,
        quote,
        request,
        history,
        materials: noteMaterials(note!),
        signal: c.signal,
      });
      if (c.signal.aborted) return;
      setFix(result);
      setPhase("proposal");
    } catch (e) {
      if (c.signal.aborted) return;
      setError(platform.describeError(e));
      setPhase("asking");
    }
  }

  function accept() {
    const current = getState().notes.find((n) => n.id === noteId);
    if (!current || !fix) return;
    const next = applyFix(current.content, fix.old, fix.replacement, findInSource(current.content, quote)?.start);
    if (next === null) {
      setError("Claude hat die Stelle im Text nicht genau getroffen. Ändere sie bitte selbst.");
      return;
    }
    repo.updateNote(current.id, { content: next, editedAt: Date.now() });
    onApplied?.();
    setPhase("done");
  }

  /** Zurück zum Anfang – im eigenen Fenster heißt das: schließen. */
  const back = () => (onClose ? onClose() : setPhase("idle"));

  const selfEdit = onEdit && (
    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(quote)}>
      Selbst ändern
    </button>
  );

  if (phase === "done") {
    return (
      <div className="callout callout-ok mark-fix stack-sm">
        <span>✓ Diese Stelle ist im Lernzettel korrigiert.</span>
        {onClose && (
          <div>
            <button className="btn btn-primary btn-sm" onClick={onClose}>
              Fertig
            </button>
          </div>
        )}
      </div>
    );
  }
  if (phase === "idle") {
    return (
      <div className="mark-fix">
        <button className="btn btn-ghost btn-sm" onClick={() => setPhase("asking")}>
          <PencilIcon /> Stimmt hier etwas nicht? Im Lernzettel korrigieren
        </button>
      </div>
    );
  }
  if (phase === "running") {
    return (
      <div className="mark-fix practice-progress" aria-live="polite" aria-busy="true">
        <div className="spinner spinner-sm" />
        <span className="small">Claude prüft die Stelle und schlägt eine Korrektur vor …</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            controller.current?.abort();
            setPhase("asking");
          }}
        >
          Abbrechen
        </button>
      </div>
    );
  }
  if (phase === "asking") {
    return (
      <div className="mark-fix stack-sm">
        <label className="field">
          <span>Was ist falsch? (optional)</span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={600}
            value={request}
            placeholder="z. B. „Laut Skript sind es 19 %, nicht 16 %“ – leer lassen, dann prüft Claude selbst"
            onChange={(e) => setRequest(e.target.value)}
          />
        </label>
        {error && <p className="error-text small">{error}</p>}
        <div className="row-wrap">
          <button className="btn btn-primary btn-sm" onClick={propose} disabled={ai.state !== "ready"}>
            Korrektur vorschlagen
          </button>
          {selfEdit}
          <button className="btn btn-ghost btn-sm" onClick={back}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  }
  // Vorschlag
  if (!fix || !fix.old.trim()) {
    return (
      <div className="callout mark-fix stack-sm">
        <span>
          <strong>Claude meint, die Stelle stimmt.</strong> {fix?.reason}
        </span>
        <div className="row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={back}>
            OK
          </button>
          {selfEdit}
        </div>
      </div>
    );
  }
  return (
    <div className="mark-fix stack-sm">
      <strong>Korrekturvorschlag</strong>
      {fix.reason && <p className="small">{fix.reason}</p>}
      <div className="mark-fix-diff">
        <div className="mark-fix-old">
          <span className="small muted">Vorher</span>
          <Markdown className="study-note">{fix.old}</Markdown>
        </div>
        <div className="mark-fix-new">
          <span className="small muted">Nachher</span>
          <Markdown className="study-note">{fix.replacement}</Markdown>
        </div>
      </div>
      {error && <p className="error-text small">{error}</p>}
      <div className="row-wrap">
        <button className="btn btn-primary btn-sm" onClick={accept}>
          Übernehmen
        </button>
        <button className="btn btn-ghost btn-sm" onClick={back}>
          Verwerfen
        </button>
        {selfEdit}
      </div>
    </div>
  );
}

function MarkAnswer({ content, basis, links }: Pick<NoteMark["messages"][number], "content" | "basis" | "links">) {
  const label = basisLabel(basis);
  return (
    <div className="mark-answer stack-sm">
      <Markdown className="study-note">{content}</Markdown>
      {label && <p className={`mark-basis mark-basis-${label.tone}`}>{label.text}</p>}
      {links && links.length > 0 && (
        <div className="mark-links small">
          <span className="muted">Gefunden im Internet:</span>
          <ul>
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.title || hostOf(l.url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
