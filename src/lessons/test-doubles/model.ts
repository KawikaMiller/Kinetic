/**
 * checkout(cart, deps) and its test, as fixed lesson-authored source text that really runs.
 * The learner only picks among pre-written variants (a double kind per dependency, a planted
 * bug); nothing they type is ever executed.
 */

export type Dep = 'gateway' | 'tax' | 'email' | 'clock';
export const DEPS: readonly Dep[] = ['gateway', 'tax', 'email', 'clock'];
export type Kind = 'dummy' | 'stub' | 'fake' | 'mock' | 'spy' | 'real';
export const KINDS: readonly Kind[] = ['dummy', 'stub', 'fake', 'mock', 'spy', 'real'];
export type Bug = 'none' | 'email' | 'tax' | 'twice';
export const BUGS: readonly Bug[] = ['none', 'email', 'tax', 'twice'];
/** The dependency each planted bug lives next to: the one whose double decides if it's caught. */
export const BUG_DEP: Record<Exclude<Bug, 'none'>, Dep> = { email: 'email', tax: 'tax', twice: 'gateway' };

export const DEP_NAME: Record<Dep, string> = { gateway: 'PaymentGateway', tax: 'TaxService', email: 'EmailSender', clock: 'Clock' };

// Illustrative latencies of the simulated real services (ms).
export const LATENCY: Record<Dep, number> = { gateway: 800, tax: 120, email: 300, clock: 0 };
/** The simulated real gateway times out on every 4th run (scripted, so the lesson is repeatable). */
export const FLAKY_EVERY = 4;
export const isFlakyRun = (run: number) => run % FLAKY_EVERY === FLAKY_EVERY - 1;

export const FIXED_TIME = '2026-10-07T12:00:00Z';
export const EXPECTED_TOTAL = 4329;

// ── The code under test ─────────────────────────────────────────────

export interface CheckoutVariant {
  emailBug: boolean;
  twice: boolean;
  /** Integration bug: the request uses a field name the real gateway doesn't know. */
  wrongField: boolean;
  /** A harmless refactor: ask the tax service for the rate and multiply here. */
  useRate: boolean;
}
export const CLEAN: CheckoutVariant = { emailBug: false, twice: false, wrongField: false, useRate: false };

export function checkoutLines(v: CheckoutVariant): string[] {
  return [
    'function checkout(cart, deps) {',
    '  const subtotal = cart.items.reduce((sum, i) => sum + i.cents * i.qty, 0);',
    v.useRate
      ? '  const tax = Math.round(subtotal * deps.tax.rateFor(cart.region));'
      : '  const tax = deps.tax.taxFor(subtotal, cart.region);',
    '  const total = subtotal + tax;',
    v.wrongField
      ? "  const request = { amountCents: total, currencyCode: 'USD', card: cart.card };"
      : "  const request = { amountCents: total, currency: 'USD', card: cart.card };",
    '  const charge = deps.gateway.charge(request);',
    ...(v.twice ? ['  deps.gateway.charge(request); // left in after debugging'] : []),
    '  if (!charge.ok) return { ok: false, error: charge.error };',
    ...(v.emailBug ? [] : ['  deps.email.send(cart.email, `Receipt: ${total} cents`);']),
    '  return { ok: true, total, chargeId: charge.id, at: deps.clock.now() };',
    '}',
  ];
}

/** The real tax service's source. The planted rounding bug lives here, not in checkout. */
export function taxLines(roundingBug: boolean): string[] {
  return [
    "const RATES = { CA: 0.0825, NY: 0.08875 };",
    'function taxFor(subtotalCents, region) {',
    roundingBug
      ? '  return Math.floor(subtotalCents * (RATES[region] ?? 0));'
      : '  return Math.round(subtotalCents * (RATES[region] ?? 0));',
    '}',
    'function rateFor(region) { return RATES[region] ?? 0; }',
  ];
}

// ── The test ─────────────────────────────────────────────────────────

export type Config = Record<Dep, Kind>;

