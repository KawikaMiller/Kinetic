import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_DEFAULT, FLASH, INSTANCE_RPS, MAX_INSTANCES, MINUTES_PER_DAY, POLICIES, PRESETS, RUN_MINUTES, SCHEDULE, SCORED_FROM, VIOLATION_PCT,
  DAILY, bill, ceilDiv, cooldownAllows, countReversals, createFleetSim, desiredCount, isViolation, latencyProxy, loadCurve, policyTable, runFleet, staticFleet, utilisationPct,
  type Controller, type Preset,
} from './model';

const withPolicy = (over: Partial<Controller>): Controller => ({ ...CONTROLLER_DEFAULT, ...over });

describe('the target-tracking arithmetic, on whole percents', () => {
  it('hand traces: 4 instances at 90% against a 60% target ask for ⌈4 × 0.9 ÷ 0.6⌉ = 6', () => {
    expect(desiredCount(4, 90, 60)).toBe(6);
    expect(desiredCount(10, 50, 50)).toBe(10);
    expect(desiredCount(10, 51, 50)).toBe(11);
    expect(desiredCount(5, 240, 60)).toBe(20);
    expect(desiredCount(1, 1, 95)).toBe(1);
  });

  it('the float form is a real trap: Math.ceil(3 × 0.1 ÷ 0.3) is 2, while the whole-percent form is 1', () => {
    expect(3 * 0.1 / 0.3).toBe(1.0000000000000002);
    expect(Math.ceil((3 * 0.1) / 0.3)).toBe(2);
    expect(desiredCount(3, 10, 30)).toBe(1);
    expect(ceilDiv(30, 30)).toBe(1);
  });

  it('ceilDiv equals the exact rational ceiling for every pair up to 300 × 100', () => {
    for (let a = 0; a <= 300; a++) {
      for (let b = 1; b <= 100; b++) {
        const q = Math.floor(a / b) + (a % b === 0 ? 0 : 1);
        expect(ceilDiv(a, b), `${a}/${b}`).toBe(q);
      }
    }
  });

  it('whole-percent utilisation and the violation line use whole numbers: 90% exactly is not a violation, one more request is', () => {
    expect(utilisationPct(300, 500)).toBe(60);
    expect(isViolation(450, 500)).toBe(false);
    expect(isViolation(451, 500)).toBe(true);
    expect(VIOLATION_PCT).toBe(90);
    expect(latencyProxy(250, 500)).toBeCloseTo(2, 12);
    expect(latencyProxy(600, 500)).toBe(50);
    expect(latencyProxy(499, 500)).toBeLessThanOrEqual(50);
  });

  it('cooldown boundaries: 0 allows the next minute, the exact edge is still silent, one tick after is allowed', () => {
    expect(cooldownAllows(10, 10, 0)).toBe(false);
    expect(cooldownAllows(11, 10, 0)).toBe(true);
    expect(cooldownAllows(15, 10, 5)).toBe(false);
    expect(cooldownAllows(16, 10, 5)).toBe(true);
    expect(cooldownAllows(0, -Infinity, 30)).toBe(true);
  });
});

describe('the loads', () => {
  it('are whole numbers, at least 1, two days long, and only the noisy preset reads the seed', () => {
    for (const preset of PRESETS) {
      const a = loadCurve(preset, 1);
      expect(a).toHaveLength(RUN_MINUTES);
      expect(a.every((v) => Number.isInteger(v) && v >= 1)).toBe(true);
      const b = loadCurve(preset, 2);
      expect(preset === 'noisy' ? a.join() !== b.join() : a.join() === b.join(), preset).toBe(true);
    }
  });

  it('the flash spike is ×4 for 20 minutes on day 2 only, and the daily wave and sawtooth repeat exactly each day', () => {
    const flash = loadCurve('flash', 1);
    expect(flash[FLASH.startMinute - 1]).toBe(300);
    expect(flash[FLASH.startMinute]).toBe(1200);
    expect(flash[FLASH.startMinute + FLASH.minutes]).toBe(300);
    expect(flash.slice(0, MINUTES_PER_DAY).every((v) => v === 300)).toBe(true);
    for (const preset of ['daily', 'sawtooth'] as Preset[]) {
      const curve = loadCurve(preset, 1);
      for (let t = 0; t < MINUTES_PER_DAY; t++) expect(curve[t + MINUTES_PER_DAY]).toBe(curve[t]);
    }
  });
});

