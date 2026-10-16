import { useState } from 'react';
import { beginSession, submitOp, type OpSession, type OpSessionModel, type OpStart } from './opSession';

/**
 * The tree a stepper scene works on: the frames of the latest insert or delete, and the tree they end
 * with. `submit` reads the typed key, refuses what cannot go ahead (a note, nothing changes) and
 * otherwise starts the operation; `restart` loads a prepared one. The model should be a module-level
 * constant, so the hook is a thin `useState` over the pure transitions in `opSession.ts`.
 */
export function useOpSession<T, F>(model: OpSessionModel<T, F>, initial: () => OpStart<T>) {
  const [session, setSession] = useState<OpSession<T, F>>(() => beginSession(model, initial()));
  const restart = (start: OpStart<T>) => setSession(beginSession(model, start));
  const submit = (op: OpStart<T>['op'], keyText: string): boolean => {
    const next = submitOp(model, session, op, keyText);
    setSession(next.session);
    return next.started;
  };
  return { ...session, restart, submit };
}
