import { numberedItems, splitNotes } from "../lib/notes";

/**
 * Hinweise zu einem Test oder Lernplan. Absätze, die mit „Hinweis der App:“
 * beginnen (z. B. zum verwendeten Auszug), stehen getrennt von Claudes Hinweisen.
 * `collapsed`: zugeklappt am Seitenende (bei Bedarf aufklappen).
 */
export default function NotesCallout({ notes, collapsed = false }: { notes: string; collapsed?: boolean }) {
  const { app, claude } = splitNotes(notes);
  const items = numberedItems(claude);

  const appNotes = app.map((text) => (
    <div key={text} className="callout callout-warn">
      <strong>Auszug verwendet:</strong> {text}
    </div>
  ));
  const claudeText =
    items.length > 1 ? (
      <ol className="notes-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    ) : (
      items[0]
    );

  if (collapsed) {
    if (!app.length && !items.length) return null;
    return (
      <details className="card note-sources notes-details">
        <summary>
          <strong>Hinweise von Claude</strong>
          <span className="muted small">
            {items.length > 1 && ` · ${items.length} Hinweise`}
            {app.length > 0 && " · Auszug verwendet"}
          </span>
        </summary>
        <div className="stack-sm note-sources-body">
          {appNotes}
          {items.length > 0 && <div className="notes-text">{claudeText}</div>}
        </div>
      </details>
    );
  }

  return (
    <>
      {appNotes}
      {items.length > 0 && (
        <div className="callout">
          <strong>Hinweis von Claude:</strong> {items.length > 1 ? claudeText : items[0]}
        </div>
      )}
    </>
  );
}