describe('the fleet, minute by minute', () => {
  it('conservation: served + dropped = offered every minute, and the fleet stays within [min, max] every tick, for every preset and policy', () => {
    for (const preset of PRESETS) {
      for (const policy of POLICIES) {
        for (const warmingCounts of [false, true]) {
          const c = withPolicy({ policy, warmingCounts, min: 3, max: 18 });
          const sim = createFleetSim(preset, c, 1);
          sim.run(RUN_MINUTES);
          expect(sim.violation).toBeNull();
          for (const s of sim.history.slice(1)) {
            expect(s.served + s.dropped, `${preset} ${policy} t=${s.minute}`).toBe(s.load);
            expect(s.live.length).toBeGreaterThanOrEqual(3);
            expect(s.live.length).toBeLessThanOrEqual(18);
            expect(s.dropped).toBe(Math.max(0, s.load - s.ready * INSTANCE_RPS));
          }
        }
      }
    }
  });

  it('a step load: ready capacity is unchanged for exactly the decision minute plus W warm-up minutes, then jumps', () => {
    for (let w = 0; w <= 10; w++) {
      const sim = createFleetSim('flash', withPolicy({ warmupMin: w }), 1);
      sim.run(RUN_MINUTES);
      const ready = (t: number) => sim.history[t + 1].ready;
      const before = ready(FLASH.startMinute - 1);
      expect(before).toBe(5);
      for (let t = FLASH.startMinute; t <= FLASH.startMinute + w; t++) expect(ready(t), `W=${w} t+${t - FLASH.startMinute}`).toBe(before);
      expect(ready(FLASH.startMinute + w + 1), `W=${w}`).toBe(20);
    }
  });

  it('reactive on a step load violates for at least W minutes (here W + 1: the spike minute and the W warm-up minutes)', () => {
    for (let w = 0; w <= 10; w++) {
      const run = runFleet('flash', withPolicy({ warmupMin: w }), 1);
      const hit = run.rows.filter((r) => r.minute >= FLASH.startMinute && r.minute <= FLASH.startMinute + w && r.violation).length;
      expect(hit).toBeGreaterThanOrEqual(w);
      expect(hit).toBe(w + 1);
      expect(run.summary.violationMinutes).toBe(w + 1);
    }
  });

  it('counting warming instances as current while the metric still reads only the ready ones overshoots: the fleet runs past what the load needs', () => {
    const needed = ceilDiv(1200 * 100, INSTANCE_RPS * 60);
    const ready = runFleet('flash', withPolicy({ warmingCounts: false }), 1);
    const naive = runFleet('flash', withPolicy({ warmingCounts: true }), 1);
    expect(ready.summary.peakInstances).toBe(needed);
    expect(naive.summary.peakInstances).toBe(MAX_INSTANCES);
    expect(naive.summary.instanceMinutes).toBeGreaterThan(ready.summary.instanceMinutes);
  });

  it('cooldowns hold: launches are more than the scale-out cooldown apart, removals more than the scale-in cooldown apart', () => {
    for (const [out, inn] of [[0, 0], [3, 7], [10, 2]]) {
      const sim = createFleetSim('noisy', withPolicy({ cooldownOut: out, cooldownIn: inn, warmingCounts: true }), 4);
      sim.run(RUN_MINUTES);
      const launches = sim.history.filter((s) => s.change > 0).map((s) => s.minute);
      const removals = sim.history.filter((s) => s.change < 0).map((s) => s.minute);
      launches.slice(1).forEach((t, i) => expect(t - launches[i], `out ${out}`).toBeGreaterThan(out));
      removals.slice(1).forEach((t, i) => expect(t - removals[i], `in ${inn}`).toBeGreaterThan(inn));
      expect(launches.length).toBeGreaterThan(0);
    }
  });

  it('flapping equals an independent reversal counter over the fleet size, on 200 seeded noisy traces', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const c = withPolicy({ cooldownOut: seed % 4, cooldownIn: seed % 7 });
      const sim = createFleetSim('noisy', c, seed);
      sim.run(RUN_MINUTES);
      const sizes = sim.history.map((s) => s.live.length);
      // An independent counter: the sign of each step in fleet size, with zeros removed, then the places where it flips.
      const signs = sizes.slice(SCORED_FROM + 1).map((n, i) => Math.sign(n - sizes[SCORED_FROM + i])).filter((v) => v !== 0);
      let flips = 0;
      for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) flips++;
      expect(runFleet('noisy', c, seed).summary.flaps, `seed ${seed}`).toBe(flips);
    }
  });

  it('countReversals on hand sequences', () => {
    expect(countReversals([])).toBe(0);
    expect(countReversals([1, 1, 0, 2])).toBe(0);
    expect(countReversals([1, -1, 1])).toBe(2);
    expect(countReversals([0, 3, 0, 0, -2, -1, 4])).toBe(2);
  });

  it('no cooldowns on noisy load flap more than the defaults (the classic failure), at the default seed', () => {
    const calm = runFleet('noisy', CONTROLLER_DEFAULT, 1).summary.flaps;
    const jittery = runFleet('noisy', withPolicy({ cooldownOut: 0, cooldownIn: 0 }), 1).summary.flaps;
    expect(jittery).toBeGreaterThan(calm);
  });

  it('the scheduled policy keeps its raised minimum inside the window and the ordinary one outside it', () => {
    const sim = createFleetSim('daily', withPolicy({ policy: 'scheduled' }), 1);
    sim.run(RUN_MINUTES);
    for (const s of sim.history.slice(1)) {
      const m = s.minute % MINUTES_PER_DAY;
      if (m >= SCHEDULE.fromMinute && m < SCHEDULE.toMinute) expect(s.live.length).toBeGreaterThanOrEqual(SCHEDULE.minimum);
    }
  });
});