const SETUP: Record<Dep, Record<Kind, string>> = {
  gateway: {
    dummy: "const gateway = dummy('PaymentGateway');",
    stub: "const gateway = stubGateway({ charge: { ok: true, id: 'ch_1' } });",
    fake: 'const gateway = fakeGateway(); // in-memory ledger',
    mock: "const gateway = mockGateway({ expectCharge: { amountCents: 4329, currency: 'USD', card: 'tok_visa' } });",
    spy: 'const gateway = spyOn(realGateway());',
    real: 'const gateway = realGateway(); // sandbox, over the network',
  },
  tax: {
    dummy: "const tax = dummy('TaxService');",
    stub: 'const tax = stubTax({ taxFor: 330 });',
    fake: 'const tax = fakeTax({ CA: 0.0825 });',
    mock: "const tax = mockTax({ expectTaxFor: [3999, 'CA'], returns: 330 });",
    spy: 'const tax = spyOn(realTax());',
    real: 'const tax = realTax();',
  },
  email: {
    dummy: "const email = dummy('EmailSender');",
    stub: 'const email = stubEmail();',
    fake: 'const email = fakeEmail(); // in-memory outbox',
    mock: "const email = mockEmail({ expectSend: ['ada@example.com', 'Receipt: 4329 cents'] });",
    spy: 'const email = spyOn(realEmail());',
    real: 'const email = realEmail(); // real SMTP',
  },
  clock: {
    dummy: "const clock = dummy('Clock');",
    stub: "const clock = stubClock('2026-10-07T12:00:00Z');",
    fake: "const clock = fakeClock('2026-10-07T12:00:00Z');",
    mock: "const clock = mockClock({ expectNow: 1, returns: '2026-10-07T12:00:00Z' });",
    spy: 'const clock = spyOn(realClock());',
    real: 'const clock = realClock();',
  },
};

/** Extra checks each kind makes possible: a mock verifies, a spy or fake can be inspected. */
const CHECKS: Record<Dep, Partial<Record<Kind, string[]>>> = {
  gateway: { fake: ['expect(gateway.balance()).toBe(4329);'], mock: ['gateway.verify();'], spy: ['expect(gateway.calls.length).toBe(1);'] },
  tax: { mock: ['tax.verify();'], spy: ['expect(tax.calls.length).toBe(1);'] },
  email: { fake: ['expect(email.outbox.length).toBe(1);'], mock: ['email.verify();'], spy: ['expect(email.calls.length).toBe(1);'] },
  clock: {
    stub: ["expect(receipt.at).toBe('2026-10-07T12:00:00Z');"],
    fake: ["expect(receipt.at).toBe('2026-10-07T12:00:00Z');"],
    mock: ['clock.verify();', "expect(receipt.at).toBe('2026-10-07T12:00:00Z');"],
  },
};

export const CART_LINE = "  const cart = { items: [{ sku: 'book', cents: 3999, qty: 1 }], region: 'CA', card: 'tok_visa', email: 'ada@example.com' };";

export function testLines(cfg: Config): string[] {
  return [
    "test('checkout charges the card, emails a receipt, returns it', () => {",
    CART_LINE,
    ...DEPS.map((d) => `  ${SETUP[d][cfg[d]]}`),
    '  const receipt = checkout(cart, { gateway, tax, email, clock });',
    '  expect(receipt.error).toBe(undefined);',
    '  expect(receipt.total).toBe(4329);',
    ...DEPS.flatMap((d) => (CHECKS[d][cfg[d]] ?? []).map((l) => `  ${l}`)),
    '});',
  ];
}

