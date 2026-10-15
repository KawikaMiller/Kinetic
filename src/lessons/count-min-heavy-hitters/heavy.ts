/**
 * count-min-heavy-hitters, scene 3: a sketch plus a small set of candidates. For each arriving item the sketch is queried and the item
 * kept if its estimate beats the smallest candidate. The sketch can say how often an item occurred but cannot list its items, which is
 * why the candidates are kept at all. Pure.
 */
import { estimate, makeFamily, newSketch, update, type Sketch } from './sketch';
import { exactCounts, exactTop, keyOfRank, TOP_K } from './stream';

export interface Candidate {
  item: number;
  est: number;
}

export interface HeavyEvent {
  /** How many items had been seen when it happened. */
  at: number;
  kind: 'enter' | 'evict';
  item: number;
  est: number;
  /** For an eviction: the item that took its place. */
  by?: number;
}

export interface HeavyState {
  sketch: Sketch;
  /** At most K candidates, in no order. */
  heap: Candidate[];
  events: HeavyEvent[];
  seen: number;
}

/** Run the first `upTo` items of the stream through a sketch and a K-candidate set. */
export function heavyRun(stream: readonly number[], w: number, d: number, hashSeed: number, upTo: number, k = TOP_K): HeavyState {
  const sketch = newSketch(w, d, makeFamily(hashSeed, d));
  const heap: Candidate[] = [];
  const events: HeavyEvent[] = [];
  const n = Math.min(upTo, stream.length);
  for (let i = 0; i < n; i++) {
    const item = stream[i];
    const key = keyOfRank(item);
    update(sketch, key);
    const est = estimate(sketch, key);
    const mine = heap.find((c) => c.item === item);
    if (mine) {
      mine.est = est;
    } else if (heap.length < k) {
      heap.push({ item, est });
      events.push({ at: i + 1, kind: 'enter', item, est });
    } else {
      const low = heap.reduce((a, b) => (b.est < a.est ? b : a));
      if (est > low.est) {
        events.push({ at: i + 1, kind: 'evict', item: low.item, est: low.est, by: item });
        heap[heap.indexOf(low)] = { item, est };
      }
    }
  }
  return { sketch, heap, events, seen: n };
}

export interface Quality {
  /** Candidates that are among the true top K. */
  hits: number;
  precision: number;
  recall: number;
  top: number[];
}

/** Precision and recall of the candidates against the exact top K of the first `seen` items. */
export function quality(stream: readonly number[], state: HeavyState, k = TOP_K): Quality {
  const top = exactTop(exactCounts(stream.slice(0, state.seen)), k);
  const hits = state.heap.filter((c) => top.includes(c.item)).length;
  return { hits, precision: state.heap.length ? hits / state.heap.length : 1, recall: hits / k, top };
}

/** Counters the exact approach needs (one per distinct item seen) against the sketch's d * w. */
export const memory = (stream: readonly number[], state: HeavyState): { exact: number; sketch: number } => ({
  exact: new Set(stream.slice(0, state.seen)).size,
  sketch: state.sketch.w * state.sketch.d,
});
