import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DOCS, QUERY_PRESETS, VECTOR_PRESETS, compare, direction, metricsDisagree, plotExtent, rank, read, snap, topIds, type V2,
} from './model';

const rnd = mulberry32(8);
const randomVec = (): V2 => [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20];

/** Independent reference: the angle between two vectors from their polar angles, no dot product involved. */
function angleFromPolar(a: V2, b: V2): number {
  let d = Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

describe('read', () => {
  it('cos θ = a·b / (‖a‖‖b‖), stays in [−1, 1], and matches the angle measured from polar angles', () => {
    for (let i = 0; i < 500; i++) {
      const a = randomVec();
      const b = randomVec();
      const r = read(a, b);
      const handDot = a[0] * b[0] + a[1] * b[1];
      expect(r.dot).toBeCloseTo(handDot, 12);
      expect(r.normA).toBeCloseTo(Math.hypot(...a), 12);
      expect(r.cos).toBeCloseTo(handDot / (Math.hypot(...a) * Math.hypot(...b)), 12);
      expect(r.cos!).toBeGreaterThanOrEqual(-1);
      expect(r.cos!).toBeLessThanOrEqual(1);
      expect(r.angle!).toBeCloseTo(angleFromPolar(a, b), 6);
    }
  });

  it('scaling either vector by k > 0 leaves cosine unchanged and scales the dot product by k', () => {
    for (let i = 0; i < 200; i++) {
      const a = randomVec();
      const b = randomVec();
      const k = 0.1 + rnd() * 9;
      const base = read(a, b);
      const bk = read(a, [b[0] * k, b[1] * k]);
      const ak = read([a[0] * k, a[1] * k], b);
      expect(bk.cos).toBeCloseTo(base.cos!, 12);
      expect(ak.cos).toBeCloseTo(base.cos!, 12);
      expect(bk.dot).toBeCloseTo(base.dot * k, 9);
    }
  });

  it('the shadow is the foot of the perpendicular from b to a’s line, and dot = shadow length × ‖a‖', () => {
    for (let i = 0; i < 200; i++) {
      const a = randomVec();
      const b = randomVec();
      const r = read(a, b);
      const [sx, sy] = r.shadow!;
      // b − shadow is perpendicular to a, and the shadow lies on a's line (cross product 0).
      expect((b[0] - sx) * a[0] + (b[1] - sy) * a[1]).toBeCloseTo(0, 9);
      expect(sx * a[1] - sy * a[0]).toBeCloseTo(0, 9);
      expect(r.shadowLength! * r.normA).toBeCloseTo(r.dot, 9);
      expect(Math.abs(r.shadowLength!)).toBeCloseTo(Math.hypot(sx, sy), 9);
    }
  });

  it('a zero vector has no angle: cos and θ are null (the screen says "undefined"), never NaN', () => {
    for (const [a, b] of [[[0, 0], [3, 1]], [[3, 1], [0, 0]], [[0, 0], [0, 0]]] as [V2, V2][]) {
      const r = read(a, b);
      expect(r.cos).toBeNull();
      expect(r.angle).toBeNull();
      expect(r.dot).toBe(0);
      expect(direction(a, b)).toBe('undefined');
    }
    expect(read([0, 0], [1, 1]).shadow).toBeNull();
  });
});

describe('presets', () => {
  it('same / perpendicular / opposite give cos 1, 0 and −1 exactly as labelled', () => {
    const byId = (id: string) => VECTOR_PRESETS.find((x) => x.id === id)!;
    const cos = (id: string) => read(byId(id).a, byId(id).b).cos!;
    const dir = (id: string) => direction(byId(id).a, byId(id).b);
    expect(cos('same')).toBeCloseTo(1, 12);
    expect(dir('same')).toBe('same');
    expect(cos('perpendicular')).toBe(0);
    expect(dir('perpendicular')).toBe('perpendicular');
    expect(cos('opposite')).toBeCloseTo(-1, 12);
    expect(dir('opposite')).toBe('opposite');
  });

  it('"long but off-angle vs short and aligned": the dot product prefers the long one, cosine the aligned one', () => {
    const p = VECTOR_PRESETS.find((x) => x.id === 'long-short')!;
    const long = read(p.a, p.pinned!);
    const short = read(p.a, p.b);
    expect(long.normB).toBeGreaterThan(short.normB);
    expect(long.dot).toBeGreaterThan(short.dot);
    expect(short.cos!).toBeGreaterThan(long.cos!);
    expect(compare(p.a, p.pinned!, p.b)).toEqual({ dotPrefers: 'pinned', cosPrefers: 'current', disagree: true });
  });

  it('every preset vector sits on the snap grid and inside the base plot', () => {
    for (const p of VECTOR_PRESETS) {
      for (const v of [p.a, p.b, ...(p.pinned ? [p.pinned] : [])]) {
        expect(v.map(snap)).toEqual([...v]);
      }
      expect(plotExtent([p.a, p.b])).toBe(5);
    }
  });
});

describe('plotExtent', () => {
  it('grows to fit a doubled b and never shrinks below the base', () => {
    expect(plotExtent([[3, 1], [9, 3]])).toBe(10);
    expect(plotExtent([[0, 0]])).toBe(5);
    expect(plotExtent([[-7.4, 0]])).toBe(8);
  });
});

describe('snap', () => {
  it('rounds to 0.1 and never returns −0', () => {
    expect(snap(1.26)).toBeCloseTo(1.3, 12);
    expect(Object.is(snap(-0.01), 0)).toBe(true);
  });
});

/**
 * Brute force: a document's rank is how many others beat it, scored by a separate formula.
 * A tie (within 1e-12) goes to the earlier letter, the rule the lesson states.
 */
function bruteTop(query: V2, metric: 'cosine' | 'euclidean', k = 3): string[] {
  const score = (at: V2) =>
    metric === 'cosine'
      ? (query[0] * at[0] + query[1] * at[1]) / (Math.hypot(...query) * Math.hypot(...at))
      : -Math.hypot(query[0] - at[0], query[1] - at[1]);
  const beats = (o: (typeof DOCS)[number], d: (typeof DOCS)[number]) =>
    score(o.at) - score(d.at) > 1e-12 || (Math.abs(score(o.at) - score(d.at)) <= 1e-12 && o.id < d.id);
  return DOCS.filter((d) => DOCS.filter((o) => o !== d && beats(o, d)).length < k).map((d) => d.id).sort();
}

describe('rank', () => {
  it('matches a brute-force count for both metrics at many query points', () => {
    for (let x = 0; x <= 10; x += 0.5) {
      for (let y = 0; y <= 10; y += 0.5) {
        if (x === 0 && y === 0) continue;
        for (const metric of ['cosine', 'euclidean'] as const) {
          expect([...topIds(rank([x, y], metric))].sort()).toEqual(bruteTop([x, y], metric));
        }
      }
    }
  });

  it('has no ties in the top 3 at any preset (so the order shown is the only order)', () => {
    for (const q of QUERY_PRESETS.filter((p) => p.id !== 'zero')) {
      for (const metric of ['cosine', 'euclidean'] as const) {
        const r = rank(q.at, metric)!;
        for (let i = 0; i < 3; i++) expect(r[i].score).not.toBe(r[i + 1].score);
      }
    }
  });

  it('the short cat question ranks differently by cosine and by distance; the balanced one agrees', () => {
    const short = QUERY_PRESETS.find((p) => p.id === 'short-cat')!.at;
    expect(topIds(rank(short, 'cosine'))).toEqual(['A', 'G', 'K']);
    expect(topIds(rank(short, 'euclidean'))).toEqual(['B', 'F', 'D']);
    expect(metricsDisagree(short)).toBe(true);
    const balanced = QUERY_PRESETS.find((p) => p.id === 'balanced')!.at;
    expect(metricsDisagree(balanced)).toBe(false);
  });

  it('a zero query has no cosine ranking, but distance still works', () => {
    expect(rank([0, 0], 'cosine')).toBeNull();
    expect(topIds(rank([0, 0], 'euclidean'))).toEqual(['D', 'B', 'F']);
    expect(metricsDisagree([0, 0])).toBe(false);
  });

  it('cosine ignores length: a document and the same document 3× longer score the same', () => {
    const q: V2 = [2, 0.4];
    const doubled = rank(q, 'cosine', [{ id: 'x', title: 'x', at: [1, 2] }, { id: 'y', title: 'y', at: [3, 6] }])!;
    expect(doubled[0].score).toBeCloseTo(doubled[1].score, 12);
  });
});
