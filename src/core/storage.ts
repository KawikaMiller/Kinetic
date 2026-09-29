import { useSyncExternalStore } from 'react';

const PREFIX = 'kinetic:';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback; // private window, blocked storage, corrupt value
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the value lasts for this session only */
  }
}

export interface PersistedStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * A tiny localStorage-backed store that React can subscribe to. Never throws:
 * if storage is unavailable, it keeps working in memory for the session.
 */
export function createPersistedStore<T>(key: string, fallback: T): PersistedStore<T> {
  let value = readJSON(key, fallback);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      writeJSON(key, next);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Current value of a persisted store; re-renders when it changes. */
export function usePersistedStore<T>(store: PersistedStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
