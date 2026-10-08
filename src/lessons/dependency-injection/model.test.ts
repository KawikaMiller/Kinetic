import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { PRESETS, RESOLVES, ROOT, creationOrder, resolve, type Lifetime, type Registration } from './container';
import { ORDER_SERVICE, TESTS, mainLines, newsIn, type MailerChoice, type RepoChoice } from './programs';
import { runRoot, runTest } from './run';

describe('scene 1: the same lesson-authored test, run for real', () => {
  it('hard-wired: the test cannot isolate OrderService, and fails on the (simulated) database', () => {
    const r = runTest('hardwired');
    expect(r.passed).toEqual([false]);
    expect(r.lines.map((l) => l.text).join('\n')).toContain('ECONNREFUSED');
  });

  it('constructor injection: a fake repo and a spy mailer, and the test passes', () => {
    const r = runTest('injected');
    expect(r.passed).toEqual([true]);
    expect(r.lines[0]).toEqual({ text: '✓ place() saves the order and emails a receipt', tone: 'ok' });
  });

  it('service locator: the constructor looks clean but the hidden registry still reaches the database', () => {
    const r = runTest('locator');
    expect(r.passed).toEqual([false]);
    expect(r.lines.map((l) => l.text).join('\n')).toContain('ECONNREFUSED');
    // The hidden dependency: the constructor takes nothing, the method names Registry.
    expect(ORDER_SERVICE.locator[1]).toBe('  constructor() {}');
    expect(ORDER_SERVICE.locator.some((l) => l.includes("Registry.get('repo')"))).toBe(true);
  });

  it('the graph\'s hard-wired edges are exactly the `new`s in each OrderService', () => {
    const service = (lines: string[]) => lines.slice(0, lines.indexOf('}') + 1);
    expect(newsIn(service(ORDER_SERVICE.hardwired))).toEqual(['PostgresRepo', 'SmtpMailer']);
    expect(newsIn(service(ORDER_SERVICE.injected))).toEqual([]);
    expect(newsIn(TESTS.injected)).toEqual(['FakeRepo', 'SpyMailer', 'OrderService']);
  });
});

describe('scene 2: the composition root', () => {
  const choices: [RepoChoice, MailerChoice][] = [['postgres', 'smtp'], ['postgres', 'console'], ['memory', 'smtp'], ['memory', 'console']];

  it('only the in-memory + console wiring runs without touching the simulated network', () => {
    const passed = choices.map(([r, m]) => runRoot(r, m).passed[0]);
    expect(passed).toEqual([false, false, false, true]);
    expect(runRoot('memory', 'console').lines.map((l) => l.text)).toEqual(['mail to ada@example.com: Order 1 confirmed', 'saved order 1']);
  });

  it('swapping an implementation changes one line of main and no line of OrderService', () => {
    for (const [r1, m1] of choices) {
      for (const [r2, m2] of choices) {
        const a = mainLines(r1, m1);
        const b = mainLines(r2, m2);
        const diff = a.filter((l, i) => l !== b[i]).length;
        expect(diff).toBe(Number(r1 !== r2) + Number(m1 !== m2));
      }
    }
    // OrderService is one fixed text, whatever main picks.
    expect(newsIn(ORDER_SERVICE.injected)).toEqual([]);
  });
});

/**
 * Independent reference for instance counts: how many times each key is built, from the
 * graph alone. A key is requested once per creation of each dependent (per edge); a transient
 * is created per request, a singleton once if it is requested at all.
 */
function referenceCounts(regs: Registration[], root: string, times: number): Record<string, number> {
  const byKey = new Map(regs.map((r) => [r.key, r]));
  const memo = new Map<string, number>();
  const created = (key: string): number => {
    if (memo.has(key)) return memo.get(key)!;
    const requests = (key === root ? times : 0) + regs.filter((r) => r.deps.includes(key)).reduce((s, r) => s + created(r.key) * r.deps.filter((d) => d === key).length, 0);
    const n = byKey.get(key)!.lifetime === 'singleton' ? Math.min(1, requests) : requests;
    memo.set(key, n);
    return n;
  };
  return Object.fromEntries(regs.map((r) => [r.key, created(r.key)]));
}

describe('scene 3: the container', () => {
  it('shop preset, defaults: shared singletons are built once, transients per request', () => {
    const r = resolve(PRESETS.shop, ROOT.shop, RESOLVES);
    expect(r.cycle).toBeNull();
    expect(r.created).toEqual({ checkout: 2, orders: 2, reports: 2, repo: 1, mailer: 1, clock: 1 });
  });

  it('making repo transient builds one per dependent per resolve: 4', () => {
    const regs = PRESETS.shop.map((x) => (x.key === 'repo' ? { ...x, lifetime: 'transient' as Lifetime } : x));
    expect(resolve(regs, ROOT.shop, RESOLVES).created.repo).toBe(4);
  });

  it('agrees with the path-count reference for every lifetime combination of the shop preset (64)', () => {
    const regs = PRESETS.shop;
    for (let mask = 0; mask < 1 << regs.length; mask++) {
      const variant = regs.map((x, i) => ({ ...x, lifetime: (mask >> i) & 1 ? 'singleton' : 'transient' }) as Registration);
      expect(resolve(variant, ROOT.shop, RESOLVES).created, String(mask)).toEqual(referenceCounts(variant, ROOT.shop, RESOLVES));
    }
  });

  it('creates every class after all of its dependencies (topological), on 500 random DAGs', () => {
    const rnd = mulberry32(21);
    for (let t = 0; t < 500; t++) {
      const n = 2 + Math.floor(rnd() * 6);
      const regs: Registration[] = Array.from({ length: n }, (_, i) => ({
        key: `k${i}`,
        impl: `K${i}`,
        // Only edges to higher indices: a DAG.
        deps: Array.from({ length: n }, (_, j) => j).filter((j) => j > i && rnd() < 0.4).map((j) => `k${j}`),
        lifetime: rnd() < 0.5 ? 'singleton' : 'transient',
      }));
      const r = resolve(regs, 'k0', 2);
      expect(r.cycle).toBeNull();
      // Every create event happens after a create (or reuse) of each of its deps in the same resolve path.
      const order = creationOrder(r);
      for (const reg of regs) {
        if (!order.includes(reg.key)) continue;
        for (const d of reg.deps) expect(order.indexOf(d)).toBeLessThan(order.indexOf(reg.key));
      }
      expect(r.created).toEqual(referenceCounts(regs, 'k0', 2));
    }
  });

  it('the circular preset fails with the cycle highlighted, before building either class of it', () => {
    const r = resolve(PRESETS.cycle, ROOT.cycle, RESOLVES);
    expect(r.cycle).toEqual(['orders', 'audit', 'orders']);
    expect(r.created.orders).toBe(0);
    expect(r.created.audit).toBe(0);
    expect(r.created.repo).toBe(1);
    expect(r.events[r.events.length - 1].kind).toBe('cycle');
  });

  it('reports a missing registration instead of inventing one', () => {
    const r = resolve([{ key: 'a', impl: 'A', deps: ['b'], lifetime: 'transient' }], 'a', 1);
    expect(r.missing).toBe('b');
    expect(r.created.a).toBe(0);
  });
});
