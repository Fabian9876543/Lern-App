import { useEffect, useRef, useSyncExternalStore } from "react";
import { NavHistory, type NavResult } from "./lib/navHistory";
import { IS_ARTIFACT } from "./platform";

/**
 * Kleiner Router. In der Web-Version steht die Route im URL-Hash (#/test/abc)
 * und der Browser-Verlauf gilt (Zurück-Taste des Browsers funktioniert);
 * in claude.ai steht sie nur im Speicher, weil dort nur einfache Hashes
 * erlaubt sind – dort führt die App den Verlauf selbst (siehe NavHistory).
 * Links im Format href="#/..." funktionieren in beiden Varianten.
 */

const listeners = new Set<() => void>();
const leaveGuards = new Set<() => void>();
const memory = new NavHistory("/");

/** Eintrag im Browser-Verlauf (Web-Version) */
interface WebState {
  idx: number;
  prev: string | null;
  scroll?: number;
}

let webPath = "/";
let webIdx = 0;

function hashPath(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

function webState(): WebState | null {
  const s = window.history.state as WebState | null;
  return s && typeof s.idx === "number" ? s : null;
}

function getPath(): string {
  if (IS_ARTIFACT) return memory.current.path;
  return hashPath();
}

function emit() {
  listeners.forEach((l) => l());
}

/** Vor jedem Seitenwechsel: z. B. Antwortentwürfe sichern. */
function runLeaveGuards() {
  for (const guard of leaveGuards) {
    try {
      guard();
    } catch (e) {
      console.error(e);
    }
  }
}

function scrollAfterRender(top: number) {
  if (top <= 0) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  // Erst nach dem Zeichnen der Seite ist sie lang genug.
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" })));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  // Interne Links laufen über navigate(), damit der Verlauf stimmt.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element | null)?.closest?.("a[href^='#/']");
    if (!anchor || anchor.getAttribute("target")) return;
    e.preventDefault();
    navigate(anchor.getAttribute("href")!.slice(1));
  });

  if (!IS_ARTIFACT) {
    window.history.scrollRestoration = "manual";
    const s = webState();
    if (!s) window.history.replaceState({ idx: 0, prev: null } satisfies WebState, "");
    webIdx = s?.idx ?? 0;
    webPath = hashPath();
    const onBrowserNavigation = () => {
      const path = hashPath();
      if (path === webPath) return;
      runLeaveGuards();
      let state = webState();
      if (!state) {
        // Adresse von Hand geändert
        state = { idx: webIdx + 1, prev: webPath };
        window.history.replaceState(state, "");
      }
      webPath = path;
      webIdx = state.idx;
      emit();
      scrollAfterRender(state.scroll ?? 0);
    };
    window.addEventListener("popstate", onBrowserNavigation);
    window.addEventListener("hashchange", onBrowserNavigation);
  }
}

/** Liefert die Pfadsegmente der aktuellen Route, z. B. ["test", "abc"]. */
export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, getPath, getPath);
  return path.split("?")[0].split("/").filter(Boolean);
}

/** Aktueller Pfad samt Query, z. B. "/plan/abc?task=x". */
export function currentPath(): string {
  return getPath();
}

/** Query-Parameter der aktuellen Route (z. B. ?from=...). */
export function routeQuery(): URLSearchParams {
  return new URLSearchParams(getPath().split("?")[1] ?? "");
}

function applyMemory(result: NavResult) {
  emit();
  scrollAfterRender(result.restored ? result.entry.scroll : 0);
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (IS_ARTIFACT) {
    runLeaveGuards();
    applyMemory(opts.replace ? memory.replace(path) : memory.push(path, window.scrollY));
    return;
  }
  const state = webState() ?? { idx: webIdx, prev: null };
  if (state.prev === path && state.idx > 0) {
    // Die Seite davor: zurückgehen statt einen neuen Eintrag anzulegen.
    window.history.back();
    return;
  }
  if (path === webPath && !opts.replace) return;
  runLeaveGuards();
  if (opts.replace) {
    window.history.replaceState({ idx: state.idx, prev: state.prev } satisfies WebState, "", `#${path}`);
  } else {
    window.history.replaceState({ ...state, scroll: window.scrollY } satisfies WebState, "");
    webIdx = state.idx + 1;
    window.history.pushState({ idx: webIdx, prev: webPath } satisfies WebState, "", `#${path}`);
  }
  webPath = path;
  emit();
  scrollAfterRender(0);
}

/**
 * Zur vorherigen Seite. Gibt es keine (z. B. direkt geöffneter Link), geht es
 * zu `fallback` (der übergeordneten Seite). Seiten, für die `skip` true
 * liefert (z. B. inzwischen gelöscht), werden in claude.ai übersprungen.
 */
export function goBack(fallback: string, skip?: (path: string) => boolean): void {
  if (IS_ARTIFACT) {
    runLeaveGuards();
    applyMemory(memory.back(fallback, skip));
    return;
  }
  if ((webState()?.idx ?? 0) > 0) window.history.back();
  else navigate(fallback, { replace: true });
}

/** `fn` läuft, bevor die Seite verlassen wird (z. B. um Eingaben zu speichern). */
export function useLeaveGuard(fn: () => void): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const guard = () => ref.current();
    leaveGuards.add(guard);
    return () => {
      leaveGuards.delete(guard);
    };
  }, []);
}
