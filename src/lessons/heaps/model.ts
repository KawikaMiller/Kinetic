/** The array-backed min-heap: index arithmetic, sift up / down, insert, extract-min and heapify. */

/** Four full levels. */
export const MAX = 15;

export interface HItem {
  id: number;
  v: number;
}

export const parent = (i: number) => Math.floor((i - 1) / 2);
export const left = (i: number) => 2 * i + 1;
export const right = (i: number) => 2 * i + 2;

/** Running totals, bumped before each event is reported so an observer sees them already counted. */
export interface Tally {
  comparisons: number;
  swaps: number;
}

/** What a sift just did, for whoever is narrating it. `swap` events arrive before the swap, `swapped` after. */
export type SiftEvent =
  | { kind: 'up'; i: number; p: number; swap: boolean }
  | { kind: 'down'; i: number; l: number; r: number | null; c: number; swap: boolean }
  | { kind: 'swapped'; from: number; to: number }
  | { kind: 'leaf'; i: number };
/** Called with the live array and tallies, so a narrator can snapshot them. */
export type Observer = (e: SiftEvent, a: readonly HItem[], t: Readonly<Tally>) => void;

function swapAt(a: HItem[], i: number, j: number, t: Tally) {
  [a[i], a[j]] = [a[j], a[i]];
  t.swaps++;
}

/** Move a[i] up while it's smaller than its parent. Returns where it settled. */
export function siftUp(a: HItem[], i: number, t: Tally, on?: Observer): number {
  while (i > 0) {
    const p = parent(i);
    t.comparisons++;
    const swap = a[i].v < a[p].v;
    on?.({ kind: 'up', i, p, swap }, a, t);
    if (!swap) return i;
    swapAt(a, i, p, t);
    on?.({ kind: 'swapped', from: i, to: p }, a, t);
    i = p;
  }
  return 0;
}

/** Move a[i] down, swapping with its smaller child, while that child is smaller. Only the first `n` items count. */
export function siftDown(a: HItem[], i: number, n: number, t: Tally, on?: Observer): number {
  for (;;) {
    const l = left(i);
    const r = right(i);
    if (l >= n) {
      on?.({ kind: 'leaf', i }, a, t);
      return i;
    }
    let c = l;
    t.comparisons++;
    if (r < n) {
      t.comparisons++;
      if (a[r].v < a[l].v) c = r;
    }
    const swap = a[c].v < a[i].v;
    on?.({ kind: 'down', i, l, r: r < n ? r : null, c, swap }, a, t);
    if (!swap) return i;
    swapAt(a, i, c, t);
    on?.({ kind: 'swapped', from: i, to: c }, a, t);
    i = c;
  }
}

/** Every index that has at least one child, deepest first: the nodes heapify sifts down. */
export const internalNodesBottomUp = (n: number) => Array.from({ length: Math.floor(n / 2) }, (_, k) => Math.floor(n / 2) - 1 - k);

export interface HeapOp extends Tally {
  items: HItem[];
}

export function heapInsert(items: HItem[], item: HItem, on?: Observer): HeapOp & { end: number } {
  const a = [...items, item];
  const t: Tally = { comparisons: 0, swaps: 0 };
  const end = siftUp(a, a.length - 1, t, on);
  return { items: a, end, ...t };
}

/** Take the root; the last item fills the hole and sifts down. `beforeSift` sees the array once the hole is filled. */
export function heapExtract(items: HItem[], on?: Observer, beforeSift?: (a: HItem[]) => void): HeapOp & { min: HItem; end: number | null } {
  const a = items.slice();
  const t: Tally = { comparisons: 0, swaps: 0 };
  const min = a[0];
  const last = a.pop()!;
  if (!a.length) return { items: a, min, end: null, ...t };
  a[0] = last;
  beforeSift?.(a);
  const end = siftDown(a, 0, a.length, t, on);
  return { items: a, min, end, ...t };
}

/** Bottom-up heap construction: sift down every node that has children, deepest first. */
export function heapify(items: HItem[], on?: Observer, beforeEach?: (a: HItem[], i: number) => void): HeapOp {
  const a = items.slice();
  const t: Tally = { comparisons: 0, swaps: 0 };
  for (const i of internalNodesBottomUp(a.length)) {
    beforeEach?.(a, i);
    siftDown(a, i, a.length, t, on);
  }
  return { items: a, ...t };
}

/** Does every parent hold a value ≤ both its children? */
export const isHeap = (values: number[]) => values.every((v, i) => i === 0 || values[parent(i)] <= v);
