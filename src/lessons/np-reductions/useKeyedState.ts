import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * State that starts again from `init()` whenever `key` changes, without remounting the component: the scene keeps its
 * controls (and the keyboard focus on them) while the formula under it changes and its working state is thrown away.
 */
export function useKeyedState<T>(key: string, init: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [held, setHeld] = useState<{ key: string; value: T }>(() => ({ key, value: init() }));
  let current = held;
  if (held.key !== key) {
    current = { key, value: init() };
    setHeld(current);
  }
  const set: Dispatch<SetStateAction<T>> = (next) =>
    setHeld((h) => {
      const base = h.key === key ? h.value : init();
      return { key, value: typeof next === 'function' ? (next as (prev: T) => T)(base) : next };
    });
  return [current.value, set];
}
