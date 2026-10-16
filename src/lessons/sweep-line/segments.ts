/** A horizontal segment at height y from x0 to x1 (closed: both ends belong to it). */
export interface HSeg {
  y: number;
  x0: number;
  x1: number;
}
/** A vertical segment at x from y0 to y1 (closed). */
export interface VSeg {
  x: number;
  y0: number;
  y1: number;
}

export type SegBug = 'no-remove' | 'query-first' | null;

export interface Crossing {
  h: number;
  v: number;
}

export type SegEvent =
  | { kind: 'insert'; x: number; h: number; active: number[] }
  | { kind: 'query'; x: number; v: number; hits: number[]; active: number[] }
  | { kind: 'remove'; x: number; h: number; active: number[] };

export interface SweepResult {
  crossings: Crossing[];
  events: SegEvent[];
  /** Coordinate comparisons: ordering the events plus every y comparison on the active set. */
  comparisons: number;
}

const ORDER: Record<'insert' | 'query' | 'remove', number> = { insert: 0, query: 1, remove: 2 };

/** Merge sort that counts each comparison. */
function sortCounted<T>(items: T[], cmp: (a: T, b: T) => number, tally: { n: number }): T[] {
  if (items.length <= 1) return items;
  const mid = items.length >> 1;
  const a = sortCounted(items.slice(0, mid), cmp, tally);
  const b = sortCounted(items.slice(mid), cmp, tally);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    tally.n++;
    if (cmp(a[i], b[j]) <= 0) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return [...out, ...a.slice(i), ...b.slice(j)];
}

/**
 * Crossings of horizontal and vertical segments by a left-to-right sweep. At one x the events go: insert the horizontals that start here,
 * query the verticals at this x, remove the horizontals that end here, so segments that merely touch count (closed segments).
 * The active set is a list of live horizontals sorted by y; a vertical binary-searches it for the y-range [y0, y1].
 */
export function sweepCrossings(hs: readonly HSeg[], vs: readonly VSeg[], bug: SegBug = null): SweepResult {
  type Raw = { kind: 'insert' | 'query' | 'remove'; x: number; id: number };
  const raw: Raw[] = [
    ...hs.flatMap((h, id) => [{ kind: 'insert' as const, x: h.x0, id }, { kind: 'remove' as const, x: h.x1, id }]),
    ...vs.map((v, id) => ({ kind: 'query' as const, x: v.x, id })),
  ];
  const tally = { n: 0 };
  const rank = (k: Raw['kind']) => (bug === 'query-first' && k === 'query' ? -1 : ORDER[k]);
  const ordered = sortCounted(raw, (a, b) => a.x - b.x || rank(a.kind) - rank(b.kind) || a.id - b.id, tally);

  // active: horizontal ids sorted by (y, id)
  const active: number[] = [];
  const lowerBound = (y: number, id: number): number => {
    let lo = 0;
    let hi = active.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      tally.n++;
      if (hs[active[mid]].y < y || (hs[active[mid]].y === y && active[mid] < id)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const crossings: Crossing[] = [];
  const events: SegEvent[] = [];
  for (const e of ordered) {
    if (e.kind === 'insert') {
      active.splice(lowerBound(hs[e.id].y, e.id), 0, e.id);
      events.push({ kind: 'insert', x: e.x, h: e.id, active: [...active] });
    } else if (e.kind === 'remove') {
      if (bug !== 'no-remove') active.splice(lowerBound(hs[e.id].y, e.id), 1);
      events.push({ kind: 'remove', x: e.x, h: e.id, active: [...active] });
    } else {
      const { y0, y1 } = vs[e.id];
      const hits: number[] = [];
      for (let k = lowerBound(y0, -1); k < active.length; k++) {
        tally.n++;
        if (hs[active[k]].y > y1) break;
        hits.push(active[k]);
      }
      for (const h of hits) crossings.push({ h, v: e.id });
      events.push({ kind: 'query', x: e.x, v: e.id, hits, active: [...active] });
    }
  }
  return { crossings, events, comparisons: tally.n };
}

/** Every (horizontal, vertical) pair checked: up to four coordinate comparisons each, counted with short-circuiting. */
export function bruteCrossings(hs: readonly HSeg[], vs: readonly VSeg[]): { crossings: Crossing[]; comparisons: number; pairs: number } {
  const crossings: Crossing[] = [];
  let comparisons = 0;
  hs.forEach((h, hi) => {
    vs.forEach((v, vi) => {
      comparisons++;
      if (v.x < h.x0) return;
      comparisons++;
      if (v.x > h.x1) return;
      comparisons++;
      if (h.y < v.y0) return;
      comparisons++;
      if (h.y > v.y1) return;
      crossings.push({ h: hi, v: vi });
    });
  });
  return { crossings, comparisons, pairs: hs.length * vs.length };
}

export const crossingKey = (c: Crossing) => `${c.h}:${c.v}`;
