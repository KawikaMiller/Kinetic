import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { IDEMPOTENCY_KEY, MAX_REPLAYS, POLICIES, REQUESTS, isSafeToRepeat, roundTripsSavedBy0Rtt, runEarly } from './earlyData';
import { FLIGHTS, STACKS, roundTripsBeforeRequest, roundTripsToFirstByte, schedule, timelineEnd, type Flight, type Stack } from './flights';
import { DEFAULT_LAYOUT, DEFAULT_LOST, PACKET_GAP_MS, holRun, summariseHol, toggleLost, type Layout } from './hol';
import { SWITCH_AT_MS, TCP_NOTICE_MS, UDP_BLOCKED_WAIT_MS, recover } from './migration';

describe('round trips before the first byte, hand-derived', () => {
  // TLS 1.2 over TCP: SYN to SYN-ACK is 1, ClientHello to ServerHelloDone is 2, ClientKeyExchange to Finished is 3, so the request leaves at 3.
  // TLS 1.3 over TCP: 1 for the TCP handshake, 1 for ClientHello to Finished, so the request leaves with the client's Finished at 2.
  // QUIC: ClientHello to the server's Finished is 1. QUIC 0-RTT: the request rides the first flight.
  const requestAt: Record<Stack, number> = { 'tcp-tls12': 3, 'tcp-tls13': 2, quic: 1, 'quic-0rtt': 0 };

  it('the request leaves after 3, 2, 1 and 0 round trips and the first byte arrives one round trip later', () => {
    for (const s of STACKS) {
      expect(roundTripsBeforeRequest(s), s).toBe(requestAt[s]);
      expect(roundTripsToFirstByte(s), s).toBe(requestAt[s] + 1);
    }
  });

  it('at a round trip of 100 ms and no think time the times are 300/400, 200/300, 100/200 and 0/100 ms', () => {
    const times = STACKS.map((s) => [schedule(s, 100, 0).requestAt, schedule(s, 100, 0).firstByteAt]);
    expect(times).toEqual([[300, 400], [200, 300], [100, 200], [0, 100]]);
  });

  it('at a round trip of 0 every stack sends at 0 and answers after the think time alone', () => {
    for (const s of STACKS) {
      expect(schedule(s, 0, 0).requestAt).toBe(0);
      expect(schedule(s, 0, 0).firstByteAt).toBe(0);
      expect(schedule(s, 0, 25).firstByteAt).toBe(25);
    }
  });

  it('think time is added once, after the request arrives: 100 ms round trip and 40 ms think give 440, 340, 240 and 140 ms', () => {
    expect(STACKS.map((s) => schedule(s, 100, 40).firstByteAt)).toEqual([440, 340, 240, 140]);
    expect(timelineEnd(100, 40)).toBe(440);
  });

  it('every flight arrives half a round trip after it leaves, and none leaves before the one it follows has arrived', () => {
    for (const s of STACKS) {
      const sched = schedule(s, 80, 10);
      for (const f of sched.flights) {
        expect(f.arrivesAt - f.sentAt).toBe(40);
        if (f.after) {
          const before = sched.flights.find((x) => x.id === f.after) as (typeof sched.flights)[number];
          expect(f.sentAt).toBeGreaterThanOrEqual(before.arrivesAt);
        }
      }
    }
  });

  it('a stack whose flight is listed before the one it follows is refused rather than timed wrongly (a broken variant)', () => {
    const broken: Flight[] = [{ id: 'resp', from: 'server', label: 'x', kind: 'response', after: 'req', thinks: true }, ...FLIGHTS.quic];
    const saved = FLIGHTS.quic;
    (FLIGHTS as Record<Stack, readonly Flight[]>).quic = broken;
    try {
      expect(() => schedule('quic', 100, 0)).toThrow(RangeError);
    } finally {
      (FLIGHTS as Record<Stack, readonly Flight[]>).quic = saved;
    }
  });

  it('0-RTT saves exactly one round trip against a 1-RTT QUIC handshake', () => {
    expect(roundTripsSavedBy0Rtt()).toBe(1);
  });
});

