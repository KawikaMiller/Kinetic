/**
 * The lesson's reducer on named terms: redexes, capture-avoiding substitution (with an alpha
 * rename when a free variable would be captured), a labelled-wrong naive substitution, the two
 * strategies, and a bounded run that says why it stopped. `debruijn.ts` is the independent check.
 */
import { alphaKey } from './debruijn';
import { allNames, app, freeVars, getAt, lam, replaceAt, termSize, v, type Path, type Term } from './term';

export type Mode = 'safe' | 'naive';
export type Strategy = 'normal' | 'applicative';

/** A run stops when a term grows past this many nodes. */
export const MAX_SIZE = 2000;
export const BUDGET_RANGE = { min: 10, max: 200 } as const;

const isRedex = (t: Term) => t.k === 'a' && t.fn.k === 'l';

/** Redex addresses in pre-order (outermost first, then left to right). */
export function redexPaths(t: Term, path: Path = ''): Path[] {
  const here = isRedex(t) ? [path] : [];
  if (t.k === 'a') return [...here, ...redexPaths(t.fn, `${path}f`), ...redexPaths(t.arg, `${path}a`)];
  if (t.k === 'l') return redexPaths(t.body, `${path}b`);
  return here;
}

/** Redex addresses in post-order (inner ones before the redexes that contain them, left to right). */
function redexPathsPost(t: Term, path: Path = ''): Path[] {
  const inner = t.k === 'a' ? [...redexPathsPost(t.fn, `${path}f`), ...redexPathsPost(t.arg, `${path}a`)] : t.k === 'l' ? redexPathsPost(t.body, `${path}b`) : [];
  return isRedex(t) ? [...inner, path] : inner;
}

/**
 * Normal order reduces the leftmost outermost redex. Applicative order here reduces the
 * leftmost innermost one (arguments first), under abstractions too.
 */
export function nextRedex(t: Term, strategy: Strategy): Path | null {
  const all = strategy === 'normal' ? redexPaths(t) : redexPathsPost(t);
  return all[0] ?? null;
}

/** A name that is not in `avoid`: the letter with the smallest number after it, like y1. */
export function freshName(base: string, avoid: ReadonlySet<string>): string {
  const letter = base[0];
  for (let i = 1; ; i++) if (!avoid.has(`${letter}${i}`)) return `${letter}${i}`;
}

function renameFree(t: Term, from: string, to: string): Term {
  if (t.k === 'v') return t.name === from ? v(to) : t;
  if (t.k === 'a') return app(renameFree(t.fn, from, to), renameFree(t.arg, from, to));
  return t.param === from ? t : lam(t.param, renameFree(t.body, from, to));
}

/** Where the free occurrences of x are inside a body, as addresses relative to the body. */
export function occurrencePaths(t: Term, x: string, path: Path = ''): Path[] {
  if (t.k === 'v') return t.name === x ? [path] : [];
  if (t.k === 'a') return [...occurrencePaths(t.fn, x, `${path}f`), ...occurrencePaths(t.arg, x, `${path}a`)];
  return t.param === x ? [] : occurrencePaths(t.body, x, `${path}b`);
}

export interface Rename {
  from: string;
  to: string;
  /** The abstraction that was renamed, as an address in the result. */
  at: Path;
}

interface Substitution {
  term: Term;
  /** Addresses (relative to the result) of the copies of the argument that replaced x. */
  copies: Path[];
  renames: Rename[];
  /** Naive mode: a free variable of the argument ended up under a binder of the same name. */
  captured: boolean;
}

/** M[x := N]. Safe mode renames a binder first when it would capture a free variable of N. */
export function substitute(body: Term, x: string, arg: Term, mode: Mode): Substitution {
  const copies: Path[] = [];
  const renames: Rename[] = [];
  let captured = false;
  const argFree = freeVars(arg);
  const go = (t: Term, path: Path): Term => {
    if (t.k === 'v') {
      if (t.name !== x) return t;
      copies.push(path);
      return arg;
    }
    if (t.k === 'a') return app(go(t.fn, `${path}f`), go(t.arg, `${path}a`));
    if (t.param === x) return t;
    const bodyFree = freeVars(t.body);
    if (argFree.has(t.param) && bodyFree.has(x)) {
      if (mode === 'naive') {
        captured = true;
        return lam(t.param, go(t.body, `${path}b`));
      }
      const avoid = new Set([...argFree, ...allNames(t.body), x]);
      const fresh = freshName(t.param, avoid);
      renames.push({ from: t.param, to: fresh, at: path });
      return lam(fresh, go(renameFree(t.body, t.param, fresh), `${path}b`));
    }
    return lam(t.param, go(t.body, `${path}b`));
  };
  return { term: go(body, ''), copies, renames, captured };
}

export interface Step {
  before: Term;
  after: Term;
  redex: Path;
  binder: string;
  argument: Term;
  /** In `before`: where the replaced variable occurs inside the redex's body. */
  occurrences: Path[];
  /** In `after`: the copies of the argument that were put in. */
  replaced: Path[];
  renames: Rename[];
  captured: boolean;
  mode: Mode;
}

export function stepAt(t: Term, path: Path, mode: Mode = 'safe'): Step | null {
  const node = getAt(t, path);
  if (node.k !== 'a' || node.fn.k !== 'l') return null;
  const { param, body } = node.fn;
  const sub = substitute(body, param, node.arg, mode);
  return {
    before: t,
    after: replaceAt(t, path, sub.term),
    redex: path,
    binder: param,
    argument: node.arg,
    occurrences: occurrencePaths(body, param).map((p) => `${path}fb${p}`),
    replaced: sub.copies.map((p) => `${path}${p}`),
    renames: sub.renames.map((r) => ({ ...r, at: `${path}${r.at}` })),
    captured: sub.captured,
    mode,
  };
}

export type RunEnd =
  | { kind: 'normal' }
  | { kind: 'budget' }
  | { kind: 'too-big'; size: number }
  /** The term after `at` steps is alpha-equal to the term after `first` steps: a certificate that reduction repeats. */
  | { kind: 'loop'; first: number; at: number };

export interface Run {
  /** The start and the term after each step. */
  terms: Term[];
  end: RunEnd;
}

/** Reduces with a strategy until a normal form, the budget, the size guard, or a repeated term. */
export function run(start: Term, strategy: Strategy, budget: number, mode: Mode = 'safe'): Run {
  const terms = [start];
  const seen = new Map([[alphaKey(start), 0]]);
  for (let n = 0; n < budget; n++) {
    const at = nextRedex(terms[n], strategy);
    if (at === null) return { terms, end: { kind: 'normal' } };
    const step = stepAt(terms[n], at, mode);
    if (!step) throw new Error('nextRedex gave a path that is not a redex');
    terms.push(step.after);
    const size = termSize(step.after);
    if (size > MAX_SIZE) return { terms, end: { kind: 'too-big', size } };
    const key = alphaKey(step.after);
    const first = seen.get(key);
    if (first !== undefined) return { terms, end: { kind: 'loop', first, at: n + 1 } };
    seen.set(key, n + 1);
  }
  return { terms, end: nextRedex(terms[budget], strategy) === null ? { kind: 'normal' } : { kind: 'budget' } };
}

export const stepsOf = (r: Run) => r.terms.length - 1;
export const finalTerm = (r: Run) => r.terms[r.terms.length - 1];
