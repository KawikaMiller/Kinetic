import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { createTickSim } from '../../core/simTick';
import {
  ACK_SLOTS, DIFS_SLOTS, FIRST_BUSY_SLOTS, FRAME_SLOTS_A, INTERRUPT_AFTER_COUNTS, INTERRUPT_SLOTS, backoffStory,
} from './backoff';
import { CW_MAX, CW_MIN, FRAME_SLOTS, airtimeShare, collisionShare, initDcf, meanCw, nextCw, runDcf, slotEvents, stepDcf, type DcfState } from './dcf';
import {
  AP, OFFSETS, RTS_SLOTS, CTS_SLOTS, collisionProbability, exchange, hearing, hears, isHidden, simulateRounds, circle, clampPoint, clampRange, RANGE, type Pt,
} from './hidden';
import { FAST_RATE, FRAME_BYTES, OVERHEAD_US, SLOW_RATE, frameUs, ratesFor, shares } from './rates';

/** Bianchi's fixed point (2000): tau and p solved by damped iteration, W = CW_MIN + 1 = 16, m = 6 (CW_MAX + 1 = 2^6 * W). Written from the formula, independent of the simulator. */
function bianchi(n: number): number {
  const W = 16;
  const m = 6;
  let tau = 0.1;
  for (let i = 0; i < 5000; i++) {
    const p = 1 - (1 - tau) ** (n - 1);
    const next = (2 * (1 - 2 * p)) / ((1 - 2 * p) * (W + 1) + p * W * (1 - (2 * p) ** m));
    tau = 0.5 * tau + 0.5 * next;
  }
  return 1 - (1 - tau) ** (n - 1);
}

describe('the contention window', () => {
  it('doubles 15, 31, 63, ..., 1023 and then stays at 1023', () => {
    const seq = [CW_MIN];
    for (let i = 0; i < 9; i++) seq.push(nextCw(seq[seq.length - 1]));
    expect(seq).toEqual([15, 31, 63, 127, 255, 511, 1023, 1023, 1023, 1023]);
    expect(CW_MAX + 1).toBe(2 ** 6 * (CW_MIN + 1));
  });
});

describe('one virtual slot, hand-worked with a stub random source', () => {
  const rnd = () => 0; // every draw is 0
  const state = (counters: number[], cws: number[] = counters.map(() => CW_MIN)): DcfState => ({
    stations: counters.map((counter, i) => ({ counter, cw: cws[i], successes: 0, collisions: 0, attempts: 0 })),
    kind: null, senders: [], slots: 0, idle: 0, success: 0, collision: 0, time: 0,
  });

  it('no counter at 0: an idle slot, every counter counts down, and it lasts one idle slot', () => {
    const s = stepDcf(state([3, 1, 7]), rnd);
    expect([s.kind, s.stations.map((x) => x.counter), s.time]).toEqual(['idle', [2, 0, 6], 1]);
  });

  it('exactly one counter at 0: a success, the sender returns to CW_MIN, the others count down once, and the slot lasts FRAME_SLOTS', () => {
    const s = stepDcf(state([0, 4, 9], [63, 15, 15]), rnd);
    expect(s.kind).toBe('success');
    expect(s.senders).toEqual([0]);
    expect(s.stations.map((x) => [x.cw, x.successes, x.attempts])).toEqual([[CW_MIN, 1, 1], [15, 0, 0], [15, 0, 0]]);
    expect(s.stations[1].counter).toBe(3);
    expect(s.stations[2].counter).toBe(8);
    expect(s.time).toBe(FRAME_SLOTS);
  });

  it('two counters at 0: a collision, each sender doubles its window, the third counts down once', () => {
    const s = stepDcf(state([0, 0, 5], [15, 63, 15]), rnd);
    expect(s.kind).toBe('collision');
    expect(s.stations.map((x) => [x.cw, x.collisions])).toEqual([[31, 1], [127, 1], [15, 0]]);
    expect(s.stations[2].counter).toBe(4);
  });

  it('a waiting station loses exactly one count in a busy slot, however long the busy slot is: the busy period itself does not count', () => {
    const before = state([0, 6]);
    const after = stepDcf(before, rnd);
    expect(before.stations[1].counter - after.stations[1].counter).toBe(1);
    expect(FRAME_SLOTS).toBeGreaterThan(1);
    expect(after.time).toBe(FRAME_SLOTS);
  });
});

