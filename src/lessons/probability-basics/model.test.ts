import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  EVENTS, RACK_DOWN, chance, checkpoints, distinct, ownRate, replicaDown, convergence, eventSet, hitsOf, outcomeCell, replicaRisk, rollsFor, rules, runSuite,
  spaceSize, suiteRed, totals, type Dice,
} from './model';

/** Independent reference: walk the faces with nested loops and count by hand-written predicates. */
function bruteCount(dice: Dice, pred: (a: number, b: number) => boolean): number {
  let n = 0;
  for (let a = 1; a <= 6; a++) {
    if (dice === 1) n += pred(a, 0) ? 1 : 0;
    else for (let b = 1; b <= 6; b++) n += pred(a, b) ? 1 : 0;
  }
  return n;
}

const REFERENCE: Record<string, { dice: Dice; pred: (a: number, b: number) => boolean; count: number }> = {
  even: { dice: 1, pred: (a) => a === 2 || a === 4 || a === 6, count: 3 },
  'five-up': { dice: 1, pred: (a) => a === 5 || a === 6, count: 2 },
  six: { dice: 1, pred: (a) => a === 6, count: 1 },
  low: { dice: 1, pred: (a) => a < 4, count: 3 },
  sum7: { dice: 2, pred: (a, b) => a + b === 7, count: 6 },
  double: { dice: 2, pred: (a, b) => a === b, count: 6 },
  any6: { dice: 2, pred: (a, b) => a === 6 || b === 6, count: 11 },
  sum10: { dice: 2, pred: (a, b) => a + b > 9, count: 6 },
  'first-even': { dice: 2, pred: (a) => a % 2 === 0, count: 18 },
};

