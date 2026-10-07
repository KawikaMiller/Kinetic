import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import lesson from './index';
import { chattyCaption, pipeCaption, shareText, transferCaption } from './frames';
import {
  BANDWIDTH_STOPS, CHATTY_CALLS, CHATTY_EACH, GBIT, KB, NEW_CONNECTION_RTTS, PRESETS, RTT_STOPS, SIZES, WINDOW_STOPS, bdp, chattyVsBatched, rateText,
  sizeText, throughput, timeText, transferTime, windowLimited,
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
        const verdicts = [...say.matchAll(/(latency|bandwidth)-bound/g)].map((m) => m[1]);
        expect(verdicts).toEqual([small.dominant, big.dominant]);
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
