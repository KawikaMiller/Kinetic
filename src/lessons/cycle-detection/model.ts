import { randInt, shuffle, type Rnd } from '../../core/random';

/**
 * Floyd's tortoise and hare, as pure functions over a "next" function: a linked list given
 * as next[i] (null = end of list), or an array read as i → a[i].
 */

export type Next = (i: number) => number | null;

/** A rho-shaped list: a tail of mu nodes, then a loop of lambda nodes (or, with `loop` off, a plain list ending in null). */
export function rho(mu: number, lambda: number, loop = true): (number | null)[] {
  const n = mu + lambda;
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? i + 1 : loop ? mu : null));
}

export interface Pos {
  slow: number;
  fast: number | null;
}

export interface FloydRun {
  /** Phase 1 positions after each step (step 0 = both at the head). */
  phase1: Pos[];
  /** Where they met, or null when fast ran off the end. */
  meet: number | null;
  /** Phase 2 positions: slow from the head, fast from the meeting point, both one step at a time. */
  phase2: Pos[];
  /** The first node of the loop (index into the walk: the tail length mu). */
  start: number | null;
  /** Phase 3: the loop nodes in order from the start. */
  loop: number[];
}

/** Floyd's algorithm from `head`. Stops after `limit` phase-1 steps as a safety net. */
export function floyd(next: Next, head = 0, limit = 10_000): FloydRun {
  const phase1: Pos[] = [{ slow: head, fast: head }];
  let slow = head;
  let fast: number | null = head;
  let meet: number | null = null;
  for (let k = 0; k < limit; k++) {
    const f1: number | null = fast === null ? null : next(fast);
    fast = f1 === null ? null : next(f1);
    slow = next(slow) ?? slow;
    phase1.push({ slow, fast });
    if (fast === null) break;
    if (slow === fast) {
      meet = slow;
      break;
    }
  }
  if (meet === null) return { phase1, meet, phase2: [], start: null, loop: [] };

  const phase2: Pos[] = [{ slow: head, fast: meet }];
  let p = head;
  let q = meet;
  while (p !== q) {
    p = next(p)!;
    q = next(q)!;
    phase2.push({ slow: p, fast: q });
  }
  const loop = [p];
  for (let x = next(p)!; x !== p; x = next(x)!) loop.push(x);
  return { phase1, meet, phase2, start: p, loop };
}

/** Slow's steps until the meeting (phase 1 length). */
export const meetSteps = (r: FloydRun) => r.phase1.length - 1;

/**
 * The proof numbers from a run: slow took k = mu + a steps, a of them inside the loop (the
 * meeting node is a mod lambda into it); fast took 2k; k is a whole number of loops, so mu ≡ −a (mod lambda).
 */
export function proof(r: FloydRun, mu: number) {
  const k = meetSteps(r);
  const lambda = r.loop.length;
  const a = k - mu;
  return { k, a, lambda, laps: k / lambda, holds: k % lambda === 0 && (mu + a) % lambda === 0 };
}

// ---- find the duplicate ----

/** n + 1 values from 1 … n: every value once, plus one extra copy of `dup`, shuffled. */
export function duplicateArray(n: number, rnd: Rnd): { values: number[]; dup: number } {
  const dup = randInt(1, n, rnd);
  return { values: shuffle([...Array.from({ length: n }, (_, i) => i + 1), dup], rnd), dup };
}

/** A value that appears more than once, found with Floyd on i → a[i] from index 0. Values must be in 1 … length − 1. */
export function findDuplicate(values: readonly number[]): { dup: number; run: FloydRun } {
  const run = floyd((i) => values[i]);
  return { dup: run.start!, run };
}

/** The hash-set way: walk the same i → a[i] chain, remembering every index, until one repeats. */
export function hashSetWalk(values: readonly number[]): { dup: number; stored: number } {
  const seen = new Set<number>();
  let i = 0;
  while (!seen.has(i)) {
    seen.add(i);
    i = values[i];
  }
  return { dup: i, stored: seen.size };
}

export const MU_MAX = 8;
export const LAMBDA_MAX = 10;
