import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { TALLY_AT, buildFrames, delayText, handshakeFrames, milestones, rateText, summary } from './frames';
import lesson from './index';
import { DURATION, POLL_INTERVALS, SSE_HANDSHAKE, TRANSPORTS, WS_HANDSHAKE, counters, simulate, type Params, type Rate } from './model';

const ALL: Params[] = POLL_INTERVALS.flatMap((interval) =>
  (['rare', 'normal', 'chatty'] as Rate[]).flatMap((rate) => [false, true].flatMap((disconnect) => [false, true].flatMap((resync) => [false, true].map((clientSends) => ({ interval, rate, disconnect, resync, clientSends }))))));

describe('captions, every control combination (192)', () => {
  it('quote the model: first-message delays, replay and loss counts, request totals', () => {
    for (const p of ALL) {
      const { events, lanes } = simulate(p);
      const text = milestones(events, lanes, p).map((m) => expectCaption(m.say)).join(' | ');
      for (const t of TRANSPORTS) {
        const d = lanes[t].deliveries.find((x) => x.id === 1)!;
        expect(text).toContain(delayText(d.delivered - d.at));
      }
      expect(text.includes('The network dropped')).toBe(p.disconnect);
      if (p.disconnect) {
        expect(text).toContain(`replayed ${lanes.sse.replayed} missed`);
        if (p.resync) expect(text).toContain(`${lanes.ws.replayed} event`);
        else expect(text).toContain(`${lanes.ws.missed.length} event`);
      }
      expect(text.includes('empty 200')).toBe(lanes.long.bars.some((b) => b.kind === 'timeout'));
      const s = expectCaption(summary(lanes));
      expect(s).toContain(`short polling made ${lanes.poll.requests} requests (${lanes.poll.wasted} came back empty)`);
      expect(s).toContain(`WebSocket ${lanes.ws.requests}`);
    }
  });

  it('running tallies count exactly what the lanes show by then (brute force over the bars)', () => {
    for (const p of ALL) {
      const { events, lanes } = simulate(p);
      const text = milestones(events, lanes, p).map((m) => expectCaption(m.say)).join(' | ');
      for (const at of TALLY_AT) {
        const count = (t: 'poll' | 'long') => lanes[t].bars.filter((b) => b.from <= at && b.kind !== 'stream' && b.kind !== 'timeout').length;
        const empty = lanes.poll.bars.filter((b) => b.kind === 'empty' && b.to <= at).length;
        expect(text).toContain(`Short polling has made ${count('poll')} requests (${empty} came back`);
        expect(text).toContain(`long polling ${count('long')},`);
        expect(text).toContain(`By ${at.toFixed(1)} s: ${events.filter((e) => e.t <= at).length} message`);
      }
      expect(text.includes('sends a message of its own')).toBe(p.clientSends);
    }
  });

  it('frames walk the 60 s forward and end on the summary', () => {
    const p = ALL[0];
    const { events, lanes } = simulate(p);
    const frames = buildFrames(events, lanes, p);
    for (let i = 1; i < frames.length; i++) expect(frames[i].now).toBeGreaterThanOrEqual(frames[i - 1].now);
    expect(frames.at(-1)!.now).toBe(DURATION);
    expect(expectCaption(frames.at(-1)!.say)).toContain('illustrative');
  });

  it('the handshake scene has a caption for every message', () => {
    for (const [k, steps] of [['ws', WS_HANDSHAKE], ['sse', SSE_HANDSHAKE]] as const) {
      const frames = handshakeFrames(k, steps);
      expect(frames).toHaveLength(steps.length + 1);
      for (const f of frames) expect(expectCaption(f.say).length).toBeGreaterThan(20);
    }
  });
});

describe('formatting', () => {
  it('writes delays in ms under a second and seconds above, and small rates with a decimal', () => {
    expect([delayText(0.05), delayText(0.876), delayText(5.041)]).toEqual(['50 ms', '876 ms', '5.0 s']);
    expect([rateText(0.2), rateText(2000), rateText(12.4)]).toEqual(['0.2/s', '2,000/s', '12/s']);
  });
});

describe('the quiz numbers come from the model', () => {
  it('10,000 clients polling every 5 s make 2,000 requests a second', () => {
    const { lanes } = simulate({ interval: 5, rate: 'normal', disconnect: false, resync: false, clientSends: false });
    expect(counters(lanes.poll, 10_000).requestsPerSec).toBe(2000);
    expect(lesson.quiz[4].why).toContain('2,000 requests a second');
  });
});
