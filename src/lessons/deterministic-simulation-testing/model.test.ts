import { describe, expect, it } from 'vitest';
import {
  BROKEN_SEED, BROKEN_TRACE_HASH, GAP, HUNT_N, LEAK_PERIOD, LOSS, REPLAYS, SCENE2_T1, WINDOW,
  bisectBoundary, boundaryOf, buildBooking, defaultBooking, expectedTries, exploreBooking, failureProbability, hunt, linkDelay, liveHunt, liveReplays, replayAgreement,
  replicateDelay, resetAmbient, runBooking, runGap, seededLeg, type BookingSetup,
} from './model';

const setup = (over: Partial<BookingSetup> = {}): BookingSetup => ({ ...defaultBooking(), ...over });
const share = (xs: number, n: number) => xs / n;

describe('the exact failure probability, derived two ways and measured', () => {
  it('hand vectors: W = 30 gives 0.32556, W = 10 gives 0.7300, W = 100 gives 0.1063; with 10% loss at W = 30 it is 0.3930; 65.1 failures expected in 200', () => {
    expect(failureProbability(30, 0)).toBeCloseTo(0.32556, 5);
    expect(failureProbability(10, 0)).toBeCloseTo(0.73, 12);
    expect(failureProbability(100, 0)).toBeCloseTo(0.1063, 12);
    expect(failureProbability(30, 0.1)).toBeCloseTo(0.393, 4);
    expect(200 * failureProbability(30, 0)).toBeCloseTo(65.1, 1);
    expect(expectedTries(30, 0)).toBeCloseTo(3.07, 2);
  });

  it('11/W - 37/W^2 equals a numerical integral of the triangular gap distribution against the delay (an independent route)', () => {
    // P(the later request arrives before the earlier one's replicate) = E over L ~ U[1, 10] of the triangular CDF 2L/W - (L/W)^2.
    for (const w of [10, 20, 30, 50, 100]) {
      const steps = 200_000;
      let sum = 0;
      for (let i = 0; i < steps; i++) {
        const l = 1 + ((i + 0.5) * 9) / steps;
        sum += (2 * l) / w - (l / w) ** 2;
      }
      expect(failureProbability(w, 0)).toBeCloseTo(sum / steps, 6);
    }
  });

  it('the measured share over 10,000 seeds is within 3 standard errors, at W = 10, 30 and 100 and with loss', () => {
    for (const [windowMs, loss] of [[10, 0], [30, 0], [100, 0], [30, 0.1], [30, 0.2]] as const) {
      const n = 10_000;
      const h = hunt(setup({ windowMs, loss }), 1, n);
      const p = failureProbability(windowMs, loss);
      expect(Math.abs(share(h.failures.length, n) - p), `W ${windowMs} loss ${loss}`).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / n));
    }
  });

  it('seeds until the first failure average 1 / P (independent hunts, within 3 standard errors)', () => {
    const waits: number[] = [];
    let start = 1;
    while (waits.length < 1_000) {
      const h = hunt(setup(), start, 60);
      if (h.failures.length === 0) {
        start += 60;
        continue;
      }
      waits.push(h.failures[0] - start + 1);
      start = h.failures[0] + 1;
    }
    const m = waits.reduce((a, b) => a + b, 0) / waits.length;
    const p = failureProbability(30, 0);
    const sd = Math.sqrt(1 - p) / p;
    expect(Math.abs(m - 1 / p)).toBeLessThan((3 * sd) / Math.sqrt(waits.length));
  });
});

describe('determinism: the seed is the whole schedule', () => {
  it('the same seed gives the same trace hash on 3 runs of each of 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const hashes = [0, 1, 2].map(() => runBooking(setup({ seed })).hash);
      expect(new Set(hashes).size, `seed ${seed}`).toBe(1);
    }
  });

  it('different seeds give different traces: 1,000 seeds, 1,000 hashes (a 32-bit hash collides about once in 8 million pairs at this size)', () => {
    expect(hunt(setup(), 1, 1_000).distinct).toBeGreaterThanOrEqual(999);
  });

  it('a seed fixes the request times, the link delays and the loss: nothing else varies between runs', () => {
    const a = buildBooking(setup({ seed: 5, loss: 0.2 }));
    const b = buildBooking(setup({ seed: 5, loss: 0.2 }));
    a.run({ until: 500 });
    b.run({ until: 500 });
    expect(a.trace).toEqual(b.trace);
  });
});

