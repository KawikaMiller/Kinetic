import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { buildFrames } from './frames';
import { legs, PHASES, phaseColor, setOpt, timeline, type Opts, type Phase } from './model';

const ALL: Opts[] = [false, true].flatMap((dnsCached) =>
  [false, true].flatMap((reuse) => [false, true].map((tls13) => ({ dnsCached, reuse, tls13 }))),
);
/** The combinations the controls can actually reach. */
const POSSIBLE = ALL.filter((o) => !(o.reuse && !o.dnsCached));
const name = (o: Opts) => `${o.dnsCached ? 'cached' : 'cold'} DNS, ${o.reuse ? 'reused' : 'new'} connection, TLS ${o.tls13 ? '1.3' : '1.2'}`;

/** Round trips worked out from the protocols, independently of the legs. */
function expectedRtts(o: Opts) {
  if (o.reuse) return 1; // just the HTTP request
  const dns = o.dnsCached ? 0 : 4; // OS↔resolver wrapping resolver↔root, ↔TLD, ↔authoritative
  const tcp = 1;
  const tls = o.tls13 ? 1 : 2;
  return dns + tcp + tls + 1;
}

describe.each(POSSIBLE)('%#', (o) => {
  const { steps, total, setup } = timeline(o);
  const end = steps.at(-1)!;

  it(`${name(o)}: round trips match the protocols`, () => {
    expect(end.rtts).toBe(expectedRtts(o));
  });

  it(`${name(o)}: the clock, the waterfall and the setup figure all add up`, () => {
    const sum = legs(o).reduce((a, l) => a + l.ms, 0);
    expect(total).toBe(sum);
    expect(end.ms).toBe(sum);
    expect(Object.values(end.elapsed).reduce((a, b) => a + b, 0)).toBe(sum);
    expect(setup).toBe(end.elapsed.dns + end.elapsed.tcp + end.elapsed.tls);
    for (let i = 1; i < steps.length; i++) expect(steps[i].ms).toBeGreaterThanOrEqual(steps[i - 1].ms);
  });

  it(`${name(o)}: phases run in order, and each layer is up before the next starts`, () => {
    const order = PHASES.map((p) => p.id);
    const seen = legs(o).map((l) => l.phase).filter((p): p is Phase => p !== null);
    for (let i = 1; i < seen.length; i++) expect(order.indexOf(seen[i])).toBeGreaterThanOrEqual(order.indexOf(seen[i - 1]));
    for (const s of steps) {
      if (s.leg?.phase === 'tcp') expect(s.ip).toBe(true);
      if (s.leg?.phase === 'tls') expect(s.tcp).toBe(true);
      if (s.leg?.phase === 'http') expect([s.ip, s.tcp, s.tls]).toEqual([true, true, true]);
    }
    expect(end.painted).toBe(true);
  });

  it(`${name(o)}: the summary caption quotes the real totals and says they're illustrative`, () => {
    const { frames } = buildFrames(o);
    const text = renderToStaticMarkup(frames.at(-1)!.say as ReactElement);
    expect(text).toContain(`${total} ms`);
    expect(text).toContain('illustrative');
    expect(text).toContain(`<b>${end.rtts} round trip${end.rtts === 1 ? '' : 's'}</b>`);
    // The opening line matches what the browser already has.
    const opening = renderToStaticMarkup(frames[0].say as ReactElement);
    expect(opening.includes('no idea where')).toBe(!o.reuse && !o.dnsCached);
    if (setup) expect(text).toContain(`${setup} ms`);
    for (const f of frames) expect(f.say).toBeTruthy();
  });
});

describe('specific figures', () => {
  it('the default (cold, new, TLS 1.3) is 362 ms, of which 222 ms is setup', () => {
    const t = timeline({ dnsCached: false, reuse: false, tls13: true });
    expect([t.total, t.setup]).toEqual([362, 222]);
  });

  it('TLS 1.2 costs exactly one more round trip and 50 ms more than 1.3', () => {
    const a = timeline({ dnsCached: true, reuse: false, tls13: true });
    const b = timeline({ dnsCached: true, reuse: false, tls13: false });
    expect(b.steps.at(-1)!.rtts - a.steps.at(-1)!.rtts).toBe(1);
    expect(b.total - a.total).toBe(50);
  });

  it('a cached lookup makes no network trip', () => {
    const dns = legs({ dnsCached: true, reuse: false, tls13: true }).filter((l) => l.phase === 'dns');
    expect(dns.map((l) => [l.from, l.to])).toEqual([['browser', 'os'], ['os', 'browser']]);
    expect(dns.some((l) => l.rtt)).toBe(false);
  });
});

describe('a reused connection', () => {
  const o = { dnsCached: true, reuse: true, tls13: true };

  it('skips DNS, TCP and TLS entirely, and the skip is not dressed up as a TCP step', () => {
    const l = legs(o);
    expect(l.some((x) => x.phase === 'dns' || x.phase === 'tcp' || x.phase === 'tls')).toBe(false);
    expect(l[0]).toMatchObject({ id: 'reuse', phase: null, ms: 0 });
    expect(phaseColor(l[0].phase)).toBe('var(--ok)');
    expect(timeline(o).setup).toBe(0);
  });

  it('TLS version makes no difference once the connection is already up', () => {
    expect(timeline({ ...o, tls13: false }).total).toBe(timeline(o).total);
  });
});

describe('setOpt keeps the controls to possible combinations', () => {
  it('turning reuse on makes DNS cached; turning DNS cold drops reuse', () => {
    expect(setOpt({ dnsCached: false, reuse: false, tls13: true }, 'reuse', true)).toEqual({ dnsCached: true, reuse: true, tls13: true });
    expect(setOpt({ dnsCached: true, reuse: true, tls13: true }, 'dnsCached', false)).toEqual({ dnsCached: false, reuse: false, tls13: true });
  });

  it('no sequence of clicks reaches cold DNS with a reused connection', () => {
    const keys = ['dnsCached', 'reuse', 'tls13'] as const;
    let frontier: Opts[] = [{ dnsCached: false, reuse: false, tls13: true }];
    const seen = new Set<string>();
    while (frontier.length) {
      const next: Opts[] = [];
      for (const s of frontier) {
        const k = JSON.stringify(s);
        if (seen.has(k)) continue;
        seen.add(k);
        expect(s.reuse && !s.dnsCached).toBe(false);
        for (const key of keys) for (const v of [false, true]) next.push(setOpt(s, key, v));
      }
      frontier = next;
    }
    expect(seen.size).toBe(POSSIBLE.length);
  });
});
