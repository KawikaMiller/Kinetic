import { describe, expect, it } from 'vitest';
import {
  BUGS, BUG_DEP, CLEAN, DEPS, EXPECTED_TOTAL, FLAKY_EVERY, KINDS, LATENCY, checkoutLines, isDeterministic, isFlakyRun, overMockedTestLines,
  runConfig, runTest, taxLines, verdict, type Bug, type Config, type Kind,
} from './model';

const all: Config[] = KINDS.flatMap((g) => KINDS.flatMap((t) => KINDS.flatMap((e) => KINDS.map((c) => ({ gateway: g, tax: t, email: e, clock: c })))));
const noDummy = all.filter((c) => !Object.values(c).includes('dummy'));
const touchesReal = (k: Kind) => k === 'real' || k === 'spy';

/**
 * The expected verdicts, reasoned from what each kind can observe (not from the model):
 * - a dummy is called on the happy path, so the test is broken without any bug;
 * - so is anything going through the real gateway on its scripted timeout run;
 * - a missing email is only visible to something that records sends (mock, spy, fake outbox);
 * - the rounding bug lives in the real TaxService, so only real or spy runs it;
 * - a second charge is only visible to something that counts charges (mock, spy, fake ledger).
 */
function expected(cfg: Config, bug: Exclude<Bug, 'none'>, run: number) {
  if (Object.values(cfg).includes('dummy')) return 'broken';
  if (touchesReal(cfg.gateway) && isFlakyRun(run)) return 'broken';
  const k = cfg[BUG_DEP[bug]];
  if (bug === 'tax') return touchesReal(k) ? 'caught' : 'escaped';
  return k === 'mock' || k === 'spy' || k === 'fake' ? 'caught' : 'escaped';
}

describe('the bug × double matrix', () => {
  it(`matches the reasoning for all ${all.length} configurations × 3 bugs × a full flaky cycle`, () => {
    let checked = 0;
    for (const cfg of all) {
      for (const bug of ['email', 'tax', 'twice'] as const) {
        for (let run = 0; run < FLAKY_EVERY; run++) {
          expect(verdict(cfg, bug, run), `${JSON.stringify(cfg)} ${bug} run ${run}`).toBe(expected(cfg, bug, run));
          checked++;
        }
      }
    }
    expect(checked).toBe(6 ** 4 * 3 * FLAKY_EVERY);
  });

  it('the spec rows from the default doubles (gateway mock, tax stub, email mock, clock stub)', () => {
    const base: Config = { gateway: 'mock', tax: 'stub', email: 'mock', clock: 'stub' };
    const row = (bug: 'email' | 'tax' | 'twice') => KINDS.map((k) => verdict({ ...base, [BUG_DEP[bug]]: k }, bug, 0));
    // dummy, stub, fake, mock, spy, real
    expect(row('email')).toEqual(['broken', 'escaped', 'caught', 'caught', 'caught', 'escaped']);
    expect(row('tax')).toEqual(['broken', 'escaped', 'escaped', 'escaped', 'caught', 'caught']);
    expect(row('twice')).toEqual(['broken', 'escaped', 'caught', 'caught', 'caught', 'escaped']);
  });
});

