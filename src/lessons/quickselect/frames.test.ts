import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { selectFrames } from './frames';
import { DEFAULT_SEED, K_CHOICES, kFor, PRESETS, quickselect, quicksortComparisons, winner, type PivotRule } from './model';

const RULES: PivotRule[] = ['last', 'random', 'median3'];
const text = (f: { say?: unknown }) => captionText(f.say as never);

describe('selectFrames', () => {
  it('every preset × pivot rule × k ends with the true answer and the winner the counts give', () => {
    for (const p of PRESETS) for (const rule of RULES) for (const c of K_CHOICES) {
      const xs = [...p.values];
      const k = kFor(c.value, xs.length);
      const fr = selectFrames(xs, k, rule, DEFAULT_SEED, c.label);
      const last = fr[fr.length - 1];
      const say = text(last);
      const sorted = [...xs].sort((a, b) => a - b);
      const sel = quickselect(xs, k, rule, DEFAULT_SEED).comparisons;
      const sort = quicksortComparisons(xs, rule, DEFAULT_SEED).comparisons;
      const label = `${p.id} ${rule} ${c.value}`;
      expect(say, label).toContain(`Answer: ${sorted[k]} at k = ${k}`);
      expect(last.cmps, label).toBe(sel);
      const w = winner(sel, sort);
      expect(say.includes('Quickselect wins'), label).toBe(w === 'select');
      expect(say.includes('dead heat'), label).toBe(w === 'tie');
      expect(say.includes('Quick sort wins'), label).toBe(w === 'sort');
      expect(last.found).toBe(k);
      expect(last.arr[k]).toBe(sorted[k]);
    }
  });

  it('each comparison caption names the value that was compared, and the cell where it now sits', () => {
    const fr = selectFrames([...PRESETS[0].values], 5, 'last', DEFAULT_SEED, 'median');
    let checked = 0;
    for (const f of fr) {
      const m = /^(\d+) (≤|>) (\d+):/.exec(text(f));
      if (!m || f.j === null || f.i === null) continue;
      checked++;
      const shownAt = m[2] === '≤' ? f.i - 1 : f.j;
      expect(f.arr[shownAt]).toBe(Number(m[1]));
      expect(f.arr[f.pivotAt!]).toBe(Number(m[3]));
    }
    expect(checked).toBe(fr.filter((f) => f.j !== null && f.say !== undefined && /^\d/.test(text(f))).length);
    expect(checked).toBeGreaterThan(5);
  });

  it('dims exactly what a "never touched again" caption threw away', () => {
    const fr = selectFrames([...PRESETS[1].values], 5, 'last', DEFAULT_SEED, 'median');
    for (let t = 1; t < fr.length; t++) {
      if (!text(fr[t]).includes('never touched again')) continue;
      // Nothing outside the new live range changes for the rest of the run.
      const { lo, hi } = fr[t];
      for (const later of fr.slice(t)) {
        for (let i = 0; i < later.arr.length; i++) if (i < lo || i > hi) expect(later.arr[i]).toBe(fr[t].arr[i]);
      }
    }
  });

  it('backs the try-this numbers', () => {
    const sorted = [...PRESETS[1].values];
    const med = kFor('median', sorted.length);
    expect(quickselect(sorted, med, 'median3').comparisons).toBe(13);
    expect(quickselect(sorted, med, 'median3').rounds).toBe(1);
    expect(quickselect(sorted, 0, 'last').comparisons).toBe(66);
    expect(quicksortComparisons(sorted, 'last').comparisons).toBe(66);
    const answers = new Set([1, 2, 3, 4, 5, 6].map((s) => quickselect([...PRESETS[0].values], 5, 'random', s).value));
    const counts = new Set([1, 2, 3, 4, 5, 6].map((s) => quickselect([...PRESETS[0].values], 5, 'random', s).comparisons));
    expect(answers.size).toBe(1);
    expect(counts.size).toBeGreaterThan(1);
  });

  it('a one-value array is answered with no comparisons', () => {
    const fr = selectFrames([42], 0, 'last', DEFAULT_SEED, 'median');
    expect(text(fr[fr.length - 1])).toContain('Answer: 42 at k = 0, after 0 comparisons');
  });
});
