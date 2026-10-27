// Device settings (language, theme). These belong to this device, not to a save game.
// A tiny store: components read it with useSettings() and re-render when it changes.
import { useSyncExternalStore } from 'react';

export type Language = 'en' | 'de';
export type ThemePreference = 'system' | 'dark' | 'light';

export interface Settings {
  language: Language;
  theme: ThemePreference;
}

const STORAGE_KEY = 'am.settings.v1';

function defaultSettings(): Settings {
  const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return {
    language: browserLang.toLowerCase().startsWith('de') ? 'de' : 'en',
    theme: 'system',
  };
}

function load(): Settings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage blocked (private mode) or corrupt: fall back to defaults.
  }
  return defaults;
}

let current: Settings = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Not fatal: the setting still applies until the page is closed.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