describe('a run reports what really happened', () => {
  it('passes with no bug for every configuration without a dummy, off the flaky run', () => {
    for (const cfg of noDummy) {
      const r = runConfig(cfg, 'none', 0);
      expect(r.passed, JSON.stringify(cfg)).toBe(true);
      expect((r.receipt as { total: number }).total).toBe(EXPECTED_TOTAL);
    }
  });

  it('times the run from the real services it touched, and flags the network', () => {
    for (const cfg of noDummy) {
      for (const bug of BUGS) {
        const r = runConfig(cfg, bug, 0);
        const charges = bug === 'twice' ? 2 : 1;
        const ms = (touchesReal(cfg.gateway) ? LATENCY.gateway * charges : 0) + (touchesReal(cfg.tax) ? LATENCY.tax : 0)
          + (touchesReal(cfg.email) && bug !== 'email' ? LATENCY.email : 0);
        expect(r.ms).toBe(ms);
        expect(r.network).toBe(touchesReal(cfg.gateway) || touchesReal(cfg.tax) || (touchesReal(cfg.email) && bug !== 'email'));
      }
    }
  });

  it('is deterministic unless it goes through the flaky gateway or reads the real clock', () => {
    for (const cfg of noDummy.filter((_, i) => i % 7 === 0)) {
      expect(isDeterministic(cfg, 'none'), JSON.stringify(cfg)).toBe(!touchesReal(cfg.gateway) && !touchesReal(cfg.clock));
    }
  });

  it('records each call in order with the double that answered', () => {
    const r = runConfig({ gateway: 'spy', tax: 'fake', email: 'mock', clock: 'stub' }, 'twice', 0);
    expect(r.trace.map((c) => `${c.dep}.${c.method}:${c.by}`)).toEqual(['tax.taxFor:fake', 'gateway.charge:spy', 'gateway.charge:spy', 'email.send:mock', 'clock.now:stub']);
  });

  it('runs the shown tax code: floor vs round really differ on this cart', () => {
    const t = (bug: boolean) => new Function(`${taxLines(bug).join('\n')}\nreturn taxFor(3999, 'CA');`)() as number;
    expect(t(false)).toBe(330); // 329.9175 rounds up
    expect(t(true)).toBe(329);
    expect(3999 + t(false)).toBe(EXPECTED_TOTAL);
  });
});

describe('over-mocking', () => {
  const run = (wrongField: boolean, useRate: boolean, gw: 'mock' | 'fake', tax: 'mock' | 'fake') =>
    runTest({ checkout: checkoutLines({ ...CLEAN, wrongField, useRate }), test: overMockedTestLines(gw, tax), roundingBug: false, run: 0 });

  it('the all-mock test passes even with the integration bug (currencyCode instead of currency)', () => {
    expect(run(true, false, 'mock', 'mock').passed).toBe(true);
  });
  it('the real gateway rejects that request, and so does a fake that checks the real API', () => {
    const viaReal = runConfig({ gateway: 'real', tax: 'stub', email: 'mock', clock: 'stub' }, 'none', 0);
    expect(viaReal.passed).toBe(true);
    const r = run(true, false, 'fake', 'mock');
    expect(r.passed).toBe(false);
    expect(r.error).toContain('missing field: currency');
  });
  it('the all-mock test breaks on a harmless refactor that a fake survives', () => {
    const refactored = run(true, true, 'mock', 'mock');
    expect(refactored.passed).toBe(false);
    expect(refactored.error).toContain('unexpected call rateFor');
    expect(run(true, true, 'mock', 'fake').passed).toBe(true);
    // ...and the refactor really is behaviour-preserving: same receipt from the same inputs
    const before = runConfig({ gateway: 'fake', tax: 'real', email: 'fake', clock: 'stub' }, 'none', 0).receipt;
    const after = runTest({ checkout: checkoutLines({ ...CLEAN, useRate: true }), test: [
      "test('t', () => {", "  const cart = { items: [{ sku: 'book', cents: 3999, qty: 1 }], region: 'CA', card: 'tok_visa', email: 'ada@example.com' };",
      '  checkout(cart, { gateway: fakeGateway(), tax: realTax(), email: fakeEmail(), clock: stubClock(\'2026-10-07T12:00:00Z\') });', '});',
    ], roundingBug: false, run: 0 }).receipt;
    expect(after).toEqual({ ...(before as object), chargeId: (after as { chargeId: string }).chargeId });
  });
  it('a correct checkout passes the fake-gateway version, and the copied mock then enshrines the bug', () => {
    expect(run(false, false, 'fake', 'fake').passed).toBe(true);
    expect(run(false, false, 'mock', 'mock').error).toContain('currencyCode');
  });
});

describe('every shown snippet is the code that runs', () => {
  it('checkout and the tests are plain JS that compile for every variant', () => {
    for (const bug of BUGS) expect(() => new Function(checkoutLines({ ...CLEAN, emailBug: bug === 'email', twice: bug === 'twice' }).join('\n'))).not.toThrow();
    for (const d of DEPS) for (const k of KINDS) expect(() => runConfig({ gateway: 'stub', tax: 'stub', email: 'stub', clock: 'stub', [d]: k }, 'none', 0)).not.toThrow();
  });
});