describe('rule 0: at most one client is granted the seat across both replicas', () => {
  it('broken mode (W = 30, no loss): the lowest failing seed from 1 is pinned with its message and trace hash; it fails on 20% to 45% of 200 seeds, never all', () => {
    const h = hunt(setup(), 1, 200);
    expect(h.failures[0]).toBe(BROKEN_SEED);
    expect(h.triesToFirst).toBe(BROKEN_SEED);
    expect(h.failures.length).toBeGreaterThan(0.2 * 200);
    expect(h.failures.length).toBeLessThan(0.45 * 200);
    const run = runBooking(setup({ seed: BROKEN_SEED }));
    expect(run.message).toBe('both A and B granted');
    expect(run.hash).toBe(BROKEN_TRACE_HASH);
    expect(h.distinct).toBe(200);
  });

  it('fixed mode (single writer, all bookings through r1) passes the same 200 seeds, with 20% loss and 20% duplication too', () => {
    expect(hunt(setup({ mode: 'single-writer' }), 1, 200).failures).toEqual([]);
    expect(hunt(setup({ mode: 'single-writer', loss: 0.2, duplicate: 0.2 }), 1, 200).failures).toEqual([]);
  });

  it('seed-free hand schedule (a fixed 7 ms link): requests at 100 and 105 ms oversell, at 100 and 108 ms the seat is refused', () => {
    const run = (t2: number) => runBooking(setup({ delayMs: 7, t1: 100, t2, windowMs: 200 }));
    expect(run(105).failed).toBe(true);
    expect(run(105).message).toBe('both A and B granted');
    expect(run(108).failed).toBe(false);
  });

  it('removing a request leaves nothing to oversell, and dropping the replicate message oversells even at a wide gap', () => {
    expect(runBooking(setup({ seed: BROKEN_SEED, requestA: false })).failed).toBe(false);
    expect(runBooking(setup({ seed: BROKEN_SEED, requestB: false })).failed).toBe(false);
    expect(runBooking(setup({ delayMs: 7, t1: 100, t2: 190, windowMs: 200, dropReplicate: true })).failed).toBe(true);
    expect(runBooking(setup({ delayMs: 7, t1: 100, t2: 190, windowMs: 200 })).failed).toBe(false);
  });
});

describe('scene 2: the boundary is computed from the trace and found by bisection', () => {
  it('for 20 failing seeds, bisection converges to the earlier request\'s traced delay within 0.01 ms, in both directions', () => {
    const seeds = hunt(setup(), 1, 200).failures.slice(0, 20);
    for (const seed of seeds) {
      expect(Math.abs(bisectBoundary(seed, 1) - boundaryOf(seed, 1)), `seed ${seed} +`).toBeLessThan(0.01);
      expect(Math.abs(bisectBoundary(seed, -1) - boundaryOf(seed, -1)), `seed ${seed} -`).toBeLessThan(0.01);
    }
  });

  it('the delay read from the trace equals the link delay of the seed, and is null when the replicate is dropped or never sent', () => {
    for (const seed of [1, 5, 8, 13]) {
      const run = runBooking(setup({ seed, t1: 100, t2: 190, windowMs: 200 }));
      expect(replicateDelay(run)!).toBeCloseTo(linkDelay(seed, 'r1'), 9);
    }
    expect(replicateDelay(runBooking(setup({ t1: 100, t2: 190, windowMs: 200, dropReplicate: true })))).toBeNull();
    expect(replicateDelay(runBooking(setup({ requestA: false, requestB: false })))).toBeNull();
  });

  it('a gap under the delay oversells and a gap over it does not (the frozen seed)', () => {
    const l = linkDelay(BROKEN_SEED, 'r1');
    expect(runGap(BROKEN_SEED, Math.floor(l)).failed).toBe(true);
    expect(runGap(BROKEN_SEED, Math.ceil(l) + 1).failed).toBe(false);
    expect(runGap(BROKEN_SEED, 0).failed).toBe(true);
    const l2 = linkDelay(BROKEN_SEED, 'r2');
    expect(runGap(BROKEN_SEED, -Math.floor(l2)).failed).toBe(true);
    expect(runGap(BROKEN_SEED, -Math.ceil(l2) - 1).failed).toBe(false);
    expect(SCENE2_T1).toBe(100);
  });

  it('the slider extremes -100 and 100, and one beyond, run', () => {
    for (const gap of [GAP.min, GAP.max, GAP.min - 1, GAP.max + 1]) expect(typeof runGap(BROKEN_SEED, gap).failed).toBe('boolean');
  });
});

