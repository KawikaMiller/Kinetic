import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import {
  DT, HIT_HALF, MAX_FRAME, MAX_STEPS, SAFETY_STEPS, START, TRAIL_SECONDS, TUNNEL_SPIKE, WORLD, advanceFrame, createLoop, createMachine,
  createWorld, machineFrame, machineGap, runTimed, runTimedReports, spikeReady, spiralling, step, type LoopMode,
} from './sim';

/** Frame times: mostly about one refresh interval, sometimes a spike of up to 2 s. */
function schedule(rnd: Rnd, n: number, refresh = 1 / 60): number[] {
  return Array.from({ length: n }, () => (rnd() < 0.03 ? refresh + rnd() * 2 : refresh * (0.8 + rnd() * 0.4)));
}

describe('the accumulator (capped)', () => {
  it('never runs more than MAX_STEPS updates, always leaves 0 ≤ acc < DT, and alpha in [0, 1)', () => {
    const rnd = mulberry32(1);
    for (const mode of ['fixed', 'interpolated'] as LoopMode[]) {
      for (let run = 0; run < 20; run++) {
        const s = createLoop();
        for (const dt of schedule(rnd, 600)) {
          const r = advanceFrame(s, dt, mode, true);
          expect(r.steps).toBeLessThanOrEqual(MAX_STEPS);
          expect(s.acc).toBeGreaterThanOrEqual(0);
          expect(s.acc).toBeLessThan(DT);
          expect(r.alpha).toBeGreaterThanOrEqual(0);
          expect(r.alpha).toBeLessThan(1);
          expect(r.backlog).toBe(0);
        }
      }
    }
  });

  it('conserves time: steps × DT plus what is left equals the (capped) real time fed in', () => {
    const rnd = mulberry32(2);
    const s = createLoop();
    let fed = 0;
    let dropped = 0;
    for (const dt of schedule(rnd, 3000)) {
      const r = advanceFrame(s, dt, 'fixed', true);
      fed += Math.min(dt, MAX_FRAME);
      dropped += r.dropped;
      expect(r.dropped).toBeCloseTo(Math.max(0, dt - MAX_FRAME), 12);
    }
    expect(s.world.steps * DT + s.acc).toBeCloseTo(fed, 9);
    expect(dropped).toBeGreaterThan(0); // the 2 s spikes really were cut
  });

  it('MAX_STEPS covers a capped frame plus a leftover just under DT', () => {
    expect(MAX_STEPS * DT).toBeGreaterThanOrEqual(MAX_FRAME + DT - 1e-12);
  });

  it('interpolation draws between the last two physics states; fixed draws the newest', () => {
    const a = createLoop();
    const b = createLoop();
    for (const dt of [0.01, 0.02, 0.005, 0.03]) {
      const ri = advanceFrame(a, dt, 'interpolated', true);
      const rf = advanceFrame(b, dt, 'fixed', true);
      expect(rf.render).toEqual(rf.physics);
      const w = a.world;
      expect(ri.render.x).toBeCloseTo(w.prev.x + (w.ball.x - w.prev.x) * ri.alpha, 12);
    }
  });
});

describe('fixed steps are deterministic across displays', () => {
  it('30 Hz and 144 Hz give the identical state at every whole step, for 10 seeded spike schedules', () => {
    for (let seed = 0; seed < 10; seed++) {
      const rnd = mulberry32(100 + seed);
      const spike = () => (rnd() < 0.02 ? rnd() * 0.3 : 0);
      const slow = createMachine(30);
      const fast = createMachine(144);
      for (let i = 0; i < 30 * 8; i++) machineFrame(slow, 'fixed', spike());
      for (let i = 0; i < 144 * 8; i++) machineFrame(fast, 'fixed', spike());
      const n = Math.min(slow.stepHistory.length, fast.stepHistory.length);
      expect(n).toBeGreaterThan(400);
      expect(slow.stepHistory.slice(0, n)).toEqual(fast.stepHistory.slice(0, n));
      expect(machineGap(slow, fast, 'fixed').gap).toBe(0);
      // and both match plain stepping by DT, the independent reference
      const ref = createWorld();
      for (let k = 0; k < n; k++) {
        step(ref, DT);
        expect(slow.stepHistory[k]).toEqual(ref.ball);
      }
    }
  });

  it('trails span the same simulated time at either rate', () => {
    const slow = createMachine(30);
    const fast = createMachine(144);
    for (let i = 0; i < 30 * 5; i++) machineFrame(slow, 'fixed');
    for (let i = 0; i < 144 * 5; i++) machineFrame(fast, 'fixed');
    expect(slow.trail.length / 30).toBe(TRAIL_SECONDS);
    expect(fast.trail.length / 144).toBe(TRAIL_SECONDS);
  });

  it('variable dt does not: the same code at 30 Hz and 144 Hz drifts apart', () => {
    const slow = createMachine(30);
    const fast = createMachine(144);
    for (let i = 0; i < 30 * 4; i++) machineFrame(slow, 'variable');
    for (let i = 0; i < 144 * 4; i++) machineFrame(fast, 'variable');
    const g = machineGap(slow, fast, 'variable');
    expect(g.compared).toBe(4 * 6);
    expect(g.gap).toBeGreaterThan(1);
  });
});

