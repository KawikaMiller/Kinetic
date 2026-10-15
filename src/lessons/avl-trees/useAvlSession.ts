import { useState } from 'react';
import { opFrames, type AvlFrame } from './frames';
import { hasKey, sizeOf, type Tree } from './model';
import { parseKey, refuseOp } from './keys';

export interface AvlStart {
  base: Tree;
  op: 'insert' | 'delete';
  key: number;
}

interface Session {
  /** The tree after the last operation finished (the base for the next one). */
  tree: Tree;
  frames: AvlFrame[];
  /** Why the last request was refused, shown under the controls. */
  note: string | null;
}

const begin = ({ base, op, key }: AvlStart): Session => {
  const r = opFrames(base, op, key);
  return { tree: r.tree, frames: r.frames, note: null };
};

/**
 * The tree a stepper scene works on: the frames of the latest insert or delete, and the tree they end
 * with. `submit` reads the typed key, refuses what cannot go ahead (a message, nothing changes) and
 * otherwise starts the operation; `restart` loads a prepared one.
 */
export function useAvlSession(initial: () => AvlStart) {
  const [session, setSession] = useState<Session>(() => begin(initial()));
  const restart = (start: AvlStart) => setSession(begin(start));
  const submit = (op: 'insert' | 'delete', keyText: string): boolean => {
    const parsed = parseKey(keyText);
    const refusal = parsed.ok ? refuseOp(op, parsed.value, sizeOf(session.tree), hasKey(session.tree, parsed.value)) : parsed.error;
    if (refusal || !parsed.ok) {
      setSession({ ...session, note: refusal });
      return false;
    }
    setSession(begin({ base: session.tree, op, key: parsed.value }));
    return true;
  };
  return { ...session, restart, submit };
}