describe('the saturated simulation against Bianchi (2000)', () => {
  it('per-attempt collision probability is within 0.02 of the fixed point for n = 2, 5 and 10 over 200,000 virtual slots, on three seeds', () => {
    for (const n of [2, 5, 10]) {
      const target = bianchi(n);
      for (const seed of [1, 2, 3]) {
        const s = runDcf(n, 200_000, mulberry32(seed));
        expect(Math.abs((collisionShare(s) as number) - target), `n ${n} seed ${seed}`).toBeLessThan(0.02);
      }
    }
  });

  it('the fixed point itself has the textbook shape: about 0.10 for 2 stations, 0.27 for 5, 0.38 for 10', () => {
    expect(bianchi(2)).toBeCloseTo(0.1046, 3);
    expect(bianchi(5)).toBeCloseTo(0.2715, 3);
    expect(bianchi(10)).toBeCloseTo(0.3844, 3);
  });

  it('every state obeys the counter rules: counters stay at 0 or above, windows are 15, 31, ..., 1023, and a slot is exactly one of idle, success, collision', () => {
    const rnd = mulberry32(9);
    let s = initDcf(7, rnd);
    const windows = new Set([15, 31, 63, 127, 255, 511, 1023]);
    for (let i = 0; i < 20_000; i++) {
      s = stepDcf(s, rnd);
      for (const st of s.stations) {
        expect(st.counter).toBeGreaterThanOrEqual(0);
        expect(st.counter).toBeLessThanOrEqual(st.cw);
        expect(windows.has(st.cw)).toBe(true);
      }
      expect(s.idle + s.success + s.collision).toBe(s.slots);
    }
  });

  it('airtime that carried a successful frame falls as stations are added (n = 3, 5, 8, 12), even though success slots become a larger share of all slots', () => {
    const at = (n: number) => airtimeShare(runDcf(n, 200_000, mulberry32(5))) as number;
    const shares2 = [3, 5, 8, 12].map(at);
    for (let i = 1; i < shares2.length; i++) expect(shares2[i]).toBeLessThan(shares2[i - 1] - 0.01);
    const slotShare = (n: number) => {
      const s = runDcf(n, 100_000, mulberry32(5));
      return s.success / s.slots;
    };
    expect(slotShare(12)).toBeGreaterThan(slotShare(3));
  });

  it('with every station saturated each gets about the same number of frames: the busiest is within 8% of the quietest over 200,000 slots', () => {
    const s = runDcf(5, 200_000, mulberry32(11));
    const wins = s.stations.map((x) => x.successes);
    expect(Math.max(...wins) / Math.min(...wins)).toBeLessThan(1.08);
  });

  it('the same seed gives the same trace through createTickSim, and at(k) equals running k slots', () => {
    const make = () => createTickSim<DcfState>({ seed: 4, init: (rnd) => initDcf(5, rnd), step: (s, rnd) => stepDcf(s, rnd) });
    const a = make();
    const b = make();
    a.run(60);
    b.run(40);
    expect(a.at(40)).toEqual(b.state);
    expect(a.at(60)).toEqual(make().at(60));
  });

  it('the readouts are null before anything happens and slotEvents has one interval per slot, back to back', () => {
    const rnd = mulberry32(2);
    const s0 = initDcf(4, rnd);
    expect(collisionShare(s0)).toBeNull();
    expect(airtimeShare(s0)).toBeNull();
    const hist = [s0];
    for (let i = 0; i < 30; i++) hist.push(stepDcf(hist[i], rnd));
    const ev = slotEvents(hist);
    expect(ev).toHaveLength(30);
    ev.forEach((e, i) => {
      if (i > 0) expect(e.start).toBe(ev[i - 1].end);
      expect(e.end - e.start).toBe(e.kind === 'idle' ? 1 : FRAME_SLOTS);
    });
    expect(meanCw(hist[30])).toBeGreaterThanOrEqual(CW_MIN);
  });
});

