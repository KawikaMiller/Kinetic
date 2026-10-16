import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { BROKEN_CONFIG, BROKEN_SEED, DEFAULT_CONFIG, RING_SIZE, RING_TICKS, TIME_LIMIT_OFF, createRing, packetsPerInterrupt, runRing, toggleBroken, type RingConfig, type RingState } from './ring';

const SEEDS = Array.from({ length: 200 }, (_, i) => i);

/** Safety checked from the state alone, not through the model's own checkRing. */
function independentFailures(s: RingState): string[] {
  const out: string[] = [];
  if (s.head < 0 || s.head >= RING_SIZE || s.tail < 0 || s.tail >= RING_SIZE) out.push('index out of range');
  if (s.produced - s.consumed > RING_SIZE) out.push('more than 8 outstanding');
  if (s.ring.some((d) => d.phase === 'owned' && d.seq >= 0)) out.push('owned descriptor holds a packet');
  const inRing = s.ring.filter((d) => d.phase === 'filled' || d.phase === 'processing').length;
  if (s.produced !== s.consumed + inRing + s.overwritten) out.push('packets not conserved');
  if (s.consumed > 0 && s.lastConsumedSeq !== s.consumed - 1) out.push('a packet was consumed out of order or skipped');
  return out;
}

const CONFIGS: RingConfig[] = [
  DEFAULT_CONFIG,
  { ...DEFAULT_CONFIG, ratePct: 90, driverTicks: 12 },
  { ...DEFAULT_CONFIG, ratePct: 60, driverTicks: 5, coalesceN: 4, timeLimit: 16 },
  { ...DEFAULT_CONFIG, ratePct: 100, driverTicks: 1, coalesceN: 8 },
];

describe('the ring over 200 seeded arrival schedules', () => {
  it('the correct driver keeps every invariant at every tick: indices in range, produced - consumed <= 8, packets conserved, FIFO', () => {
    for (const base of CONFIGS) {
      for (const seed of SEEDS) {
        const sim = createRing({ ...base, seed });
        sim.run(RING_TICKS);
        expect(sim.violation, `seed ${seed}`).toBeNull();
        sim.history.forEach((s, tick) => expect(independentFailures(s), `seed ${seed} tick ${tick}`).toEqual([]));
      }
    }
  });

  it('a full ring drops and counts packets, it never hides them: arrivals = DMAed + dropped', () => {
    const cfg = { ...DEFAULT_CONFIG, ratePct: 90, driverTicks: 12 };
    let anyDrop = false;
    for (const seed of SEEDS) {
      const s = runRing({ ...cfg, seed }).state;
      anyDrop ||= s.dropped > 0;
      // an independent count of arrivals: the same seeded stream, one draw per tick
      const hits = arrivalsOf(seed, cfg.ratePct, RING_TICKS);
      expect(s.produced + s.dropped, `seed ${seed}`).toBe(hits);
    }
    expect(anyDrop).toBe(true);
  });

  it('device-owned and processed never overlap: every descriptor has exactly one phase and an owned one is empty', () => {
    const sim = runRing({ ...DEFAULT_CONFIG, ratePct: 60, driverTicks: 4 });
    for (const s of sim.history) for (const d of s.ring) if (d.phase === 'owned' || d.phase === 'free') expect(d.seq).toBe(-1);
  });
});

/** The arrival draws of the sim, replayed independently: the model draws exactly once per tick. */
function arrivalsOf(seed: number, ratePct: number, ticks: number): number {
  // The sim's stream has no draw in `init`, so tick k's draw is the k-th number of mulberry32(seed): replayed here.
  const next = mulberry32(seed);
  let hits = 0;
  for (let i = 0; i < ticks; i++) if (next() < ratePct / 100) hits++;
  return hits;
}

