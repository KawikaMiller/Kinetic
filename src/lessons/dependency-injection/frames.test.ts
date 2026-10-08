import { describe, expect, it } from 'vitest';
import { PRESETS, RESOLVES, ROOT, resolve, type Registration } from './container';
import { containerFrames } from './frames';
import { MAILER_CLASS, ORDER_SERVICE, REPO_CLASS } from './programs';

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
