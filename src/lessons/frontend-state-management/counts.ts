import { useSyncExternalStore } from 'react';
import { IDS, type Action, type CompId } from './model';

/**
 * Real render counts. Each component of the real tree reports a commit from an effect that runs after
 * every render of that component, and the displays subscribe from outside, so reading a count never
 * makes the counted component render.
 */
export interface RenderTally {
  bump: (id: CompId) => void;
  reset: () => void;
  get: (id: CompId) => number;
  /** A string that changes whenever any count does: "app:1,header:1". */
  key: () => string;
  subscribe: (listener: () => void) => () => void;
}

export function createTally(): RenderTally {
  const counts = new Map<CompId, number>();
  const listeners = new Set<() => void>();
  let key = '';
  const refresh = () => {
    key = IDS.filter((id) => counts.get(id)).map((id) => `${id}:${counts.get(id)}`).join(',');
    listeners.forEach((l) => l());
  };
  return {
    bump: (id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      refresh();
    },
    reset: () => {
      counts.clear();
      refresh();
    },
    get: (id) => counts.get(id) ?? 0,
    key: () => key,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const useTallyKey = (t: RenderTally): string => useSyncExternalStore(t.subscribe, t.key);
export const useTallyCount = (t: RenderTally, id: CompId): number => useSyncExternalStore(t.subscribe, () => t.get(id));

/** How the real tree learns about the learner's buttons, which live outside it. */
export interface ActionBus {
  send: (a: Action) => void;
  subscribe: (listener: (a: Action) => void) => () => void;
}

export function createBus(): ActionBus {
  const listeners = new Set<(a: Action) => void>();
  return {
    send: (a) => listeners.forEach((l) => l(a)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The counts as the model states them: each re-rendered component once. */
export const expectedKey = (rendered: readonly CompId[]): string => IDS.filter((id) => rendered.includes(id)).map((id) => `${id}:1`).join(',');