describe('one station\'s backoff story', () => {
  const idleSlots = (story: ReturnType<typeof backoffStory>, attempt: number) => story.slots.filter((s) => s.attempt === attempt && s.medium === 'idle').length;

  it('on 200 seeds the counter freezes through every busy and DIFS slot, drops by exactly 1 in every idle slot, and A sends the slot after it reaches 0', () => {
    for (let seed = 0; seed < 200; seed++) {
      const story = backoffStory(seed, false);
      expect(story.acked).toBe(true);
      story.slots.forEach((s, i) => {
        if (i === 0) return;
        const prev = story.slots[i - 1];
        if (s.medium === 'idle') expect(s.counter, `seed ${seed} slot ${i}`).toBe((prev.counter as number) - 1);
        else expect(s.counter).toBe(prev.counter);
      });
      const firstSend = story.slots.findIndex((s) => s.medium === 'a-sends');
      expect(story.slots[firstSend - 1].counter).toBe(0);
      expect(idleSlots(story, 1)).toBe(story.draws[0]);
    }
  });

  it('the other station interrupts only when A still has counts to make: the interruption appears iff the draw is above 2', () => {
    for (let seed = 0; seed < 200; seed++) {
      const story = backoffStory(seed, false);
      const busy = story.slots.filter((s) => s.medium === 'busy-other').length;
      expect(busy).toBe(FIRST_BUSY_SLOTS + (story.draws[0] > INTERRUPT_AFTER_COUNTS ? INTERRUPT_SLOTS : 0));
    }
  });

  it('a lost ACK is inferred from silence: the window doubles to 31, a new counter is drawn from 0 to 31 and the second attempt is acknowledged', () => {
    for (let seed = 0; seed < 200; seed++) {
      const story = backoffStory(seed, true);
      expect(story.draws).toHaveLength(2);
      expect(story.draws[1]).toBeLessThanOrEqual(31);
      expect(story.slots.filter((s) => s.medium === 'ack-missing')).toHaveLength(ACK_SLOTS);
      expect(story.slots.filter((s) => s.attempt === 2 && s.medium === 'a-sends')).toHaveLength(FRAME_SLOTS_A);
      expect(story.slots.filter((s) => s.attempt === 2).every((s) => s.cw === 31)).toBe(true);
      expect(story.slots.filter((s) => s.attempt === 1).every((s) => s.cw === 15)).toBe(true);
      expect(story.slots[story.slots.length - 1].medium).toBe('ack');
      expect(idleSlots(story, 2)).toBe(story.draws[1]);
    }
    expect(DIFS_SLOTS).toBeGreaterThan(0);
  });

  it('every story is deterministic for its seed', () => {
    expect(backoffStory(7, true)).toEqual(backoffStory(7, true));
  });
});