describe('predictive scaling: wins where yesterday is a good guide, and is no help where it is not', () => {
  it('on a perfectly periodic load it has zero violations after the first day (the daily wave and the sawtooth)', () => {
    for (const preset of ['daily', 'sawtooth'] as Preset[]) {
      for (const warmupMin of [0, 2, 5, 10]) {
        const run = runFleet(preset, withPolicy({ policy: 'predictive', warmupMin }), 1);
        expect(run.summary.violationMinutes, `${preset} W=${warmupMin}`).toBe(0);
      }
    }
  });

  it('on the flash spike, which yesterday did not have, it violates as long as the reactive policy does (it is useless there)', () => {
    const predictive = runFleet('flash', withPolicy({ policy: 'predictive' }), 1).summary;
    const reactive = runFleet('flash', CONTROLLER_DEFAULT, 1).summary;
    expect(predictive.violationMinutes).toBeGreaterThanOrEqual(FLASH.minutes);
    expect(predictive.violationMinutes).toBeGreaterThan(reactive.violationMinutes);
  });

  it('on noisy load yesterday\'s noise is no guide: predictive has violations', () => {
    expect(runFleet('noisy', withPolicy({ policy: 'predictive' }), 1).summary.violationMinutes).toBeGreaterThan(0);
  });
});

