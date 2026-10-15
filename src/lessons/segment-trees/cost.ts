import { mulberry32, randInt, type Rnd } from '../../core/random';
import { fenAdd, fenBuild, fenRange } from './fenwick';
import { buildTree, queryRange, setCell } from './model';

/**
 * The one unit of scene 1, "cells touched": one per cell or node an operation reads or writes. A prefix array
 * counts the cells it reads (a query) or rewrites (an update), a Fenwick tree each cell on its hop path, and a
 * segment tree every node its walk enters, partial nodes included: their aggregates are not read, but the walk
 * has to stand on them to find the covered nodes. Recomputing a node from its children is not counted again.
 */
export type Request = { kind: 'update'; index: number; value: number } | { kind: 'query'; l: number; r: number };

export type CostRank = 'bad' | 'ok' | 'muted';

/** Colour each total by where it ranks: the costliest is `bad`, the cheapest `ok`, the rest `muted`; all equal means no verdict. */
export function rankCosts(costs: Costs): Record<keyof Costs, CostRank> {
  const values = Object.values(costs);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const rank = (v: number): CostRank => (high === low ? 'muted' : v === high ? 'bad' : v === low ? 'ok' : 'muted');
  return { prefix: rank(costs.prefix), segment: rank(costs.segment), fenwick: rank(costs.fenwick) };
}

export interface Costs {
  prefix: number;
  segment: number;
  fenwick: number;
}

/** Operations in the mixed workload of scene 1. */
export const WORKLOAD_SIZE = 20;
export const VALUE_LIMIT = 9;

/** A seeded run of requests: each is an update with probability `updatePct` percent, else a range query. */
export function makeWorkload(n: number, count: number, updatePct: number, seed: number): Request[] {
  const rnd: Rnd = mulberry32(seed);
  return Array.from({ length: count }, (): Request => {
    if (rnd() * 100 < updatePct) return { kind: 'update', index: randInt(0, n - 1, rnd), value: randInt(-VALUE_LIMIT, VALUE_LIMIT, rnd) };
    const a = randInt(0, n - 1, rnd);
    const b = randInt(0, n - 1, rnd);
    return { kind: 'query', l: Math.min(a, b), r: Math.max(a, b) };
  });
}

/** Cells a prefix-sum array writes when cell i changes: every prefix from i + 1 to n. */
export const prefixUpdateCells = (n: number, index: number): number => n - index;
/** Cells it reads to answer any range: two prefixes. */
export const PREFIX_QUERY_CELLS = 2;

export interface WorkloadRun {
  costs: Costs;
  /** The answer each design gave to each query, in order, for checking against a naive loop. */
  answers: { prefix: number[]; segment: number[]; fenwick: number[] };
  /** The array after the updates. */
  values: number[];
}

/** Run the same requests on a prefix-sum array, a segment tree and a Fenwick tree, counting cells touched. */
export function runWorkload(initial: readonly number[], requests: readonly Request[]): WorkloadRun {
  const n = initial.length;
  const values = [...initial];
  const prefix = [0];
  for (const v of initial) prefix.push(prefix[prefix.length - 1] + v);
  let seg = buildTree(initial, 'sum');
  let fen = fenBuild(initial, 'sum');
  const costs: Costs = { prefix: 0, segment: 0, fenwick: 0 };
  const answers = { prefix: [] as number[], segment: [] as number[], fenwick: [] as number[] };
  for (const q of requests) {
    if (q.kind === 'update') {
      const delta = q.value - values[q.index];
      values[q.index] = q.value;
      for (let j = q.index + 1; j <= n; j++) prefix[j] += delta;
      costs.prefix += prefixUpdateCells(n, q.index);
      const s = setCell(seg, q.index, q.value);
      seg = s.tree;
      costs.segment += s.touched;
      const f = fenAdd(fen, q.index + 1, delta, 'sum');
      fen = f.tree;
      costs.fenwick += f.hops.length;
    } else {
      answers.prefix.push(prefix[q.r + 1] - prefix[q.l]);
      costs.prefix += PREFIX_QUERY_CELLS;
      const s = queryRange(seg, q.l, q.r);
      answers.segment.push(s.value as number);
      seg = s.tree;
      costs.segment += s.touched;
      const f = fenRange(fen, q.l + 1, q.r + 1, 'sum');
      answers.fenwick.push(f.value);
      costs.fenwick += f.hopsR.length + f.hopsL.length;
    }
  }
  return { costs, answers, values };
}