describe('the hidden node', () => {
  const g = (a: Pt, c: Pt, range: number) => ({ a, c, range });

  it('hearing equals a brute-force squared-distance test on a grid of positions and ranges', () => {
    for (let ax = 0; ax <= 100; ax += 20) for (let ay = 0; ay <= 100; ay += 25) for (let cx = 0; cx <= 100; cx += 20) for (const range of [10, 35, 50, 90]) {
      const a = { x: ax, y: ay };
      const c = { x: cx, y: 100 - ay };
      const brute = (ax - cx) ** 2 + (ay - (100 - ay)) ** 2 <= range * range;
      expect(hears(a, c, range)).toBe(brute);
      expect(hearing(g(a, c, range)).aToC).toBe(brute);
    }
  });

  it('the default geometry is a hidden node: both reach the AP at distance 35, they are 70 apart, the range is 45', () => {
    const h = hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 45));
    expect(h).toEqual({ aToAp: true, cToAp: true, aToC: false });
    expect(isHidden(h)).toBe(true);
    expect(isHidden(hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 80)))).toBe(false);
    expect(isHidden(hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 30)))).toBe(false);
    expect(AP).toEqual({ x: 50, y: 50 });
  });

  it('collision probability matches a brute-force count of the 16 x 16 start pairs, and hand cases: hidden L=10 is 214/256, audible is 16/256, hidden L=20 is 1', () => {
    for (const hidden of [true, false]) {
      for (const len of [2, 4, 10, 16, 20, 40]) {
        let n = 0;
        for (let sa = 0; sa < 16; sa++) for (let sc = 0; sc < 16; sc++) if (hidden ? Math.abs(sa - sc) < len : sa === sc) n++;
        expect(collisionProbability(hidden, len)).toBe(n / 256);
      }
    }
    expect(collisionProbability(true, 10)).toBe(214 / 256);
    expect(collisionProbability(false, 10)).toBe(16 / 256);
    expect(collisionProbability(true, 20)).toBe(1);
    expect(OFFSETS).toBe(16);
  });

  it('seeded rounds agree with the probability within 0.02 over 20,000 rounds', () => {
    const hidden = hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 45));
    for (const len of [4, 10]) {
      const r = simulateRounds(hidden, len, false, 20_000, 3);
      expect(Math.abs(r.dataCollisions / r.rounds - collisionProbability(true, len))).toBeLessThan(0.02);
    }
  });

  it('with RTS/CTS on, no data frame collides on any of 200 seeds, RTS frames still can, and they collide as often as short frames would', () => {
    const hidden = hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 45));
    let rts = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateRounds(hidden, 30, true, 300, seed);
      expect(r.dataCollisions).toBe(0);
      rts += r.rtsCollisions;
    }
    expect(rts).toBeGreaterThan(0);
    expect(Math.abs(rts / (200 * 300) - collisionProbability(true, RTS_SLOTS))).toBeLessThan(0.01);
    expect(exchange(hidden, 30, true).pDataCollide).toBe(0);
  });

  it('goodput hand values: hidden with long frames, RTS/CTS 0.826 against 0 without; audible long frames 0.968 without against less with; hidden short frames favour no RTS/CTS', () => {
    const hidden = hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 45));
    const audible = hearing(g({ x: 15, y: 50 }, { x: 85, y: 50 }, 80));
    expect(exchange(hidden, 20, false).goodput).toBe(0);
    expect(exchange(hidden, 20, true).goodput).toBeCloseTo(0.826, 3);
    expect(exchange(audible, 20, false).goodput).toBeCloseTo(0.968, 3);
    expect(exchange(audible, 20, true).goodput).toBeLessThan(exchange(audible, 20, false).goodput);
    expect(exchange(hidden, 2, false).goodput).toBeGreaterThan(exchange(hidden, 2, true).goodput);
    expect(RTS_SLOTS + CTS_SLOTS).toBe(4);
  });

  it('positions are kept on the plane and rounded, the range is kept inside its limits, and the circle closes', () => {
    expect(clampPoint([-5.4, 140.6])).toEqual({ x: 0, y: 100 });
    expect(clampPoint([20.4, 59.6])).toEqual({ x: 20, y: 60 });
    expect(clampRange(3)).toBe(RANGE.min);
    expect(clampRange(400)).toBe(RANGE.max);
    const c = circle({ x: 50, y: 50 }, 20);
    expect(c[0][0]).toBeCloseTo(c[c.length - 1][0], 9);
    expect(c[0][1]).toBeCloseTo(c[c.length - 1][1], 9);
  });
});

describe('one slow station', () => {
  it('hand-worked: a 1500-byte frame takes 12000 / 54 + 100 = 322.2 us at 54 Mbit/s and 2100 us at 6; two fast and one slow give 4.37 Mbit/s each and the slow one holds 76.5% of the air', () => {
    expect(FRAME_BYTES).toBe(1500);
    expect(OVERHEAD_US).toBe(100);
    expect(frameUs(FAST_RATE)).toBeCloseTo(322.222, 3);
    expect(frameUs(SLOW_RATE)).toBe(2100);
    const s = shares([54, 54, 6]);
    expect(s.roundUs).toBeCloseTo(2744.444, 3);
    expect(s.stations.map((x) => x.mbps.toFixed(2))).toEqual(['4.37', '4.37', '4.37']);
    expect(s.stations[2].airtime).toBeCloseTo(0.7652, 4);
    expect(s.totalMbps).toBeCloseTo(13.1175, 3);
  });

  it('without the slow station the two fast ones get 18.62 Mbit/s each: the slow one taxes everybody', () => {
    const fast = shares([54, 54]);
    expect(fast.stations[0].mbps).toBeCloseTo(18.621, 3);
    expect(fast.totalMbps).toBeGreaterThan(shares([54, 54, 6]).totalMbps);
  });

  it('airtime shares sum to 1 and every station gets the same throughput, for every count and every choice of slow stations', () => {
    for (let n = 2; n <= 6; n++) {
      for (let mask = 0; mask < 2 ** n; mask++) {
        const slow = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)));
        const s = shares(ratesFor(n, slow));
        expect(s.stations.reduce((a, x) => a + x.airtime, 0)).toBeCloseTo(1, 12);
        for (const x of s.stations) expect(x.mbps).toBeCloseTo(s.stations[0].mbps, 12);
        expect(s.totalMbps).toBeCloseTo(n * s.stations[0].mbps, 9);
      }
    }
  });
});