describe('what 0-RTT costs', () => {
  it('a safe request is applied once per delivered copy, and that is harmless; an unsafe one is applied once per copy too', () => {
    expect(runEarly('get', 'accept', 1, 100, 20).applied).toBe(2);
    expect(runEarly('post', 'accept', 1, 100, 20).applied).toBe(2);
    expect(runEarly('post', 'accept', 0, 100, 20).applied).toBe(1);
    expect(isSafeToRepeat('get')).toBe(true);
    expect(isSafeToRepeat('post')).toBe(false);
  });

  it('safe-only policy refuses the early POST and its replays, then applies it once after the handshake, one round trip later', () => {
    const r = runEarly('post', 'idempotent-only', 2, 100, 20);
    expect(r.deliveries.map((d) => d.outcome)).toEqual(['rejected-early', 'rejected-early', 'rejected-early', 'retried']);
    expect(r.applied).toBe(1);
    expect(r.retried).toBe(true);
    expect(r.firstByteMs).toBe(220);
    expect(runEarly('post', 'accept', 2, 100, 20).firstByteMs).toBe(120);
  });

  it('an idempotency key makes the replays of a POST do nothing: applied once, the rest ignored', () => {
    const r = runEarly('post', 'idempotency-key', 3, 100, 20);
    expect(r.deliveries.map((d) => d.outcome)).toEqual(['applied', 'ignored-key', 'ignored-key', 'ignored-key']);
    expect(r.applied).toBe(1);
    expect(r.firstByteMs).toBe(120);
    expect(IDEMPOTENCY_KEY.length).toBeGreaterThan(0);
  });

  it('for every request, policy and replay count the work done matches an independent count', () => {
    for (const req of REQUESTS) {
      for (const policy of POLICIES) {
        for (let replays = 0; replays <= MAX_REPLAYS; replays++) {
          const copies = 1 + replays;
          const expected = req === 'get' ? copies : policy === 'accept' ? copies : 1;
          expect(runEarly(req, policy, replays, 60, 0).applied, `${req} ${policy} ${replays}`).toBe(expected);
        }
      }
    }
  });
});

