import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { ALGOS, racePlaces, raceVerdict, type AlgoId, type Bar, type Kind, type RaceVerdict, type SortFrame } from './model';

/** A tick of the race view: `t` indexes into every algorithm's own race timeline. */
export interface RaceFrame extends Frame {
  t: number;
}
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

  /** One item written to its place in a merge's output; records a frame. */
  write(i: number) {
    this.writes++;
    this.snap('write', i, null);
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
    // Drawn as an in-place merge (by rotation) so every bar keeps a definite position:
    // same comparisons as a textbook merge, and one write per item placed, as a real
    // merge into its O(n) buffer would make. The stage says so.
    let i = lo;
    let j = mid + 1;
    let firstSay: Say = <>Merge two sorted halves ({mid - lo + 1} + {hi - mid}): repeatedly take the smaller front item.</>;
    while (i < j && j <= hi) {
      const leftBigger = r.greater(i, j, firstSay);
      firstSay = undefined;
      if (leftBigger) {
        const [moved] = r.arr.splice(j, 1);
        r.arr.splice(i, 0, moved);
        j++;
      }
      r.write(i);
      i++;
    }
    // Whichever half is left over is already in order: a real merge still copies it.
    for (let k = i; k <= hi; k++) r.write(k);
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

const names = (ids: readonly AlgoId[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(ids.map((id) => ALGOS[id].name));

/** The race's closing line, built from what the numbers show on this input. */
function verdictSay(v: RaceVerdict): ReactNode {
  const n = v.bestIds.length;
  return (
    <>
      Selection compared every pair: <span className="hl bad">{v.everyPair}</span>, whatever the input.{' '}
      {v.bestIsQuadratic ? (
        <>
          {names(v.bestIds)} did only <span className="hl ok">{v.best}</span>: O(n²) is {n > 1 ? 'their' : 'its'} worst case, and this
          input is close to {n > 1 ? 'their' : 'its'} best.{' '}
        </>
      ) : (
        <>
          The best, {names(v.bestIds)}, did <span className="hl ok">{v.best}</span>. That gap explodes as n grows.{' '}
        </>
      )}
      {v.alsoEveryPair.length > 0 && <>{names(v.alsoEveryPair)} also compared every pair: this input is the worst case for {v.alsoEveryPair.length > 1 ? 'them' : 'it'}. </>}
      {v.quickNearWorst !== null && !v.alsoEveryPair.includes('quick') && <>Quick did {v.quickNearWorst}, close to that. </>}
      {v.quickNearWorst !== null && <>Quick picks the last bar as its pivot, so input already in order, either way round, is its worst case.</>}
    </>
  );
}

/**
 * One tick per unit of work for all five at once (pass in each algorithm's raceSteps),
 * so they're ranked by comparisons + writes; captions announce each finisher.
 */
export function buildRaceFrames(race: { id: AlgoId; frames: SortFrame[] }[]): RaceFrame[] {
  const len = Math.max(...race.map((r) => r.frames.length));
  const places = racePlaces(race.map((r) => r.frames.length));
  const finishersAt = (t: number) => race.map((r, k) => ({ ...r, place: places[k] })).filter((r) => r.frames.length - 1 === t);
  const announce = (t: number) =>
    finishersAt(t).map((f) => {
      const last = f.frames[f.frames.length - 1];
      return (
        <span key={f.id}>
          <b>{ALGOS[f.id].name}</b> finishes <span className="hl ok">#{f.place}</span> with {last.comparisons}{' '}
          comparisons and {last.writes} {ALGOS[f.id].writeLabel.toLowerCase()}.{' '}
        </span>
      );
    });
  const out: RaceFrame[] = [];
  for (let t = 0; t < len - 1; t++) {
    let say;
    if (t === 0) say = <>Same input, five algorithms, one comparison or write each per tick. Who finishes first?</>;
    else if (finishersAt(t).length) say = <>{announce(t)}</>;
    out.push({ t, say });
  }
  const verdict = raceVerdict(Object.fromEntries(race.map((r) => [r.id, r.frames.at(-1)!.comparisons])) as Record<AlgoId, number>);
  // The last finisher's announcement and the verdict share the final frame.
  out.push({ t: len - 1, hold: 2, say: <>{announce(len - 1)}{verdictSay(verdict)}</> });
  return out;
}