describe('scene 3: a leak breaks replay, and live chaos replays far less', () => {
  it('with the leak off, 10 replays of one seed are identical; with it on at least one differs', () => {
    resetAmbient();
    const off = replayAgreement(setup({ seed: BROKEN_SEED }), 10);
    expect(off.agree).toBe(10);
    resetAmbient();
    const on = replayAgreement(setup({ seed: BROKEN_SEED, leak: true }), 10);
    expect(on.agree).toBeLessThan(10);
    expect(new Set(on.hashes).size).toBeGreaterThan(1);
  });

  it('replay agreement is 20 of 20 without the leak and 2 of 20 with it (the counter repeats every 16 presses)', () => {
    resetAmbient();
    expect(replayAgreement(setup({ seed: BROKEN_SEED }), REPLAYS).agree).toBe(20);
    resetAmbient();
    expect(replayAgreement(setup({ seed: BROKEN_SEED, leak: true }), REPLAYS).agree).toBe(2);
    expect(LEAK_PERIOD).toBe(16);
  });

  it('with the leak on, a failure can vanish on replay (some replays of the failing seed pass)', () => {
    resetAmbient();
    const runs = Array.from({ length: LEAK_PERIOD }, () => runBooking(setup({ seed: BROKEN_SEED, leak: true })));
    expect(runs.some((r) => r.failed)).toBe(true);
    expect(runs.some((r) => !r.failed)).toBe(true);
  });

  it('a seeded failure replays 20 of 20; a live-chaos failure replays on only some of 20 (about P x 20 = 6.5)', () => {
    resetAmbient();
    expect(replayAgreement(setup({ seed: BROKEN_SEED })).failed).toBe(20);
    const live = liveHunt(setup(), 200);
    expect(live.failedWith).not.toBeNull();
    const again = liveReplays(setup());
    expect(again).toBeLessThan(20);
    expect(again).toBeGreaterThanOrEqual(1);
    resetAmbient();
  });

  it('the fix (single writer) holds with the leak on, over 200 seeds', () => {
    resetAmbient();
    for (let seed = 1; seed <= 200; seed++) expect(runBooking(setup({ seed, mode: 'single-writer', leak: true })).failed, `seed ${seed}`).toBe(false);
    resetAmbient();
  });
});

describe('scene 4: every schedule at once, and the same protocol under seeds', () => {
  it('the explorer finds the shortest counterexample in the unfixed protocol: both bookings delivered before any replicate (2 steps)', () => {
    const r = exploreBooking('async');
    expect(r.violation).not.toBeNull();
    expect(r.violation!.path.map((p) => p.label.text)).toEqual(['r1 receives book A from client', 'r2 receives book B from client']);
    expect(r.violation!.message).toBe('both A and B granted');
  });

  it('single writer: the whole bounded model is explored, 8 states (hand-counted), and the rule holds in all of them', () => {
    // S0 start; S1 r1 granted A; S2 r2 forwarded B; S3 both books delivered; S4 r1 granted B (forward first); S5 r2 learns B;
    // S6 r2 learns A (after both books); S7 r2 learns A (before B's book): 8 distinct states, and no state has two grants.
    const r = exploreBooking('single-writer');
    expect(r.truncated).toBe(false);
    expect(r.states).toBe(8);
    expect(r.violation).toBeNull();
  });

  it('the seeded leg over the same protocol: unfixed fails on a seed, fixed passes 200 with 10% loss and 15% duplication', () => {
    const broken = seededLeg('async');
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.message).toBe('both A and B granted');
    expect(seededLeg('single-writer').ok).toBe(true);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('W = 10 and 100, loss 0 and 20% (and 25%), N = 10 and 1,000 all run', () => {
    for (const [windowMs, loss] of [[WINDOW.min, LOSS.min], [WINDOW.max, LOSS.max], [WINDOW.max + 10, 0.25]] as const) {
      const h = hunt(setup({ windowMs, loss }), 1, 10);
      expect(h.count).toBe(10);
    }
    expect(hunt(setup(), 1, HUNT_N.min).count).toBe(10);
    const t = hunt(setup(), 1, HUNT_N.max);
    expect(t.count).toBe(1_000);
  });
});
