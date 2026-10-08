import { describe, expect, it } from 'vitest';
import {
  BACK, CLIENT_SENDS, DROP, DURATION, EVENTS_UNTIL, HTTP_HEADER_BYTES, LONG_POLL_TIMEOUT, ONE_WAY, POLL_INTERVALS, RTT, TRANSPORTS,
  WS_ACCEPT, WS_GUID, WS_HANDSHAKE, WS_KEY, WS_SERVER_FRAME_HEADER, counters, delays, eventStream, simulate, type Params, type Rate,
} from './model';

const RATES: Rate[] = ['rare', 'normal', 'chatty'];
const ALL: Params[] = POLL_INTERVALS.flatMap((interval) =>
  RATES.flatMap((rate) => [false, true].flatMap((disconnect) => [false, true].flatMap((resync) => [false, true].map((clientSends) => ({ interval, rate, disconnect, resync, clientSends }))))));
const base: Params = { interval: 5, rate: 'normal', disconnect: false, resync: false, clientSends: false };

describe('the event stream', () => {
  it('is seeded (the same every run), ordered, and inside the window', () => {
    for (const r of RATES) {
      const a = eventStream(r);
      expect(eventStream(r)).toEqual(a);
      expect(a.length).toBeGreaterThan(0);
      for (let i = 1; i < a.length; i++) expect(a[i].t).toBeGreaterThan(a[i - 1].t);
      expect(a.at(-1)!.t).toBeLessThan(EVENTS_UNTIL);
    }
    expect(eventStream('chatty').length).toBeGreaterThan(eventStream('rare').length * 3);
  });
});

describe('every transport, every combination', () => {
  it('delivers each event at most once, in order, never before it happened; delivered + missed = all', () => {
    for (const p of ALL) {
      const { events, lanes } = simulate(p);
      for (const t of TRANSPORTS) {
        const lane = lanes[t];
        const ids = lane.deliveries.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids, ...lane.missed.map((e) => e.id)].sort((a, b) => a - b)).toEqual(events.map((e) => e.id));
        for (const d of lane.deliveries) expect(d.delivered).toBeGreaterThanOrEqual(d.at + ONE_WAY - 1e-9);
        const byId = [...lane.deliveries].sort((a, b) => a.id - b.id);
        for (let i = 1; i < byId.length; i++) expect(byId[i].delivered).toBeGreaterThanOrEqual(byId[i - 1].delivered);
      }
    }
  });

  it('only a WebSocket without resync ever misses events, and only those sent while it was down', () => {
    for (const p of ALL) {
      const { lanes } = simulate(p);
      for (const t of ['poll', 'long', 'sse'] as const) expect(lanes[t].missed).toEqual([]);
      if (!p.disconnect || p.resync) expect(lanes.ws.missed).toEqual([]);
      for (const e of lanes.ws.missed) {
        expect(e.t).toBeGreaterThanOrEqual(DROP - ONE_WAY);
        expect(e.t).toBeLessThan(BACK + 2);
      }
    }
  });
});

describe('short polling', () => {
  it('makes duration ÷ interval requests', () => {
    for (const interval of POLL_INTERVALS) expect(simulate({ ...base, interval }).lanes.poll.requests).toBe(DURATION / interval);
  });

  it('matches a brute-force reference: each event arrives with the first poll that reaches the server after it', () => {
    for (const p of ALL.filter((x) => !x.disconnect)) {
      const { events, lanes } = simulate(p);
      for (const e of events) {
        let k = 1;
        while (k * p.interval + ONE_WAY < e.t) k++;
        expect(lanes.poll.deliveries.find((d) => d.id === e.id)!.delivered).toBeCloseTo(k * p.interval + RTT, 9);
      }
    }
  });

  it('delays an event by at most the interval plus the one-way trip back', () => {
    for (const p of ALL.filter((x) => !x.disconnect)) {
      const max = counters(simulate(p).lanes.poll, 1).maxDelay!;
      expect(max).toBeLessThanOrEqual(p.interval + ONE_WAY + 1e-9);
    }
  });

  it('counts an empty 200 as wasted for every poll that found nothing', () => {
    const { lanes } = simulate({ ...base, interval: 1, rate: 'rare' });
    const full = new Set(lanes.poll.deliveries.map((d) => d.delivered)).size;
    expect(lanes.poll.wasted).toBe(lanes.poll.requests - full);
    expect(lanes.poll.wasted).toBeGreaterThan(40);
  });
});

