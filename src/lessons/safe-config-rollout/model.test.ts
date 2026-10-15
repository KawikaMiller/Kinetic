import { describe, expect, it } from 'vitest';
import {
  ALL_AT_ONCE, CHANGES, FAULT_REGION, FLEET, GATE_THRESHOLD, HUMAN_DETECT_MIN, PEAK_DELAY, REGION_SIZE, ROLLBACK_AUTO_MIN, ROLLBACK_MANUAL_MIN, STAGE_CHOICES, TIMEOUT_RANGE,
  changeOf, planFrom, simulate, statusAt, withinRange, type Change, type Plan,
} from './model';

/**
 * An independent oracle: a global clock, one minute at a time, with the gate and the human checked before each promotion. It shares none of the
 * stage-by-stage loop of `simulate`, and totals server-minutes by counting failing servers at each minute until the revert.
 */
function oracle(change: Change, plan: Plan): { landed: number; detect: number | null; revert: number | null; serverMinutes: number } {
  const land: number[] = [];
  let next = 0;
  let nextStart = 0;
  let lastStart = 0;
  let detect: number | null = null;
  const failing = (m: number) => land.filter((l, s) => change.affects(s) && l + change.delay <= m).length;
  const firstFail = () => Math.min(...land.flatMap((l, s) => (change.affects(s) ? [l + change.delay] : [])));
  const check = (m: number) => {
    if (detect !== null || land.length === 0) return;
    if (plan.gate && m <= lastStart + plan.bake && failing(m) / land.length > GATE_THRESHOLD) detect = m;
    else if (Number.isFinite(firstFail()) && m === firstFail() + HUMAN_DETECT_MIN) detect = m;
  };
  for (let m = 0; m < 400 && detect === null; m++) {
    check(m);
    while (detect === null && next < plan.stages.length && m === nextStart) {
      while (land.length < plan.stages[next]) land.push(m);
      lastStart = m;
      next++;
      nextStart = m + plan.bake;
      check(m);
    }
  }
  if (detect === null) return { landed: land.length, detect, revert: null, serverMinutes: 0 };
  const revert = detect + (plan.autoRollback ? ROLLBACK_AUTO_MIN : ROLLBACK_MANUAL_MIN);
  let serverMinutes = 0;
  for (let m = 0; m < revert; m++) serverMinutes += failing(m);
  return { landed: land.length, detect, revert, serverMinutes };
}

const SUBSETS = (() => {
  const ids = STAGE_CHOICES.map((s) => s.id);
  return Array.from({ length: 1 << ids.length }, (_, mask) => ids.filter((_, i) => mask & (1 << i)));
})();

const plans = function* (): Generator<Plan> {
  for (const subset of SUBSETS) {
    for (const bake of [0, 1, 2, 3, 5, 8, 10, 11, 15, 19, 20, 21, 25, 30, 40]) {
      for (const gate of [true, false]) {
        for (const autoRollback of [true, false]) yield planFrom(subset, { bake, gate, validate: false, autoRollback });
      }
    }
  }
};

describe('the simulator against the independent oracle', () => {
  it('agrees on reach, detection, revert and server-minutes for every change over 8 stage plans x 15 bakes x gate x rollback', () => {
    let n = 0;
    for (const change of CHANGES) {
      for (const plan of plans()) {
        const r = simulate(change, plan);
        const o = oracle(change, plan);
        const label = `${change.id} ${JSON.stringify(plan)}`;
        expect([r.reached, r.detectedAt, r.revertAt, r.serverMinutes], label).toEqual([o.landed, o.detect, o.revert, o.serverMinutes]);
        n++;
      }
    }
    expect(n).toBe(4 * 8 * 15 * 4);
  });
});

describe('closed forms for deterministic faults', () => {
  const rb = (p: Plan) => (p.autoRollback ? ROLLBACK_AUTO_MIN : ROLLBACK_MANUAL_MIN);

  it('everything at once: 48 servers fail from minute 0 until a person notices (10 min) and reverts by hand (15 min): 48 x 25', () => {
    for (const id of ['validation', 'crash'] as const) expect(simulate(changeOf(id), ALL_AT_ONCE).serverMinutes).toBe(FLEET * (HUMAN_DETECT_MIN + ROLLBACK_MANUAL_MIN));
    expect(simulate(changeOf('region'), ALL_AT_ONCE).serverMinutes).toBe(REGION_SIZE * (HUMAN_DETECT_MIN + ROLLBACK_MANUAL_MIN));
    expect(simulate(changeOf('peak'), ALL_AT_ONCE).serverMinutes).toBe(FLEET * (HUMAN_DETECT_MIN + ROLLBACK_MANUAL_MIN));
  });

  it('staged with a gate, an immediate fault on every server: the first stage only, for the rollback time', () => {
    for (const plan of plans()) {
      if (!plan.gate) continue;
      expect(simulate(changeOf('crash'), plan).serverMinutes, JSON.stringify(plan)).toBe(plan.stages[0] * rb(plan));
    }
  });

  it('staged with a gate, a fault only in one region: 12 servers for the rollback time, caught when the whole fleet lands', () => {
    for (const plan of plans()) {
      if (!plan.gate) continue;
      const r = simulate(changeOf('region'), plan);
      expect(r.serverMinutes, JSON.stringify(plan)).toBe(REGION_SIZE * rb(plan));
      expect(r.detectedAt).toBe((plan.stages.length - 1) * plan.bake);
    }
  });

  it('staged with no gate, an immediate fault: every stage that lands before a person notices, each from its own landing minute', () => {
    for (const plan of plans()) {
      if (plan.gate) continue;
      const detect = HUMAN_DETECT_MIN;
      const revert = detect + rb(plan);
      let expected = 0;
      let before = 0;
      plan.stages.forEach((size, k) => {
        const start = k * plan.bake;
        const landed = k === 0 || plan.stages.slice(0, k).every((_, j) => (j + 1) * plan.bake < detect);
        if (landed && start <= detect) expected += (size - before) * (revert - start);
        if (landed && start <= detect) before = size;
      });
      expect(simulate(changeOf('crash'), plan).serverMinutes, JSON.stringify(plan)).toBe(expected);
    }
  });
});