describe('the broken driver: when a packet is waiting and the ring is full it re-posts the head descriptor before the packet in it was consumed', () => {
  const lowest = () => {
    for (const seed of SEEDS) if (runRing({ ...BROKEN_CONFIG, seed }).violation) return seed;
    return -1;
  };

  it('violates the invariant on a pinned lowest seed, and that seed is the default in broken mode', () => {
    expect(lowest()).toBe(BROKEN_SEED);
    expect(BROKEN_CONFIG.seed).toBe(BROKEN_SEED);
    const sim = runRing(BROKEN_CONFIG);
    expect(sim.violation).not.toBeNull();
    expect(sim.violation!.message).toContain('overwritten before the driver consumed it');
  });

  it('for the stated reason: the same seed with the correct driver is identical up to that tick, then holds the packet and drops the new one instead', () => {
    const broken = runRing(BROKEN_CONFIG);
    const tick = broken.violation!.tick;
    const good = createRing({ ...BROKEN_CONFIG, broken: false });
    good.run(tick);
    const strip = (s: RingState) => ({ ...s, events: [] as string[] });
    for (let k = 0; k < tick; k++) expect(strip(broken.history[k]), `tick ${k}`).toEqual(strip(good.history[k]));
    const before = good.history[tick - 1];
    const after = good.history[tick];
    const lost = broken.state.lastOverwritten;
    expect(broken.state.overwritten).toBe(1);
    expect(broken.state.events.some((e) => e.includes('overwritten'))).toBe(true);
    // The correct driver at the same instant: the head descriptor still holds that unconsumed packet, and the arrival is a counted drop.
    const head = before.ring[before.head];
    expect(['filled', 'processing']).toContain(head.phase);
    expect(head.seq).toBe(lost);
    expect(after.dropped).toBe(before.dropped + 1);
    expect(after.overwritten).toBe(0);
    expect(after.ring[before.head].seq).toBe(lost);
  });

  it('the trace shows the cause: a driver re-post of the head descriptor, naming the packet it still holds, comes before the overwrite on the violation tick and nowhere earlier', () => {
    const broken = runRing(BROKEN_CONFIG);
    const tick = broken.violation!.tick;
    const held = broken.history[tick - 1].ring[broken.history[tick - 1].head];
    const events = broken.history[tick].events;
    const repost = events.findIndex((e) => e === `driver re-posts descriptor ${broken.history[tick - 1].head} while it still holds packet ${held.seq}`);
    const overwrite = events.findIndex((e) => e.includes('is overwritten by packet'));
    expect(repost).toBeGreaterThanOrEqual(0);
    expect(overwrite).toBeGreaterThan(repost);
    const earlier = broken.history.slice(0, tick).flatMap((h) => h.events);
    expect(earlier.some((e) => e.includes('re-posts'))).toBe(false);
  });

  it('counterfactual: with the correct driver the same seed never logs a re-post, and the ring is never device-owned while holding a packet', () => {
    const good = runRing({ ...BROKEN_CONFIG, broken: false });
    expect(good.history.flatMap((h) => h.events).some((e) => e.includes('re-posts'))).toBe(false);
    expect(good.state.overwritten).toBe(0);
  });

  it('with healthy settings (a driver that keeps up) the broken driver never overwrites on any of 200 seeds, so the failure needs a full ring', () => {
    for (const seed of SEEDS) expect(runRing({ ...DEFAULT_CONFIG, seed, broken: true }).violation, `seed ${seed}`).toBeNull();
  });
});

describe('the Driver toggle', () => {
  const learner: RingConfig = { ...DEFAULT_CONFIG, seed: 77, ratePct: 55, driverTicks: 7, coalesceN: 3, timeLimit: 16 };

  it('switching on loads the pinned failing setup, so the run really fails', () => {
    const on = toggleBroken(learner, true);
    expect(on).toEqual(BROKEN_CONFIG);
    expect(runRing(on).violation).not.toBeNull();
  });

  it('switching off flips only the driver: the learner seed and sliders are kept, and on the broken seed the same ring only drops and counts packets', () => {
    expect(toggleBroken(learner, false)).toEqual({ ...learner, broken: false });
    const off = toggleBroken(BROKEN_CONFIG, false);
    expect(off).toEqual({ ...BROKEN_CONFIG, broken: false });
    const s = runRing(off).state;
    expect(s.overwritten).toBe(0);
    expect(s.dropped).toBeGreaterThan(0);
    // an independent count: every arrival is either DMAed or dropped
    expect(s.produced + s.dropped).toBe(arrivalsOf(off.seed, off.ratePct, RING_TICKS));
  });
});

describe('interrupt coalescing, against closed forms', () => {
  it('with no time limit, interrupts = floor(packets / N) and the remainder waits unannounced (not ceil: nothing flushes it)', () => {
    for (let n = 1; n <= 8; n++) {
      for (const seed of SEEDS.slice(0, 40)) {
        const s = runRing({ ...DEFAULT_CONFIG, seed, coalesceN: n, timeLimit: TIME_LIMIT_OFF }).state;
        expect(s.irqs, `N=${n} seed ${seed}`).toBe(Math.floor(s.produced / n));
        expect(s.pending).toBe(s.produced % n);
        expect(s.signalled).toBe(s.irqs * n);
        expect(s.irqs).toBeLessThanOrEqual(s.produced);
      }
    }
  });

  it('a time limit announces every packet eventually: signalled + pending = produced, and interrupts stay between ceil(signalled / N) and the packet count', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const s = runRing({ ...DEFAULT_CONFIG, seed, coalesceN: 4, timeLimit: 8 }).state;
      expect(s.signalled + s.pending).toBe(s.produced);
      expect(s.irqs).toBeGreaterThanOrEqual(Math.ceil(s.signalled / 4));
      expect(s.irqs).toBeLessThanOrEqual(s.produced);
    }
  });

  it('packets per interrupt is signalled / interrupts, 1 at N = 1 and about N at larger N', () => {
    const one = runRing({ ...DEFAULT_CONFIG, coalesceN: 1 }).state;
    expect(packetsPerInterrupt(one)).toBe(1);
    const four = runRing({ ...DEFAULT_CONFIG, coalesceN: 4 }).state;
    expect(packetsPerInterrupt(four)).toBe(4);
    expect(packetsPerInterrupt(createRing(DEFAULT_CONFIG).state)).toBeNull();
  });

  it('coalescing trades latency for fewer interrupts on the default schedule: fewer interrupts, a higher worst latency', () => {
    const one = runRing({ ...DEFAULT_CONFIG, coalesceN: 1 }).state;
    const four = runRing({ ...DEFAULT_CONFIG, coalesceN: 4 }).state;
    expect(four.irqs).toBeLessThan(one.irqs);
    expect(four.worstLatency).toBeGreaterThan(one.worstLatency);
  });
});
