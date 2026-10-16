import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FUNCTIONS, K_MAX, K_MIN, read } from './cancellation';
import { MODES, makeCart, taxView, type Granularity } from './cart';
import { bestMethods, cancelCaption, cartCaption, sumCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { OPENING, SUM_PRESETS } from './opening';
import { evaluate, generate, GENERATORS, type Precision } from './summation';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('numeric-precision');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('numeric-precision')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state', () => {
    expect(OPENING.scene).toBe('summation');
    expect(OPENING.summation).toEqual({ generator: 'dimes', n: 10, precision: 'f64', seed: 42 });
    expect(OPENING.cancellation).toEqual({ id: 'sqrt-difference', k: 16 });
    expect(OPENING.cents).toEqual({ items: 200, bp: 500, mode: 'half-up', granularity: 'line', representation: 'float', seed: 42 });
    expect(SUM_PRESETS.find((p) => p.id === 'million-steps')).toMatchObject({ n: 200_000, precision: 'f32' });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: ten dimes give 0.9999999999999999 naive and 1 Kahan; 200,000 float32 dimes make naive far off and Kahan within 0.001', () => {
    expect([FACTS.dimesNaive, FACTS.dimesKahan]).toEqual(['0.9999999999999999', '1']);
    expect(FACTS.f32NaiveUlps).toBeGreaterThan(1000);
    const f32 = evaluate(generate('dimes', 200_000, 42, 'f32').values, 'f32');
    const err = (id: string) => f32.runs.find((r) => r.id === id)!.error;
    expect(err('naive')).toBeGreaterThan(10);
    expect(err('kahan')).toBeLessThan(1e-3);
    expect(lesson.tryThis[0]).toContain('0.9999999999999999');
  });

  it('try-this 2: the blind spot gives 0, 0, 2 and the exact 2', () => {
    expect([FACTS.blindNaive, FACTS.blindKahan, FACTS.blindNeumaier, FACTS.blindExact]).toEqual(['0', '0', '2', '2']);
    expect(lesson.tryThis[1]).toContain('Neumaier 2');
  });

  it('try-this 3: at 10^16 the naive difference has 0 digits and the rewrite 16; at k = 8 the naive keeps 7; the quadratic root keeps 0', () => {
    expect([FACTS.k, FACTS.sqrtNaiveDigits, FACTS.sqrtStableDigits]).toEqual([16, 0, 16]);
    expect([FACTS.sqrt8NaiveDigits, FACTS.quad8NaiveDigits]).toEqual([7, 0]);
    expect(FACTS.sqrt8NaiveMatching).toBe(0);
    expect(lesson.tryThis[2]).toContain('0 of 16 digits right');
  });

  it('try-this 4: float64 drifts on the default cart while integer cents do not; the facts read 0.30000000000000004, "1.00" and 100', () => {
    expect(FACTS.floatDriftHalfUp).not.toBe(0);
    expect(FACTS.centsDriftHalfUp).toBe(0);
    expect([FACTS.addFact, FACTS.toFixedFact, FACTS.roundFact]).toEqual(['0.30000000000000004', '1.00', 100]);
    expect(lesson.tryThis[3]).toContain(`drift ${FACTS.floatDriftHalfUp} cents`);
  });
});

describe('the control cross product', () => {
  it('every generator and precision gives a clean caption or the overflow notice; overflow only when a value does not fit', () => {
    for (const g of GENERATORS) {
      for (const p of ['f64', 'f32'] as Precision[]) {
        for (const n of [1, 2, 10, 500]) {
          const data = generate(g.id, n, 3, p);
          expect(data.overflow, `${g.id} ${p}`).toBe(g.id === 'blind-spot' && p === 'f32');
          if (data.overflow) continue;
          const ev = evaluate(data.values, p);
          expect(expectCaption(sumCaption(ev, p, data.values.length))).not.toMatch(/NaN|undefined|\[object/);
          expect(bestMethods(ev).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every function and every k from 1 to 20 gives a clean caption', () => {
    for (const f of FUNCTIONS) for (let k = K_MIN; k <= K_MAX; k++) expect(expectCaption(cancelCaption(f.label, k, read(f.id, k)))).not.toMatch(/NaN|undefined|\[object/);
  });

  it('every mode, granularity and representation gives a clean caption', () => {
    const cart = makeCart(25, 9);
    for (const m of MODES) for (const g of ['line', 'total'] as Granularity[]) for (const r of ['float', 'cents'] as const) expect(expectCaption(cartCaption(taxView(cart, 825, m.id, g, r), m.id, g))).not.toMatch(/NaN|undefined|\[object/);
  });
});
