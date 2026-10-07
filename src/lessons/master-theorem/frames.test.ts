import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { seededPoints } from './closest';
import { caseLabel, num, pairFrames, thetaText, treeFrames } from './frames';
import { A_VALUES, B_VALUES, classify, DISPLAY_K, F_IDS, PRESETS, treeLevels, treeSum } from './master';

describe('treeFrames', () => {
  it('has one frame per level, every caption its own, and closes on the case and the real sum, for all 168 (a, b, f)', () => {
    for (const a of A_VALUES) for (const b of B_VALUES) for (const f of F_IDS) {
      const K = DISPLAY_K[b];
      const frames = treeFrames(a, b, f, K);
      expect(frames).toHaveLength(1 + (K + 1) + 1);
      expect(frames.every((x) => x.say != null)).toBe(true);
      const c = classify(a, b, f);
      const last = text(frames.at(-1)!.say);
      expect(last).toContain(`${caseLabel(c)}`);
      expect(last).toContain(`Θ(${thetaText(c.theta)})`);
      expect(last).toContain(`= ${num(treeSum(a, b, f, K))}.`);
      treeLevels(a, b, f, K).forEach((l, i) => expect(text(frames[i + 1].say)).toContain(`total ${num(l.total)}`));
    }
  });

  it('states the presets the way the lesson promises', () => {
    const verdict = (id: string) => {
      const p = PRESETS.find((x) => x.id === id)!;
      return text(treeFrames(p.a, p.b, p.f, DISPLAY_K[p.b]).at(-1)!.say);
    };
    expect(verdict('binary')).toContain('Θ(log n)');
    expect(verdict('merge')).toContain('Θ(n log n)');
    expect(verdict('karatsuba')).toContain('Θ(n^1.585)');
    expect(verdict('strassen')).toContain('Θ(n^2.807)');
    expect(verdict('degenerate')).toContain('Case 3');
    expect(verdict('degenerate')).toContain('Θ(n)');
    expect(verdict('gap')).toContain('Not covered by the basic theorem');
    expect(verdict('gap')).toContain('Θ(n log log n)');
  });

  it('writes exponents and big numbers readably', () => {
    expect(thetaText({ p: 2, q: 0 })).toBe('n²');
    expect(thetaText({ p: 0, q: 2 })).toBe('log² n');
    expect(thetaText({ p: 0, q: 0 })).toBe('1');
    expect(num(4096)).toBe('4,096');
    expect(num(8 ** 12)).toBe('6.87 × 10¹⁰');
  });
});

describe('pairFrames', () => {
  it('walks every combine step and closes on the true closest distance and per-level counts', () => {
    for (let s = 1; s <= 30; s++) {
      const { run, frames } = pairFrames(seededPoints(s, 32));
      expect(frames).toHaveLength(run.steps.length + 2);
      const last = text(frames.at(-1)!.say);
      expect(last).toContain(`distance ${run.best.d.toFixed(2)}`);
      run.stripChecks.forEach((c, l) => expect(last).toContain(`level ${l}: ${c}`));
    }
  });
});

describe('try-this claims', () => {
  it('merge sort at n = 4,096: 13 levels, every one exactly 4,096; Karatsuba with a = 4 becomes Θ(n²)', () => {
    const lv = treeLevels(2, 2, 'n', DISPLAY_K[2]);
    expect(lv).toHaveLength(13);
    expect(lv.every((l) => l.total === 4096)).toBe(true);
    expect(thetaText(classify(4, 2, 'n').theta)).toBe('n²');
    const shrink = treeLevels(1, 2, 'n', DISPLAY_K[2]).slice(0, -1).map((l) => l.total);
    expect(shrink.every((t, i) => i === 0 || t < shrink[i - 1])).toBe(true);
  });
});