describe('long polling', () => {
  it('delivers each event within one and a half round trips (the reconnect, then the trip back)', () => {
    for (const p of ALL.filter((x) => !x.disconnect)) {
      for (const d of delays(simulate(p).lanes.long)) expect(d).toBeLessThanOrEqual(RTT + ONE_WAY + 1e-9);
    }
  });

  it('comes back empty only after a held request times out', () => {
    const { lanes } = simulate({ ...base, rate: 'rare' });
    const hanging = lanes.long.bars.filter((b) => b.kind === 'hanging');
    expect(lanes.long.wasted).toBeGreaterThan(0);
    expect(hanging.some((b) => b.to - b.from >= LONG_POLL_TIMEOUT)).toBe(true);
    expect(hanging.every((b) => b.to - b.from <= LONG_POLL_TIMEOUT + RTT + 1e-9)).toBe(true);
  });
});

describe('SSE and WebSocket', () => {
  it('push every event one-way-trip after it happens on a healthy connection, over one request', () => {
    for (const t of ['sse', 'ws'] as const) {
      const lane = simulate(base).lanes[t];
      expect(lane.requests).toBe(1);
      for (const d of delays(lane)) expect(d).toBeCloseTo(ONE_WAY, 9);
    }
  });

  it('after a disconnect, SSE resumes from Last-Event-ID with zero missed events', () => {
    for (const p of ALL.filter((x) => x.disconnect)) {
      const sse = simulate(p).lanes.sse;
      expect(sse.missed).toEqual([]);
      expect(sse.replayed).toBe(sse.deliveries.filter((d) => d.at >= DROP - ONE_WAY && d.delivered > BACK && d.delivered - d.at > ONE_WAY + 1e-9).length);
    }
  });

  it('a WebSocket loses what was sent while it was down, unless the app resyncs', () => {
    const p = { ...base, rate: 'chatty' as Rate, disconnect: true };
    const lost = simulate(p).lanes.ws;
    const back = simulate({ ...p, resync: true }).lanes.ws;
    expect(lost.missed.length).toBeGreaterThan(0);
    expect(back.missed).toEqual([]);
    expect(back.replayed).toBe(lost.missed.length);
  });

  it('only the WebSocket sends the client\'s messages without extra HTTP requests', () => {
    const on = simulate({ ...base, clientSends: true }).lanes;
    const off = simulate(base).lanes;
    for (const t of ['poll', 'long', 'sse'] as const) expect(on[t].requests - off[t].requests).toBe(CLIENT_SENDS.length);
    expect(on.ws.requests).toBe(off.ws.requests);
  });

  it('header bytes: one HTTP exchange per request, plus 2-byte frame headers for WebSocket pushes', () => {
    const { events, lanes } = simulate(base);
    expect(lanes.poll.headerBytes).toBe(lanes.poll.requests * HTTP_HEADER_BYTES);
    expect(lanes.ws.headerBytes).toBe(HTTP_HEADER_BYTES + events.length * WS_SERVER_FRAME_HEADER);
  });
});

describe('server-side cost', () => {
  it('scales open connections and requests per second with the number of clients', () => {
    const { lanes } = simulate(base);
    const one = counters(lanes.poll, 1);
    const many = counters(lanes.poll, 10_000);
    expect(many.requestsPerSec).toBeCloseTo(one.requestsPerSec * 10_000, 6);
    expect(counters(lanes.ws, 10_000).openConnections).toBeCloseTo(10_000, 6);
    expect(one.requestsPerSec).toBeCloseTo(lanes.poll.requests / DURATION, 9);
  });
});

describe('the WebSocket handshake (RFC 6455)', () => {
  it('Sec-WebSocket-Accept is base64(SHA-1(key + GUID)), the RFC\'s own example', async () => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(WS_KEY + WS_GUID)));
    expect(btoa(String.fromCharCode(...digest))).toBe(WS_ACCEPT);
  });
  it('frame lines state each payload\'s real UTF-8 length (hand-counted: 30, 27, 30)', () => {
    const parsed = WS_HANDSHAKE.slice(2).map((h) => /(\d+) bytes: (.*)$/.exec(h.lines[0])!);
    expect(parsed.map((m) => Number(m[1]))).toEqual([30, 27, 30]);
    for (const m of parsed) expect(new TextEncoder().encode(m[2]).length).toBe(Number(m[1]));
  });

  it('asks to upgrade with the required headers and is answered with 101', () => {
    const [req, res] = WS_HANDSHAKE;
    expect(req.lines).toEqual(expect.arrayContaining(['Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${WS_KEY}`, 'Sec-WebSocket-Version: 13']));
    expect(req.lines[0]).toMatch(/^GET \S+ HTTP\/1\.1$/);
    expect(res.lines[0]).toBe('HTTP/1.1 101 Switching Protocols');
    expect(res.lines).toContain(`Sec-WebSocket-Accept: ${WS_ACCEPT}`);
  });
});