/** The over-mocking scene's test: every dependency mocked, expectations copied from the code. */
export function overMockedTestLines(gatewayKind: 'mock' | 'fake', taxKind: 'mock' | 'fake'): string[] {
  return [
    "test('checkout (everything mocked)', () => {",
    CART_LINE,
    gatewayKind === 'mock'
      ? "  const gateway = mockGateway({ expectCharge: { amountCents: 4329, currencyCode: 'USD', card: 'tok_visa' } });"
      : '  const gateway = fakeGateway(); // checks requests like the real API',
    taxKind === 'mock'
      ? "  const tax = mockTax({ expectTaxFor: [3999, 'CA'], returns: 330 });"
      : '  const tax = fakeTax({ CA: 0.0825 });',
    "  const email = mockEmail({ expectSend: ['ada@example.com', 'Receipt: 4329 cents'] });",
    "  const clock = mockClock({ expectNow: 1, returns: '2026-10-07T12:00:00Z' });",
    '  const receipt = checkout(cart, { gateway, tax, email, clock });',
    '  expect(receipt.error).toBe(undefined);',
    ...(gatewayKind === 'mock' ? ['  gateway.verify();'] : ['  expect(gateway.balance()).toBe(4329);']),
    ...(taxKind === 'mock' ? ['  tax.verify();'] : []),
    '  email.verify();',
    '  clock.verify();',
    '});',
  ];
}

// ── The doubles and the simulated real services ─────────────────────

export interface Call {
  dep: Dep;
  method: string;
  args: string;
  ms: number;
  network: boolean;
  /** Which stand-in answered. */
  by: Kind;
}

class AssertionFailure extends Error {}
const show = (v: unknown) => JSON.stringify(v);
const same = (a: unknown, b: unknown) => show(a) === show(b);
const fail = (msg: string): never => {
  throw new AssertionFailure(msg);
};

function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (actual !== expected) fail(`expected ${show(expected)}, got ${show(actual)}`);
    },
  };
}

interface Env {
  run: number;
  trace: Call[];
  roundingBug: boolean;
}

function realServices(env: Env) {
  // Runtime code execution, deliberately: the real TaxService runs from the same fixed,
  // lesson-authored text the stage shows (taxLines), chosen by a preset chip; no learner input
  // ever reaches it. It needs 'unsafe-eval', so a strict CSP would break this lesson.
  const taxImpl = new Function(`${taxLines(env.roundingBug).join('\n')}\nreturn { taxFor, rateFor };`)() as {
    taxFor: (c: number, r: string) => number;
    rateFor: (r: string) => number;
  };
  const record = (dep: Dep, method: string, args: unknown[], by: Kind) =>
    env.trace.push({ dep, method, args: args.map(show).join(', '), ms: LATENCY[dep], network: dep !== 'clock', by });
  return {
    gateway: (by: Kind) => ({
      charge(req: Record<string, unknown>) {
        record('gateway', 'charge', [req], by);
        if (isFlakyRun(env.run)) return { ok: false, error: 'gateway timeout after 800 ms' };
        if (typeof req.currency !== 'string') return { ok: false, error: '400 Bad Request: missing field: currency' };
        return { ok: true, id: `ch_live_${env.run}` };
      },
    }),
    tax: (by: Kind) => ({
      taxFor(c: number, r: string) {
        record('tax', 'taxFor', [c, r], by);
        return taxImpl.taxFor(c, r);
      },
      rateFor(r: string) {
        record('tax', 'rateFor', [r], by);
        return taxImpl.rateFor(r);
      },
    }),
    email: (by: Kind) => ({
      send(to: string, body: string) {
        record('email', 'send', [to, body], by);
      },
    }),
    // The "real" clock is simulated too: each run reads a different moment.
    clock: (by: Kind) => ({
      now() {
        record('clock', 'now', [], by);
        return `2026-10-07T12:00:${String(13 + env.run * 7).padStart(2, '0')}Z`;
      },
    }),
  };
}

