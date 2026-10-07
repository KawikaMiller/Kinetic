import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { seededPoints } from './closest';
import { caseLabel, levelNote, num, pairFrames, thetaText, treeFrames } from './frames';
import { A_VALUES, B_VALUES, classify, DISPLAY_K, F, F_IDS, PRESETS, treeLevels, treeSum } from './master';

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

describe('review B15 regressions', () => {
  const all = A_VALUES.flatMap((a) => B_VALUES.flatMap((b) => F_IDS.map((f) => [a, b, f] as const)));

  it('case 2 captions say what the level totals actually do', () => {
    for (const [a, b, f] of all) {
      const c = classify(a, b, f);
      if (c.kind !== 2) continue;
      const K = DISPLAY_K[b];
      const lv = treeLevels(a, b, f, K);
      const last = text(treeFrames(a, b, f, K).at(-1)!.say);
      if (c.k === 0) {
        expect(last).toContain('every level, the leaves included, does the same');
        for (const l of lv) expect(l.total / lv[0].total).toBeCloseTo(1, 9);
      } else {
        expect(last, `${a},${b},${f}`).not.toMatch(/same work/);
        expect(last).toContain('shrinks toward the leaves');
        const work = lv.filter((l) => !l.leaf).map((l) => l.total);
        expect(work.every((t, i) => i === 0 || t < work[i - 1])).toBe(true);
        expect(work[0] / work.at(-1)!).toBeGreaterThan(2);
      }
    }
  });

  it('never writes "log¹"', () => {
    for (const [a, b, f] of all) {
      const K = DISPLAY_K[b];
      for (const fr of treeFrames(a, b, f, K)) expect(text(fr.say)).not.toContain('log¹');
      expect(levelNote(a, b, f)).not.toContain('log¹');
    }
  });

  it('the level note blames the log factor exactly when the polynomial parts tie, and its direction matches the bars', () => {
    for (const [a, b, f] of all) {
      const note = levelNote(a, b, f);
      const c = classify(a, b, f);
      const tie = c.kind === 2 || c.kind === 'gap';
      const lv = treeLevels(a, b, f, DISPLAY_K[b]).filter((l) => !l.leaf).map((l) => l.total);
      if (F[f].q !== 0 && tie) {
        expect(note).toContain('the log factor decides');
        expect(note).not.toContain('polynomial part decides');
        if (note.includes('shrinks')) expect(lv[0]).toBeGreaterThan(lv.at(-1)!);
        if (note.includes('grows')) expect(lv[0]).toBeLessThan(lv.at(-1)!);
      }
      if (F[f].q !== 0 && !tie) expect(note).toContain('polynomial part decides');
      if (F[f].q === 0) {
        const r = lv[1] / lv[0];
        expect(note).toContain(note.includes('growing') ? 'leaves win' : note.includes('shrinking') ? 'root wins' : 'every level the same');
        if (note.includes('growing')) expect(r).toBeGreaterThan(1);
        if (note.includes('shrinking')) expect(r).toBeLessThan(1);
      }
    }
  });

  it('discloses the closest-pair demo cost in full', () => {
    const last = text(pairFrames(seededPoints(1, 32)).frames.at(-1)!.say);
    expect(last).toContain('O(n log² n)');
    expect(last).toContain('merging y-sorted halves');
  });
});