describe('tunnelling', () => {
  /** 60 Hz frames, with one spike injected the first time the ball is about to reach the thin wall. */
  function run(mode: LoopMode, spikeSeconds: number, frames = 600) {
    const s = createLoop();
    let spiked = false;
    let pending = 0;
    for (let i = 0; i < frames; i++) {
      advanceFrame(s, 1 / 60 + pending, mode, true);
      pending = 0;
      if (!spiked && spikeReady(s.world.ball)) {
        spiked = true;
        pending = spikeSeconds;
      }
    }
    return { tunnels: s.world.tunnels, spiked };
  }

  it('the preset tunnels under variable dt and never under the fixed step', () => {
    const v = run('variable', TUNNEL_SPIKE);
    expect(v.spiked).toBe(true);
    expect(v.tunnels).toBeGreaterThanOrEqual(1);
    for (const mode of ['fixed', 'interpolated'] as LoopMode[]) {
      const f = run(mode, TUNNEL_SPIKE);
      expect(f.spiked).toBe(true);
      expect(f.tunnels).toBe(0);
    }
  });

  it('a fixed step never tunnels, whatever the frame times: one step moves |vx|·DT, less than the contact zone', () => {
    expect(Math.abs(START.vx) * DT).toBeLessThan(2 * HIT_HALF);
    const rnd = mulberry32(7);
    for (let run = 0; run < 30; run++) {
      const s = createLoop();
      for (const dt of schedule(rnd, 1200)) advanceFrame(s, dt, 'fixed', run % 2 === 0);
      expect(s.world.tunnels).toBe(0);
      expect(s.world.ball.x).toBeLessThan(WORLD.wallX); // still on the starting side
    }
  });

  it('a short spike under variable dt can be too small to tunnel', () => {
    expect(run('variable', 0.02).tunnels).toBe(0);
  });
});

describe('the spiral of death (timing model)', () => {
  const refresh = 1 / 60;
  it('updates that cost more than DT climb to the safety stop when nothing caps the frame time', () => {
    const counts = runTimed('fixed', false, { refresh, render: 0.002, cost: 0.02 }, 120);
    expect(counts[counts.length - 1]).toBe(SAFETY_STEPS);
    expect(Math.max(...counts.slice(0, 5))).toBeLessThan(SAFETY_STEPS);
  });

  it('with the 250 ms cap, the same costs stay at or below MAX_STEPS: the game slows down instead', () => {
    const counts = runTimed('fixed', true, { refresh, render: 0.002, cost: 0.02 }, 120);
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_STEPS);
  });

  it('cheap updates recover after a spike: a burst of catch-up, then back to about one per frame', () => {
    const counts = runTimed('fixed', false, { refresh, render: 0.002, cost: 0.005 }, 80, (i) => (i === 10 ? 0.4 : 0));
    expect(counts[10]).toBeGreaterThanOrEqual(20); // the spike lands in frame 10's own frame time
    expect(counts[11]).toBeLessThan(counts[10]);
    expect(Math.max(...counts.slice(40))).toBeLessThanOrEqual(2);
  });

  /** Whether any window of the run counts as a spiral, frame by frame as the Stage sees it. */
  const everSpirals = (reports: ReturnType<typeof runTimedReports>) => reports.some((_, i) => spiralling(reports.slice(0, i + 1)));

  it('a one-off catch-up with free updates is not a spiral, even when it hits the update limit (the review repro)', () => {
    for (const spike of [0.32, 0.4, 1.5]) {
      const reports = runTimedReports('fixed', false, { refresh, render: 0.002, cost: 0 }, 80, (i) => (i === 10 ? spike : 0));
      expect(reports[10].steps).toBe(SAFETY_STEPS); // it does hit the limit…
      expect(everSpirals(reports)).toBe(false); // …but the backlog shrinks, so no spiral caption
    }
  });

  it('updates dearer than DT, uncapped, are a spiral; capped, they never are', () => {
    expect(everSpirals(runTimedReports('fixed', false, { refresh, render: 0.002, cost: 0.02 }, 120))).toBe(true);
    expect(everSpirals(runTimedReports('fixed', true, { refresh, render: 0.002, cost: 0.02 }, 120))).toBe(false);
  });
});

describe('switching the cap back on', () => {
  it('drops a backlog built up while uncapped, so acc < DT and alpha < 1 at once', () => {
    const s = createLoop();
    for (let i = 0; i < 20; i++) advanceFrame(s, 0.5, 'interpolated', false); // 30 steps owed per frame, 20 run
    expect(s.acc).toBeGreaterThan(1);
    const owed = s.acc;
    const r = advanceFrame(s, 1 / 60, 'interpolated', true);
    expect(s.acc).toBeLessThan(DT);
    expect(r.alpha).toBeLessThan(1);
    expect(r.backlog).toBe(0);
    expect(r.dropped).toBeGreaterThan(owed - 2 * DT);
  });
});

