import { useCallback } from 'react';
import { createPersistedStore, usePersistedStore } from './storage';

const doneStore = createPersistedStore<string[]>('done', []);

/** Which lessons the learner has completed, persisted to localStorage. */
export function useProgress() {
  const done = usePersistedStore(doneStore);
  const isDone = useCallback((id: string) => done.includes(id), [done]);
  const setDone = useCallback((id: string, value = true) => {
    const current = doneStore.get();
    const has = current.includes(id);
    if (value && !has) doneStore.set([...current, id]);
    if (!value && has) doneStore.set(current.filter((x) => x !== id));
  }, []);
  return { done, isDone, setDone };
}
