import { useSyncExternalStore } from "react";

function getHash(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** Liefert die Pfadsegmente der aktuellen Hash-Route, z. B. ["test", "abc"]. */
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, getHash, getHash);
  return hash.split("?")[0].split("/").filter(Boolean);
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const target = `#${path}`;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = path;
  window.scrollTo({ top: 0 });
}