function factories(env: Env) {
  const real = realServices(env);
  const note = (dep: Dep, method: string, args: unknown[], by: Kind) =>
    env.trace.push({ dep, method, args: args.map(show).join(', '), ms: 0, network: false, by });
  return {
    dummy(name: string) {
      const dep = DEPS.find((d) => DEP_NAME[d] === name)!;
      return new Proxy({}, {
        get: (_t, prop) => () => {
          note(dep, String(prop), [], 'dummy');
          return fail(`dummy ${name} was used: ${String(prop)}() called`);
        },
      });
    },
    stubGateway: (canned: { charge: unknown }) => ({ charge: (req: unknown) => (note('gateway', 'charge', [req], 'stub'), canned.charge) }),
    fakeGateway() {
      const ledger: number[] = [];
      return {
        charge(req: Record<string, unknown>) {
          note('gateway', 'charge', [req], 'fake');
          if (typeof req.currency !== 'string') return { ok: false, error: '400 Bad Request: missing field: currency' };
          ledger.push(req.amountCents as number);
          return { ok: true, id: `ch_fake_${ledger.length}` };
        },
        balance: () => ledger.reduce((a, b) => a + b, 0),
      };
    },
    mockGateway({ expectCharge }: { expectCharge: unknown }) {
      const calls: unknown[] = [];
      return {
        charge: (req: unknown) => (note('gateway', 'charge', [req], 'mock'), calls.push(req), { ok: true, id: 'ch_mock' }),
        verify: () => {
          if (calls.length !== 1) fail(`mock PaymentGateway: expected charge() once, called ${calls.length} times`);
          if (!same(calls[0], expectCharge)) fail(`mock PaymentGateway: expected charge(${show(expectCharge)}), got charge(${show(calls[0])})`);
        },
      };
    },
    realGateway: () => real.gateway('real'),
    stubTax: (canned: { taxFor: number }) => ({ taxFor: (c: number, r: string) => (note('tax', 'taxFor', [c, r], 'stub'), canned.taxFor) }),
    fakeTax: (rates: Record<string, number>) => ({
      taxFor: (c: number, r: string) => (note('tax', 'taxFor', [c, r], 'fake'), Math.round(c * (rates[r] ?? 0))),
      rateFor: (r: string) => (note('tax', 'rateFor', [r], 'fake'), rates[r] ?? 0),
    }),
    mockTax({ expectTaxFor, returns }: { expectTaxFor: unknown[]; returns: number }) {
      const calls: unknown[][] = [];
      return new Proxy({}, {
        get: (_t, prop) => {
          if (prop === 'verify') {
            return () => {
              if (calls.length !== 1) fail(`mock TaxService: expected taxFor() once, called ${calls.length} times`);
              if (!same(calls[0], expectTaxFor)) fail(`mock TaxService: expected taxFor(${show(expectTaxFor).slice(1, -1)}), got taxFor(${show(calls[0]).slice(1, -1)})`);
            };
          }
          if (prop === 'taxFor') return (...args: unknown[]) => (note('tax', 'taxFor', args, 'mock'), calls.push(args), returns);
          return (...args: unknown[]) => {
            note('tax', String(prop), args, 'mock');
            return fail(`mock TaxService: unexpected call ${String(prop)}()`);
          };
        },
      });
    },
    realTax: () => real.tax('real'),
    stubEmail: () => ({ send: (to: string, body: string) => void note('email', 'send', [to, body], 'stub') }),
    fakeEmail() {
      const outbox: { to: string; body: string }[] = [];
      return { outbox, send: (to: string, body: string) => (note('email', 'send', [to, body], 'fake'), void outbox.push({ to, body })) };
    },
    mockEmail({ expectSend }: { expectSend: unknown[] }) {
      const calls: unknown[][] = [];
      return {
        send: (...args: unknown[]) => (note('email', 'send', args, 'mock'), void calls.push(args)),
        verify: () => {
          if (calls.length !== 1) fail(`mock EmailSender: expected send() once, called ${calls.length} times`);
          if (!same(calls[0], expectSend)) fail(`mock EmailSender: expected send(${show(expectSend).slice(1, -1)}), got send(${show(calls[0]).slice(1, -1)})`);
        },
      };
    },
    realEmail: () => real.email('real'),
    stubClock: (at: string) => ({ now: () => (note('clock', 'now', [], 'stub'), at) }),
    fakeClock(at: string) {
      let now = at;
      return { now: () => (note('clock', 'now', [], 'fake'), now), set: (t: string) => void (now = t) };
    },
    mockClock({ expectNow, returns }: { expectNow: number; returns: string }) {
      let calls = 0;
      return {
        now: () => (note('clock', 'now', [], 'mock'), calls++, returns),
        verify: () => {
          if (calls !== expectNow) fail(`mock Clock: expected now() ${expectNow} time(s), called ${calls}`);
        },
      };
    },
    realClock: () => real.clock('real'),
    /** A spy wraps the real thing (as jest.spyOn does by default) and records every call. */
    spyOn<T extends object>(target: T) {
      const calls: unknown[][] = [];
      const wrapped: Record<string, unknown> = { calls };
      for (const [k, fn] of Object.entries(target)) {
        wrapped[k] = (...args: unknown[]) => {
          calls.push(args);
          const before = env.trace.length;
          const r = (fn as (...a: unknown[]) => unknown)(...args);
          for (let i = before; i < env.trace.length; i++) env.trace[i] = { ...env.trace[i], by: 'spy' };
          return r;
        };
      }
      return wrapped;
    },
  };
}

