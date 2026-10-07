/**
 * Binary relations on a small set {0 … n-1}, as an n × n boolean matrix: R[a][b] means
 * "a is related to b". Properties with their first counterexample, closures (with the
 * pairs each wave adds), equivalence classes, Hasse diagrams and linear extensions.
 */

export type Rel = boolean[][];
export type Pair = readonly [number, number];

export const emptyRel = (n: number): Rel => Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
export const fromPred = (n: number, p: (a: number, b: number) => boolean): Rel => Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => p(a, b)));
export const copy = (r: Rel): Rel => r.map((row) => row.slice());
export const pairs = (r: Rel): Pair[] => r.flatMap((row, a) => row.flatMap((x, b) => (x ? [[a, b] as const] : [])));
export const toggle = (r: Rel, a: number, b: number): Rel => r.map((row, i) => (i === a ? row.map((x, j) => (j === b ? !x : x)) : row));

export type Property = 'reflexive' | 'symmetric' | 'antisymmetric' | 'transitive';
export const PROPERTIES: readonly Property[] = ['reflexive', 'symmetric', 'antisymmetric', 'transitive'];

/** Why a property fails: the pairs that are there, and the pairs that should be but aren't. */
export interface Counterexample {
  present: Pair[];
  missing: Pair[];
  /** The elements involved, for the caption. */
  elements: number[];
}

/** The first counterexample to `p`, scanning a, then b, then c in order; null when `p` holds. */
export function counterexample(r: Rel, p: Property): Counterexample | null {
  const n = r.length;
  if (p === 'reflexive') {
    for (let a = 0; a < n; a++) if (!r[a][a]) return { present: [], missing: [[a, a]], elements: [a] };
  } else if (p === 'symmetric') {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (r[a][b] && !r[b][a]) return { present: [[a, b]], missing: [[b, a]], elements: [a, b] };
  } else if (p === 'antisymmetric') {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (r[a][b] && r[b][a]) return { present: [[a, b], [b, a]], missing: [], elements: [a, b] };
  } else {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (!r[a][b]) continue;
        for (let c = 0; c < n; c++) if (r[b][c] && !r[a][c]) return { present: [[a, b], [b, c]], missing: [[a, c]], elements: [a, b, c] };
      }
    }
  }
  return null;
}

export const holds = (r: Rel, p: Property) => counterexample(r, p) === null;
export const isEquivalence = (r: Rel) => holds(r, 'reflexive') && holds(r, 'symmetric') && holds(r, 'transitive');
export const isPartialOrder = (r: Rel) => holds(r, 'reflexive') && holds(r, 'antisymmetric') && holds(r, 'transitive');

export type Closure = 'reflexive' | 'symmetric' | 'transitive';

/** One step of a closure: the pairs it added (and, for transitive, the element it went through). */
export interface Wave {
  via: number | null;
  added: Pair[];
}

/**
 * The closure as waves. Reflexive and symmetric add everything in one wave; transitive is
 * Warshall's algorithm, one wave per element k: add (a, b) whenever a R k and k R b.
 */
export function closureWaves(r: Rel, kind: Closure): { result: Rel; waves: Wave[] } {
  const n = r.length;
  const m = copy(r);
  const waves: Wave[] = [];
  if (kind === 'reflexive' || kind === 'symmetric') {
    const added: Pair[] = [];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const want = kind === 'reflexive' ? a === b : r[b][a];
        if (want && !m[a][b]) {
          m[a][b] = true;
          added.push([a, b]);
        }
      }
    }
    waves.push({ via: null, added });
    return { result: m, waves };
  }
  for (let k = 0; k < n; k++) {
    const added: Pair[] = [];
    for (let a = 0; a < n; a++) {
      if (!m[a][k]) continue;
      for (let b = 0; b < n; b++) {
        if (m[k][b] && !m[a][b]) {
          m[a][b] = true;
          added.push([a, b]);
        }
      }
    }
    waves.push({ via: k, added });
  }
  return { result: m, waves };
}

/** Equivalence classes (meaningful when r is an equivalence): each element with everything related to it. */
export function classes(r: Rel): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let a = 0; a < r.length; a++) {
    if (seen.has(a)) continue;
    const cls = r[a].flatMap((x, b) => (x ? [b] : []));
    const members = cls.includes(a) ? cls : [a, ...cls];
    members.forEach((b) => seen.add(b));
    out.push(members);
  }
  return out;
}

/** Covering pairs of a partial order: a < b with nothing strictly between. These are the Hasse diagram's edges. */
export function hasse(r: Rel): Pair[] {
  const n = r.length;
  const lt = (a: number, b: number) => a !== b && r[a][b];
  const out: Pair[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (!lt(a, b)) continue;
      let between = false;
      for (let c = 0; c < n && !between; c++) between = lt(a, c) && lt(c, b);
      if (!between) out.push([a, b]);
    }
  }
  return out;
}

/** Pairs a < b (by index) that are related neither way. */
export const incomparable = (r: Rel): Pair[] =>
  r.flatMap((_, a) => r.flatMap((__, b) => (a < b && !r[a][b] && !r[b][a] ? [[a, b] as const] : [])));

/** A ranking of all elements that respects every pair (a topological sort of the strict order), smallest first. */
export function linearExtension(r: Rel): number[] {
  const n = r.length;
  const placed: number[] = [];
  const done = new Set<number>();
  while (placed.length < n) {
    const next = Array.from({ length: n }, (_, b) => b).find((b) => !done.has(b) && Array.from({ length: n }, (_, a) => a).every((a) => a === b || !r[a][b] || done.has(a)));
    if (next === undefined) return placed; // a cycle: not a partial order
    placed.push(next);
    done.add(next);
  }
  return placed;
}

/** True when `order` lists every element once and every a R b (a ≠ b) has a before b. */
export function respects(r: Rel, order: readonly number[]): boolean {
  if (order.length !== r.length || new Set(order).size !== r.length) return false;
  const pos = new Map(order.map((x, i) => [x, i]));
  return pairs(r).every(([a, b]) => a === b || pos.get(a)! < pos.get(b)!);
}