describe('sample space and events', () => {
  it('every preset matches a brute-force count over the outcomes, and the textbook value', () => {
    for (const dice of [1, 2] as const) {
      for (const e of EVENTS[dice]) {
        const ref = REFERENCE[e.id];
        expect(ref.dice).toBe(dice);
        expect(eventSet(dice, e).size).toBe(bruteCount(dice, ref.pred));
        expect(eventSet(dice, e).size).toBe(ref.count);
      }
    }
    expect(spaceSize(2)).toBe(36);
  });

  it('1,000 seeded custom cell sets: P = |set|/36 equals counting the (first, second) pairs directly', () => {
    const rnd = mulberry32(7);
    for (let trial = 0; trial < 1000; trial++) {
      const chosen = new Set<string>();
      const set = new Set<number>();
      for (let o = 0; o < 36; o++) {
        if (rnd() < 0.4) {
          set.add(o);
          const { r, c } = outcomeCell(2, o);
          chosen.add(`${r + 1},${c + 1}`);
        }
      }
      const r = rules(set, new Set(), 36);
      expect(r.a).toBe(bruteCount(2, (a, b) => chosen.has(`${a},${b}`)));
    }
  });

  it('the union rule holds for every pair of presets', () => {
    for (const dice of [1, 2] as const) {
      for (const ea of EVENTS[dice]) {
        for (const eb of EVENTS[dice]) {
          const r = rules(eventSet(dice, ea), eventSet(dice, eb), spaceSize(dice));
          const either = bruteCount(dice, (a, b) => REFERENCE[ea.id].pred(a, b) || REFERENCE[eb.id].pred(a, b));
          expect(r.either).toBe(either);
          expect(r.a + r.b - r.both).toBe(either);
        }
      }
    }
  });

  it('the independence verdict is the exact rational check P(A∩B) = P(A)P(B), with no float compare', () => {
    for (const dice of [1, 2] as const) {
      for (const ea of EVENTS[dice]) {
        for (const eb of EVENTS[dice]) {
          const total = BigInt(spaceSize(dice));
          const A = BigInt(REFERENCE[ea.id].count);
          const B = BigInt(REFERENCE[eb.id].count);
          const AB = BigInt(bruteCount(dice, (a, b) => REFERENCE[ea.id].pred(a, b) && REFERENCE[eb.id].pred(a, b)));
          // (AB / total) == (A / total)(B / total)  ⇔  AB · total == A · B
          expect(rules(eventSet(dice, ea), eventSet(dice, eb), spaceSize(dice)).independent).toBe(AB * total === A * B);
        }
      }
    }
    const ev = (d: Dice, id: string) => eventSet(d, EVENTS[d].find((e) => e.id === id)!);
    expect(rules(ev(2, 'sum7'), ev(2, 'first-even'), 36).independent).toBe(true);
    expect(rules(ev(2, 'double'), ev(2, 'any6'), 36).independent).toBe(false);
    expect(rules(ev(1, 'even'), ev(1, 'five-up'), 6).independent).toBe(true);
    expect(rules(ev(1, 'even'), ev(1, 'six'), 6).independent).toBe(false);
  });

  it('exact totals: two dice give the triangle 1..6..1 over sums 2..12', () => {
    expect(totals(2).map((t) => t.ways)).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
    expect(totals(1).map((t) => t.ways)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('rolling', () => {
  it('10,000 seeded rolls land within 0.02 of 6/36 for sum = 7', () => {
    const sum7 = eventSet(2, EVENTS[2].find((e) => e.id === 'sum7')!);
    const rolls = rollsFor(1, 2, 10_000);
    expect(Math.abs(hitsOf(rolls, sum7) / 10_000 - 6 / 36)).toBeLessThan(0.02);
  });

  it('rolls are a pure function of the seed, and a longer run extends a shorter one', () => {
    expect(rollsFor(3, 2, 50)).toEqual(rollsFor(3, 2, 50));
    expect(rollsFor(3, 2, 80).slice(0, 50)).toEqual(rollsFor(3, 2, 50));
    expect(rollsFor(4, 2, 50)).not.toEqual(rollsFor(3, 2, 50));
  });

  it('every face turns up roughly equally (chi-square, 5 d.f., under the 0.1% critical value 20.52)', () => {
    const rolls = rollsFor(9, 1, 60_000);
    const counts = new Array(6).fill(0);
    for (const o of rolls) counts[o]++;
    const chi2 = counts.reduce((s, c) => s + (c - 10_000) ** 2 / 10_000, 0);
    expect(chi2).toBeLessThan(20.52);
  });

  it('convergence points are increasing roll counts ending at the last roll, each a true running frequency', () => {
    const ev = new Set([0, 7, 14, 21, 28, 35]);
    const rolls = rollsFor(2, 2, 3000);
    const pts = convergence(rolls, ev);
    expect(pts[pts.length - 1][0]).toBe(3000);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThan(pts[i - 1][0]);
    for (const [n, f] of pts) expect(f).toBeCloseTo(hitsOf(rolls.slice(0, n), ev) / n, 12);
    expect(checkpoints(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(checkpoints(0)).toEqual([]);
  });
});

describe('replicas and the flaky suite', () => {
  it('pⁿ and 1 − (1 − p)ⁿ: 3 replicas at 1% give 1·10⁻⁶ and 2.9701%', () => {
    const r = replicaRisk(3, 0.01, false);
    expect(r.allDown).toBeCloseTo(1e-6, 18);
    expect(r.anyDown).toBeCloseTo(0.029701, 12);
    expect(chance(r.allDown)).toBe('1.0 × 10⁻⁶');
    expect(chance(r.anyDown)).toBe('2.97%');
  });

  it('shared rack: each replica is still down p overall, and P(all down) matches enumerating rack × replica states', () => {
    for (let n = 1; n <= 4; n++) {
      for (let pm = 5; pm <= 500; pm += 5) {
        const p = pm / 1000;
        const q = ownRate(p);
        // Independent reference: rack down (everything down), or rack up and each up/down pattern of n replicas.
        let all = RACK_DOWN;
        let firstDown = RACK_DOWN;
        for (let mask = 0; mask < 2 ** n; mask++) {
          let prob = 1 - RACK_DOWN;
          for (let b = 0; b < n; b++) prob *= (mask >> b) & 1 ? q : 1 - q;
          if (mask === 2 ** n - 1) all += prob;
          if (mask & 1) firstDown += prob;
        }
        expect(firstDown).toBeCloseTo(p, 12);
        expect(replicaDown(p, true)).toBeCloseTo(p, 12);
        expect(replicaRisk(n, p, true).allDown).toBeCloseTo(all, 12);
        expect(replicaRisk(n, p, true).allDown).toBeGreaterThanOrEqual(RACK_DOWN);
        expect(replicaRisk(n, p, true).allDown).toBeGreaterThanOrEqual(replicaRisk(n, p, false).allDown - 1e-15);
      }
    }
    expect(replicaDown(0, true)).toBe(RACK_DOWN);
  });

  it('0.99²⁰⁰ is 13.40%, so the suite is red 86.60% of the time', () => {
    expect(1 - suiteRed(200, 0.01)).toBeCloseTo(0.13398, 5);
    expect(suiteRed(200, 0.01)).toBeCloseTo(0.86602, 5);
    expect(chance(suiteRed(200, 0.01))).toBe('86.6%');
  });

  it('simulated suites go red at about the exact rate (3 standard errors, fixed seed)', () => {
    const rnd = mulberry32(5);
    const runs = 4000;
    let red = 0;
    for (let i = 0; i < runs; i++) if (runSuite(rnd, 200, 0.01).some(Boolean)) red++;
    const p = suiteRed(200, 0.01);
    expect(Math.abs(red / runs - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / runs));
  });

  it('chance() formats', () => {
    expect(chance(0)).toBe('0%');
    expect(chance(0.5)).toBe('50%');
    expect(chance(1 / 6)).toBe('16.7%');
    expect(chance(1e-4)).toBe('0.01%');
    expect(chance(9.765625e-24)).toBe('9.8 × 10⁻²⁴');
    expect(chance(9.99e-5)).toBe('1.0 × 10⁻⁴');
    expect(chance(1 - 1e-6)).toBe('99.9999%');
    expect(chance(1.25e-4)).toBe('0.0125%');
    expect(chance(0.0010007)).toBe('0.1%');
    for (let k = 1; k <= 12; k++) expect(chance(1 - 10 ** -k)).not.toBe('100%');
  });

  it('distinct() adds figures until two different values read differently', () => {
    expect(distinct(0.0010007, 0.001)).toEqual(['0.1001%', '0.1%']);
    expect(distinct(1 - 0.0010007, 0.999)).toEqual(['99.8999%', '99.9%']);
    expect(distinct(1 - 1e-6, 1 - 1e-4)).toEqual(['99.9999%', '99.99%']);
    expect(distinct(0.5, 0.5)).toEqual(['50%', '50%']);
  });
});
