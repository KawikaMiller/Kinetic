import { describe, expect, it } from 'vitest';
import { humanDuration } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { changeCaption, ladder, lookupFrames, messageTone, stepCaption, type Lowering } from './frames';
import { LOWERED_TTL, NEW_NAME, RESOLVERS, TTL_STEPS, createInternet, flipOf, resolve, type RType, type ServerId } from './model';

const QUESTIONS: [string, RType][] = [
  ['example.com', 'A'], ['example.com', 'AAAA'], ['www.example.com', 'A'], ['example.com', 'MX'], ['shop.example.com', 'A'], [NEW_NAME, 'A'], [NEW_NAME, 'AAAA'], ['mail.example.com', 'AAAA'],
];

describe('lookup captions', () => {
  it('state the result each lookup really got: cold, warm, one server down and both down', () => {
    for (const [name, type] of QUESTIONS) {
      const net = createInternet();
      const cold = resolve(net, {}, name, type, 0);
      const warm = resolve(net, cold.cache, name, type, 30);
      const down = (d: ServerId[]) => resolve({ ...net, down: d }, {}, name, type, 0);
      const half = down(['ns1']);
      const dead = down(['ns1', 'ns2']);
      for (const l of [cold, warm, half, dead]) {
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
          if (s.kind === 'timeout') expect(text).toContain(l.rcode === 'SERVFAIL' && s.server === 'ns2' ? 'gives up' : 'tries ns2.example.com next');
          if (s.kind === 'answer') expect(text.includes('same reply')).toBe(!!s.chain?.length);
          if (s.kind === 'cname') expect(text).toContain('another zone');
          if (s.kind === 'cache-negative') expect(text).toContain(s.negative === 'NXDOMAIN' ? 'whole name' : 'NODATA');
          if (s.kind === 'reply') expect(text.includes('CNAME chain')).toBe(l.rcode !== 'SERVFAIL' && l.answers.some((a) => a.includes('→')));
        });
        // the ladder's colours follow the step kinds: a timeout is an orange lost arrow, NXDOMAIN red
        ladder(l).forEach((m, i) => {
          expect(m.lost ?? false).toBe(l.steps[i].kind === 'timeout');
          expect(m.tone).toBe(messageTone(l.steps[i]));
        });
      }
      expect(warm.steps.some((s) => s.kind.startsWith('cache'))).toBe(true);
      expect(dead.rcode).toBe('SERVFAIL');
      expect(half.rcode).toBe(cold.rcode);
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
