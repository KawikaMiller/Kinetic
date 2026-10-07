import { describe, expect, it } from 'vitest';
import { humanDuration } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { changeCaption, ladder, lookupFrames, messageTone, stepCaption, type Lowering } from './frames';
import { LOWERED_TTL, NEW_NAME, RESOLVERS, TTL_STEPS, createInternet, flipOf, resolve, type RType } from './model';

const QUESTIONS: [string, RType][] = [
  ['example.com', 'A'], ['example.com', 'AAAA'], ['www.example.com', 'A'], ['example.com', 'MX'], ['shop.example.com', 'A'], [NEW_NAME, 'A'],
];

describe('lookup captions', () => {
  it('state the result each lookup really got, cold, warm and with the server down', () => {
    for (const [name, type] of QUESTIONS) {
      const net = createInternet();
      const cold = resolve(net, {}, name, type, 0);
      const warm = resolve(net, cold.cache, name, type, 30);
      const down = resolve({ ...net, down: ['auth'] }, {}, name, type, 0);
      for (const l of [cold, warm, down]) {
        const frames = lookupFrames(l);
        expect(frames).toHaveLength(l.steps.length);
        const last = captionText(frames.at(-1)!.say);
        expect(last).toContain(l.rcode === 'NOERROR' ? 'hands back' : l.rcode);
        expect(last).toContain(`${l.ms} ms`);
        l.steps.forEach((s) => {
          const text = captionText(stepCaption(l, s));
          if (s.kind === 'cache-hit') expect(text).toContain(humanDuration(s.ttl!));
          if (s.kind === 'nxdomain') expect(text).toContain(humanDuration(s.ttl!));
          if (s.kind === 'nxdomain') expect(text.includes('typo in a CNAME target')).toBe(s.name !== l.name);
          if (s.kind === 'timeout') expect(text).toContain('timeout');
        });
        // the ladder's colours follow the step kinds: a timeout is an orange lost arrow, NXDOMAIN red
        ladder(l).forEach((m, i) => {
          expect(m.lost ?? false).toBe(l.steps[i].kind === 'timeout');
          expect(m.tone).toBe(messageTone(l.steps[i]));
        });
      }
      expect(warm.steps.some((s) => s.kind.startsWith('cache'))).toBe(true);
      expect(down.rcode === 'SERVFAIL').toBe(true);
    }
  });
});

describe('change-a-record captions over every TTL and lowering choice', () => {
  it('quote the first and last flip computed from the model', () => {
    const lowerings: Lowering[] = ['never', 'at-change', 'ahead'];
    let n = 0;
    for (const ttl of TTL_STEPS) {
      for (const lowering of lowerings) {
        n++;
        const plan = lowering === 'never' ? { ttl, lowered: null } : { ttl, lowered: { ttl: LOWERED_TTL, at: lowering === 'at-change' ? 0 : -ttl } };
        const flips = RESOLVERS.map((r) => flipOf(r, plan).flip);
        const text = captionText(changeCaption(RESOLVERS, plan, lowering));
        expect(text).toContain(`the last ${humanDuration(Math.max(...flips))} after it`);
        expect(text.includes("doesn't help")).toBe(lowering === 'at-change');
        if (lowering === 'ahead') expect(Math.max(...flips)).toBeLessThanOrEqual(LOWERED_TTL);
        if (lowering === 'at-change') expect(flips).toEqual(RESOLVERS.map((r) => flipOf(r, { ttl, lowered: null }).flip));
      }
    }
    expect(n).toBe(18);
  });
});
