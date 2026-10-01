import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { buildFrames, buildRaceFrames } from './algorithms';
import { ALGO_IDS, isWorkFrame, makeBars, racePlaces, raceSteps, type AlgoId, type Bar, type Preset } from './model';

const PRESETS: Preset[] = ['random', 'nearly', 'reversed', 'few'];
const RUNS_PER_PRESET = 60;

/** Independent reference implementations that count their own comparisons and writes. */
function reference(values: number[], algo: AlgoId) {
  const a = values.slice();
  let comparisons = 0;
  let writes = 0;
  const gt = (x: number, y: number) => {
    comparisons++;
    return x > y;
  };
  const swap = (i: number, j: number) => {
    [a[i], a[j]] = [a[j], a[i]];
    writes++;
  };
  const n = a.length;
  if (algo === 'bubble') {
    for (let end = n - 1; end > 0; end--) {
      let swapped = false;
      for (let i = 0; i < end; i++) {
        if (gt(a[i], a[i + 1])) {
          swap(i, i + 1);
          swapped = true;
        }
      }
      if (!swapped) break;
    }
  } else if (algo === 'insertion') {
    for (let i = 1; i < n; i++) for (let j = i; j > 0 && gt(a[j - 1], a[j]); j--) swap(j - 1, j);
  } else if (algo === 'selection') {
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      for (let j = i + 1; j < n; j++) if (gt(a[min], a[j])) min = j;
      if (min !== i) swap(i, min);
    }
  } else if (algo === 'merge') {
    const sort = (lo: number, hi: number) => {
      if (lo >= hi) return;
      const mid = (lo + hi) >> 1;
      sort(lo, mid);
      sort(mid + 1, hi);
      const out: number[] = [];
      let i = lo;
      let j = mid + 1;
      while (i <= mid && j <= hi) out.push(gt(a[i], a[j]) ? a[j++] : a[i++]);
      while (i <= mid) out.push(a[i++]);
      while (j <= hi) out.push(a[j++]);
      out.forEach((v, k) => {
        a[lo + k] = v;
        writes++;
      });
    };
    sort(0, n - 1);
  } else {
    const sort = (lo: number, hi: number) => {
      if (lo >= hi) return;
      let i = lo;
      for (let j = lo; j < hi; j++) {
        if (!gt(a[j], a[hi])) {
          if (i !== j) swap(i, j);
          i++;
        }
      }
      if (i !== hi) swap(i, hi);
      sort(lo, i - 1);
      sort(i + 1, hi);
    };
    sort(0, n - 1);
  }
  return { sorted: a, comparisons, writes };
}

const values = (bars: Bar[]) => bars.map((b) => b.v);

describe('sorting algorithms', () => {
  it('each sorts every preset correctly, and its counters match an independent count', () => {
    const rnd = mulberry32(11);
    for (const preset of PRESETS) {
      for (let k = 0; k < RUNS_PER_PRESET; k++) {
        const bars = makeBars(randInt(2, 48, rnd), preset, rnd);
        const expected = values(bars).sort((x, y) => x - y);
        for (const algo of ALGO_IDS) {
          const frames = buildFrames(bars, algo);
          const last = frames[frames.length - 1];
          const ref = reference(values(bars), algo);
          expect(values(last.order), `${algo} ${preset}`).toEqual(expected);
          expect(last.order.map((b) => b.id).sort((x, y) => x - y)).toEqual(bars.map((b) => b.id));
          expect(last.comparisons, `${algo} comparisons`).toBe(ref.comparisons);
          expect(last.writes, `${algo} writes`).toBe(ref.writes);
          expect(last.sorted).toHaveLength(bars.length);
          // every unit of work is one frame, so the race measures exactly the counters
          expect(frames.filter(isWorkFrame)).toHaveLength(ref.comparisons + ref.writes);
        }
      }
    }
  });

  it('matches the known textbook counts', () => {
    for (let n = 2; n <= 40; n++) {
      const sorted = makeBars(n, 'reversed').reverse().map((b, id) => ({ ...b, id }));
      expect(buildFrames(sorted, 'bubble').at(-1)!.comparisons).toBe(n - 1); // early exit
      expect(buildFrames(sorted, 'bubble').at(-1)!.writes).toBe(0);
      expect(buildFrames(sorted, 'insertion').at(-1)!.comparisons).toBe(n - 1);
      const reversed = makeBars(n, 'reversed');
      expect(buildFrames(reversed, 'selection').at(-1)!.comparisons).toBe((n * (n - 1)) / 2);
      expect(buildFrames(reversed, 'insertion').at(-1)!.writes).toBe((n * (n - 1)) / 2);
      expect(buildFrames(reversed, 'bubble').at(-1)!.writes).toBe((n * (n - 1)) / 2);
    }
  });

  it('bubble, insertion and merge are stable: equal values keep their original order', () => {
    const rnd = mulberry32(12);
    for (let k = 0; k < 100; k++) {
      const bars = makeBars(randInt(4, 40, rnd), 'few', rnd);
      for (const algo of ['bubble', 'insertion', 'merge'] as AlgoId[]) {
        const out = buildFrames(bars, algo).at(-1)!.order;
        for (let i = 1; i < out.length; i++) {
          if (out[i].v === out[i - 1].v) expect(out[i].id).toBeGreaterThan(out[i - 1].id);
        }
      }
    }
  });
});

describe('the race', () => {
  it('ticks once per comparison or write, so places follow comparisons + writes', () => {
    const rnd = mulberry32(13);
    for (const preset of PRESETS) {
      for (let k = 0; k < 20; k++) {
        const bars = makeBars(randInt(8, 48, rnd), preset, rnd);
        const race = ALGO_IDS.map((id) => ({ id, frames: raceSteps(buildFrames(bars, id)) }));
        const work = race.map((r) => r.frames.at(-1)!.comparisons + r.frames.at(-1)!.writes);
        race.forEach((r, i) => expect(r.frames).toHaveLength(work[i] + 2));
        const places = racePlaces(race.map((r) => r.frames.length));
        for (let i = 0; i < race.length; i++) {
          for (let j = 0; j < race.length; j++) {
            if (work[i] < work[j]) expect(places[i]).toBeLessThan(places[j]);
            if (work[i] === work[j]) expect(places[i]).toBe(places[j]);
          }
        }
        expect(buildRaceFrames(race)).toHaveLength(Math.max(...race.map((r) => r.frames.length)));
      }
    }
  });

  it('gives tied algorithms the same place', () => {
    expect(racePlaces([10, 4, 10, 7, 4])).toEqual([4, 1, 4, 3, 1]);
  });
});

describe('makeBars', () => {
  it('builds each preset with the right shape', () => {
    const rnd = mulberry32(14);
    expect(values(makeBars(10, 'reversed', rnd))).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(new Set(values(makeBars(20, 'few', rnd))).size).toBeLessThanOrEqual(4);
    const nearly = values(makeBars(20, 'nearly', rnd));
    const outOfPlace = nearly.filter((v, i) => v !== i + 1).length;
    expect(outOfPlace).toBeLessThanOrEqual(4);
    expect([...values(makeBars(30, 'random', rnd))].sort((x, y) => x - y)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});