describe('head-of-line blocking', () => {
  it('hand-worked: ten packets 10 ms apart, 100 ms round trip, packet 6 lost: QUIC delays only stream D (to 200); TCP delays all four to 200', () => {
    // Arrivals with no loss are 50, 60, ..., 140 ms. Stream A has packets 1, 4 and 7 (clean 110), B 1, 5 and 8 (120), C 2, 5 and 9 (130), D 3, 6 and 10 (140).
    // Packet 6 would arrive at 100 and instead arrives at 100 + 100 = 200.
    const run = holRun(DEFAULT_LAYOUT, DEFAULT_LOST, 100);
    expect(run.cleanArrivals).toEqual([50, 60, 70, 80, 90, 100, 110, 120, 130, 140]);
    expect(run.arrivals[5]).toBe(200);
    expect(run.streams.map((s) => [s.stream, s.clean, s.quic, s.tcp])).toEqual([
      ['A', 110, 110, 200],
      ['B', 120, 120, 200],
      ['C', 130, 130, 200],
      ['D', 140, 200, 200],
    ]);
    expect(summariseHol(run)).toEqual({ tcpDelayed: 4, quicDelayed: 1, tcpEnd: 200, quicEnd: 200 });
  });

  it('with no loss both stacks finish every stream at the same time', () => {
    const run = holRun(DEFAULT_LAYOUT, [], 100);
    for (const s of run.streams) expect([s.tcp, s.quic]).toEqual([s.clean, s.clean]);
  });

  it('losing a packet that holds only stream 2\'s data (here the second packet, C) leaves QUIC\'s other streams at their clean times', () => {
    const run = holRun(DEFAULT_LAYOUT, [1], 100);
    const by = Object.fromEntries(run.streams.map((s) => [s.stream, s]));
    expect(by.A.quic).toBe(by.A.clean);
    expect(by.B.quic).toBe(by.B.clean);
    expect(by.D.quic).toBe(by.D.clean);
    // C's packet 5 also has B's data, but packet 2 is only C's.
    expect(by.C.quic).toBe(Math.max(by.C.clean, 60 + 100));
  });

  const layouts: Layout[] = (() => {
    const rnd = mulberry32(17);
    return Array.from({ length: 200 }, () => {
      const nStreams = 2 + Math.floor(rnd() * 5);
      const streams = Array.from({ length: nStreams }, (_, i) => String.fromCharCode(65 + i));
      const nPackets = 6 + Math.floor(rnd() * 11);
      const packets = Array.from({ length: nPackets }, () => {
        const k = 1 + Math.floor(rnd() * Math.min(3, nStreams));
        return [...new Set(Array.from({ length: k }, () => streams[Math.floor(rnd() * nStreams)]))];
      });
      // Every stream has at least one packet.
      streams.forEach((s, i) => {
        if (!packets.some((p) => p.includes(s))) packets[i % nPackets] = [...packets[i % nPackets], s];
      });
      return { streams, packets };
    });
  })();

  it('on 200 seeded layouts and every single lost packet, QUIC is never later than TCP, and a stream without the lost packet is unaffected over QUIC', () => {
    let tcpWorse = 0;
    for (const layout of layouts) {
      for (let lost = 0; lost < layout.packets.length; lost++) {
        const run = holRun(layout, [lost], 120);
        for (const s of run.streams) {
          expect(s.quic).toBeLessThanOrEqual(s.tcp);
          expect(s.quic).toBeGreaterThanOrEqual(s.clean);
          const hasLost = layout.packets[lost].includes(s.stream);
          if (!hasLost) expect(s.quic).toBe(s.clean);
          if (s.tcp > s.quic) tcpWorse++;
        }
      }
    }
    expect(tcpWorse).toBeGreaterThan(1000);
  });

  it('with no loss every layout gives equal times, and TCP\'s time for a stream is the latest arrival among all packets up to its last one', () => {
    for (const layout of layouts) {
      const run = holRun(layout, [], 90);
      for (const s of run.streams) expect([s.tcp, s.quic]).toEqual([s.clean, s.clean]);
      const lossy = holRun(layout, [2, 4], 90);
      for (const s of lossy.streams) {
        const last = layout.packets.map((p, k) => (p.includes(s.stream) ? k : -1)).reduce((a, b) => Math.max(a, b), -1);
        expect(s.tcp).toBe(Math.max(...lossy.arrivals.slice(0, last + 1)));
      }
    }
  });

  it('toggleLost adds and removes a packet and keeps the list sorted', () => {
    expect(toggleLost([5], 2)).toEqual([2, 5]);
    expect(toggleLost([2, 5], 5)).toEqual([2]);
    expect(PACKET_GAP_MS).toBe(10);
  });
});

describe('connection migration', () => {
  it('at 100 ms: TCP stalls for the timeout plus a new handshake (2 round trips) plus the request round trip, 1300 ms; QUIC for one validation round trip, 100 ms', () => {
    expect(recover('tcp', 100, false).stallMs).toBe(TCP_NOTICE_MS + 200 + 100);
    expect(recover('tcp', 100, false).stallMs).toBe(1300);
    expect(recover('quic', 100, false).stallMs).toBe(100);
  });

  it('with UDP blocked QUIC waits, then falls back to the same handshake TCP needs: 300 + 200 + 100 ms', () => {
    expect(recover('quic', 100, true).stallMs).toBe(UDP_BLOCKED_WAIT_MS + 300);
    expect(recover('tcp', 100, true).stallMs).toBe(recover('tcp', 100, false).stallMs);
  });

  it('the stall is the sum of its parts, the phases are back to back from the switch, and QUIC\'s grows with the round trip alone', () => {
    for (const rtt of [10, 60, 150, 300]) {
      for (const stack of ['tcp', 'quic'] as const) {
        for (const blocked of [false, true]) {
          const r = recover(stack, rtt, blocked);
          expect(r.parts.reduce((s, p) => s + p.ms, 0)).toBe(r.stallMs);
          r.phases.forEach((p, i) => {
            if (i > 0) expect(p.start).toBe(r.phases[i - 1].end);
          });
          expect(r.phases[0].end).toBe(SWITCH_AT_MS);
        }
      }
      expect(recover('quic', rtt, false).stallMs).toBe(rtt);
    }
  });

  it('udp blocked changes nothing for TCP (a hidden control feeds only the QUIC lane)', () => {
    for (const rtt of [10, 300]) expect(recover('tcp', rtt, true)).toEqual(recover('tcp', rtt, false));
  });
});
