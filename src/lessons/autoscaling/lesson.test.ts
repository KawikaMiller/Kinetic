import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { pctText, sig } from '../distributions/fmt';
import { billCaption, capitalise, cheapestClean, clockText, joinList, minuteCaption, policyCaption } from './frames';
import lesson from './index';
import {
  CONTROLLER_DEFAULT, FLASH, FOCUS_MINUTE, INSTANCE_RPS, MAX_INSTANCES, MINUTES_PER_DAY, POLICIES, PRESETS, SCENE_DEFAULT, bill, ceilDiv, createFleetSim, desiredCount, loadCurve,
  policyTable, runFleet, type Controller, type Preset,
} from './model';

const text = expectCaption;
const seed = SCENE_DEFAULT.seed;
const go = (preset: Preset, over: Partial<Controller> = {}) => runFleet(preset, { ...CONTROLLER_DEFAULT, ...over }, seed);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the default is the flash spike with a 2 minute warm-up: 3 minutes of violations, and 20 instances carry it', () => {
    expect(SCENE_DEFAULT.preset).toBe('flash');
    expect(CONTROLLER_DEFAULT).toMatchObject({ warmupMin: 2, warmingCounts: false, policy: 'reactive' });
    const r = go('flash');
    expect(r.summary.violationMinutes).toBe(3);
    expect(r.summary.dropped).toBe(3 * (FLASH.base * FLASH.factor - 5 * INSTANCE_RPS));
    expect(r.summary.peakInstances).toBe(ceilDiv(FLASH.base * FLASH.factor * 100, INSTANCE_RPS * 60));
    expect(lesson.tryThis[0]).toContain(`${r.summary.violationMinutes} violation minutes and ${sig(r.summary.dropped)} requests dropped`);
  });

  it('try-this 2: with an 8 minute warm-up the spike has 9 violation minutes', () => {
    expect(go('flash', { warmupMin: 8 }).summary.violationMinutes).toBe(9);
    expect(lesson.tryThis[1]).toContain('grow to 9');
  });

  it('try-this 3: counting warming instances as current takes the fleet to its maximum, though 20 carry the spike', () => {
    expect(go('flash', { warmingCounts: true }).summary.peakInstances).toBe(MAX_INSTANCES);
    expect(go('flash').summary.peakInstances).toBe(20);
    expect(lesson.tryThis[2]).toContain(`${MAX_INSTANCES} maximum, though 20`);
  });

  it('try-this 4: on noisy traffic at the default seed, zero cooldowns flap more than the default cooldowns', () => {
    const calm = go('noisy').summary.flaps;
    const jittery = go('noisy', { cooldownOut: 0, cooldownIn: 0 }).summary.flaps;
    expect(jittery).toBeGreaterThan(calm);
    expect(lesson.tryThis[3]).toContain(`from ${calm} reversals to ${jittery}`);
  });

  it('try-this 5: the default pick (predictive, daily wave) has 0 violation minutes, and the flash spike has more than the reactive loop', () => {
    expect(go('daily', { policy: 'predictive' }).summary.violationMinutes).toBe(0);
    const flash = go('flash', { policy: 'predictive' }).summary.violationMinutes;
    expect(flash).toBeGreaterThanOrEqual(FLASH.minutes);
    expect(lesson.tryThis[4]).toContain(`it has ${flash}`);
  });
});

