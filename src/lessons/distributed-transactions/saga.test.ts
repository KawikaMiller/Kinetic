import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../../core/distSim';
import { SEED_MAX } from '../../core/seed';
import { CHECK_HORIZON_MS, PRICE, sagaCluster, verdictOf, type OrderStatus, type SagaOptions, type SagaState, type SagaStyle } from './saga';
import { checkSagaSeeds, describeSagaCheck, NO_KEY_SEED, sagaCrashEveryStep } from './sagaCheck';
import { sagaScene, sagaSteps } from './sagaSteps';
import { CHECK_SEEDS, outOfStockOn } from './twoPcCheck';

const STYLES: SagaStyle[] = ['orch', 'chor'];

/** A snapshot built by hand, so the verdict is tested against the table below and not against a run. */
function snapshot(o: { orders: OrderStatus; charges: number; refunds: number; reserved: boolean; failed: boolean }): Snapshot<SagaState> {
  const up = { up: true, paused: false };
  return {
    time: 0, step: 0, inFlight: 0,
    nodes: {
      orders: { ...up, state: { role: 'orders', status: o.orders } },
      payments: { ...up, state: { role: 'payments', charges: o.charges, refunds: o.refunds } },
      inventory: { ...up, state: { role: 'inventory', reserved: o.reserved, failed: o.failed, stock: 3 } },
    },
  } as Snapshot<SagaState>;
}

describe('the saga verdict, from the services\' state', () => {
  const none = { orders: 'none', charges: 0, refunds: 0, reserved: false, failed: false } as const;
  const cases: [string, Parameters<typeof snapshot>[0], string, boolean][] = [
    ['before anything', none, 'nothing yet', true],
    ['order created', { ...none, orders: 'pending' }, 'partial: 1 of 3 steps applied', false],
    ['order and charge', { ...none, orders: 'pending', charges: 1 }, 'partial: 2 of 3 steps applied', false],
    ['order, charge and reservation, not yet confirmed', { ...none, orders: 'pending', charges: 1, reserved: true }, 'partial: 3 of 3 steps applied, order not confirmed', false],
    ['all applied and confirmed', { ...none, orders: 'confirmed', charges: 1, reserved: true }, 'consistent ✓ all steps applied', true],
    ['step 3 failed after the charge', { ...none, orders: 'pending', charges: 1, failed: true }, "inconsistent: charged, can't ship", false],
    ['refunded but the order is still open', { ...none, orders: 'pending', charges: 1, refunds: 1, failed: true }, 'inconsistent: order still open', false],
    ['compensated', { ...none, orders: 'cancelled', charges: 1, refunds: 1, failed: true }, 'consistent ✓ after compensation', true],
    ['charged twice', { ...none, orders: 'pending', charges: 2 }, `inconsistent: charged $${2 * PRICE} for a $${PRICE} order`, false],
  ];
  it.each(cases)('%s', (_name, input, label, consistent) => {
    expect(verdictOf(snapshot(input))).toMatchObject({ label, consistent });
  });
});

describe.each(STYLES)('the real saga (%s)', (style) => {
  it(`never charges twice nor confirms an incomplete order on all ${CHECK_SEEDS} seeds with loss and duplication`, () => {
    const s = checkSagaSeeds(style, 'idempotent');
    expect(s.failedRuns).toBe(0);
    expect(s.events).toBeGreaterThan(CHECK_SEEDS * 5);
  });

  it(`holds with every node crashed after every step on all ${CHECK_SEEDS} seeds`, () => {
    const s = sagaCrashEveryStep(style, 'idempotent');
    expect(s.failedRuns).toBe(0);
    expect(s.runs).toBeGreaterThan(CHECK_SEEDS * 10);
  });

  it('ends consistent on a clean network: all applied when there is stock, all compensated when there is not', () => {
    for (const outOfStock of [false, true]) {
      const c = sagaCluster({ seed: 3, style, variant: 'idempotent', outOfStock, faults: false });
      c.run({ until: CHECK_HORIZON_MS });
      const v = verdictOf(c.snapshot());
      expect(v.label).toBe(outOfStock ? 'consistent ✓ after compensation' : 'consistent ✓ all steps applied');
    }
  });
});

describe('the orchestrator keeps going (liveness, a separate claim from safety)', () => {
  it('ends consistent on every seed of the fault check, because it retries and resumes from its log', () => {
    const s = checkSagaSeeds('orch', 'idempotent');
    expect(s.settledRuns).toBe(s.runs);
  });

  it('is not claimed for choreography: with no retries a lost message strands some runs', () => {
    const s = checkSagaSeeds('chor', 'idempotent');
    expect(s.settledRuns).toBeLessThan(s.runs);
  });
});

describe.each(STYLES)('the missing idempotency key (%s)', (style) => {
  const s = checkSagaSeeds(style, 'no-key');

  it('charges the customer twice on the pinned lowest failing seed, for the stated reason', () => {
    expect(s.lowest?.seed).toBe(NO_KEY_SEED[style]);
    expect(s.lowest?.message).toBe(`the customer is charged $${2 * PRICE} for a $${PRICE} order`);
    expect(s.lowest?.rule).toBe(0);
  });

  it('fails on some seeds, at most 90% of them, and the real saga passes the same seeds', () => {
    expect(s.failedSeeds).toBeGreaterThan(0);
    expect(s.failedSeeds).toBeLessThanOrEqual(CHECK_SEEDS * 0.9);
    expect(checkSagaSeeds(style, 'idempotent').failedRuns).toBe(0);
  });

  it('prints the numbers the runs produced', () => {
    const text = describeSagaCheck(s, sagaCrashEveryStep(style, 'no-key', 10));
    expect(text).toContain(`Lowest failing seed ${NO_KEY_SEED[style]}`);
    expect(text).toContain(`${s.failedSeeds} of ${CHECK_SEEDS} seeds`);
  });
});

describe('the saga scenes', () => {
  it('compute the inconsistent window from the run: first local commit to last compensation', () => {
    const o: SagaOptions = sagaScene('fail', 'orch', 1, 'idempotent', false);
    const cluster = sagaCluster(o);
    cluster.run({ until: CHECK_HORIZON_MS });
    const delivered = (type: string) => cluster.trace.filter((r) => r.kind === 'deliver' && (r.payload as { type?: string })?.type === type).map((r) => r.t);
    const expected = Math.max(...delivered('cancel')) - Math.min(...delivered('create order'));
    const steps = sagaSteps(o);
    expect(steps.at(-1)?.facts.inconsistentMs).toBe(Math.round(expected));
    expect(expected).toBeGreaterThan(0);
  });

  it('build frames for both styles and cases at the ends of the seed range', () => {
    for (const style of STYLES) {
      for (const kase of ['happy', 'fail'] as const) {
        for (const seed of [0, SEED_MAX]) {
          const steps = sagaSteps(sagaScene(kase, style, seed, 'idempotent', true));
          expect(steps[0].row).toBeNull();
          expect(steps.length).toBeGreaterThan(3);
        }
      }
    }
    expect(outOfStockOn(NO_KEY_SEED.orch) && outOfStockOn(NO_KEY_SEED.chor)).toBe(true);
  });
});
