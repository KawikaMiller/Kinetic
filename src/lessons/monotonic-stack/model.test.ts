import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { frames, rectFrames, totalsFor, warmerFrames, windowFrames, type Scene } from './frames';
import {
  bruteNextComparisons, K_CHOICES, largestRectangle, MAX_VALUES, nextGreater, opCounts, parseValues, PRESETS, slidingMax,
} from './model';

/** Seeded arrays with plenty of duplicates and equal-height runs: values from a small range, sometimes repeated. */
function seededArray(rnd: Rnd, maxLen = 14): number[] {
  const n = randInt(0, maxLen, rnd);
  const hi = pickRange(rnd);
  const xs: number[] = [];
  while (xs.length < n) {
    const v = randInt(0, hi, rnd);
    const run = rnd() < 0.25 ? randInt(2, 4, rnd) : 1;
    for (let r = 0; r < run && xs.length < n; r++) xs.push(v);
  }
  return xs;
}
const pickRange = (rnd: Rnd) => [1, 3, 9, 99][randInt(0, 3, rnd)];

/** O(n²) reference: look right from every index for the first strictly greater value. */
function bruteNext(xs: readonly number[]): (number | null)[] {
  return xs.map((v, i) => {
    for (let j = i + 1; j < xs.length; j++) if (xs[j] > v) return j;
    return null;
  });
}

function bruteWindowMax(xs: readonly number[], k: number): number[] {
  const out: number[] = [];
  for (let s = 0; s + k <= xs.length; s++) out.push(Math.max(...xs.slice(s, s + k)));
  return out;
}

/** O(n²) reference: every range, its minimum times its width. */
function bruteRect(xs: readonly number[]): number {
  let best = 0;
  for (let a = 0; a < xs.length; a++) {
    let min = Infinity;
    for (let b = a; b < xs.length; b++) {
      min = Math.min(min, xs[b]);
      best = Math.max(best, min * (b - a + 1));
    }
  }
  return best;
}

/** Per index: how often it was pushed and popped in a trace. */
function perIndex(n: number, ops: readonly { t: string; i: number }[]) {
  const pushed = new Array(n).fill(0);
  const popped = new Array(n).fill(0);
  for (const o of ops) {
    if (o.t === 'push') pushed[o.i]++;
    else if (o.t === 'pop' || o.t === 'drop' || o.t === 'expire') popped[o.i]++;
  }
  return { pushed, popped };
}

const ARRAYS = (() => {
  const rnd = mulberry32(7);
  return Array.from({ length: 500 }, () => seededArray(rnd));
})();

describe('next greater element', () => {
  it('matches the O(n²) brute force on 500 seeded arrays, duplicates and equal runs included', () => {
    expect(ARRAYS.some((xs) => xs.some((v, i) => i > 0 && xs[i - 1] === v))).toBe(true);
    for (const xs of ARRAYS) expect(nextGreater(xs).next).toEqual(bruteNext(xs));
  });

  it('pushes every index exactly once and pops each at most once, so push + pop ≤ 2n', () => {
    for (const xs of ARRAYS) {
      const { ops } = nextGreater(xs);
      const { pushed, popped } = perIndex(xs.length, ops);
      expect(pushed.every((c) => c === 1)).toBe(true);
      expect(popped.every((c) => c <= 1)).toBe(true);
      const c = opCounts(ops);
      expect(c.pushes + c.pops).toBeLessThanOrEqual(2 * xs.length);
    }
  });

  it('an equal value never answers: strictly greater is the rule', () => {
    expect(nextGreater([5, 5, 5]).next).toEqual([null, null, null]);
    expect(nextGreater([70, 70, 72]).next).toEqual([2, 2, null]);
  });

  it('counts the brute-force comparisons by hand on small cases', () => {
    expect(bruteNextComparisons([3, 2, 1])).toBe(3); // 2 + 1 + 0
    expect(bruteNextComparisons([1, 2, 3])).toBe(2); // each finds the next one at once
    expect(bruteNextComparisons([])).toBe(0);
  });
});

describe('sliding-window maximum', () => {
  it('matches brute force for every k from 1 to n', () => {
    for (const xs of ARRAYS.slice(0, 200)) {
      for (let k = 1; k <= xs.length; k++) expect(slidingMax(xs, k).maxes).toEqual(bruteWindowMax(xs, k));
    }
  });

  it('each index enters the deque once and leaves at most once', () => {
    for (const xs of ARRAYS.slice(0, 200)) {
      for (let k = 1; k <= xs.length; k++) {
        const { ops } = slidingMax(xs, k);
        const { pushed, popped } = perIndex(xs.length, ops.filter((o) => o.t !== 'max') as { t: string; i: number }[]);
        expect(pushed.every((c) => c === 1)).toBe(true);
        expect(popped.every((c) => c <= 1)).toBe(true);
      }
    }
  });
});