describe('the way to fail: a bake shorter than the change takes to show itself', () => {
  const four = (bake: number): Plan => planFrom(['canary', 'region', 'half'], { bake, gate: true, validate: false, autoRollback: true });
  const peak = changeOf('peak');

  it('with a 5 minute bake the staged rollout reaches all 48 servers before any gate sees a problem', () => {
    const r = simulate(peak, four(5));
    expect(r.reached).toBe(FLEET);
    expect(r.detectedBy).toBe('human');
    expect(r.stages.every((s) => s.start < PEAK_DELAY)).toBe(true);
    expect(r.serverMinutes).toBe(13 + 11 * 8 + 12 * 3);
  });

  it('with a 25 minute bake the gate stops it at the canary, one server for the rollback time', () => {
    const r = simulate(peak, four(25));
    expect([r.reached, r.detectedBy, r.detectedAt, r.serverMinutes, r.peakFailing]).toEqual([1, 'gate', PEAK_DELAY, ROLLBACK_AUTO_MIN, 1]);
    expect(r.stages).toHaveLength(1);
  });

  it('a bake exactly as long as the delay still catches it, and one minute shorter does not', () => {
    expect(simulate(peak, four(PEAK_DELAY)).reached).toBe(1);
    expect(simulate(peak, four(PEAK_DELAY - 1)).reached).toBeGreaterThan(1);
  });
});

describe('validation, the invariant after a rollback, and hidden controls', () => {
  it('refuses exactly the out-of-range timeouts, and so exactly the change that sets 30', () => {
    for (const v of [0, 1, 29, 30, 999, TIMEOUT_RANGE.min - 1]) expect(withinRange(v), String(v)).toBe(false);
    for (const v of [TIMEOUT_RANGE.min, 30000, TIMEOUT_RANGE.max]) expect(withinRange(v), String(v)).toBe(true);
    expect(withinRange(TIMEOUT_RANGE.max + 1)).toBe(false);
    for (const c of CHANGES) {
      const r = simulate(c, planFrom([], { bake: 5, gate: true, validate: true, autoRollback: true }));
      expect(r.refused, c.id).toBe(c.id === 'validation');
      if (r.refused) expect([r.reached, r.serverMinutes, r.revertAt]).toEqual([0, 0, null]);
    }
  });

  it('leaves no server on the new version after a rollback, at every minute from the revert on', () => {
    for (const change of CHANGES) {
      for (const plan of plans()) {
        const r = simulate(change, plan);
        if (r.revertAt === null) continue;
        for (let s = 0; s < FLEET; s++) {
          for (const m of [r.revertAt, r.revertAt + 1, r.revertAt + 50]) {
            expect(['unreached', 'rolledback']).toContain(statusAt(r, s, m));
          }
        }
      }
    }
  });

  it('keeps the all-at-once scene independent of bake, gate and rollback: its plan is a constant and no other plan is read', () => {
    const before = CHANGES.map((c) => simulate(c, ALL_AT_ONCE).serverMinutes);
    for (const extreme of [{ bake: 0, gate: true, autoRollback: true }, { bake: 40, gate: false, autoRollback: false }]) {
      simulate(changeOf('peak'), planFrom(['canary'], { ...extreme, validate: false }));
    }
    expect(CHANGES.map((c) => simulate(c, ALL_AT_ONCE).serverMinutes)).toEqual(before);
    expect(ALL_AT_ONCE).toEqual({ stages: [FLEET], bake: 0, gate: false, validate: false, autoRollback: false });
  });

  it('keeps the region fault to its own region', () => {
    const r = simulate(changeOf('region'), ALL_AT_ONCE);
    const failing = r.failAt.flatMap((f, s) => (f !== null ? [s] : []));
    expect(failing).toHaveLength(REGION_SIZE);
    expect(failing.every((s) => Math.floor(s / REGION_SIZE) === FAULT_REGION)).toBe(true);
  });
});
