import { useState } from 'react';
import { rbFrames, type RbFrame } from './frames';
import { parseKey, refuseOp } from './keys';
import { hasKey, sizeOf, type RbTree } from './model';

export interface RbStart {
  base: RbTree;
  op: 'insert' | 'delete';
  key: number;
}

interface Session {
  /** The tree after the last operation finished (the base for the next one). */
  tree: RbTree;
  frames: RbFrame[];
  /** Why the last request was refused, shown under the controls. */
  note: string | null;
}

const begin = ({ base, op, key }: RbStart): Session => {
  const r = rbFrames(base, op, key);
  return { tree: r.tree, frames: r.frames, note: null };
};

/**
 * The tree a stepper scene works on: the frames of the latest insert or delete and the tree they end
 * with. `submit` reads the typed key, refuses what cannot go ahead (a message, nothing changes) and
 * otherwise starts the operation; `restart` loads a prepared one.
 */
export function useRbSession(initial: () => RbStart) {
  const [session, setSession] = useState<Session>(() => begin(initial()));
  const restart = (start: RbStart) => setSession(begin(start));
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
