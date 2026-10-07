import { describe, expect, it } from 'vitest';
import { FORCED_TCP_LOSS, FORCED_UDP_LOSS, N, RTO, simulate, type Tick } from './sim';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const LOSSES = [0, 0.05, 0.15, 0.25, 0.4];
const REORDERS = [0, 0.2, 0.5];
const SEEDS = range(40);

/** Every slider stop the tests sweep, over many seeds. */
function* runs(): Generator<{ seed: number; loss: number; reorder: number; ticks: Tick[] }> {
  for (const loss of LOSSES) for (const reorder of REORDERS) for (const seed of SEEDS) yield { seed, loss, reorder, ticks: simulate(seed, loss, reorder) };
}

describe('TCP', () => {
  it('always finishes and hands the app exactly 1..N in order, for every swept setting', () => {
    for (const { ticks } of runs()) {
      const last = ticks[ticks.length - 1];
      expect(last.tcp.done).toBe(true);
      expect(last.tcp.delivered).toEqual(range(N));
      // and the delivered stream is an in-order prefix at every tick
      for (const t of ticks) expect(t.tcp.delivered).toEqual(range(t.tcp.delivered.length));
    }
  });

  it('only holds back packets beyond the gap, never one it has delivered', () => {
    for (const { ticks } of runs()) {
      for (const t of ticks) {
        const next = t.tcp.delivered.length + 1;
        for (const s of t.tcp.buffer) expect(s).toBeGreaterThan(next);
      }
    }
  });

  it('resends only after a full timeout with no ACK past the resent packet, and drops its window to 1', () => {
    for (const { ticks } of runs()) {
      for (const t of ticks) {
        for (const e of t.events) {
          if (e.kind !== 'retx') continue;
          expect(e.cwnd).toBe(1);
          expect(t.tcp.cwnd).toBe(1);
          // the resent packet is the first unacknowledged one
          expect(t.tcp.status[e.seq - 1]).not.toBe('acked');
          if (e.seq > 1) expect(t.tcp.status[e.seq - 2]).toBe('acked');
          // and no new ACK arrived for a whole RTO before this tick
          const window = ticks.slice(Math.max(0, t.t - RTO), t.t);
          for (const w of window) expect(w.tcp.status[e.seq - 1]).not.toBe('acked');
        }
      }
    }
  });

  it('never resends on a clean link, and counts every resend', () => {
    for (const seed of SEEDS) {
      for (const reorder of REORDERS) {
        const last = simulate(seed, 0, reorder).at(-1)!;
        expect(last.tcp.retransmits).toBe(0);
      }
    }
    for (const { ticks } of runs()) {
      const last = ticks[ticks.length - 1];
      const resentInFlight = new Set(ticks.flatMap((t) => t.tcp.flights.filter((f) => f.retx).map((f) => f.id)));
      expect(last.tcp.retransmits).toBe(resentInFlight.size);
    }
  });

  it('a head-of-line event names a missing packet that has not been delivered, and held ones beyond it', () => {
    for (const { ticks } of runs()) {
      for (const t of ticks) {
        for (const e of t.events) {
          if (e.kind !== 'hol') continue;
          expect(t.tcp.delivered).not.toContain(e.waiting);
          expect(t.tcp.delivered.length + 1).toBe(e.waiting);
          for (const s of e.held) expect(s).toBeGreaterThan(e.waiting);
        }
      }
    }
  });

  it('a release event hands over a consecutive run in one tick', () => {
    for (const { ticks } of runs()) {
      ticks.forEach((t, i) => {
        for (const e of t.events) {
          if (e.kind !== 'release') continue;
          expect(e.seqs.length).toBeGreaterThan(1);
          expect(e.seqs).toEqual(range(e.seqs.length).map((k) => e.seqs[0] + k - 1));
          const before = i > 0 ? ticks[i - 1].tcp.delivered.length : 0;
          // (a second packet can land in the same tick, so the burst is a run inside this tick's handover)
          const handed = t.tcp.delivered.slice(before);
          expect(handed.slice(handed.indexOf(e.seqs[0]), handed.indexOf(e.seqs[0]) + e.seqs.length)).toEqual(e.seqs);
        }
      });
    }
  });

  it('the longest stall is the longest gap between two deliveries', () => {
    for (const { ticks } of runs()) {
      const at: number[] = [];
      ticks.forEach((t, i) => {
        const prev = i > 0 ? ticks[i - 1].tcp.delivered.length : 0;
        if (t.tcp.delivered.length > prev) at.push(t.t);
      });
      const gaps = at.slice(1).map((v, i) => v - at[i]);
      expect(ticks.at(-1)!.tcp.longestStall).toBe(Math.max(0, ...gaps));
    }
  });
});