describe('captions are computed from the minute they describe', () => {
  it('the minute caption quotes the row: load, ready, warming, utilisation, the formula and the action, at the spike and after it', () => {
    for (const warmingCounts of [false, true]) {
      for (const policy of POLICIES) {
        const c: Controller = { ...CONTROLLER_DEFAULT, warmingCounts, policy, warmupMin: 3 };
        const run = runFleet('flash', c, seed);
        for (const minute of [FLASH.startMinute - 1, FLASH.startMinute, FLASH.startMinute + 1, FLASH.startMinute + 5, FLASH.startMinute + 30, 1440, 2879]) {
          const row = run.rows[minute];
          const t = text(minuteCaption(row, c, run));
          expect(t, `${policy} ${warmingCounts} ${minute}`).toContain(`At ${clockText(minute)} the load is ${sig(row.load, 4)}/s`);
          expect(t).toContain(`against ${row.ready} ready ${row.ready === 1 ? 'instance' : 'instances'}`);
          expect(t).toContain(`with ${row.warming} warming`);
          expect(t.includes('is dropped'), `${policy} ${minute}`).toBe(row.dropped > 0);
          if (row.change > 0) expect(t).toContain(`It launched ${row.change}`);
          else if (row.change < 0) expect(t).toContain(`It removed ${-row.change}`);
          else expect(t).toContain('It changed nothing');
          if (!(policy === 'predictive' && minute + 1 >= MINUTES_PER_DAY)) {
            const current = warmingCounts ? row.ready + row.warming : row.ready;
            expect(t).toContain(`⌈${current} × ${row.utilPct} ÷ ${c.targetPct}⌉ = ${desiredCount(current, row.utilPct, c.targetPct)}`);
            expect(t.includes('held to'), `${policy} ${minute}`).toBe(desiredCount(current, row.utilPct, c.targetPct) !== row.desired);
          } else {
            expect(t).toContain("provisioning from yesterday's load");
          }
          expect(t).toContain(`this run has ${run.summary.violationMinutes} violation minutes`);
        }
      }
    }
  });

  it('the policy caption names the policies with the fewest violation minutes on that traffic, for all twelve cells', () => {
    const table = policyTable(CONTROLLER_DEFAULT, seed);
    for (const policy of POLICIES) {
      for (const preset of PRESETS) {
        const t = text(policyCaption(table, policy, preset));
        const cell = table[policy][preset];
        expect(t).toContain(`has ${cell.violationMinutes} violation minutes on day 2`);
        const fewest = Math.min(...POLICIES.map((p) => table[p][preset].violationMinutes));
        const best = POLICIES.filter((p) => table[p][preset].violationMinutes === fewest);
        expect(t).toContain(`(${fewest}) belong to ${joinList(best)}.`);
        expect(t.startsWith(capitalise(policy))).toBe(true);
      }
    }
  });

  it('the cheapest-clean mark goes to exactly one clean cell per column, or none when every policy has violations', () => {
    const table = policyTable(CONTROLLER_DEFAULT, seed);
    for (const preset of PRESETS) {
      const marked = POLICIES.filter((p) => cheapestClean(table, p, preset));
      const clean = POLICIES.filter((p) => table[p][preset].violationMinutes === 0);
      expect(marked.length).toBeLessThanOrEqual(1);
      expect(marked.length === 1).toBe(clean.length > 0);
      for (const p of marked) expect(clean.every((q) => table[p][preset].instanceMinutes <= table[q][preset].instanceMinutes)).toBe(true);
    }
  });

  it('the bill caption quotes the hours, the saving and the violation minutes of the same run', () => {
    for (const preset of PRESETS) {
      for (const policy of POLICIES) {
        const b = bill(go(preset, { policy }));
        const t = text(billCaption(preset, b));
        expect(t).toContain(`used ${sig(b.autoHours)} instance-hours against ${sig(b.staticHours)}`);
        expect(t).toContain(`${pctText(b.saving!, 0)} saved`);
        expect(t).toContain(`${b.violationMinutes} violation minutes`);
      }
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: a ×4 spike with a 5 minute warm-up drops load for 6 minutes, and capacity is unchanged until then', () => {
    const r = go('flash', { warmupMin: 5 });
    expect(r.summary.violationMinutes).toBe(6);
    expect(r.rows[FLASH.startMinute].dropped).toBeGreaterThan(0);
    expect(r.rows[FLASH.startMinute + 5].ready).toBe(r.rows[FLASH.startMinute - 1].ready);
  });

  it('Q2: with warming instances counted the request for instances grows every minute while the metric still reads the ready fleet, and without it the request is the same', () => {
    const naive = createFleetSim('flash', { ...CONTROLLER_DEFAULT, warmingCounts: true, warmupMin: 6 }, seed);
    naive.run(MINUTES_PER_DAY + 14 * 60 + 5);
    const a = naive.history[FLASH.startMinute + 1].desired;
    const b = naive.history[FLASH.startMinute + 2].desired;
    expect(b).toBeGreaterThanOrEqual(a);
    expect(naive.history[FLASH.startMinute + 2].utilPct).toBe(naive.history[FLASH.startMinute + 1].utilPct);
    const ready = createFleetSim('flash', { ...CONTROLLER_DEFAULT, warmupMin: 6 }, seed);
    ready.run(MINUTES_PER_DAY + 14 * 60 + 5);
    expect(ready.history[FLASH.startMinute + 2].desired).toBe(ready.history[FLASH.startMinute + 1].desired);
  });

  it('Q3: zero cooldowns on noisy traffic flap more, cost fewer instance-minutes and have several times the violation minutes, on 4 seeds', () => {
    for (const s of [1, 2, 3, 4]) {
      const calm = runFleet('noisy', CONTROLLER_DEFAULT, s).summary;
      const jittery = runFleet('noisy', { ...CONTROLLER_DEFAULT, cooldownOut: 0, cooldownIn: 0 }, s).summary;
      expect(jittery.flaps, `seed ${s}`).toBeGreaterThan(calm.flaps);
      expect(jittery.instanceMinutes).toBeLessThan(calm.instanceMinutes);
      expect(jittery.violationMinutes).toBeGreaterThan(3 * calm.violationMinutes);
    }
  });

  it('Q4: yesterday had no spike (day 1 of the flash traffic is flat), so predictive cannot provision for it', () => {
    const curve = loadCurve('flash', seed);
    expect(Math.max(...curve.slice(0, MINUTES_PER_DAY))).toBe(FLASH.base);
    expect(go('flash', { policy: 'predictive' }).summary.violationMinutes).toBeGreaterThanOrEqual(FLASH.minutes);
    expect(FOCUS_MINUTE.flash).toBeGreaterThan(FLASH.startMinute);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('the seed is read only by the noisy traffic: every other preset is identical for any seed, in every scene', () => {
    for (const preset of PRESETS.filter((p) => p !== 'noisy')) {
      for (const policy of POLICIES) {
        expect(runFleet(preset, { ...CONTROLLER_DEFAULT, policy }, 1).summary, `${preset} ${policy}`).toEqual(runFleet(preset, { ...CONTROLLER_DEFAULT, policy }, 99).summary);
      }
    }
    expect(go('noisy').summary).not.toEqual(runFleet('noisy', CONTROLLER_DEFAULT, 2).summary);
  });

  it('a fixed-size fleet (minimum = maximum) never changes size, so it is not an autoscaler', () => {
    const sim = createFleetSim('daily', { ...CONTROLLER_DEFAULT, min: 6, max: 6 }, seed);
    sim.run(2880);
    expect(new Set(sim.history.map((s) => s.live.length)).size).toBe(1);
    expect(runFleet('daily', { ...CONTROLLER_DEFAULT, min: 6, max: 6 }, seed).summary.flaps).toBe(0);
  });

  it('a fleet fixed at the size the busiest minute needs never drops a request, which is what the bill compares against', () => {
    for (const preset of PRESETS) {
      const b = bill(go(preset));
      const fixed = runFleet(preset, { ...CONTROLLER_DEFAULT, min: Math.min(b.staticInstances, MAX_INSTANCES), max: Math.min(b.staticInstances, MAX_INSTANCES) }, seed);
      expect(fixed.summary.dropped, preset).toBe(0);
    }
  });
});
