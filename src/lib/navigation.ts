import type { StoreState } from "../store/store";

type Data = Pick<StoreState, "subjects" | "tests" | "attempts" | "plans" | "notes">;

function segments(path: string): string[] {
  return path.split("?")[0].split("/").filter(Boolean);
}

/** Die übergeordnete Seite – Ziel von „Zurück“, wenn es keine vorherige Seite gibt. */
export function parentPath(path: string, data: Data): string {
  const [section, id, sub] = segments(path);
  switch (section) {
    case "subject":
      return sub ? `/subject/${id}` : "/";
    case "note": {
      const note = data.notes.find((n) => n.id === id);
      return note ? `/subject/${note.subjectId}` : "/";
    }
    case "plan": {
      if (sub === "note") return `/plan/${id}`;
      const plan = data.plans.find((p) => p.id === id);
      return plan ? `/subject/${plan.subjectId}` : "/";
    }
    case "test": {
      const test = data.tests.find((t) => t.id === id);
      return test ? `/subject/${test.subjectId}` : "/";
    }
    case "run":
    case "result": {
      const attempt = data.attempts.find((a) => a.id === id);
      const test = attempt && data.tests.find((t) => t.id === attempt.testId);
      if (!test) return "/";
      if (section === "result" && test.planId && data.plans.some((p) => p.id === test.planId)) return `/plan/${test.planId}`;
      return `/test/${test.id}`;
    }
    default:
      return "/";
  }
}

/** Gibt es die Seite noch? (Gelöschte Tests usw. überspringt „Zurück“.) */
export function routeExists(path: string, data: Data): boolean {
  const [section, id] = segments(path);
  switch (section) {
    case undefined:
    case "settings":
      return true;
    case "subject":
      return data.subjects.some((s) => s.id === id);
    case "note":
      return data.notes.some((n) => n.id === id);
    case "plan":
      return data.plans.some((p) => p.id === id);
    case "test":
      return data.tests.some((t) => t.id === id);
    case "run":
      // Ein beendeter Durchlauf leitet nur noch zum Ergebnis weiter.
      return data.attempts.some((a) => a.id === id && a.status !== "finished");
    case "result":
      return data.attempts.some((a) => a.id === id);
    default:
      return false;
  }
}
