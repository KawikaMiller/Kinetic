import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { dotCaption, neighbourCaption, num } from './frames';
import { mulberry32 } from '../../core/random';
import { QUERY_PRESETS, VECTOR_PRESETS, rank, read, snapV, topIds, type V2 } from './model';

const twice = ([x, y]: V2): V2 => [2 * x, 2 * y];

describe('num', () => {
  it('rounds, drops trailing zeros and uses a real minus sign', () => {
    expect(num(15)).toBe('15');
    expect(num(-6.004)).toBe('−6');
    expect(num(0.83333, 3)).toBe('0.833');
    expect(num(-0.0001)).toBe('0');
  });
});

describe('dotCaption', () => {
  it('names the exact cases the presets set up', () => {
    const byId = (id: string) => VECTOR_PRESETS.find((p) => p.id === id)!;
    expect(text(dotCaption(byId('same').a, byId('same').b, false, null))).toBe(
      'Same direction: θ = 0°, cos θ = 1. All of b lies along a, so a·b = ‖a‖‖b‖ = 15, the most these lengths can give.',
    );
    expect(text(dotCaption(byId('perpendicular').a, byId('perpendicular').b, false, null))).toContain('cos θ = 0. b casts no shadow on a, so a·b = 0.');
    expect(text(dotCaption(byId('opposite').a, byId('opposite').b, false, null))).toContain('a·b = −‖a‖‖b‖ = −10');
  });

  it('every preset × scale × pin combination states the dot product of the vectors actually shown', () => {
    for (const p of VECTOR_PRESETS) {
      for (const doubled of [false, true]) {
        for (const pinned of [null, p.pinned ?? ([2, 2] as V2)]) {
          const shown = doubled ? twice(p.b) : p.b;
          const c = text(dotCaption(p.a, shown, doubled, pinned));
          const r = read(p.a, shown);
          if (r.dot !== 0) expect(c).toContain(num(r.dot));
          expect(c).toContain(doubled ? 'a·2b' : 'a·b');
          expect(c.includes('b is doubled')).toBe(doubled);
          if (doubled) expect(c).toContain(`a·b was ${num(r.dot / 2)}, a·2b is ${num(r.dot)}, and cos θ didn't move`);
          expect(c.includes('Compared with b′')).toBe(pinned !== null);
          expect(c).not.toMatch(/NaN|undefined /);
        }
      }
    }
  });

  it('the long-vs-short preset says the two scores disagree, and which wins each', () => {
    const p = VECTOR_PRESETS.find((x) => x.id === 'long-short')!;
    const c = text(dotCaption(p.a, p.b, false, p.pinned!));
    expect(c).toContain('the dot product prefers b′ (a·b′ = 7.5 vs a·b = 4), cosine prefers b (cos 0.514 vs 1)');
  });

  it('says why the shadow is negative past 90°', () => {
    expect(text(dotCaption([3, 1], [-2, 1], false, null))).toBe(
      `θ ≈ ${num(read([3, 1], [-2, 1]).angle!, 0)}°: more than 90°, so b's shadow falls behind a (${num(-5 / Math.sqrt(10))}) and a·b is negative: −5.`,
    );
  });

  it('a zero vector reads "undefined", never NaN, whichever one it is', () => {
    expect(text(dotCaption([0, 0], [1, 2], false, null))).toBe('a is the zero vector: no direction, so θ and cos θ are undefined. a·b is 0.');
    expect(text(dotCaption([1, 2], [0, 0], true, null))).toBe('2b is the zero vector: no direction, so θ and cos θ are undefined. a·2b is 0.');
    expect(text(dotCaption([0, 0], [0, 0], false, [1, 1]))).toContain("Against b′, cosine can't compare");
  });
});

describe('neighbourCaption', () => {
  it('lists the true top 3 for every query × metric, and says when the other metric disagrees', () => {
    for (const q of QUERY_PRESETS) {
      for (const metric of ['cosine', 'euclidean'] as const) {
        const c = text(neighbourCaption(q.at, metric));
        const ranked = rank(q.at, metric);
        if (!ranked) {
          expect(c).toContain('undefined');
          continue;
        }
        expect(c).toContain(`are ${topIds(ranked).join(', ')}.`);
        if (q.id === 'short-cat') expect(c).toContain(metric === 'cosine' ? 'Distance would pick B, F, D instead' : 'Cosine would pick A, G, K instead');
        if (q.id === 'balanced') expect(c).toContain('Both metrics agree');
        if (q.id === 'zero') expect(c).toContain("Cosine can't rank an empty query at all.");
      }
    }
  });
});

describe('sweep: exact-case captions only when exact (review B8)', () => {
  const rnd = mulberry32(2024);
  const grid = (): V2 => snapV([(rnd() - 0.5) * 10, (rnd() - 0.5) * 10]);
  const pairs: [V2, V2][] = Array.from({ length: 20000 }, () => [grid(), grid()]);
  // The reviewer's repros, plus near-misses on purpose: parallel but 0.1 off, perpendicular but 0.1 off.
  pairs.push([[3, 1], [4.5, 1.6]], [[-5, -4.3], [-3.7, 4.3]], [[3, 1], [-1, 3.1]], [[3, 1], [-3, -1.1]]);
  for (let k = 1; k <= 30; k++) pairs.push([[3, 1], snapV([3 * k / 10, k / 10])], [[2, -1], snapV([k / 10, 2 * k / 10])]);

  it('"Same direction" / "Opposite" need a zero cross product; "Perpendicular" needs a zero dot product', () => {
    let exact = 0;
    for (const [a, b] of pairs) {
      const c = text(dotCaption(a, b, false, null));
      const d = a[0] * b[0] + a[1] * b[1];
      const cross = a[0] * b[1] - a[1] * b[0];
      if (c.startsWith('Same direction') || c.startsWith('Opposite')) {
        exact++;
        expect(Math.abs(cross)).toBeLessThan(1e-9);
      }
      if (c.startsWith('Perpendicular')) {
        exact++;
        expect(Math.abs(d)).toBeLessThan(1e-9);
      }
      if (Math.abs(cross) >= 1e-9 && Math.abs(d) >= 1e-9) expect(c).toMatch(/^θ ≈/);
    }
    expect(exact).toBeGreaterThan(30);
  });

  it('the reviewer repros now read "θ ≈", not an exact case', () => {
    expect(text(dotCaption([3, 1], [4.5, 1.6], false, null))).toMatch(/^θ ≈ 1°/);
    expect(text(dotCaption([-5, -4.3], [-3.7, 4.3], false, null))).toMatch(/^θ ≈ 90°/);
  });

  it('"Length won the dot product" only when the dot-product winner is the longer vector', () => {
    const c = text(dotCaption([1, 0], [-0.5, 0.1], false, [-1, 4.9]));
    expect(c).not.toContain('Length won');
    for (let t = 0; t < 3000; t++) {
      const a = grid();
      const b = grid();
      const pin = grid();
      const cap = text(dotCaption(a, b, false, pin));
      if (!cap.includes('Length won')) continue;
      const rb = read(a, b);
      const rp = read(a, pin);
      const dotWinnerLen = rp.dot > rb.dot ? rp.normB : rb.normB;
      expect(dotWinnerLen).toBe(Math.max(rp.normB, rb.normB));
    }
  });
});
