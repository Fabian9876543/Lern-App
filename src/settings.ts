import { useSyncExternalStore } from "react";

export interface Settings {
  apiKey: string;
  generationModel: string;
  gradingModel: string;
}

export const MODELS: { id: string; label: string; hint: string }[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "beste Qualität" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "schnell & günstiger" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "am günstigsten" },
];

const STORAGE_KEY = "lern-app-settings";

const DEFAULTS: Settings = {
  apiKey: "",
  generationModel: "claude-opus-5-5",
  gradingModel: "claude-opus-5-5",
};

let cache: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function saveSettings(patch: Partial<Settings>): void {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Speicher nicht verfügbar – Einstellungen gelten nur für diese Sitzung.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
