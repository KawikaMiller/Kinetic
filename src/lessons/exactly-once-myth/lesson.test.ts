import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { dedupeCaption, deliveryCaption, generalsCaption } from './captions';
import { CRASH_POINTS, DESIGNS, crashTable, runCrashPoint } from './dedupe';
import { DEFAULT_LOSS as DELIVERY_LOSS, DELIVERY_BROKEN_SEED, DELIVERY_MODES, HORIZON_MS, MESSAGES, countersOf, deliveryCluster } from './delivery';
import { DEFAULT_DEPTH, DEFAULT_LOSS, DEPTH, GENERALS_SEED, LOSS_MAX, pBoth, pDisagree, pNobody, runSeeded } from './generals';
import lesson from './index';
import { SCOPES } from './scopes';

const counters = (mode: (typeof DELIVERY_MODES)[number], seed: number, loss = DELIVERY_LOSS, crash = false) => {
  const c = deliveryCluster({ seed, mode, loss, crash });
  c.run({ until: HORIZON_MS });
  return countersOf(c);
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: depth 4 at p = 0.3 disagrees 10.29% of the time; removing three messages gives depth 1 and 30%', () => {
    expect([DEFAULT_DEPTH, DEFAULT_LOSS]).toEqual([4, 0.3]);
    expect(pDisagree(4, 0.3)).toBeCloseTo(0.3 * 0.7 ** 3, 12);
    expect(pDisagree(1, 0.3)).toBeCloseTo(0.3, 12);
    expect(lesson.tryThis[0]).toContain('10.29%');
    expect(lesson.tryThis[0]).toContain('depth 1 raises it to 30%');
    const c = text(generalsCaption({ k: 4, p: 0.3, outcome: runSeeded(4, 0.3, GENERALS_SEED).outcome, seed: GENERALS_SEED }), { strict: true });
    expect(c).toContain('10.29%');
  });

  it('try-this 2: at p = 1 with depth 2 or more the caption says nobody attacks; at p = 0 it says a perfect link needs no protocol', () => {
    for (let k = 2; k <= DEPTH.max; k++) {
      const c = text(generalsCaption({ k, p: 1, outcome: runSeeded(k, 1, 1).outcome, seed: 1 }), { strict: true });
      expect(c).toContain('Every messenger is captured, so nobody attacks.');
      expect(c).not.toContain('NaN');
    }
    expect(text(generalsCaption({ k: 3, p: 0, outcome: 'both', seed: 1 }))).toContain('A perfect link needs no protocol, and no real link is perfect.');
  });

  it('try-this 3: at-least-once at 30% loss on seed 0 shows a duplicate and nothing lost; at-most-once on the same seed has no duplicates and loses messages', () => {
    expect(DELIVERY_BROKEN_SEED).toBe(0);
    const alo = counters('at-least-once', DELIVERY_BROKEN_SEED);
    expect([alo.duplicates > 0, alo.lost]).toEqual([true, 0]);
    const amo = counters('at-most-once', DELIVERY_BROKEN_SEED);
    expect(amo.duplicates).toBe(0);
    expect(amo.lost).toBeGreaterThan(0);
  });

  it('try-this 4: acks of acks still produce a duplicate on the default seed', () => {
    expect(counters('exactly-once', DELIVERY_BROKEN_SEED).duplicates).toBeGreaterThan(0);
  });

  it('try-this 5: the default crash (between the effect and the id, id recorded separately) applies the effect twice and reads 20; recording in the same step reads 10', () => {
    const sep = runCrashPoint('separate', 'gap').outcome;
    expect(sep).toEqual({ balance: 20, applied: 2 });
    expect(runCrashPoint('atomic', 'gap').outcome).toEqual({ balance: 10, applied: 1 });
    expect(text(dedupeCaption({ design: 'separate', point: 'gap', outcome: sep }), { strict: true })).toContain('applied 2 times and the balance ended at 20');
  });
});

describe('captions are computed from the model', () => {
  it('the generals caption quotes the closed forms, for every depth and capture chance in the control range', () => {
    for (let k = DEPTH.min; k <= DEPTH.max; k++) {
      for (let i = 0; i <= Math.round(LOSS_MAX / 0.05); i++) {
        const p = Number((i * 0.05).toFixed(2));
        const c = text(generalsCaption({ k, p, outcome: runSeeded(k, p, 3).outcome, seed: 3 }), { strict: true });
        expect(c, `k=${k} p=${p}`).not.toMatch(/NaN|Infinity/);
        if (p > 0) {
          expect(pBoth(k, p) + pDisagree(k, p) + pNobody(k, p)).toBeCloseTo(1, 12);
          expect(c).toContain(`Of the 2^${k} delivery patterns exactly one`);
        }
      }
    }
  });

  it('the delivery caption agrees with the counters it prints, for every mode, loss level and crash setting on several seeds', () => {
    for (const mode of DELIVERY_MODES) {
      for (const loss of [0, 0.3, 0.6]) {
        for (const crash of [false, true]) {
          for (const seed of [0, 1, 2, 7]) {
            const c = counters(mode, seed, loss, crash);
            const t = text(deliveryCaption({ mode, loss, seed, c, messages: MESSAGES }), { strict: true });
            expect(t).toContain(`It sent ${c.sent} deliveries, ${c.delivered} arrived`);
            expect(t.includes('no duplicates'), `${mode} ${loss} ${crash} ${seed}`).toBe(c.duplicates === 0);
            expect(t.includes('nothing lost'), `${mode} ${loss} ${crash} ${seed}`).toBe(c.lost === 0);
          }
        }
      }
    }
  });

  it('the dedup caption agrees with every cell of the table', () => {
    const table = crashTable();
    for (const design of DESIGNS) {
      for (const point of CRASH_POINTS) {
        const o = table[point][design];
        const t = text(dedupeCaption({ design, point, outcome: o }), { strict: true });
        expect(t.includes('applied 2 times'), `${design} ${point}`).toBe(o.applied === 2);
        expect(t).toContain(`balance ended at ${o.balance}`);
      }
    }
  });

  it('the scopes table says exactly-once is honestly true only for processing inside one system', () => {
    expect(SCOPES.filter((s) => s.honest).map((s) => s.id)).toEqual(['inside']);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
});
