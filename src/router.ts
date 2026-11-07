import { useSyncExternalStore } from "react";
import { IS_ARTIFACT } from "./platform";

/**
 * Kleiner Router. In der Web-Version steht die Route im URL-Hash (#/test/abc),
 * in claude.ai nur im Speicher, weil dort nur einfache Hashes erlaubt sind.
 * Links im Format href="#/..." funktionieren in beiden Varianten.
 */

let memoryPath = "/";
const listeners = new Set<() => void>();

function getPath(): string {
  if (IS_ARTIFACT) return memoryPath;
  return window.location.hash.replace(/^#/, "") || "/";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!IS_ARTIFACT) window.addEventListener("hashchange", listener);
  return () => {
    listeners.delete(listener);
    if (!IS_ARTIFACT) window.removeEventListener("hashchange", listener);
  };
}

if (IS_ARTIFACT && typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const anchor = (e.target as Element | null)?.closest?.("a[href^='#/']");
    if (!anchor) return;
    e.preventDefault();
    navigate(anchor.getAttribute("href")!.slice(1));
  });
}

/** Liefert die Pfadsegmente der aktuellen Route, z. B. ["test", "abc"]. */
export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, getPath, getPath);
  return path.split("?")[0].split("/").filter(Boolean);
}

/** Query-Parameter der aktuellen Route (z. B. ?from=...). */
export function routeQuery(): URLSearchParams {
  return new URLSearchParams(getPath().split("?")[1] ?? "");
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (IS_ARTIFACT) {
    memoryPath = path;
    listeners.forEach((l) => l());
  } else if (opts.replace) {
    window.location.replace(`#${path}`);
  } else {
    window.location.hash = path;
  }
  window.scrollTo({ top: 0 });
}
