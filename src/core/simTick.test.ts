import { describe, expect, it } from 'vitest';
import { createTickSim, ticksDue } from './simTick';

/** A random walk whose step reads the random stream twice, so replay order matters. */
const walk = (seed: number, check?: (n: number) => string | null) =>
  createTickSim<number>({
    seed,
    init: (rnd) => Math.floor(rnd() * 10),
    step: (s, rnd) => s + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)),
    check: check && ((s) => check(s)),
  });

describe('createTickSim', () => {
  it('same seed, same history; another seed differs', () => {
    const a = walk(5);
    const b = walk(5);
    a.run(200);
    b.run(200);
    expect(a.history).toEqual(b.history);
    const c = walk(6);
    c.run(200);
    expect(c.history).not.toEqual(a.history);
  });

  it('at(k) equals running k steps, in any order of asking', () => {
    const scrubbed = walk(9);
    const direct = (k: number) => {
      const s = walk(9);
      s.run(k);
      return s.state;
    };
    for (const k of [50, 3, 0, 120, 49]) expect(scrubbed.at(k)).toBe(direct(k));
    expect(scrubbed.ticks).toBe(120);
  });

  it('run adds to the history one tick at a time, and reset replays the same trace', () => {
    const sim = walk(2);
    expect(sim.history).toHaveLength(1);
    expect(sim.run(3)).toBe(3);
    expect(sim.ticks).toBe(3);
    const first = [...sim.history];
    sim.reset();
    expect(sim.ticks).toBe(0);
    sim.run(3);
    expect(sim.history).toEqual(first);
  });

  it('at() past the start or before it returns null for a negative tick', () => {
    expect(walk(1).at(-1)).toBeNull();
  });

  it('check fires on a deliberately broken step, records the tick and stops the run', () => {
    const sim = createTickSim<number>({
      seed: 1,
      init: () => 0,
      step: (s, _rnd, tick) => (tick === 7 ? -1 : s + 1),
      check: (s) => (s < 0 ? 'went negative' : null),
    });
    expect(sim.run(100)).toBe(7);
    expect(sim.violation).toEqual({ tick: 7, message: 'went negative' });
    expect(sim.state).toBe(-1);
    expect(sim.run(10)).toBe(0);
    expect(sim.at(50)).toBeNull();
    expect(sim.at(6)).toBe(6);
  });

  it('check also covers the initial state, and a healthy run has no violation', () => {
    const bad = createTickSim<number>({ seed: 1, init: () => -5, step: (s) => s, check: (s) => (s < 0 ? 'bad start' : null) });
    expect(bad.violation).toEqual({ tick: 0, message: 'bad start' });
    const ok = walk(3, () => null);
    ok.run(50);
    expect(ok.violation).toBeNull();
  });
});

describe('ticksDue', () => {
  it('runs whole ticks and carries the remainder', () => {
    const a = ticksDue(0, 0.1, 0.03, 10);
    expect(a.ticks).toBe(3);
    expect(a.carry).toBeCloseTo(0.01, 12);
    expect(ticksDue(a.carry, 0.02, 0.03, 10).ticks).toBe(1);
  });

  it('caps ticks per frame and drops the excess time', () => {
    expect(ticksDue(0, 5, 0.03, 4)).toEqual({ ticks: 4, carry: 0 });
  });

  it('a frame shorter than a tick runs none and keeps the time', () => {
    const r = ticksDue(0.01, 0.01, 0.05, 5);
    expect(r.ticks).toBe(0);
    expect(r.carry).toBeCloseTo(0.02, 12);
  });
});
