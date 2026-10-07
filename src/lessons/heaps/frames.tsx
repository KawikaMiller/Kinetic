import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { heapExtract, heapify, heapInsert, type HItem, type Observer, type Tally } from './model';

/** An extracted item and which run it was (1 = first task run since the last reset). */
export interface OutItem extends HItem {
  run: number;
}
/** The run-order tray keeps only the latest few. */
export const OUT_SHOWN = 8;

export interface HeapFrame extends Frame {
  items: HItem[];
  hi: number[];
  swap: [number, number] | null;
  ok: number[];
  fresh: number | null;
  out: OutItem[];
  formula: ReactNode;
  comparisons: number;
  swaps: number;
}

const NO_TALLY: Tally = { comparisons: 0, swaps: 0 };

/** Collects frames, each a snapshot of the array, the run-order tray and the tallies. */
function recorder(out: OutItem[]) {
  const frames: HeapFrame[] = [];
  const rec = {
    frames,
    out,
    snap(items: readonly HItem[], t: Readonly<Tally>, extra: Partial<HeapFrame>) {
      frames.push({
        items: items.slice(), hi: [], swap: null, ok: [], fresh: null, out: rec.out.slice(), formula: null,
        comparisons: t.comparisons, swaps: t.swaps, ...extra,
      });
    },
  };
  return rec;
}
type Recorder = ReturnType<typeof recorder>;

const parentFormula = (i: number, p: number) => (
  <>
    parent({i}) = ⌊({i} − 1) / 2⌋ = <b>{p}</b>
  </>
);
const childrenFormula = (i: number, l: number, r: number | null) => (
  <>
    children({i}) = 2·{i}+1 = <b>{l}</b>
    {r != null ? (
      <>
        , 2·{i}+2 = <b>{r}</b>
      </>
    ) : null}
  </>
);

/** Narrates sift events as frames. `quiet` skips the "no children" frame (heapify). */
function narrate(rec: Recorder, quiet = false): Observer {
  let formula: ReactNode = null;
  return (e, a, t) => {
    switch (e.kind) {
      case 'up': {
        formula = parentFormula(e.i, e.p);
        const [v, pv] = [a[e.i].v, a[e.p].v];
        rec.snap(a, t, {
          hi: [e.i, e.p], formula,
          say: e.swap ? <>{v} &lt; its parent {pv}: out of order, so they swap.</> : <>{v} ≥ its parent {pv}. Heap order holds, stop.</>,
        });
        return;
      }
      case 'down': {
        formula = childrenFormula(e.i, e.l, e.r);
        const hi = e.r != null ? [e.i, e.l, e.r] : [e.i, e.l];
        rec.snap(a, t, {
          hi, formula,
          say: e.swap ? (
            <>{a[e.i].v} is bigger than its smaller child {a[e.c].v}, so they swap.</>
          ) : (
            <>{a[e.i].v} ≤ both children. Heap order holds, stop.</>
          ),
        });
        return;
      }
      case 'swapped': {
        const up = e.to < e.from;
        rec.snap(a, t, {
          swap: [Math.min(e.from, e.to), Math.max(e.from, e.to)], formula,
          say: up ? <>Swap. {a[e.to].v} moves up a level.</> : <>Swap. {a[e.to].v} sinks a level.</>,
        });
        return;
      }
      case 'leaf':
        if (!quiet) rec.snap(a, t, { hi: [e.i], say: <>{a[e.i].v} has no children left to compare. Done.</> });
    }
  };
}

export function idle(items: HItem[], out: OutItem[], say: ReactNode): HeapFrame[] {
  const rec = recorder(out);
  rec.snap(items, NO_TALLY, { say });
  return rec.frames;
}

export function insertFrames(items: HItem[], out: OutItem[], item: HItem) {
  const rec = recorder(out);
  const i = items.length;
  rec.snap([...items, item], NO_TALLY, {
    fresh: i,
    say: <>New task with priority <span className="hl info">{item.v}</span> goes in the next free slot: index {i}, the bottom of the tree.</>,
  });
  const res = heapInsert(items, item, narrate(rec));
  rec.snap(res.items, res, { ok: [res.end], hold: 1.5, say: <>Settled at index {res.end}. Insert is O(log n): at most one swap per level.</> });
  return { frames: rec.frames, items: res.items };
}

export function extractFrames(items: HItem[], out: OutItem[]) {
  const rec = recorder(out.slice());
  const min = items[0];
  rec.snap(items, NO_TALLY, {
    ok: [0],
    say: <>The minimum is always the root: <span className="hl ok">{min.v}</span>. Take it: that's the next task to run.</>,
  });
  rec.out = [{ ...min, run: (out[0]?.run ?? 0) + 1 }, ...rec.out].slice(0, OUT_SHOWN);
  const res = heapExtract(items, narrate(rec), (a) =>
    rec.snap(a, NO_TALLY, {
      fresh: 0,
      say: <>Fill the hole with the <b>last</b> item ({a[0].v}) so the tree stays complete. Now it's probably too big for the root…</>,
    }),
  );
  if (res.end == null) rec.snap(res.items, res, { hold: 1.5, say: <>That was the only item. The heap is empty.</> });
  else rec.snap(res.items, res, { ok: [res.end], hold: 1.5, say: <>Heap restored. Extract-min is O(log n): one swap per level on the way down.</> });
  return { frames: rec.frames, items: res.items, out: rec.out };
}

export function heapifyFrames(items: HItem[]) {
  const rec = recorder([]);
  rec.snap(items, NO_TALLY, { say: <>A random array: not a heap yet. Heapify fixes it bottom-up, sifting down every node that has children.</> });
  // The "sift down index i" frames carry the running totals so far, as the sift events last reported them.
  let soFar: Tally = NO_TALLY;
  const observe = narrate(rec, true);
  const res = heapify(
    items,
    (e, a, t) => {
      soFar = { ...t };
      observe(e, a, t);
    },
    (a, i) => rec.snap(a, soFar, { hi: [i], say: <>Sift down index {i} ({a[i].v}).</> }),
  );
  rec.snap(res.items, res, {
    ok: res.items.map((_, i) => i),
    hold: 2,
    say: <>Every parent ≤ its children: it's a heap. Building one this way is O(n), cheaper than n separate inserts.</>,
  });
  return { frames: rec.frames, items: res.items };
}
