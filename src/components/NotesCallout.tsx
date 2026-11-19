const APP_PREFIX = "Hinweis der App: ";

/**
 * Hinweise zu einem Test oder Lernplan. Absätze, die mit „Hinweis der App:“
 * beginnen (z. B. zum verwendeten Auszug), stehen getrennt von Claudes Hinweisen.
 */
export default function NotesCallout({ notes }: { notes: string }) {
  const paragraphs = notes.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const app = paragraphs.filter((p) => p.startsWith(APP_PREFIX)).map((p) => p.slice(APP_PREFIX.length));
  const claude = paragraphs.filter((p) => !p.startsWith(APP_PREFIX));
  return (
    <>
      {app.map((text) => (
        <div key={text} className="callout callout-warn">
          <strong>Auszug verwendet:</strong> {text}
        </div>
      ))}
      {claude.length > 0 && (
        <div className="callout">
          <strong>Hinweis von Claude:</strong> {claude.join(" ")}
        </div>
      )}
    </>
  );
}
