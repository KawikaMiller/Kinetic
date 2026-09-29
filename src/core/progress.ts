import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'kinetic:done';
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

let snapshot = read();

function write(next: string[]) {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Which lessons the learner has completed, persisted to localStorage. */
export function useProgress() {
  const done = useSyncExternalStore(subscribe, () => snapshot);
  const isDone = useCallback((id: string) => done.includes(id), [done]);
  const setDone = useCallback((id: string, value = true) => {
    const has = snapshot.includes(id);
    if (value && !has) write([...snapshot, id]);
    if (!value && has) write(snapshot.filter((x) => x !== id));
  }, []);
  return { done, isDone, setDone };
}
