import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import lesson from './index';
import { chattyCaption, pipeCaption, shareText, transferCaption } from './frames';
import {
  BANDWIDTH_STOPS, CHATTY_CALLS, CHATTY_EACH, CHATTY_WINDOW, DEFAULT_LINK, GB, GBIT, KB, MB, NEW_CONNECTION_RTTS, PRESETS, RTT_STOPS, SIZES, WINDOW_STOPS, bdp,
  chattyVsBatched, rateText, sizeText, throughput, timeText, transferTime, verdictOf, windowLimited,
} from './model';

const text = (n: Parameters<typeof captionText>[0]) => {
  const t = captionText(n).replace(/\s+/g, ' ');
  expect(t).not.toMatch(/[a-z)]\.[A-Z0-9]/);
  return t;
};

/** Every link the sliders can make with a preset's RTT and bandwidth, at every window. */
const links = PRESETS.flatMap((p) => WINDOW_STOPS.map((window) => ({ rtt: p.rtt, bandwidth: p.bandwidth, window })));

describe('captions follow the model at every preset and window', () => {
  it('the pipe caption says "smaller" exactly when the window is under the BDP, with the model\'s numbers', () => {
    for (const l of links) {
      const say = text(pipeCaption(l));
      expect(say.includes('smaller than the bandwidth-delay product')).toBe(windowLimited(l));
      expect(say).toContain(sizeText(bdp(l.bandwidth, l.rtt)));
      expect(say).toContain(rateText(throughput(l)));
    }
  });

  it('the transfer caption names each size\'s real verdict and time, for both connection kinds', () => {
    for (const l of links)
      for (const fresh of [false, true]) {
        const hs = fresh ? NEW_CONNECTION_RTTS : 0;
        const say = text(transferCaption(l, fresh));
        const small = transferTime(SIZES[0].bytes, l, hs);
        const big = transferTime(SIZES.at(-1)!.bytes, l, hs);
        expect(say).toContain(`${SIZES[0].label} takes ${timeText(small.total)}`);
        expect(say).toContain(`${SIZES.at(-1)!.label} takes ${timeText(big.total)}`);
        const verdicts = [...say.matchAll(/(latency-bound|window-limited|bandwidth-bound)/g)].map((m) => m[1]);
        expect(verdicts).toEqual([verdictOf(small), verdictOf(big)]);
        expect(say.includes('stalls it')).toBe(big.stalls > 0);
      }
  });

  it('the chatty caption never claims a bigger speed-up than the model has', () => {
    for (const rtt of RTT_STOPS)
      for (const bandwidth of BANDWIDTH_STOPS) {
        const l = { rtt, bandwidth, window: WINDOW_STOPS.at(-1)! };
        const r = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, l);
        const say = text(chattyCaption(l));
        const m = /about ([\d.]+)× faster/.exec(say);
        if (m) {
          expect(Number(m[1])).toBeLessThanOrEqual(r.chatty / r.batched);
          expect(r.chatty / r.batched - Number(m[1])).toBeLessThan(0.1);
        }
        expect(say).toContain(timeText(r.chatty));
      }
  });

  it('shares round down: 99.97% is never shown as 100%', () => {
    expect(shareText(0.9997, 1)).toBe('99%');
    expect(shareText(0.004, 1)).toBe('under 1%');
    expect(shareText(1, 1)).toBe('100%');
  });
});

describe('the quiz numbers come from the model', () => {
  it('BDP and window-limited throughput answers', () => {
    const q2 = lesson.quiz[1];
    expect(q2.options[q2.answer]).toBe(sizeText(bdp(GBIT, 0.08)));
    const q3 = lesson.quiz[2];
    expect(q3.options[q3.answer]).toBe(`About ${rateText(throughput({ rtt: 0.08, bandwidth: GBIT, window: 64 * KB }))}`);
  });
  it('the 10 KB fetch is the latency-bound one, and costs 240 ms of round trips', () => {
    const t = transferTime(10 * KB, { rtt: 0.08, bandwidth: GBIT, window: 20_000_000 }, NEW_CONNECTION_RTTS);
    expect(t.dominant).toBe('latency');
    expect(timeText(t.latency)).toBe('240 ms');
  });
  it('100 calls at 80 ms spend 8 s on round trips', () => {
    expect(chattyVsBatched(100, CHATTY_EACH, { rtt: 0.08, bandwidth: GBIT, window: 20_000_000 }).waiting).toBeCloseTo(8, 9);
  });
});

describe('the real default state and the try-this paths (review fixes)', () => {
  const next = (stops: readonly number[], v: number) => stops[stops.indexOf(v) + 1];

  it('the default link is on slider stops, with a window at least the BDP', () => {
    expect(RTT_STOPS).toContain(DEFAULT_LINK.rtt);
    expect(BANDWIDTH_STOPS).toContain(DEFAULT_LINK.bandwidth);
    expect(WINDOW_STOPS).toContain(DEFAULT_LINK.window);
    expect(windowLimited(DEFAULT_LINK)).toBe(false);
  });

  it('Transfer time at the default: 10 KB latency-bound, 1 GB bandwidth-bound, and doubling the bandwidth only helps the 1 GB', () => {
    const say = text(transferCaption(DEFAULT_LINK, true));
    expect([...say.matchAll(/(latency-bound|window-limited|bandwidth-bound)/g)].map((m) => m[1])).toEqual(['latency-bound', 'bandwidth-bound']);
    const doubled = { ...DEFAULT_LINK, bandwidth: next(BANDWIDTH_STOPS, DEFAULT_LINK.bandwidth) };
    expect(doubled.bandwidth).toBe(2 * DEFAULT_LINK.bandwidth);
    const t = (size: number, l: typeof DEFAULT_LINK) => transferTime(size, l, NEW_CONNECTION_RTTS).total;
    expect(t(SIZES.at(-1)!.bytes, doubled) / t(SIZES.at(-1)!.bytes, DEFAULT_LINK)).toBeLessThan(0.55);
    expect(t(SIZES[0].bytes, doubled) / t(SIZES[0].bytes, DEFAULT_LINK)).toBeGreaterThan(0.99);
  });

  it('try-this 1: dragging the window from 20 MB to 2 MB empties the pipe to 20%', () => {
    const l = { ...DEFAULT_LINK, window: 2 * MB };
    expect(WINDOW_STOPS).toContain(2 * MB);
    const say = text(pipeCaption(l));
    expect(say).toContain('smaller than the bandwidth-delay product');
    expect(say).toContain('only 20% full');
  });

  it('Chatty ignores the hidden window: a 1 KB window left over from The pipe changes nothing', () => {
    const tiny = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, { ...DEFAULT_LINK, window: CHATTY_WINDOW });
    expect(tiny.chatty / tiny.batched).toBeGreaterThan(50);
    expect(text(chattyCaption({ ...DEFAULT_LINK, window: CHATTY_WINDOW }))).toMatch(/about \d+(\.\d)?× faster/);
  });

  it('a stalled transfer is called window-limited', () => {
    const t = transferTime(GB, { ...DEFAULT_LINK, window: 64 * KB }, 0);
    expect(t.stalls).toBeGreaterThan(0);
    expect(verdictOf(t)).toBe('window-limited');
    expect(text(transferCaption({ ...DEFAULT_LINK, window: 64 * KB }, false))).toContain('window-limited');
  });

  it('the quiz no longer claims 1.25 MB is one millisecond at 1 Gbit/s (it is 125 KB)', () => {
    expect(bdp(GBIT, 0.001)).toBe(125 * KB);
    expect(lesson.quiz[1].why).not.toContain('millisecond');
  });
});
