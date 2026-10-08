import { describe, expect, it } from 'vitest';
import { ms } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { RTT_MAX, RTT_MIN, RTT_STEP } from './constants';
import { buildFrames, milestones, summary } from './frames';
import { LOST_RESOURCE, VERSION_NAME, simulateAll, type ConnCount, type Version } from './model';

const RTTS: number[] = [];
for (let r = RTT_MIN; r <= RTT_MAX; r += RTT_STEP) RTTS.push(r);
const COMBOS = RTTS.flatMap((rtt) => ([1, 2, 6] as ConnCount[]).flatMap((conns) => [false, true].map((loss) => ({ rtt, conns, loss }))));
const VERSIONS: Version[] = ['h1', 'h2', 'h3'];

describe('captions, every RTT × connection count × loss (full cross product)', () => {
  it('each version\'s finish caption gives its modelled load time, at that moment', () => {
    for (const p of COMBOS) {
      const runs = simulateAll(p);
      const marks = milestones(runs, p).map((m) => ({ t: m.t, text: captionText(m.say) }));
      for (const v of VERSIONS) {
        const m = marks.find((x) => x.text.includes(`${VERSION_NAME[v]} finished: all 12 resources in at ${ms(runs[v].total)}`));
        expect(m, `${v} ${JSON.stringify(p)}`).toBeDefined();
        expect(m!.t).toBeCloseTo(runs[v].total, 6);
      }
    }
  });

  it('the HTTP/2 loss caption counts exactly the streams the model stalled, and only appears with a loss', () => {
    for (const p of COMBOS) {
      const runs = simulateAll(p);
      const text = milestones(runs, p).map((m) => captionText(m.say)).join(' ');
      if (p.loss) {
        expect(text).toContain(`all ${runs.h2.loss!.stalled} streams`);
        expect(text).toContain(`arrived at ${ms(runs.h2.loss!.until)}`);
        expect(text).toContain(`stalled only ${LOST_RESOURCE}'s own stream`);
        const conn = runs.h1.timings.find((x) => x.id === LOST_RESOURCE)!.conn + 1;
        expect(text).toContain(`stalled only connection ${conn},`);
      } else {
        expect(text).not.toContain('lost');
        expect(text).not.toContain('✕');
      }
    }
  });

  it('the head-of-line caption names a request that really went out on config.js\'s connection the moment it freed', () => {
    for (const p of COMBOS) {
      const runs = simulateAll(p);
      const slow = runs.h1.timings.find((x) => x.id === 'config.js')!;
      const hol = milestones(runs, p).map((m) => captionText(m.say)).find((t) => t.includes('head-of-line blocking at the HTTP layer'));
      const behind = runs.h1.timings.find((x) => x.conn === slow.conn && Math.abs(x.sent - slow.done) < 1e-6);
      if (!behind) {
        expect(hol).toBeUndefined();
        continue;
      }
      expect(hol).toContain(`${behind.id} waited ${ms(behind.sent - behind.need)}`);
      expect(hol).toContain(`connection ${slow.conn + 1} only when`);
    }
  });

  it('when the extra HTTP/1.1 connections come up, each really takes a queued request at that moment', () => {
    for (const p of COMBOS.filter((c) => c.conns > 1)) {
      const runs = simulateAll(p);
      const extra = runs.h1.connReady[1];
      const text = milestones(runs, p).map((m) => captionText(m.say)).join(' ');
      expect(text).toContain(`the ${p.conns - 1} new connections finished their handshakes at ${ms(extra)}`);
      for (let c = 1; c < p.conns; c++) expect(runs.h1.timings.some((x) => x.conn === c && Math.abs(x.sent - extra) < 1e-6)).toBe(true);
      expect(runs.h1.timings.filter((x) => x.sent < extra - 1e-6).every((x) => x.conn === 0)).toBe(true);
    }
  });

  it('the summary ranks the versions by their modelled totals', () => {
    for (const p of COMBOS) {
      const runs = simulateAll(p);
      const text = captionText(summary(runs, p));
      const order = [...VERSIONS].sort((a, b) => runs[a].total - runs[b].total);
      const at = order.map((v) => text.indexOf(`${VERSION_NAME[v]} ${ms(runs[v].total)}`));
      expect(at.every((i) => i >= 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(text.includes('lost packet')).toBe(p.loss);
    }
  });

  it('frames run forward in time from 0 to the end, start with the intro and end on the summary', () => {
    const p = { rtt: 100, conns: 6 as const, loss: true };
    const runs = simulateAll(p);
    const end = 1200;
    const frames = buildFrames(runs, p, end);
    expect(frames[0].now).toBe(0);
    expect(captionText(frames[0].say)).toContain('up to 6 connections');
    for (let i = 1; i < frames.length; i++) expect(frames[i].now).toBeGreaterThanOrEqual(frames[i - 1].now);
    expect(frames.at(-1)!.now).toBe(end);
    expect(captionText(frames.at(-1)!.say)).toContain('Illustrative model');
  });
});