describe('largest rectangle in a histogram', () => {
  it('matches the O(n²) brute force on the seeded arrays (zeros and equal heights included)', () => {
    expect(ARRAYS.some((xs) => xs.includes(0))).toBe(true);
    for (const xs of ARRAYS) expect(largestRectangle(xs).best?.area ?? 0).toBe(bruteRect(xs));
  });

  it('every popped rectangle is real: its height fits under every bar it spans', () => {
    for (const xs of ARRAYS) {
      for (const o of largestRectangle(xs).ops) {
        if (o.t !== 'pop') continue;
        const { from, to, height, area } = o.rect;
        expect(Math.min(...xs.slice(from, to + 1))).toBe(height);
        expect(area).toBe(height * (to - from + 1));
      }
    }
  });

  it('pushes each bar once, pops each exactly once (the sentinel empties the stack)', () => {
    for (const xs of ARRAYS) {
      const { pushed, popped } = perIndex(xs.length, largestRectangle(xs).ops);
      expect(pushed.every((c) => c === 1)).toBe(true);
      expect(popped.every((c) => c === 1)).toBe(true);
    }
  });

  it('the classic 2 1 5 6 2 3 gives 10', () => {
    expect(largestRectangle([2, 1, 5, 6, 2, 3]).best).toEqual({ from: 2, to: 3, height: 5, area: 10 });
  });
});

describe('parseValues: hostile input is defined', () => {
  const refused = (s: string) => {
    const r = parseValues(s);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.error;
  };
  it('accepts lists with commas and/or spaces, leading zeros included', () => {
    expect(parseValues('73, 74 75,  71')).toEqual({ ok: true, values: [73, 74, 75, 71] });
    expect(parseValues('007 0')).toEqual({ ok: true, values: [7, 0] });
  });
  it('treats empty and whitespace as an empty list, which the frames explain', () => {
    expect(parseValues('')).toEqual({ ok: true, values: [] });
    expect(parseValues('   ')).toEqual({ ok: true, values: [] });
  });
  it('refuses the rest with a message', () => {
    expect(refused('1' + '0'.repeat(22))).toMatch(/between 0 and 99/);
    expect(refused('-1')).toMatch(/No negatives/);
    expect(refused('1e400')).toMatch(/whole numbers/);
    expect(refused('🔥')).toMatch(/whole numbers/);
    expect(refused('<b>5</b>')).toMatch(/whole numbers/);
    expect(refused('1,,2')).toMatch(/gap/);
    expect(refused('1, 2,')).toMatch(/gap/);
    expect(refused('2.5')).toMatch(/whole numbers/);
    expect(refused('100')).toMatch(/between 0 and 99/);
    expect(refused(Array.from({ length: MAX_VALUES + 1 }, () => '1').join(' '))).toMatch(/Up to 12/);
  });
});

const lastSay = (fs: { say?: unknown }[]) => captionText(fs.findLast((f) => f.say !== undefined)!.say as never);

describe('captions', () => {
  it('empty input gets its own caption in every scene', () => {
    for (const s of ['warmer', 'window', 'rect'] as Scene[]) {
      const fs = frames(s, [], 3);
      expect(fs).toHaveLength(1);
      expect(captionText(fs[0].say)).toMatch(/No values/);
    }
  });

  it('one element gets its own closing caption in every scene', () => {
    expect(lastSay(warmerFrames([42]))).toMatch(/One day only.*never popped/);
    expect(lastSay(windowFrames([42], 3))).toMatch(/One value.*42/);
    expect(lastSay(rectFrames([42]))).toMatch(/One bar.*area 42/);
  });

  it('every scene × preset × k ends with counts and answers taken from the model', () => {
    for (const scene of ['warmer', 'window', 'rect'] as Scene[]) {
      for (const p of PRESETS[scene]) {
        for (const k of K_CHOICES) {
          const xs = p.values;
          const end = lastSay(frames(scene, xs, k));
          const t = totalsFor(scene, xs, k);
          expect(end).toContain(`= ${t.work}, within 2n = ${2 * xs.length}`);
          expect(t.work).toBeLessThanOrEqual(2 * xs.length);
          if (scene === 'warmer') {
            const stuck = nextGreater(xs).next.flatMap((a, i) => (a === null ? [i] : []));
            if (stuck.length === xs.length) expect(end).toContain('No day ever sees a warmer one');
            else if (stuck.length) expect(end).toContain(`${stuck.length === 1 ? 'Day' : 'Days'} ${stuck.length === 1 ? stuck[0] : ''}`);
            else expect(end).toContain('Every day found a warmer one');
            expect(end).toContain(`${bruteNextComparisons(xs)} comparison`);
          } else if (scene === 'window') {
            expect(end).toContain(`maxima are ${bruteWindowMax(xs, Math.min(k, xs.length)).join(', ')}.`);
          } else {
            expect(end).toContain(`area ${bruteRect(xs)},`);
          }
        }
      }
    }
  });

  it('every pop caption in Next warmer day states the true wait, and equal days are named as not warmer', () => {
    for (const xs of ARRAYS.slice(0, 100)) {
      const truth = nextGreater(xs).next;
      for (const f of warmerFrames(xs)) {
        if (f.arrow === null) continue;
        const j = f.arrow;
        const wait = truth[j]! - j;
        expect(captionText(f.say)).toContain(`day ${j}'s answer is ${wait} day${wait === 1 ? '' : 's'}`);
      }
    }
    const says = warmerFrames([70, 70, 72]).map((f) => captionText(f.say));
    expect(says.some((s) => s.includes("equal isn't warmer"))).toBe(true);
  });

  it('frame counters agree with the trace at the end', () => {
    for (const xs of ARRAYS.slice(0, 100)) {
      for (const scene of ['warmer', 'window', 'rect'] as Scene[]) {
        const fs = frames(scene, xs, 3);
        const last = fs[fs.length - 1];
        if (!xs.length) continue;
        expect(last.pushes + last.pops).toBe(totalsFor(scene, xs, Math.min(3, xs.length)).work);
      }
    }
  });
});
