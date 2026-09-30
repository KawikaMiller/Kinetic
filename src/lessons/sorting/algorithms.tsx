import type { ReactNode } from 'react';
import { randInt, shuffle } from '../../core/random';
import type { Frame } from '../../core/types';

export interface Bar {
  id: number;
  v: number;
}

export type AlgoId = 'bubble' | 'insertion' | 'selection' | 'merge' | 'quick';
export type Kind = 'start' | 'compare' | 'swap' | 'write' | 'mark' | 'done';

export interface SortFrame extends Frame {
  order: Bar[];
  kind: Kind;
  /** Positions being compared / moved this frame. */
  a: number | null;
  b: number | null;
  /** Pivot (quick) or current minimum (selection). */
  pivot: number | null;
  /** Active sub-range for divide-and-conquer algorithms. */
  range: [number, number] | null;
  sorted: number[];
  comparisons: number;
  writes: number;
}

/** A tick of the race view: `t` indexes into every algorithm's own frames. */
export interface RaceFrame extends Frame {
  t: number;
}

export const ALGOS: Record<AlgoId, { name: string; big: string; note: string; writeLabel: string }> = {
  bubble: { name: 'Bubble', big: 'O(n²)', note: 'best O(n) if already sorted', writeLabel: 'Swaps' },
  insertion: { name: 'Insertion', big: 'O(n²)', note: 'O(n) on nearly-sorted data', writeLabel: 'Swaps' },
  selection: { name: 'Selection', big: 'O(n²)', note: 'always n²/2 comparisons', writeLabel: 'Swaps' },
  merge: { name: 'Merge', big: 'O(n log n)', note: 'guaranteed, uses O(n) extra memory', writeLabel: 'Writes' },
  quick: { name: 'Quick', big: 'O(n log n)', note: 'average; O(n²) worst case', writeLabel: 'Swaps' },
};

type Say = ReactNode | undefined;

class Recorder {
  frames: SortFrame[] = [];
  arr: Bar[];
  sorted = new Set<number>();
  comparisons = 0;
  writes = 0;
  pivot: number | null = null;
  range: [number, number] | null = null;

  constructor(items: Bar[]) {
    this.arr = items.slice();
  }

  snap(kind: Kind, a: number | null = null, b: number | null = null, say?: Say) {
    this.frames.push({
      order: this.arr.slice(), kind, a, b, pivot: this.pivot, range: this.range,
      sorted: [...this.sorted], comparisons: this.comparisons, writes: this.writes, say,
    });
  }

  /** Compare positions i and j; records a frame. Returns arr[i] > arr[j]. */
  greater(i: number, j: number, say?: Say) {
    this.comparisons++;
    this.snap('compare', i, j, say);
    return this.arr[i].v > this.arr[j].v;
  }

  swap(i: number, j: number, say?: Say) {
    [this.arr[i], this.arr[j]] = [this.arr[j], this.arr[i]];
    this.writes++;
    this.snap('swap', i, j, say);
  }
}

function bubble(r: Recorder) {
  const n = r.arr.length;
  for (let end = n - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      if (r.greater(i, i + 1, i === 0 ? <>Pass {n - end}: walk left to right, swapping any pair that's out of order.</> : undefined)) {
        r.swap(i, i + 1);
        swapped = true;
      }
    }
    r.sorted.add(end);
    r.snap('mark', end, null, <>The biggest remaining value has <b>bubbled</b> to the end. It's locked in.</>);
    if (!swapped) {
      for (let k = 0; k < end; k++) r.sorted.add(k);
      r.snap('mark', null, null, <>A full pass with <b>zero swaps</b>: already sorted, so bubble stops early.</>);
      return;
    }
  }
  r.sorted.add(0);
}

function insertion(r: Recorder) {
  const n = r.arr.length;
  r.range = [0, 0];
  for (let i = 1; i < n; i++) {
    r.range = [0, i];
    let j = i;
    let first = true;
    while (j > 0) {
      const say = first ? <>Take the next card and slide it left into the sorted hand.</> : undefined;
      first = false;
      if (!r.greater(j - 1, j, say)) break;
      r.swap(j - 1, j);
      j--;
    }
  }
  r.range = null;
}

function selection(r: Recorder) {
  const n = r.arr.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    r.pivot = min;
    for (let j = i + 1; j < n; j++) {
      const say = j === i + 1 ? <>Scan everything unsorted to find the <span className="hl info">smallest</span>.</> : undefined;
      if (r.greater(min, j, say)) {
        min = j;
        r.pivot = min;
      }
    }
    if (min !== i) r.swap(i, min, <>Swap the smallest into slot {i}.</>);
    r.sorted.add(i);
    r.pivot = null;
  }
  r.sorted.add(n - 1);
}

