import { describe, expect, it } from 'vitest';
import {
  BANDWIDTH_STOPS, blockShare, CHATTY_CALLS, CHATTY_EACH, GB, GBIT, KB, MB, MBIT, NEW_CONNECTION_RTTS, PIPE_SLOTS, RTT_STOPS, WINDOW_STOPS, bdp, blockBytes,
  blocksInFlight, chattyVsBatched, createPipe, nearestStop, rateText, sizeText, stepPipe, throughput, timeText, transferTime, type Link,
} from './model';

describe('bandwidth-delay product', () => {
  it('1 Gbit/s × 80 ms = 10 MB (bits to bytes: ÷ 8)', () => {
    expect(bdp(GBIT, 0.08)).toBe(10 * MB);
    expect(sizeText(bdp(GBIT, 0.08))).toBe('10 MB');
  });
  it('25 Gbit/s × 0.5 ms (a rack) is only 1.5625 MB', () => {
    expect(bdp(25 * GBIT, 0.0005)).toBeCloseTo(1_562_500, 6);
  });
});

describe('throughput = min(bandwidth, window ÷ RTT)', () => {
  it('holds at every slider stop, checked case by case', () => {
    for (const rtt of RTT_STOPS)
      for (const bandwidth of BANDWIDTH_STOPS)
        for (const window of WINDOW_STOPS) {
          const t = throughput({ rtt, bandwidth, window });
          // Independent statement: a window per round trip, unless the link is slower.
          const perRtt = (window * 8) / rtt;
          if (perRtt >= bandwidth) expect(t).toBe(bandwidth);
          else expect(t).toBeCloseTo(perRtt, 6);
          expect(t).toBeLessThanOrEqual(bandwidth);
        }
  });
});

/**
 * Independent reference: a packet-level sender. Packets of `p` bytes go out back to back at
 * line rate while fewer than `window` bytes are unacknowledged; each packet's ACK reaches the
 * sender one RTT after the packet finished transmitting. Returns when the last byte arrives,
 * counting from the request (handshakes first, then the request's half RTT).
 */
function simulate(size: number, l: Link, handshakes: number, p: number): number {
  const start = handshakes * l.rtt + l.rtt / 2;
  const tx = (p * 8) / l.bandwidth;
  const acks: number[] = []; // ACK arrival times, oldest first
  let t = start;
  let sent = 0;
  let inFlight = 0;
  let lastEnd = start;
  while (sent < size) {
    while (acks.length && acks[0] <= t) {
      acks.shift();
      inFlight -= p;
    }
    if (inFlight + p > l.window) {
      t = acks[0];
      continue;
    }
    const bytes = Math.min(p, size - sent);
    lastEnd = t + (bytes * 8) / l.bandwidth;
    acks.push(t + tx + l.rtt);
    inFlight += p;
    sent += bytes;
    t = lastEnd;
  }
  return lastEnd + l.rtt / 2;
}

describe('transfer time', () => {
  const cases: [string, Link, number, number][] = [
    ['big window, small file', { rtt: 0.08, bandwidth: GBIT, window: 20 * MB }, 10 * KB, 2],
    ['window-limited', { rtt: 0.08, bandwidth: GBIT, window: 64 * KB }, 1 * MB, 2],
    ['window-limited, connected', { rtt: 0.05, bandwidth: 20 * MBIT, window: 10 * KB }, 200 * KB, 0],
    ['window just over the BDP', { rtt: 0.05, bandwidth: 20 * MBIT, window: 130 * KB }, 1 * MB, 0],
    ['satellite', { rtt: 0.6, bandwidth: 50 * MBIT, window: 500 * KB }, 2 * MB, 2],
  ];
  it.each(cases)('%s: the closed form matches a packet-level sender (within the packet-size error)', (_, l, size, hs) => {
    const p = l.window / 200;
    const formula = transferTime(size, l, hs);
    const sim = simulate(size, l, hs, p);
    // Packets make each stall wait one packet's transmission longer than the fluid formula.
    const slack = formula.stalls * ((p * 8) / l.bandwidth) + 1e-9;
    expect(sim).toBeGreaterThanOrEqual(formula.total - 1e-9);
    expect(sim).toBeLessThanOrEqual(formula.total + slack);
  });

  it('a 10 KB fetch is latency-bound and a 1 GB fetch bandwidth-bound on the same link', () => {
    const l = { rtt: 0.08, bandwidth: GBIT, window: 20 * MB };
    const small = transferTime(10 * KB, l, NEW_CONNECTION_RTTS);
    const big = transferTime(GB, l, NEW_CONNECTION_RTTS);
    // Worked by hand: 3 round trips of 80 ms; 80,000 bits at 1 Gbit/s; 8e9 bits at 1 Gbit/s.
    expect(small.latency).toBeCloseTo(0.24, 9);
    expect(small.serialization).toBeCloseTo(0.00008, 12);
    expect(small.dominant).toBe('latency');
    expect(big.serialization).toBeCloseTo(8, 9);
    expect(big.dominant).toBe('bandwidth');
  });

  it('a window under the BDP turns a big transfer back into round trips', () => {
    const l = { rtt: 0.08, bandwidth: GBIT, window: 64 * KB };
    const t = transferTime(100 * MB, l, 0);
    expect(t.stalls).toBe(Math.ceil((100 * MB) / (64 * KB)) - 1);
    expect(t.dominant).toBe('latency');
  });

  it('is continuous as the window crosses the BDP', () => {
    const at = (window: number) => transferTime(50 * MB, { rtt: 0.08, bandwidth: GBIT, window }, 0).total;
    expect(at(10 * MB)).toBeCloseTo(at(10 * MB - 1), 3);
  });
});