describe('cumulative ACKs', () => {
  it('every ACK names the next packet the receiver expects, when it is sent', () => {
    for (const { ticks } of runs()) {
      ticks.forEach((t, i) => {
        const fresh = t.tcp.acks.filter((a) => a.p === 0).map((a) => a.ack);
        if (!fresh.length) return;
        // one ACK per arriving packet; two can land in one tick, each acking the gap at its moment
        const before = i > 0 ? ticks[i - 1].tcp.delivered.length : 0;
        for (const ack of fresh) expect(ack).toBeGreaterThanOrEqual(before + 1);
        expect(Math.max(...fresh)).toBe(t.tcp.delivered.length + 1);
      });
    }
  });

  it('the quiz case: holding #1-#3 and #5 acknowledges 4', () => {
    let seen = false;
    for (const { ticks } of runs()) {
      for (const t of ticks) {
        if (t.tcp.delivered.length !== 3 || !t.tcp.buffer.includes(5)) continue;
        for (const a of t.tcp.acks) if (a.p === 0) {
          expect(a.ack).toBe(4);
          seen = true;
        }
      }
    }
    expect(seen).toBe(true);
  });
});

describe('the default run (seed 19, 15% loss, 20% reordering)', () => {
  it('shows a freeze behind a lost packet, then a burst release, and UDP losses', () => {
    const ticks = simulate(19, 0.15, 0.2);
    const events = ticks.flatMap((t) => t.events);
    expect(events.some((e) => e.kind === 'hol')).toBe(true);
    expect(events.some((e) => e.kind === 'release')).toBe(true);
    expect(ticks.at(-1)!.tcp.retransmits).toBeGreaterThan(0);
    expect(ticks.at(-1)!.udp.lost.length).toBeGreaterThan(0);
  });
});

describe('UDP', () => {
  it('every packet is either delivered once or lost, never resent', () => {
    for (const { ticks } of runs()) {
      const last = ticks[ticks.length - 1];
      expect(last.udp.done).toBe(true);
      expect([...last.udp.delivered, ...last.udp.lost].sort((a, b) => a - b)).toEqual(range(N));
      expect(ticks.some((t) => t.udp.flights.some((f) => f.retx))).toBe(false);
    }
  });

  it('a clean, unreordered link delivers everything in order', () => {
    for (const seed of SEEDS) {
      const last = simulate(seed, 0, 0).at(-1)!;
      expect(last.udp.delivered).toEqual(range(N));
      expect(last.udp.lost).toEqual([]);
    }
  });

  it('an out-of-order event names a packet handed over after a higher one', () => {
    for (const { ticks } of runs()) {
      for (const t of ticks) {
        for (const e of t.events) {
          if (e.kind !== 'udp-reorder') continue;
          const d = t.udp.delivered;
          expect(d.indexOf(e.seq)).toBeGreaterThan(d.indexOf(e.before));
          expect(e.seq).toBeLessThan(e.before);
        }
      }
    }
  });
});

describe('the scripted losses the stage discloses', () => {
  it('drop the first send of TCP #4 and UDP #5 whenever loss is above 0%', () => {
    for (const seed of SEEDS) {
      for (const loss of LOSSES.filter((l) => l > 0)) {
        const ticks = simulate(seed, loss, 0.2);
        const firstTcp4 = ticks.flatMap((t) => t.tcp.flights).find((f) => f.seq === FORCED_TCP_LOSS);
        expect(firstTcp4?.lost).toBe(true);
        expect(ticks.at(-1)!.udp.lost).toContain(FORCED_UDP_LOSS);
        expect(ticks.at(-1)!.tcp.retransmits).toBeGreaterThan(0);
      }
    }
  });

  it('are absent at 0% loss', () => {
    for (const seed of SEEDS) {
      const ticks = simulate(seed, 0, 0.5);
      expect(ticks.some((t) => t.tcp.flights.some((f) => f.lost) || t.udp.flights.some((f) => f.lost))).toBe(false);
    }
  });
});

describe('determinism', () => {
  it('the same seed and settings replay the same run', () => {
    expect(JSON.stringify(simulate(7, 0.15, 0.2))).toBe(JSON.stringify(simulate(7, 0.15, 0.2)));
  });
});