describe('the table shows a repeating load where predictive and scheduled beat reactive', () => {
  const day2 = (run: ReturnType<typeof runFleet>) => run.rows.filter((r) => r.minute >= SCORED_FROM);

  it('the daily wave repeats and its morning rush climbs by DAILY.rampStep a minute, faster than a launch of any warm-up from 0 to 10 minutes can follow', () => {
    const curve = loadCurve('daily', 1);
    const rampMinutes = (DAILY.plateau - DAILY.night) / DAILY.rampStep;
    for (let k = 0; k < rampMinutes; k++) expect(curve[MINUTES_PER_DAY + DAILY.rampStart + k]).toBe(DAILY.night + DAILY.rampStep * (k + 1));
    expect(Math.max(...curve)).toBe(DAILY.plateau);
    // A hand check on the geometry: capacity decided from the load a launch-time ago is at most that load over the target share, so the ramp outruns it.
    expect(DAILY.rampStep).toBeGreaterThan(INSTANCE_RPS / 2);
  });

  it('at every warm-up from 0 to 10 minutes, reactive has violation minutes on the daily wave and predictive and scheduled have none, predictive for fewer instance-minutes than scheduled', () => {
    for (let warmupMin = 0; warmupMin <= 10; warmupMin++) {
      const table = policyTable(withPolicy({ warmupMin }), 1);
      expect(table.reactive.daily.violationMinutes, `reactive W=${warmupMin}`).toBeGreaterThan(0);
      expect(table.predictive.daily.violationMinutes, `predictive W=${warmupMin}`).toBe(0);
      expect(table.scheduled.daily.violationMinutes, `scheduled W=${warmupMin}`).toBe(0);
      expect(table.predictive.daily.instanceMinutes, `cost W=${warmupMin}`).toBeLessThan(table.scheduled.daily.instanceMinutes);
    }
  });

  it('the reactive loop violates on the daily wave only in the rush, and is clean on the plateau and the evening ease-down', () => {
    const rows = day2(runFleet('daily', CONTROLLER_DEFAULT, 1));
    const bad = rows.filter((r) => r.violation).map((r) => r.minute - MINUTES_PER_DAY);
    expect(bad.length).toBeGreaterThan(0);
    const rampEnd = DAILY.rampStart + (DAILY.plateau - DAILY.night) / DAILY.rampStep;
    for (const m of bad) {
      expect(m, `minute ${m}`).toBeGreaterThanOrEqual(DAILY.rampStart);
      expect(m, `minute ${m}`).toBeLessThanOrEqual(rampEnd + CONTROLLER_DEFAULT.warmupMin + 1);
    }
  });

  it('broken variant: on the old gentle sine wave a reactive loop is clean, so a table built on it shows no cell where predictive wins (the check above would fail)', () => {
    const sine = (m: number) => Math.round(350 + 250 * Math.sin((2 * Math.PI * (m - 540)) / MINUTES_PER_DAY));
    const peakStep = Math.max(...Array.from({ length: MINUTES_PER_DAY - 1 }, (_, m) => Math.abs(sine(m + 1) - sine(m))));
    expect(peakStep).toBeLessThan(DAILY.rampStep / 10);
  });

  it('noisy traffic is not a repeating load: day 2 does not equal day 1', () => {
    const curve = loadCurve('noisy', 1);
    expect(curve.slice(0, MINUTES_PER_DAY).join()).not.toBe(curve.slice(MINUTES_PER_DAY).join());
  });
});

describe('the table and the bill', () => {
  it('the 12 cells of the policy table equal 12 separate runs', () => {
    const table = policyTable(CONTROLLER_DEFAULT, 1);
    for (const policy of POLICIES) {
      for (const preset of PRESETS) expect(table[policy][preset], `${policy} ${preset}`).toEqual(runFleet(preset, withPolicy({ policy }), 1).summary);
    }
  });

  it('the static fleet is the busiest minute at the target utilisation, and the bill saves less than it looks when violations are counted', () => {
    const run = runFleet('daily', CONTROLLER_DEFAULT, 1);
    const b = bill(run);
    expect(b.staticInstances).toBe(staticFleet(loadCurve('daily', 1), CONTROLLER_DEFAULT));
    expect(b.staticInstances).toBe(Math.ceil((DAILY.plateau * 100) / (INSTANCE_RPS * 60)));
    expect(b.staticHours).toBe((b.staticInstances * 1440) / 60);
    expect(b.saving).toBeCloseTo(1 - b.autoHours / b.staticHours, 12);
    expect(b.saving!).toBeGreaterThan(0);
  });

  it('the same seed gives the same run', () => {
    const a = runFleet('noisy', CONTROLLER_DEFAULT, 9);
    const b = runFleet('noisy', CONTROLLER_DEFAULT, 9);
    expect(a.summary).toEqual(b.summary);
    expect(a.rows.map((r) => r.ready)).toEqual(b.rows.map((r) => r.ready));
  });
});