function merge(r: Recorder) {
  const sortRange = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    sortRange(lo, mid);
    sortRange(mid + 1, hi);
    r.range = [lo, hi];
    // In-place merge by rotation: same comparisons as a textbook merge,
    // and every bar keeps a definite position so the motion is readable.
    let i = lo;
    let j = mid + 1;
    let firstSay: Say = <>Merge two sorted halves ({mid - lo + 1} + {hi - mid}): repeatedly take the smaller front item.</>;
    let placed = 0;
    while (i < j && j <= hi) {
      const leftBigger = r.greater(i, j, firstSay);
      firstSay = undefined;
      r.writes++;
      placed++;
      if (leftBigger) {
        const [moved] = r.arr.splice(j, 1);
        r.arr.splice(i, 0, moved);
        r.snap('write', i, null);
        j++;
      }
      i++;
    }
    // A real merge still copies the leftovers from whichever half remains.
    r.writes += hi - lo + 1 - placed;
  };
  sortRange(0, r.arr.length - 1);
}

function quick(r: Recorder) {
  const sortRange = (lo: number, hi: number) => {
    if (lo > hi) return;
    if (lo === hi) {
      r.sorted.add(lo);
      return;
    }
    r.range = [lo, hi];
    r.pivot = hi;
    r.snap('mark', hi, null, <>Pick the last bar as the <span className="hl info">pivot</span>. Smaller bars go left of it, bigger go right.</>);
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (!r.greater(j, hi)) {
        if (i !== j) r.swap(i, j);
        i++;
      }
    }
    if (i !== hi) r.swap(i, hi);
    r.pivot = null;
    r.sorted.add(i);
    r.snap('mark', i, null, <>Pivot lands in its <b>final</b> spot. Now recurse on each side.</>);
    sortRange(lo, i - 1);
    sortRange(i + 1, hi);
  };
  sortRange(0, r.arr.length - 1);
  r.range = null;
}

const RUN: Record<AlgoId, (r: Recorder) => void> = { bubble, insertion, selection, merge, quick };

export function buildFrames(items: Bar[], algo: AlgoId): SortFrame[] {
  const r = new Recorder(items);
  r.snap('start', null, null, <>{ALGOS[algo].name} sort, {items.length} bars. Yellow = comparing, violet = moving, green = locked in.</>);
  RUN[algo](r);
  r.range = null;
  r.pivot = null;
  r.arr.forEach((_, i) => r.sorted.add(i));
  r.snap(
    'done',
    null,
    null,
    <>
      Sorted with <span className="hl">{r.comparisons} comparisons</span> and{' '}
      <span className="hl violet">
        {r.writes} {ALGOS[algo].writeLabel.toLowerCase()}
      </span>
      .
    </>,
  );
  r.frames[r.frames.length - 1].hold = 2;
  return r.frames;
}

export type Preset = 'random' | 'nearly' | 'reversed' | 'few';

/** "Few unique" squashes the values into this many distinct heights. */
const FEW_UNIQUE_LEVELS = 4;
/** "Nearly sorted" does one neighbour swap per this many bars. */
const NEARLY_SORTED_SWAP_EVERY = 10;

export function makeBars(n: number, preset: Preset): Bar[] {
  let values = Array.from({ length: n }, (_, i) => i + 1);
  if (preset === 'few') {
    values = values.map((v) => Math.ceil((v / n) * FEW_UNIQUE_LEVELS) * Math.ceil(n / FEW_UNIQUE_LEVELS));
  }
  if (preset === 'random' || preset === 'few') values = shuffle(values);
  if (preset === 'reversed') values.reverse();
  if (preset === 'nearly') {
    for (let k = 0; k < Math.max(1, Math.floor(n / NEARLY_SORTED_SWAP_EVERY)); k++) {
      const i = randInt(0, n - 2);
      [values[i], values[i + 1]] = [values[i + 1], values[i]];
    }
  }
  return values.map((v, id) => ({ id, v }));
}

/** One tick per step for all five at once; captions announce each finisher. */
export function buildRaceFrames(race: { id: AlgoId; frames: SortFrame[] }[]): RaceFrame[] {
  const len = Math.max(...race.map((r) => r.frames.length));
  const ranked = [...race].sort((a, b) => a.frames.length - b.frames.length);
  const out: RaceFrame[] = [];
  for (let t = 0; t < len; t++) {
    const finishing = ranked.filter((r) => r.frames.length - 1 === t);
    let say;
    if (t === 0) say = <>Same input, five algorithms, one step each per tick. Who finishes first?</>;
    else if (finishing.length) {
      say = (
        <>
          {finishing.map((f) => (
            <span key={f.id}>
              <b>{ALGOS[f.id].name}</b> finishes <span className="hl ok">#{ranked.indexOf(f) + 1}</span> with{' '}
              {f.frames[f.frames.length - 1].comparisons} comparisons.{' '}
            </span>
          ))}
        </>
      );
    }
    out.push({ t, say });
  }
  const worst = race.find((r) => r.id === 'selection')!.frames.at(-1)!.comparisons;
  const best = Math.min(...race.map((r) => r.frames.at(-1)!.comparisons));
  out[out.length - 1] = {
    t: len - 1,
    hold: 2,
    say: (
      <>
        O(n²) sorts compare roughly every pair (<span className="hl bad">{worst}</span> for selection). The best did{' '}
        <span className="hl ok">{best}</span>. That gap explodes as n grows.
      </>
    ),
  };
  return out;
}
