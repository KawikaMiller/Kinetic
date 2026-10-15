import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { decisionCaption } from './captions';
import {
  CONSTRAINTS, CRITERIA, OPENING_WEIGHTS, OPTIONS, SWEEP_STEP, normalise, optionOf, rank, scaled, scoreOf, sweepFlips, violated, weightTotal, winner, withShare,
  type ConstraintId, type CriterionId, type OptionId, type Weights,
} from './decision';

const randomWeights = (rnd: () => number): Weights =>
  Object.fromEntries(CRITERIA.map((c) => [c.id, Math.floor(rnd() * 21) * 5])) as Weights;

describe('the weighted ranking', () => {
  it('is a weighted sum over min-max-scaled criteria, equal to a brute-force sum over the raw table, on 200 seeded weight vectors', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 200; k++) {
      const w = randomWeights(rnd);
      if (weightTotal(w) === 0) continue;
      const ranked = rank(w, [])!;
      for (const r of ranked) {
        // brute force from the raw numbers
        let expected = 0;
        for (const c of CRITERIA) {
          const column = OPTIONS.map((o) => o.values[c.id]);
          const lo = Math.min(...column);
          const hi = Math.max(...column);
          expected += (w[c.id] / weightTotal(w)) * (hi === lo ? 1 : (hi - r.option.values[c.id]) / (hi - lo));
        }
        expect(r.score, `${r.option.id} ${JSON.stringify(w)}`).toBeCloseTo(expected, 12);
      }
      for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score - 1e-12);
    }
  });

  it('scales each criterion so the lowest value is 1 and the highest is 0, and keeps scores between 0 and 1', () => {
    for (const c of CRITERIA) {
      const xs = OPTIONS.map((o) => o.values[c.id]);
      expect(scaled(c.id, Math.min(...xs))).toBe(1);
      expect(scaled(c.id, Math.max(...xs))).toBe(0);
    }
    const rnd = mulberry32(2);
    for (let k = 0; k < 200; k++) {
      const w = randomWeights(rnd);
      if (weightTotal(w) === 0) continue;
      for (const r of rank(w, [])!) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('refuses weights that are all zero, and does not mistake a single weight for them', () => {
    const zero = { latency: 0, cost: 0, staleness: 0, effort: 0 };
    expect(normalise(zero)).toBeNull();
    expect(rank(zero, [])).toBeNull();
    expect(winner(zero, [])).toBeNull();
    expect(normalise({ ...zero, cost: 5 })).toEqual({ latency: 0, cost: 1, staleness: 0, effort: 0 });
  });

  it('keeps ranking by shares: doubling every weight changes nothing', () => {
    const doubled = Object.fromEntries(CRITERIA.map((c) => [c.id, OPENING_WEIGHTS[c.id] * 2])) as Weights;
    expect(rank(doubled, [])!.map((r) => r.option.id)).toEqual(rank(OPENING_WEIGHTS, [])!.map((r) => r.option.id));
  });

  it('orders the options by the one criterion that has any weight, best (lowest) first', () => {
    const ranked = rank({ latency: 0, cost: 100, staleness: 0, effort: 0 }, [])!;
    expect(ranked.map((r) => r.option.id)).toEqual(['nothing', 'denormalise', 'cache', 'replica']);
    expect(rank({ latency: 0, cost: 0, staleness: 100, effort: 0 }, [])!.slice(0, 1)[0].option.id).toBe('nothing');
    const tied = rank({ latency: 0, cost: 0, staleness: 0, effort: 1 }, [])!;
    expect(tied[0].option.id).toBe('nothing');
  });
});

describe('must-have constraints', () => {
  it('knock out exactly the options that break a switched-on constraint, and list the constraints they break', () => {
    for (const mask of [[], ['staleness'], ['effort'], ['cost'], ['staleness', 'effort', 'cost']] as ConstraintId[][]) {
      const ranked = rank(OPENING_WEIGHTS, mask)!;
      for (const r of ranked) {
        const broken = CONSTRAINTS.filter((c) => mask.includes(c.id) && r.option.values[c.criterion] > c.limit);
        expect(r.knockedOut.map((c) => c.id)).toEqual(broken.map((c) => c.id));
        expect(violated(r.option, mask)).toEqual(r.knockedOut);
      }
      const inRace = ranked.filter((r) => r.knockedOut.length === 0).length;
      expect(ranked.slice(0, inRace).every((r) => r.knockedOut.length === 0)).toBe(true);
    }
  });

  it('try-this 3: effort ≤ 4 weeks knocks out Denormalise, so the cache ranks first instead of Denormalise', () => {
    expect(winner(OPENING_WEIGHTS, [])!.id).toBe('denormalise');
    expect(winner(OPENING_WEIGHTS, ['effort'])!.id).toBe('cache');
    expect(rank(OPENING_WEIGHTS, ['effort'])!.find((r) => r.option.id === 'denormalise')!.knockedOut.map((c) => c.id)).toEqual(['effort']);
    expect(expectCaption(decisionCaption(OPENING_WEIGHTS, ['effort'], 'latency'))).toContain('Add a cache');
    expect(expectCaption(decisionCaption(OPENING_WEIGHTS, ['effort'], 'latency'))).toContain('Denormalise the profile tables (effort ≤ 4 weeks) is knocked out');
  });

  it('keeps a knocked-out option out whatever its score, and names no winner when every option is out', () => {
    const everything: ConstraintId[] = ['staleness', 'effort', 'cost'];
    expect(optionOf('nothing').values.effort).toBe(0);
    const r = rank(OPENING_WEIGHTS, everything)!;
    expect(r[0].option.id).toBe('nothing');
    // all weight on latency, where the knocked-out options score best: they stay out anyway
    expect(winner({ latency: 100, cost: 0, staleness: 0, effort: 0 }, everything)!.id).toBe('nothing');
    expect(rank({ latency: 100, cost: 0, staleness: 0, effort: 0 }, everything)![0].score).toBeLessThan(rank({ latency: 100, cost: 0, staleness: 0, effort: 0 }, [])![0].score);
  });
});

describe('where the decision flips', () => {
  /** Independent oracle: each option's score is a line in the swept share; find the winner exactly at the crossing points, not by scanning. */
  function analyticFlips(w: Weights, c: CriterionId, on: ConstraintId[]): number[] {
    const eligible = OPTIONS.filter((o) => violated(o, on).length === 0);
    if (eligible.length === 0) return [];
    // score_i(s) = s * a_i + (1 - s) * b_i with a_i the scaled value of c and b_i the weighted rest
    const at0 = withShare(w, c, 0);
    const lines = eligible.map((o) => {
      const b = CRITERIA.filter((x) => x.id !== c).reduce((sum, x) => sum + at0[x.id] * scaled(x.id, o.values[x.id]), 0);
      return { id: o.id, a: scaled(c, o.values[c]), b, order: OPTIONS.indexOf(o) };
    });
    const best = (s: number): OptionId =>
      [...lines].sort((p, q) => (s * q.a + (1 - s) * q.b) - (s * p.a + (1 - s) * p.b) || p.order - q.order)[0].id;
    const crossings = new Set<number>();
    for (const p of lines) for (const q of lines) {
      const denom = (p.a - p.b) - (q.a - q.b);
      if (denom !== 0) {
        const s = (q.b - p.b) / denom;
        if (s > 0 && s < 1) crossings.add(s);
      }
    }
    const points = [0, ...[...crossings].sort((x, y) => x - y), 1];
    const flips: number[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      const before = best((points[i - 1] + points[i]) / 2);
      const after = best((points[i] + points[i + 1]) / 2);
      if (before !== after) flips.push(points[i]);
    }
    return flips;
  }

  it('reports the same flip points as an analytic envelope, to within 0.01, on 200 seeded weight vectors and constraint sets', () => {
    const rnd = mulberry32(99);
    let checked = 0;
    for (let k = 0; k < 200; k++) {
      const w = randomWeights(rnd);
      const on = CONSTRAINTS.filter(() => rnd() < 0.25).map((c) => c.id);
      for (const c of CRITERIA) {
        const scan = sweepFlips(w, c.id, on).map((f) => f.at);
        const exact = analyticFlips(w, c.id, on);
        expect(scan.length, `${JSON.stringify(w)} ${c.id} ${on}`).toBe(exact.length);
        scan.forEach((s, i) => expect(Math.abs(s - exact[i])).toBeLessThanOrEqual(SWEEP_STEP + 1e-9));
        checked += exact.length;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('names the winner before and after each flip, and the flip is real: the winner differs on the two sides', () => {
    for (const c of CRITERIA) {
      for (const f of sweepFlips(OPENING_WEIGHTS, c.id, [])) {
        expect(winner(withShare(OPENING_WEIGHTS, c.id, f.at), [])?.id ?? null).toBe(f.to);
        expect(winner(withShare(OPENING_WEIGHTS, c.id, Math.round((f.at - SWEEP_STEP) * 100) / 100), [])?.id ?? null).toBe(f.from);
        expect(f.from).not.toBe(f.to);
      }
    }
  });

  it('keeps the other three weights in proportion as the swept share moves, and splits equally when they are all zero', () => {
    const w = withShare(OPENING_WEIGHTS, 'latency', 0.4);
    expect(weightTotal(w)).toBeCloseTo(1, 12);
    expect(w.cost / w.staleness).toBeCloseTo(OPENING_WEIGHTS.cost / OPENING_WEIGHTS.staleness, 12);
    const alone = withShare({ latency: 100, cost: 0, staleness: 0, effort: 0 }, 'latency', 0.4);
    expect(alone.cost).toBeCloseTo(0.2, 12);
    expect(alone.staleness).toBeCloseTo(0.2, 12);
    expect(weightTotal(withShare(OPENING_WEIGHTS, 'effort', 1))).toBeCloseTo(1, 12);
  });

  it('at the opening weights, doing nothing wins below a latency weight of 0.31 and Denormalise above it', () => {
    expect(sweepFlips(OPENING_WEIGHTS, 'latency', [])).toEqual([{ at: 0.31, from: 'nothing', to: 'denormalise' }]);
  });

  it('scores each option the same as the sweep at the swept criterion’s current share', () => {
    const shares = normalise(OPENING_WEIGHTS)!;
    const swept = withShare(OPENING_WEIGHTS, 'latency', shares.latency);
    for (const o of OPTIONS) expect(scoreOf(o, swept)).toBeCloseTo(scoreOf(o, shares), 12);
  });
});
