import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { BROOKS_DEFAULT, BROOKS_RANGES, readBrooks } from './brooks';
import { brooksCaption, crashCaption, pathCaption, peopleCaption, riskCaption } from './captions';
import { CHANGE, crashOf } from './crash';
import { PRESET, addEdge, cpm, setDays } from './cpm';
import { FACTS } from './facts';
import lesson from './index';
import { OPENING } from './opening';
import { MAX_ENGINEERS, listSchedule, lowerBounds, optimalMakespan } from './schedule';
import { SPREAD, simulateProject } from './uncertainty';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('project-planning-critical-path');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('project-planning-critical-path')).toEqual([]);
  });

  it('every scene opens on its documented state', () => {
    expect(OPENING.scene).toBe('path');
    expect(OPENING.path).toMatchObject({ selected: null, note: null, from: 'release', to: 'design' });
    expect(OPENING.path.plan).toBe(PRESET);
    expect(OPENING.crash).toEqual({ taskId: 'api', delta: 0 });
    expect(OPENING.people.engineers).toBe(2);
    expect(OPENING.brooks.params).toEqual(BROOKS_DEFAULT);
    expect(OPENING.risk).toEqual({ sigma: 0.4, seed: 9 });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the default pickers refuse Release before Design with the loop named; two days on UI keep 16 days and leave Polish no slack', () => {
    const [from, to] = [OPENING.path.from, OPENING.path.to];
    const r = addEdge(PRESET, from, to);
    expect(r.ok).toBe(false);
    expect(FACTS.cycleError).toContain('Design to API to Integrate to Tests to Release to Design');
    const ui = PRESET.tasks.find((t) => t.id === 'ui')!;
    const slipped = cpm(setDays(PRESET, 'ui', ui.days + 2));
    expect([slipped.length, slipped.slack.polish, cpm(PRESET).slack.ui]).toEqual([16, 0, 2]);
    expect([FACTS.length, FACTS.critical, FACTS.tasks, FACTS.chain]).toEqual([16, 5, 8, 'Design, API, Integrate, Tests, Release']);
    expect(lesson.tryThis[0]).toContain('the project is 16 days and 5 of 8 tasks are critical');
    expect(lesson.tryThis[0]).toContain('reads 0 days of slack');
  });

  it('try-this 2: cutting API by 3 moves the end to day 14, not 13, and UI and Polish become critical', () => {
    expect(CHANGE.min).toBeLessThanOrEqual(-3);
    const c = crashOf('api', -3);
    expect([c.after.length, c.newlyCritical]).toEqual([14, ['ui', 'polish']]);
    expect(lesson.tryThis[1]).toContain('moves the end to day 14, not 13, and UI and Polish turn orange');
  });

  it('try-this 3: 2 engineers give 17 days against bounds 16 and 12 and an optimum of 16; 1 engineer gives 24', () => {
    expect([listSchedule(PRESET, 2).makespan, lowerBounds(PRESET, 2).criticalPath, lowerBounds(PRESET, 2).workShare, optimalMakespan(PRESET, 2)]).toEqual([17, 16, 12, 16]);
    expect(listSchedule(PRESET, 1).makespan).toBe(24);
    expect(lesson.tryThis[2]).toContain('finishes on day 17, the lower bounds are 16 and 12, and brute force finds 16');
  });

  it('try-this 4: one person 20 days, best 12.75 at 3 people, later than one from 7', () => {
    const r = readBrooks(OPENING.brooks.params);
    expect([r.days[0], r.best, r.days[r.best - 1], r.laterAt]).toEqual([20, 3, 12.75, 7]);
    expect(lesson.tryThis[3]).toContain('12.75 days with 3 people, and from 7 people');
  });

  it('try-this 5: planned 16 but simulated average 17.8; API critical in 72% of runs and Schema in 3%', () => {
    const u = simulateProject(PRESET, OPENING.risk.sigma, OPENING.risk.seed);
    expect([u.meanLength.toFixed(1), Math.round(u.criticality.api * 100), Math.round(u.criticality.schema * 100)]).toEqual(['17.8', 72, 3]);
    expect(lesson.tryThis[4]).toContain('simulated average is 17.8');
  });
});