describe('chatty vs batched', () => {
  it('chatty = n × RTT + bytes ÷ bandwidth, batched = one RTT + the same bytes', () => {
    const l = { rtt: 0.08, bandwidth: GBIT, window: 20 * MB };
    const r = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, l);
    const bytes = CHATTY_CALLS * CHATTY_EACH;
    expect(r.chatty).toBeCloseTo(CHATTY_CALLS * 0.08 + (bytes * 8) / GBIT, 9);
    expect(r.batched).toBeCloseTo(0.08 + (bytes * 8) / GBIT, 9);
    expect(r.waiting).toBeCloseTo(8, 9);
  });

  it('doubling the bandwidth barely helps the chatty version', () => {
    const l = { rtt: 0.08, bandwidth: GBIT, window: 20 * MB };
    const a = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, l).chatty;
    const b = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, { ...l, bandwidth: 2 * GBIT }).chatty;
    expect((a - b) / a).toBeLessThan(0.001);
  });
});

describe('the drawn pipe', () => {
  it('holds window ÷ block size blocks in flight (within one), capped at the pipe', () => {
    for (const rtt of [0.005, 0.08, 0.6])
      for (const bandwidth of [20 * MBIT, GBIT])
        for (const window of WINDOW_STOPS) {
          const l = { rtt, bandwidth, window };
          const w = createPipe(blocksInFlight(l));
          let peak = 0;
          for (let i = 0; i < 600; i++) {
            stepPipe(w, 1 / 60);
            if (i > 300) peak = Math.max(peak, w.blocks.length);
          }
          expect(Math.abs(peak - Math.min(PIPE_SLOTS, window / blockBytes(l)))).toBeLessThanOrEqual(1);
        }
  });
});

describe('a window smaller than one drawn block', () => {
  it('draws a share of a block, never a whole one bigger than the window', () => {
    const l = { rtt: 0.08, bandwidth: GBIT, window: 64 * KB };
    expect(blockShare(l)).toBeCloseTo((64 * KB) / ((10 * MB) / PIPE_SLOTS), 9);
    expect(blockShare(l)).toBeLessThan(1);
    expect(blockShare({ ...l, window: 20 * MB })).toBe(1);
  });
});

describe('text and stops', () => {
  it('formats units without float noise', () => {
    expect(rateText(25 * GBIT)).toBe('25 Gbit/s');
    expect(rateText(20 * MBIT)).toBe('20 Mbit/s');
    expect(sizeText(64 * KB)).toBe('64 KB');
    expect(timeText(0.0005)).toBe('0.5 ms');
    expect(timeText(0.08)).toBe('80 ms');
    expect(timeText(8.0016)).toBe('8 s');
    expect(timeText(1220)).toBe('20.3 min');
  });
  it('every preset sits exactly on a slider stop', () => {
    expect(RTT_STOPS[nearestStop(RTT_STOPS, 0.08)]).toBe(0.08);
    expect(BANDWIDTH_STOPS[nearestStop(BANDWIDTH_STOPS, 25 * GBIT)]).toBe(25 * GBIT);
  });
});
