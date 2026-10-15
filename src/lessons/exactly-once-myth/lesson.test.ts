import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { dedupeCaption, deliveryCaption, generalsCaption, removalNote } from './captions';
import { CRASH_POINTS, DESIGNS, crashTable, runCrashPoint } from './dedupe';
import { DEFAULT_LOSS as DELIVERY_LOSS, DELIVERY_BROKEN_SEED, DELIVERY_MODES, HORIZON_MS, MESSAGES, countersAt, countersOf, deliveryCluster, linkTotals } from './delivery';
import { DEFAULT_DEPTH, DEFAULT_LOSS, DEPTH, GENERALS_SEED, LOSS_MAX, pBoth, pDisagree, pNobody, runSeeded } from './generals';
import lesson from './index';
import { SCOPES } from './scopes';
import { pctText } from '../../core/format';

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

  it('try-this 2: the slider really ends at 0.95, and at that end at the default depth the caption and the try-this quote the same "nobody attacks" share; at p = 0 it says a perfect link needs no protocol', () => {
    // The reachable state: the slider's own bounds (min 0, step 0.05, max LOSS_MAX), not a value the control cannot produce.
    const reachable = Array.from({ length: Math.round(LOSS_MAX / 0.05) + 1 }, (_, i) => Number((i * 0.05).toFixed(2)));
    expect(reachable.at(-1)).toBe(0.95);
    expect(reachable).not.toContain(1);
    const share = 1 - 0.05 ** 4 - 0.95 * 0.05 ** 3;
    expect(pNobody(DEFAULT_DEPTH, LOSS_MAX)).toBeCloseTo(share, 12);
    const c = text(generalsCaption({ k: DEFAULT_DEPTH, p: LOSS_MAX, outcome: runSeeded(DEFAULT_DEPTH, LOSS_MAX, GENERALS_SEED).outcome, seed: GENERALS_SEED }), { strict: true });
    expect(c).toContain('99.99%');
    expect(c).toContain("At the slider's end, 99.99% of the time nobody attacks.");
    expect(lesson.tryThis[1]).toContain('0.95');
    expect(lesson.tryThis[1]).toContain('99.99%');
    expect(lesson.tryThis[1]).not.toContain('1.00');
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

  it('try-this 4: acks of acks produce the same duplicate as at-least-once on the default seed, and put more messages on the link', () => {
    const at = (mode: (typeof DELIVERY_MODES)[number]) => {
      const c = deliveryCluster({ seed: DELIVERY_BROKEN_SEED, mode, loss: DELIVERY_LOSS });
      c.run({ until: HORIZON_MS });
      return { counters: countersAt(c, HORIZON_MS), link: linkTotals(c, HORIZON_MS) };
    };
    const eo = at('exactly-once');
    expect(eo.counters.duplicates).toBeGreaterThan(0);
    expect(eo.counters.duplicates).toBe(at('at-least-once').counters.duplicates);
    expect(eo.link.messages).toBeGreaterThan(at('at-least-once').link.messages);
    expect(lesson.tryThis[3]).toContain('On the link');
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
            const cl = deliveryCluster({ seed, mode, loss, crash });
            cl.run({ until: HORIZON_MS });
            const c = countersAt(cl, HORIZON_MS);
            const totals = linkTotals(cl, HORIZON_MS);
            const t = text(deliveryCaption({ mode, loss, seed, c, messages: c.published, at: HORIZON_MS, ended: true, unsure: totals.unsure }), { strict: true });
            expect(t).toContain(`It sent ${c.sent} deliveries, ${c.delivered} arrived, so ${MESSAGES - c.lost} of ${MESSAGES} published messages were processed`);
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

describe('the removal note is computed from the same closed form', () => {
  it('quotes the disagreement at k and k - 1 for every depth, and ends the argument at depth 1', () => {
    for (let k = DEPTH.min + 1; k <= DEPTH.max; k++) {
      for (const p of [0.1, 0.3, 0.9]) {
        const t = text(removalNote(k, p), { strict: true });
        expect(t).toContain(`depth ${k - 1} disagrees ${pctText(pDisagree(k - 1, p), 2)} of the time instead of ${pctText(pDisagree(k, p), 2)}`);
      }
    }
    expect(text(removalNote(DEPTH.min, 0.3))).toContain('At depth 1 there is one message and nothing left to delete');
  });
});

describe('lesson content', () => {
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
});
