/**
 * The state a tree stepper scene keeps: the frames of the latest insert or delete, the tree they end
 * with (the base of the next operation) and why the last request was refused. Pure transitions;
 * `useOpSession` is the thin React hook over them (avl-trees, red-black-trees).
 */
import { parseKey, refuseOp } from './keyInput';

export interface OpStart<T> {
  /** The tree the operation runs on. */
  base: T;
  op: 'insert' | 'delete';
  key: number;
}

/** What a lesson supplies: how its tree runs one operation, and the two facts a refusal needs. */
export interface OpSessionModel<T, F> {
  /** Runs one operation: the tree it ends with and the frames to step through. */
  run(start: OpStart<T>): { tree: T; frames: F[] };
  sizeOf(tree: T): number;
  hasKey(tree: T, key: number): boolean;
}

export interface OpSession<T, F> {
  /** The tree after the last operation finished (the base for the next one). */
  tree: T;
  frames: F[];
  /** Why the last request was refused, shown under the controls. */
  note: string | null;
}

export const beginSession = <T, F>(model: OpSessionModel<T, F>, start: OpStart<T>): OpSession<T, F> => {
  const { tree, frames } = model.run(start);
  return { tree, frames, note: null };
};

export interface Submitted<T, F> {
  session: OpSession<T, F>;
  /** True when the operation started; false when it was refused (the session then only carries the note). */
  started: boolean;
}

/** Reads the typed key, refuses what cannot go ahead (a note, nothing else changes) and otherwise starts the operation. */
export function submitOp<T, F>(model: OpSessionModel<T, F>, session: OpSession<T, F>, op: OpStart<T>['op'], keyText: string): Submitted<T, F> {
  const parsed = parseKey(keyText);
  const refusal = parsed.ok ? refuseOp(op, parsed.value, model.sizeOf(session.tree), model.hasKey(session.tree, parsed.value)) : parsed.error;
  if (refusal || !parsed.ok) return { session: { ...session, note: refusal }, started: false };
  return { session: beginSession(model, { base: session.tree, op, key: parsed.value }), started: true };
}
