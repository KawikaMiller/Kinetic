import { useSyncExternalStore } from 'react';

/**
 * A tiny external counter. A component bumps it from an effect after each commit, and a display
 * elsewhere subscribes, so showing the number never re-renders the thing being counted.
 */
export interface Counter {
  get: () => number;
  add: (n?: number) => void;
  reset: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createCounter(): Counter {
  let value = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => value,
    add: (n = 1) => {
      value += n;
      emit();
    },
    reset: () => {
      value = 0;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const useCount = (c: Counter): number => useSyncExternalStore(c.subscribe, c.get);
