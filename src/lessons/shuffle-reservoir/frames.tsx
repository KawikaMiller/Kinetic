import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { factorial } from '../../core/stats';
import { mulberry32 } from '../../core/random';
import {
  cellSE, choiceRange, comparatorShuffle, drawSwaps, flagged, identity, reservoirDraws, reservoirRun, type Algo,
} from './model';

export interface ShuffleFrame extends Frame {
  arr: number[];
  /** Current index i, or null before/after the loop. */
  i: number | null;
  j: number | null;
  /** True on the frame where i and j were just swapped. */
  swapped: boolean;
  /** Positions [0, settled) are final (Fisher-Yates only). */
  settled: number;
}

const ALGO_NAME: Record<Algo, string> = {
  'fisher-yates': 'Fisher-Yates',
  naive: 'the naive shuffle',
  comparator: 'a random comparator',
};

/** One seeded shuffle, step by step: pick j, then swap. */
export function shuffleFrames(algo: Algo, n: number, seed: number): ShuffleFrame[] {
  const r = createRecorder<ShuffleFrame>({ arr: identity(n), i: null, j: null, swapped: false, settled: 0 }, { transient: { swapped: false } });
  r.snap(<>Start: 1 to {n} in order. Shuffling with {ALGO_NAME[algo]}.</>);
  if (algo === 'comparator') {
    const out = comparatorShuffle(n, mulberry32(seed));
    r.set({ arr: out });
    r.close(<>sort(() =&gt; random() - 0.5), with the seeded generator, gave {out.join(' ')}. There&apos;s nothing to step: this browser&apos;s sort decided which pairs to compare.
      It is never exactly fair: each comparison is a coin flip, and a sort makes a bounded number of them, so every order&apos;s chance is a
      fraction with a power of 2 underneath, which 1/{factorial(n).toLocaleString('en-US')} never is. How biased it is depends on this browser&apos;s sort; Run ×10,000 measures it.</>);
    return r.frames;
  }
  const swaps = drawSwaps(algo, n, mulberry32(seed));
  for (const { i, j } of swaps) {
    const [lo, hi] = choiceRange(algo, n, i);
    r.snap(<>i = {i}: pick j uniformly from positions {lo} to {hi} ({hi - lo + 1} choices). Got j = {j}.</>, 1, { i, j });
    const arr = [...r.get().arr];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    r.snap(i === j ? <>Swap position {i} with itself: nothing moves.</> : <>Swap positions {i} and {j}.</>, 1, {
      arr, swapped: true, settled: algo === 'fisher-yates' ? i + 1 : 0,
    });
  }
  const end = algo === 'fisher-yates'
    ? <>Done: {r.get().arr.join(' ')}. The last position had one choice left. {n}·{n - 1}·…·1 = {factorial(n).toLocaleString('en-US')} equally likely paths, one per arrangement.</>
    : <>Done: {r.get().arr.join(' ')}. {n} steps of {n} choices each make {(BigInt(n) ** BigInt(n)).toLocaleString('en-US')} equally likely paths, which can&apos;t split evenly over {factorial(n).toLocaleString('en-US')} arrangements.</>;
  r.set({ i: null, j: null, settled: algo === 'fisher-yates' ? n : 0 });
  r.close(end, 2);
  return r.frames;
}

/** What the heatmap shows, computed from the counts. */
export function heatCaption(algo: Algo, n: number, runs: number, counts: readonly (readonly number[])[]): ReactNode {
  const off = flagged(counts, runs).length;
  const cells = n * n;
  return <>{runs.toLocaleString('en-US')} shuffles with {ALGO_NAME[algo]}: each cell should be near {(runs / n).toLocaleString('en-US', { maximumFractionDigits: 1 })}{' '}
    (± {cellSE(n, runs).toFixed(1)} per standard error). {off === 0
      ? <>No cell is more than 3 standard errors off.</>
      : <><span className="hl bad">{off} of {cells}</span> cells are more than 3 standard errors off.</>}
    {' '}A fair shuffle crosses that line in about 0.3% of cells by chance, so {off > Math.max(1, cells * 0.01) ? 'this looks biased.' : 'one stray cell proves nothing; a pattern does.'}
    {' '}Flat is necessary, not sufficient (a random rotation is flat too, yet makes only {n} of the {factorial(n).toLocaleString('en-US')} orders); the exact n = 3 count is the proof.</>;
}

export interface ReservoirFrame extends Frame {
  /** Items seen so far (1..item). */
  seen: number;
  reservoir: number[];
  /** Slot just written, for the flash. */
  admitted: number | null;
  evicted: number | null;
}

/** One seeded Algorithm R run over a stream of n items into k slots. */
export function reservoirFrames(n: number, k: number, seed: number): ReservoirFrame[] {
  const steps = reservoirRun(n, k, reservoirDraws(n, k, mulberry32(seed)));
  const r = createRecorder<ReservoirFrame>({ seen: 0, reservoir: [], admitted: null, evicted: null }, { transient: { admitted: null, evicted: null } });
  r.snap(<>A stream of {n} items will flow past a reservoir with {k} {k === 1 ? 'slot' : 'slots'}. We never need to know {n} in advance.</>);
  for (const s of steps) {
    const patch = { seen: s.item, reservoir: s.reservoir, admitted: s.slot, evicted: s.evicted };
    if (s.draw === null) r.snap(<>Item {s.item}: the reservoir isn&apos;t full yet, so it goes straight into slot {s.item}.</>, 1, patch);
    else if (s.slot !== null) {
      r.snap(<>Item {s.item}: keep it with probability {k}/{s.item}. Drew {s.draw} from 1 to {s.item}; {s.draw} ≤ {k}, so it replaces slot {s.draw}{' '}
        and item {s.evicted} is evicted.</>, 1, patch);
    } else {
      r.snap(<>Item {s.item}: keep it with probability {k}/{s.item}. Drew {s.draw} from 1 to {s.item}; {s.draw} &gt; {k}, so it passes by.</>, 1, patch);
    }
  }
  r.close(<>Stream over: kept {r.get().reservoir.slice().sort((a, b) => a - b).join(', ')}. Every item had the same {k}/{n} chance of ending up here.</>, 2);
  return r.frames;
}