describe('captions across the control cross product', () => {
  it('the crash caption is clean for every task and every change on the slider, and its numbers match the schedules', () => {
    for (const t of PRESET.tasks) {
      for (let delta = CHANGE.min; delta <= CHANGE.max; delta++) {
        const c = crashOf(t.id, delta);
        const plan = setDays(PRESET, t.id, t.days + c.delta);
        const text = expectCaption(crashCaption(plan, c));
        expect(text, `${t.id} ${delta}`).not.toMatch(NO_JUNK);
        if (c.delta !== 0) expect(text).toContain(`day ${c.after.length}`);
      }
    }
  });

  it('a task with slack that is cut says the date holds because it was off the chain; a critical cut past the second chain says so', () => {
    const off = crashCaption(setDays(PRESET, 'schema', 1), crashOf('schema', -1));
    expect(expectCaption(off)).toContain('It was off the longest chain (slack 3 days)');
    const past = expectCaption(crashCaption(setDays(PRESET, 'api', 2), crashOf('api', -3)));
    expect(past).toContain('not the 3 days you cut');
    expect(past).toContain('UI and Polish');
  });

  it('the path, people, Brooks and risk captions are clean at their extremes', () => {
    const s = cpm(PRESET);
    expect(expectCaption(pathCaption(PRESET, s, null, null))).toContain('Click a task');
    expect(expectCaption(pathCaption(PRESET, s, 'ui', 'Note.'))).toContain('UI has 2 days of slack');
    expect(expectCaption(pathCaption(PRESET, s, 'api', null))).toContain('API has no slack');
    for (let n = 1; n <= MAX_ENGINEERS; n++) {
      const text = expectCaption(peopleCaption(n, listSchedule(PRESET, n), lowerBounds(PRESET, n), optimalMakespan(PRESET, n)));
      expect(text).not.toMatch(NO_JUNK);
      expect(text).toContain(`With ${n === 1 ? '1 engineer' : `${n} engineers`}`);
    }
    for (const serial of [BROOKS_RANGES.serial.min, 1]) {
      for (const ramp of [BROOKS_RANGES.ramp.min, BROOKS_RANGES.ramp.max]) {
        const p = { ...BROOKS_DEFAULT, serial, ramp };
        expect(expectCaption(brooksCaption(p, readBrooks(p)))).not.toMatch(NO_JUNK);
      }
    }
    for (const sigma of [SPREAD.min, SPREAD.max]) {
      expect(expectCaption(riskCaption(PRESET, 16, cpm(PRESET).slack, simulateProject(PRESET, sigma, 1, 500), sigma))).not.toMatch(NO_JUNK);
    }
  });

  it('the risk caption names the slack task most often critical, from the simulation', () => {
    const u = simulateProject(PRESET, OPENING.risk.sigma, OPENING.risk.seed);
    const text = expectCaption(riskCaption(PRESET, 16, cpm(PRESET).slack, u, OPENING.risk.sigma));
    const pct = Math.round(Math.max(u.criticality.ui, u.criticality.polish, u.criticality.schema) * 100);
    expect(text).toContain(`of slack in the plan yet is on a longest chain in ${pct}% of runs`);
    expect(pct).toBe(25);
  });

  it('with no serial work nothing is split, the caption says adding people only costs, and none finishes later when costs are zero', () => {
    const p = { work: 20, serial: 1, ramp: 0, pairCost: 0 };
    const text = expectCaption(brooksCaption(p, readBrooks(p)));
    expect(text).toContain('never finishes later than one person');
    expect(text).toContain('Nothing can be split here');
  });
});
