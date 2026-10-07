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
          if (xs.length > 1) {
            expect(end).toContain(`the stack made ${t.cmps} (never more than 2n = ${2 * xs.length})`);
            expect(end).toContain(`brute force makes ${t.brute} here`);
          }
          expect(t.work).toBeLessThanOrEqual(2 * xs.length);
          if (scene === 'warmer') {
            const stuck = nextGreater(xs).next.flatMap((a, i) => (a === null ? [i] : []));
            if (stuck.length === xs.length) expect(end).toContain('No day ever sees a warmer one');
            else if (stuck.length) expect(end).toContain(`${stuck.length === 1 ? 'Day' : 'Days'} ${stuck.length === 1 ? stuck[0] : ''}`);
            else expect(end).toContain('Every day found a warmer one');
            expect(end).toContain(`brute force makes ${bruteNextComparisons(xs)} here`);
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

/**
 * Comparison counts, re-derived here with explicit counters (same unit for both sides: one
 * value-against-value comparison). The stack versions mirror the textbook loops; the brute-force
 * versions do the obvious scans.
 */
function stackNextCmp(xs: readonly number[]): number {
  const st: number[] = [];
  let c = 0;
  xs.forEach((v, i) => {
    while (st.length) {
      c++;
      if (xs[st[st.length - 1]] < v) st.pop();
      else break;
    }
    st.push(i);
  });
  return c;
}
function dequeMaxCmp(xs: readonly number[], k: number): number {
  const dq: number[] = [];
  let c = 0;
  xs.forEach((v, i) => {
    while (dq.length && dq[0] <= i - k) dq.shift(); // an index check, not a value comparison
    while (dq.length) {
      c++;
      if (xs[dq[dq.length - 1]] <= v) dq.pop();
      else break;
    }
    dq.push(i);
  });
  return c;
}
function stackRectCmp(xs: readonly number[]): number {
  const st: number[] = [];
  let c = 0;
  for (let at = 0; at <= xs.length; at++) {
    const h = at === xs.length ? 0 : xs[at];
    while (st.length) {
      c++;
      if (xs[st[st.length - 1]] >= h) st.pop();
      else break;
    }
    if (at < xs.length) st.push(at);
  }
  return c;
}
function bruteNextCmp(xs: readonly number[]): number {
  let c = 0;
  xs.forEach((v, i) => {
    for (let j = i + 1; j < xs.length; j++) {
      c++;
      if (xs[j] > v) break;
    }
  });
  return c;
}
function bruteWindowCmp(xs: readonly number[], k: number): number {
  let c = 0;
  for (let s = 0; s + k <= xs.length; s++) {
    let m = xs[s];
    for (let j = s + 1; j < s + k; j++) {
      c++;
      m = Math.max(m, xs[j]);
    }
  }
  return c;
}
function bruteRectCmp(xs: readonly number[]): number {
  let c = 0;
  for (let a = 0; a < xs.length; a++) {
    let low = xs[a];
    for (let b = a + 1; b < xs.length; b++) {
      c++;
      low = Math.min(low, xs[b]);
    }
  }
  return c;
}

describe('the headline compares like with like', () => {
  const rnd = mulberry32(77);
  const arrays = Array.from({ length: 300 }, () => seededArray(rnd));

  it('stack and brute-force counts are both value comparisons, matching independent counters, and the stack never passes 2n', () => {
    for (const xs of arrays) {
      const n = xs.length;
      const w = totalsFor('warmer', xs, 3);
      expect(w.cmps).toBe(stackNextCmp(xs));
      expect(w.brute).toBe(bruteNextCmp(xs));
      expect(w.cmps).toBeLessThanOrEqual(2 * n);
      const r = totalsFor('rect', xs, 3);
      expect(r.cmps).toBe(stackRectCmp(xs));
      expect(r.brute).toBe(bruteRectCmp(xs));
      expect(r.cmps).toBeLessThanOrEqual(2 * n);
      for (let k = 1; k <= Math.max(1, n); k++) {
        const t = totalsFor('window', xs, k);
        const kk = Math.max(1, Math.min(k, n));
        expect(t.cmps).toBe(dequeMaxCmp(xs, kk));
        expect(t.brute).toBe(bruteWindowCmp(xs, kk));
        expect(t.cmps).toBeLessThanOrEqual(2 * n);
      }
    }
  });

  it('the running counter on the last frame equals the total, in every scene', () => {
    for (const xs of arrays.slice(0, 100)) {
      if (!xs.length) continue;
      for (const scene of ['warmer', 'window', 'rect'] as Scene[]) {
        expect(frames(scene, xs, 3).at(-1)!.cmps).toBe(totalsFor(scene, xs, 3).cmps);
      }
    }
  });

  it('the stated worst case is real: a run that never warms costs brute force n(n−1)/2, the stack under 2n', () => {
    for (let n = 2; n <= 12; n++) {
      const falling = Array.from({ length: n }, (_, i) => 90 - i);
      expect(bruteNextCmp(falling)).toBe((n * (n - 1)) / 2);
      expect(captionText(warmerFrames(falling).at(-1)!.say)).toContain(`it makes n(n−1)/2 = ${(n * (n - 1)) / 2}`);
      expect(stackNextCmp(falling)).toBeLessThan(2 * n);
    }
  });

  it('when an input is kind to brute force the caption says so, and only then', () => {
    for (const xs of arrays.filter((a) => a.length > 1)) {
      const t = totalsFor('warmer', xs, 3);
      const end = captionText(warmerFrames(xs).at(-1)!.say);
      expect(end.includes('which this input happens to make cheap')).toBe(t.brute <= t.cmps);
      for (const k of K_CHOICES) {
        const tw = totalsFor('window', xs, k);
        expect(captionText(windowFrames(xs, k).at(-1)!.say).includes('cheap only because k is small')).toBe(tw.brute <= tw.cmps);
      }
      const tr = totalsFor('rect', xs, 3);
      expect(captionText(rectFrames(xs).at(-1)!.say).includes('cheap only because there are so few bars')).toBe(tr.brute <= tr.cmps);
    }
    // A rising run: every day is answered by the next, so both sides make n − 1 comparisons.
    const rising = [1, 2, 3, 4, 5];
    expect(totalsFor('warmer', rising, 3)).toMatchObject({ cmps: 4, brute: 4 });
    // The default week, in matching units: the stack makes 10, brute force 11.
    expect(totalsFor('warmer', PRESETS.warmer[0].values, 3)).toMatchObject({ cmps: 10, brute: 11 });
  });
});
