import { describe, expect, it } from 'vitest';
import { PRESETS, RESOLVES, ROOT, resolve, type Registration } from './container';
import { containerFrames } from './frames';
import { MAILER_CLASS, ORDER_SERVICE, REPO_CLASS, pickedInside, serviceClass } from './programs';

describe('container frames', () => {
  it('end on a summary computed from the run, for all 64 lifetime combinations of the shop preset', () => {
    const regs = PRESETS.shop;
    for (let mask = 0; mask < 1 << regs.length; mask++) {
      const variant = regs.map((x, i) => ({ ...x, lifetime: (mask >> i) & 1 ? 'singleton' : 'transient' }) as Registration);
      const frames = containerFrames(variant, ROOT.shop, RESOLVES);
      const r = resolve(variant, ROOT.shop, RESOLVES);
      const last = frames[frames.length - 1];
      expect(last.created).toEqual(r.created);
      for (const x of variant) expect(last.say).toContain(`${x.impl} ×${r.created[x.key]}`);
      // Counts only ever grow, and never pass the final total.
      frames.forEach((f, i) => {
        for (const x of variant) {
          if (i) expect(f.created[x.key]).toBeGreaterThanOrEqual(frames[i - 1].created[x.key]);
          expect(f.created[x.key]).toBeLessThanOrEqual(r.created[x.key]);
        }
      });
    }
  });

  it('the circular preset ends on the cycle, highlighted', () => {
    const frames = containerFrames(PRESETS.cycle, ROOT.cycle, RESOLVES);
    const last = frames[frames.length - 1];
    expect(last.cycle).toEqual(['orders', 'audit', 'orders']);
    expect(last.say).toContain('orders → audit → orders is a cycle');
    expect(frames[frames.length - 2].say).toContain('Cycle: orders → audit → orders');
  });
});

describe('the composition root claim', () => {
  it('the injected OrderService names no concrete repository or mailer, so swapping one cannot edit it', () => {
    const concrete = [...Object.values(REPO_CLASS), ...Object.values(MAILER_CLASS)];
    const words = new Set(ORDER_SERVICE.injected.join('\n').split(/\W+/));
    expect(concrete.filter((c) => words.has(c))).toEqual([]);
    // ...whereas the hard-wired one names two.
    const hard = new Set(ORDER_SERVICE.hardwired.join('\n').split(/\W+/));
    expect(concrete.filter((c) => hard.has(c))).toEqual(['PostgresRepo', 'SmtpMailer']);
  });
});

describe('quiz numbers come from the model', () => {
  it('the singleton question: 1 InMemoryRepo, and 4 as a transient', async () => {
    const lesson = (await import('./index')).default;
    const q = lesson.quiz[3];
    const r = resolve(PRESETS.shop, ROOT.shop, RESOLVES);
    expect(q.options[q.answer]).toBe(String(r.created.repo));
    const transient = PRESETS.shop.map((x) => (x.key === 'repo' ? { ...x, lifetime: 'transient' as const } : x));
    expect(q.why).toContain(`which makes ${resolve(transient, ROOT.shop, RESOLVES).created.repo}`);
  });
});

describe('review fixes, pinned', () => {
  it('counts what OrderService picks for itself: 2 hard-wired, 2 hidden lookups for the locator (not 1), 0 injected', () => {
    expect(pickedInside(ORDER_SERVICE.hardwired)).toEqual(['new:PostgresRepo', 'new:SmtpMailer']);
    expect(pickedInside(ORDER_SERVICE.locator)).toEqual(['lookup:repo', 'lookup:mailer']);
    expect(pickedInside(ORDER_SERVICE.injected)).toEqual([]);
  });

  it('the locator count reads straight off the shown text: it equals the Registry.get calls in the class', () => {
    const calls = serviceClass(ORDER_SERVICE.locator).join(' ').match(/Registry\.get\(/g) ?? [];
    expect(pickedInside(ORDER_SERVICE.locator)).toHaveLength(calls.length);
  });

  it('Q5 names constructor injection in its stem, and the half-built distractor is the one the why explains away', async () => {
    const q = (await import('./index')).default.quiz[4];
    expect(q.q).toContain('With constructor injection');
    expect(q.why).toContain('setter or field injection');
    expect(q.options[q.answer]).toContain('Fails to resolve');
  });

  it('keeps DI, DIP and IoC apart, and says this lesson shows DI, not DIP', async () => {
    const { summary } = (await import('./index')).default;
    expect(summary.what).toContain('dependency inversion principle (DIP');
    expect(summary.what).toContain('Inversion of control (IoC)');
    expect(summary.what).toContain('shows DI, not DIP');
    expect(summary.why).not.toContain('everyday form of dependency inversion');
  });

  it('describes a transient as a new one each time it is asked for, not "per request"', () => {
    const frames = containerFrames(PRESETS.shop, ROOT.shop, RESOLVES);
    const text = frames.map((f) => f.say).join(' ');
    expect(text).toContain('a new one each time it is asked for');
    expect(text).not.toContain('per request');
  });
});
