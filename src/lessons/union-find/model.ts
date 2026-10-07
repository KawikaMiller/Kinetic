import { createDisjointSet, type DsuEvent } from '../../core/disjointSet';

/** Elements in the lesson's sets. */
export const N = 10;

export type Op = { kind: 'union'; a: number; b: number } | { kind: 'find'; a: number };

export interface Opts {
  byRank: boolean;
  compress: boolean;
}

/** One operation replayed: what happened, and the structure before and after it. */
export interface Step {
  op: Op;
  events: DsuEvent[];
  before: number[];
  after: number[];
  ranksBefore: number[];
  ranksAfter: number[];
  /** Parent pointers followed by this operation's finds (a union runs two). */
  hops: number;
  /** Tallest tree after the operation. */
  height: number;
  count: number;
}

export const opLabel = (op: Op) => (op.kind === 'union' ? `union(${op.a}, ${op.b})` : `find(${op.a})`);

/** Parent pointers followed: a find that walks a path of k nodes follows k - 1 pointers. */
export const hopsOf = (events: readonly DsuEvent[]) => events.reduce((sum, e) => sum + (e.kind === 'find' ? e.path.length - 1 : 0), 0);

/** Run `ops` from n singletons with the given optimisations, recording every step. */
export function replay(n: number, ops: readonly Op[], opts: Opts): Step[] {
  const ds = createDisjointSet(n, { ...opts, trace: true });
  return ops.map((op) => {
    const before = ds.parents();
    const ranksBefore = ds.ranks();
    const from = ds.events.length;
    if (op.kind === 'union') ds.union(op.a, op.b);
    else ds.find(op.a);
    const events = ds.events.slice(from);
    return { op, events, before, after: ds.parents(), ranksBefore, ranksAfter: ds.ranks(), hops: hopsOf(events), height: ds.height(), count: ds.count };
  });
}

/** The root of x, following parent pointers (no compression). */
export function rootOf(parents: readonly number[], x: number): number {
  while (parents[x] !== x) x = parents[x];
  return x;
}

/** The sets, each sorted, ordered by smallest member. */
export function setsOf(parents: readonly number[]): number[][] {
  const groups = new Map<number, number[]>();
  parents.forEach((_, i) => {
    const r = rootOf(parents, i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()].sort((a, b) => a[0] - b[0]);
}

export interface Totals {
  hops: number;
  maxHeight: number;
  finalHeight: number;
}

export function totals(n: number, ops: readonly Op[], opts: Opts): Totals {
  const steps = replay(n, ops, opts);
  return {
    hops: steps.reduce((s, x) => s + x.hops, 0),
    maxHeight: Math.max(0, ...steps.map((s) => s.height)),
    finalHeight: steps[steps.length - 1]?.height ?? 0,
  };
}

export const COMBOS: readonly { opts: Opts; label: string }[] = [
  { opts: { byRank: false, compress: false }, label: 'Neither' },
  { opts: { byRank: true, compress: false }, label: 'Rank only' },
  { opts: { byRank: false, compress: true }, label: 'Compression only' },
  { opts: { byRank: true, compress: true }, label: 'Both' },
];

const U = (a: number, b: number): Op => ({ kind: 'union', a, b });
const F = (a: number): Op => ({ kind: 'find', a });

/** Each union hangs the old chain under a new element: without rank, one tall chain. */
export const CHAIN: readonly Op[] = [...Array.from({ length: N - 1 }, (_, i) => U(i + 1, i)), F(0), F(0)];

/**
 * A 30-operation workload: a chain grows one element at a time with the odd query along
 * the way, then mostly queries (finds, and unions of elements already connected), which
 * is how union-find spends its life.
 */
export const SCRIPT: readonly Op[] = [
  U(1, 0), U(2, 1), U(3, 2), F(0),
  U(4, 3), U(5, 4), U(6, 5), F(0),
  U(7, 6), U(8, 7), U(9, 8), F(0), F(1),
  U(9, 0), U(2, 5),
  F(3), F(4), F(5), F(6), F(7), F(8),
  U(1, 8),
  F(0), F(2), F(4), F(6), F(8), F(9), F(3), F(1),
];

/** Largest operation list the free playground keeps. */
export const MAX_OPS = 200;