// ── Running it ───────────────────────────────────────────────────────

export interface TestRun {
  passed: boolean;
  /** The assertion or error message, or null on a pass. */
  error: string | null;
  trace: Call[];
  ms: number;
  network: boolean;
  receipt: unknown;
}

export interface RunInput {
  checkout: readonly string[];
  test: readonly string[];
  roundingBug: boolean;
  run: number;
}

/** Run one test against one checkout, both from their fixed source text. */
export function runTest(i: RunInput): TestRun {
  const env: Env = { run: i.run, trace: [], roundingBug: i.roundingBug };
  const f = factories(env);
  let receipt: unknown = null;
  let error: string | null = null;
  // Runtime code execution, deliberately: checkout and its test are compiled from the exact
  // text the stage prints (checkoutLines / testLines), assembled only from this lesson's fixed
  // fragments by the double pickers and bug chips. No learner input reaches it.
  const checkout = new Function(`${i.checkout.join('\n')}\nreturn checkout;`)() as (cart: unknown, deps: unknown) => unknown;
  const spyCheckout = (cart: unknown, deps: unknown) => (receipt = checkout(cart, deps));
  const test = (_name: string, body: () => void) => {
    try {
      body();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  };
  const names = Object.keys(f) as (keyof typeof f)[];
  new Function(...names, 'checkout', 'expect', 'test', i.test.join('\n'))(...names.map((n) => f[n]), spyCheckout, expect, test);
  return {
    passed: error === null,
    error,
    trace: env.trace,
    ms: env.trace.reduce((a, c) => a + c.ms, 0),
    network: env.trace.some((c) => c.network),
    receipt,
  };
}

export const variantFor = (bug: Bug): CheckoutVariant => ({ ...CLEAN, emailBug: bug === 'email', twice: bug === 'twice' });
export const runConfig = (cfg: Config, bug: Bug, run: number) =>
  runTest({ checkout: checkoutLines(variantFor(bug)), test: testLines(cfg), roundingBug: bug === 'tax', run });

/** Same result on every run? Checked by actually running it across a full flaky cycle. */
export function sameEveryRun(make: (run: number) => TestRun): boolean {
  const runs = Array.from({ length: FLAKY_EVERY }, (_, r) => make(r));
  return runs.every((r) => r.passed === runs[0].passed && r.error === runs[0].error && same(r.receipt, runs[0].receipt));
}
export const isDeterministic = (cfg: Config, bug: Bug) => sameEveryRun((r) => runConfig(cfg, bug, r));

export type Verdict = 'caught' | 'escaped' | 'broken';
/**
 * Caught: the test fails with the bug and passes without it, on the same run. Broken: it fails
 * even without the bug, so its red says nothing about the bug. Escaped: it passes with the bug.
 */
export function verdict(cfg: Config, bug: Exclude<Bug, 'none'>, run: number): Verdict {
  if (!runConfig(cfg, 'none', run).passed) return 'broken';
  return runConfig(cfg, bug, run).passed ? 'escaped' : 'caught';
}
