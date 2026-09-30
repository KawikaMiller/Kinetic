import { useSyncExternalStore } from 'react';

const PREFIX = 'kinetic:';

/** Checks that a parsed value has the shape the store expects. */
export type ShapeGuard<T> = (value: unknown) => value is T;

/**
 * Parse a stored string, falling back when it's missing, not JSON, or valid JSON of
 * the wrong shape (a hand-edited value, or data from an older schema). Pure, for testing.
 */
export function parseStored<T>(raw: string | null, fallback: T, isValid: ShapeGuard<T>): T {
  if (raw == null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function read<T>(key: string, fallback: T, isValid: ShapeGuard<T>): T {
  try {
    return parseStored(localStorage.getItem(PREFIX + key), fallback, isValid);
  } catch {
    return fallback; // private window or blocked storage
  }
}

function write(key: string, value: unknown) {
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
 * A tiny localStorage-backed store that React can subscribe to. Never throws and
 * never hands back a value of the wrong shape: anything that fails `isValid`
 * becomes `fallback`, and if storage is unavailable it keeps working in memory.
 */
export function createPersistedStore<T>(key: string, fallback: T, isValid: ShapeGuard<T>): PersistedStore<T> {
  let value = read(key, fallback, isValid);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      write(key, next);
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

// Shape guards for the stores the app keeps.

export const isStringArray: ShapeGuard<string[]> = (v): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export const isBooleanRecord: ShapeGuard<Record<string, boolean>> = (v): v is Record<string, boolean> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'boolean');
