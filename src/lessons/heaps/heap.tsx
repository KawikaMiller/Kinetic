import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export const MAX = 15; // four full levels

export interface HItem {
  id: number;
  v: number;
}
export interface HeapFrame extends Frame {
  items: HItem[];
  hi: number[];
  swap: [number, number] | null;
  ok: number[];
  fresh: number | null;
  out: HItem[];
  formula: ReactNode;
  comparisons: number;
  swaps: number;
}

export const parent = (i: number) => Math.floor((i - 1) / 2);
export const left = (i: number) => 2 * i + 1;
export const right = (i: number) => 2 * i + 2;

class Rec {
  frames: HeapFrame[] = [];
  comparisons = 0;
  swaps = 0;
  items: HItem[];
  out: HItem[];
  constructor(items: HItem[], out: HItem[]) {
    this.items = items;
    this.out = out;
  }
  snap(extra: Partial<HeapFrame>) {
    this.frames.push({
      items: this.items.slice(),
      hi: [],
      swap: null,
      ok: [],
      fresh: null,
      out: this.out.slice(),
      formula: null,
      comparisons: this.comparisons,
      swaps: this.swaps,
      ...extra,
    });
  }
  swapAt(i: number, j: number) {
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    this.swaps++;
  }
}

function siftUp(r: Rec, i: number) {
  while (i > 0) {
    const p = parent(i);
    r.comparisons++;
    const a = r.items[i].v;
    const b = r.items[p].v;
    const formula = (
      <>
        parent({i}) = ⌊({i} − 1) / 2⌋ = <b>{p}</b>
      </>
    );
    if (a < b) {
      r.snap({ hi: [i, p], formula, say: <>{a} &lt; its parent {b}: out of order, so they swap.</> });
      r.swapAt(i, p);
      r.snap({ swap: [p, i], formula, say: <>Swap. {a} moves up a level.</> });
      i = p;
    } else {
      r.snap({ hi: [i, p], formula, say: <>{a} ≥ its parent {b}. Heap order holds, stop.</> });
      return i;
    }
  }
  return 0;
}

function siftDown(r: Rec, i: number, n: number, quiet = false) {
  for (;;) {
    const l = left(i);
    const rt = right(i);
    if (l >= n) {
      if (!quiet) r.snap({ hi: [i], say: <>{r.items[i].v} has no children left to compare. Done.</> });
      return i;
    }
    let c = l;
    r.comparisons++;
    if (rt < n) {
      r.comparisons++;
      if (r.items[rt].v < r.items[l].v) c = rt;
    }
    const formula = (
      <>
        children({i}) = 2·{i}+1 = <b>{l}</b>
        {rt < n ? (
          <>
            , 2·{i}+2 = <b>{rt}</b>
          </>
        ) : null}
      </>
    );
    const hi = rt < n ? [i, l, rt] : [i, l];
    if (r.items[c].v < r.items[i].v) {
      r.snap({ hi, formula, say: <>{r.items[i].v} is bigger than its smaller child {r.items[c].v}, so they swap.</> });
      r.swapAt(i, c);
      r.snap({ swap: [i, c], formula, say: <>Swap. {r.items[c].v} sinks a level.</> });
      i = c;
    } else {
      r.snap({ hi, formula, say: <>{r.items[i].v} ≤ both children. Heap order holds, stop.</> });
      return i;
    }
  }
}

export function idle(items: HItem[], out: HItem[], say: ReactNode): HeapFrame[] {
  const r = new Rec(items.slice(), out);
  r.snap({ say });
  return r.frames;
}

export function insertFrames(items: HItem[], out: HItem[], item: HItem) {
  const r = new Rec([...items, item], out);
  const i = r.items.length - 1;
  r.snap({ fresh: i, say: <>New task with priority <span className="hl info">{item.v}</span> goes in the next free slot: index {i}, the bottom of the tree.</> });
  const end = siftUp(r, i);
  r.snap({ ok: [end], hold: 1.5, say: <>Settled at index {end}. Insert is O(log n): at most one swap per level.</> });
  return { frames: r.frames, items: r.items };
}

export function extractFrames(items: HItem[], out: HItem[]) {
  const r = new Rec(items.slice(), out.slice());
  const min = r.items[0];
  r.snap({ ok: [0], say: <>The minimum is always the root: <span className="hl ok">{min.v}</span>. Take it: that's the next task to run.</> });
  r.out = [min, ...r.out].slice(0, 8);
  const last = r.items.pop()!;
  if (r.items.length === 0) {
    r.snap({ hold: 1.5, say: <>That was the only item. The heap is empty.</> });
    return { frames: r.frames, items: r.items, out: r.out };
  }
  r.items[0] = last;
  r.snap({ fresh: 0, say: <>Fill the hole with the <b>last</b> item ({last.v}) so the tree stays complete. Now it's probably too big for the root…</> });
  const end = siftDown(r, 0, r.items.length);
  r.snap({ ok: [end], hold: 1.5, say: <>Heap restored. Extract-min is O(log n): one swap per level on the way down.</> });
  return { frames: r.frames, items: r.items, out: r.out };
}

export function heapifyFrames(items: HItem[]) {
  const r = new Rec(items.slice(), []);
  const n = r.items.length;
  r.snap({ say: <>A random array: not a heap yet. Heapify fixes it bottom-up, sifting down every node that has children.</> });
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    r.snap({ hi: [i], say: <>Sift down index {i} ({r.items[i].v}).</> });
    siftDown(r, i, n, true);
  }
  r.snap({
    ok: r.items.map((_, i) => i),
    hold: 2,
    say: <>Every parent ≤ its children: it's a heap. Building one this way is O(n), cheaper than n separate inserts.</>,
  });
  return { frames: r.frames, items: r.items };
}
