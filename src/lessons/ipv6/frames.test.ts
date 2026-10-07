import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { sequenceLayout } from '../../core/sequenceLayout';
import { captionText } from '../../core/testing/captions';
import { SLAAC_ACTORS, compressFrames, raceFrames, slaacAddresses, slaacFrames, slaacMessages } from './frames';
import { ATTEMPT_DELAY_MS, EXAMPLE_MAC, PRESETS, RACE, classify, eui64, formatCanonical, formatFull, happyEyeballs, parseIPv6, randomIid } from './model';

const ok = (t: string) => {
  const r = parseIPv6(t);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('compress captions', () => {
  it('name the canonical form and the run that collapsed, for every preset and both directions', () => {
    for (const p of [...PRESETS.map((x) => x.text), '2001:db8:0:1:1:1:1:1', '::']) {
      const h = ok(p);
      for (const compressing of [true, false]) {
        const frames = compressFrames(h, compressing);
        expect(frames.map((f) => f.stage)).toEqual(compressing ? [0, 1, 2] : [2, 1, 0]);
        const text = frames.map((f) => captionText(f.say)).join(' ');
        expect(text).toContain(formatCanonical(h));
        if (compressing) expect(captionText(frames[0].say)).toContain(formatFull(h));
      }
      const last = captionText(compressFrames(h, true)[2].say);
      expect(last.includes("doesn't apply")).toBe(p === '2001:db8:0:1:1:1:1:1');
    }
  });
});

describe('SLAAC frames', () => {
  it('show addresses built from the chosen interface ID, in both modes', () => {
    for (const [mode, iid] of [['eui64', eui64(EXAMPLE_MAC)], ['privacy', randomIid(mulberry32(4))]] as const) {
      const { linkLocal, global } = slaacAddresses(iid);
      expect(classify(linkLocal)).toBe('link-local');
      expect(classify(global)).toBe('documentation');
      const frames = slaacFrames(iid, mode);
      expect(frames.map((f) => f.step)).toEqual([-1, 0, 1, 2, 3]);
      expect(captionText(frames[1].say)).toContain(formatCanonical(linkLocal));
      expect(captionText(frames[4].say)).toContain(formatCanonical(global));
      const layout = sequenceLayout(SLAAC_ACTORS, slaacMessages());
      expect(layout.rows).toHaveLength(4);
      // fits a 390px phone (346px of stage) without a sideways scroller
      expect(layout.minWidth).toBeLessThanOrEqual(346);
    }
  });
});

describe('race frames', () => {
  it('end on the winner the model picked, with its time', () => {
    for (const broken of [false, true]) {
      const r = happyEyeballs({ ...RACE, v6Ms: broken ? null : RACE.v6Ms });
      const frames = raceFrames(r, broken);
      expect(frames.at(-1)!.now).toBe(r.connectedAt);
      const last = captionText(frames.at(-1)!.say);
      expect(last).toContain(r.winner === 'v6' ? 'IPv6' : 'IPv4 wins');
      if (broken) expect(frames.some((f) => f.now === RACE.dnsMs + ATTEMPT_DELAY_MS)).toBe(true);
      expect(frames.map((f) => f.now)).toEqual([...frames.map((f) => f.now)].sort((a, b) => a - b));
    }
  });
});
