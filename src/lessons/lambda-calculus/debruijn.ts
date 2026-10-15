/**
 * The independent oracle: terms with de Bruijn indices, where a bound variable is the number of
 * binders between it and its own, so there are no names to capture and renaming never happens
 * (substitution shifts indices instead). Two terms are alpha-equivalent exactly when their de
 * Bruijn forms are equal. The lesson's named reducer is tested against this one; the learner
 * never sees indices.
 */
import type { Term } from './term';

export type DB =
  | { k: 'i'; i: number }
  | { k: 'f'; name: string }
  | { k: 'l'; body: DB }
  | { k: 'a'; fn: DB; arg: DB };

export function toDB(t: Term, bound: readonly string[] = []): DB {
  if (t.k === 'v') {
    const at = bound.indexOf(t.name);
    return at === -1 ? { k: 'f', name: t.name } : { k: 'i', i: at };
  }
  if (t.k === 'l') return { k: 'l', body: toDB(t.body, [t.param, ...bound]) };
  return { k: 'a', fn: toDB(t.fn, bound), arg: toDB(t.arg, bound) };
}

/** A string that is equal for two terms exactly when they are alpha-equivalent. */
export function dbKey(d: DB): string {
  if (d.k === 'i') return `#${d.i}`;
  if (d.k === 'f') return `'${d.name}`;
  if (d.k === 'l') return `(λ${dbKey(d.body)})`;
  return `(${dbKey(d.fn)} ${dbKey(d.arg)})`;
}

export const alphaKey = (t: Term) => dbKey(toDB(t));
export const alphaEqual = (a: Term, b: Term) => alphaKey(a) === alphaKey(b);

export const dbSize = (d: DB): number => (d.k === 'l' ? 1 + dbSize(d.body) : d.k === 'a' ? 1 + dbSize(d.fn) + dbSize(d.arg) : 1);

/** Adds `d` to every index at or above the cutoff `c`. */
function shift(t: DB, d: number, c = 0): DB {
  if (t.k === 'i') return t.i >= c ? { k: 'i', i: t.i + d } : t;
  if (t.k === 'f') return t;
  if (t.k === 'l') return { k: 'l', body: shift(t.body, d, c + 1) };
  return { k: 'a', fn: shift(t.fn, d, c), arg: shift(t.arg, d, c) };
}

/** Replaces index j by s inside t. */
function subst(t: DB, j: number, s: DB): DB {
  if (t.k === 'i') return t.i === j ? s : t;
  if (t.k === 'f') return t;
  if (t.k === 'l') return { k: 'l', body: subst(t.body, j + 1, shift(s, 1)) };
  return { k: 'a', fn: subst(t.fn, j, s), arg: subst(t.arg, j, s) };
}

const beta = (body: DB, arg: DB): DB => shift(subst(body, 0, shift(arg, 1)), -1);

/** One leftmost-outermost step, or null at a normal form. */
export function normalStep(t: DB): DB | null {
  if (t.k === 'a') {
    if (t.fn.k === 'l') return beta(t.fn.body, t.arg);
    const f = normalStep(t.fn);
    if (f) return { k: 'a', fn: f, arg: t.arg };
    const a = normalStep(t.arg);
    return a ? { k: 'a', fn: t.fn, arg: a } : null;
  }
  if (t.k === 'l') {
    const b = normalStep(t.body);
    return b ? { k: 'l', body: b } : null;
  }
  return null;
}

export interface OracleRun {
  status: 'normal' | 'budget' | 'too-big';
  steps: number;
  term: DB;
}

/** Normal-order reduction to a normal form, with the same budget and size guard as the lesson's reducer. */
export function oracleNormalise(start: DB, budget: number, maxSize: number): OracleRun {
  let term = start;
  for (let steps = 0; ; steps++) {
    const next = normalStep(term);
    if (!next) return { status: 'normal', steps, term };
    if (steps >= budget) return { status: 'budget', steps, term };
    term = next;
    if (dbSize(term) > maxSize) return { status: 'too-big', steps: steps + 1, term };
  }
}
