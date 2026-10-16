import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { barsOf, lanesOf, markersOf, WINDOW_LANE } from './bars';
import { milestonesOf, schedFrames, summaryOf } from './frames';
import lesson from './index';
import { NAMES, SCENE_OPENINGS, genericOpening, openingOf, pathfinderOpening } from './openings';
import {
  BROKEN_SEED, DEFAULT_SCENARIO, DEFAULT_WATCHDOG, PROTOCOLS, blockingTime, inversionWindow, runsOf, scenarioFromSeed, schedule, verdictOf, type Protocol, type Scenario,
} from './sched';

const text = expectCaption;
const run = (protocol: Protocol, over: Partial<Scenario> = {}, watchdog: number | null = null) => schedule({ ...DEFAULT_SCENARIO, ...over }, { protocol, watchdog });

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: with no protocol H waits 12 ticks against a critical section of 6, finishes at 18, misses 12 by 6, with 8 ticks of window', () => {
    const open = genericOpening();
    expect(open).toMatchObject({ protocol: 'none', fromSeed: null, scenario: { csL: 6, arrivalH: 3, arrivalM: 4, lenM: 8, deadline: 12 } });
    const sch = schedule(open.scenario, { protocol: open.protocol });
    // hand-worked: M runs from 4 to 12, so L unlocks at 15 and H, which runs 3 ticks, ends at 18
    expect([blockingTime(sch), sch.finish.H, inversionWindow(sch).length]).toEqual([12, 18, 8]);
    expect(verdictOf(sch).slack).toBe(-6);
    for (const piece of ['H waits 12 ticks against L\'s critical section of 6', 'finishes at tick 18', 'misses its deadline of 12 by 6', '8 ticks of the wait']) expect(lesson.tryThis[0]).toContain(piece);
  });

  it('try-this 2: doubling M to 16 makes the wait 20 with no protocol and leaves it 4 under inheritance, with the deadline met', () => {
    expect(blockingTime(run('none', { lenM: 16 }))).toBe(12 + 8);
    const inherit = run('inheritance', { lenM: 16 });
    expect(blockingTime(inherit)).toBe(4);
    expect(verdictOf(inherit).met).toBe(true);
    expect(lesson.tryThis[1]).toContain('drag M computes to 16');
    expect(lesson.tryThis[1]).toContain('becomes 20');
    expect(lesson.tryThis[1]).toContain('4 ticks, the same as at 8');
  });

  it('try-this 3: the ceiling holds H back 4 ticks without blocking it and it finishes at 10', () => {
    const sch = run('ceiling');
    expect(blockingTime(sch)).toBe(4);
    expect(sch.ticks.some((r) => r.status.H === 'blocked')).toBe(false);
    expect(sch.finish.H).toBe(10);
    expect(lesson.tryThis[2]).toContain('held back 4 ticks');
    expect(lesson.tryThis[2]).toContain('finishes at tick 10');
  });

  it('try-this 4: the pinned seed has H waiting past the critical section with no protocol and within it under inheritance', () => {
    const s = scenarioFromSeed(BROKEN_SEED);
    const none = schedule(s, { protocol: 'none' });
    const inherit = schedule(s, { protocol: 'inheritance' });
    expect(blockingTime(none)!).toBeGreaterThan(s.csL);
    expect(blockingTime(inherit)!).toBeLessThanOrEqual(s.csL);
    expect(lesson.tryThis[3]).toContain(`H waits ${blockingTime(none)} ticks against a critical section of ${s.csL}`);
    expect(lesson.tryThis[3]).toContain(`${inversionWindow(none).length} of them in the inversion window`);
  });

  it('try-this 5: Pathfinder resets at tick 12 with no option and not with inheritance, where bus management finishes at 10', () => {
    const open = pathfinderOpening();
    expect(open.protocol).toBe('none');
    const none = run('none', {}, open.watchdog);
    expect(none.resetAt).toBe(12);
    // hand-worked: H is unable to run from tick 3, so more than 8 ticks of it have passed by the end of tick 11
    expect(none.resetAt).toBe(D3 + DEFAULT_WATCHDOG + 1);
    const fixed = run('inheritance', {}, open.watchdog);
    expect(fixed.resetAt).toBeNull();
    expect(fixed.finish.H).toBe(10);
    expect(lesson.tryThis[4]).toContain('resets the system at tick 12');
    expect(lesson.tryThis[4]).toContain('bus management finishes at tick 10');
  });
});

const D3 = DEFAULT_SCENARIO.arrivalH;

describe('captions across the control cross product', () => {
  const grid: Scenario[] = [];
  for (const csL of [0, 1, 6, 10]) for (const arrivalH of [0, 1, 3, 10]) for (const arrivalM of [0, 4, 10]) for (const lenM of [1, 8, 20]) grid.push({ csL, arrivalH, arrivalM, lenM, deadline: 12 });

  it('every frame is a clean caption, and the summary says "No inversion" exactly when H never waited, and "met" or "missed" by the slack', () => {
    expect(grid).toHaveLength(144);
    for (const variant of ['generic', 'pathfinder'] as const) {
      for (const s of grid) {
        for (const protocol of PROTOCOLS) {
          const sch = schedule(s, { protocol, watchdog: variant === 'pathfinder' ? DEFAULT_WATCHDOG : null });
          const v = verdictOf(sch);
          const label = `${variant} ${protocol} ${JSON.stringify(s)}`;
          schedFrames(sch, variant, variant === 'generic').forEach((f) => f.say && text(f.say));
          const said = text(summaryOf(sch, variant, v, variant === 'generic'));
          if (v.resetAt !== null) expect(said, label).toContain('watchdog reset the system');
          else if (v.noInversion) expect(said.includes('No inversion in this scenario'), label).toBe(true);
          else if (variant === 'generic') expect(said.includes(v.slack! >= 0 ? 'met' : 'missed'), label).toBe(true);
          expect(said.includes('No inversion in this scenario'), label).toBe(v.noInversion && v.resetAt === null);
        }
      }
    }
  });

  it('the milestones sit on the ticks where their events happened: the block, the inheritance, the unlock and the finish', () => {
    for (const protocol of PROTOCOLS) {
      const sch = run(protocol);
      const marks = milestonesOf(sch, 'generic').map((m) => ({ t: m.t, said: text(m.say) }));
      const blocked = marks.find((m) => m.said.includes('is blocked'));
      const firstBlock = sch.ticks.find((r) => r.events.some((e) => e.kind === 'block'));
      if (firstBlock) expect(blocked?.t).toBe(firstBlock.t);
      else expect(blocked).toBeUndefined();
      const inherited = marks.find((m) => m.said.includes('runs at priority'));
      expect(Boolean(inherited)).toBe(protocol === 'inheritance');
      const unlock = marks.find((m) => m.said.includes('unlocks R'));
      expect(unlock?.t).toBe(sch.ticks.find((r) => r.events.some((e) => e.kind === 'unlock' && e.task === 'L'))!.t);
      expect(marks.find((m) => m.said.includes('finishes at tick'))?.t).toBe(sch.finish.H);
      expect(marks.some((m) => m.said.includes('the inversion'))).toBe(protocol === 'none');
    }
  });

  it('the watchdog milestone sits at the reset tick and appears only when the system reset', () => {
    const dog = run('none', {}, DEFAULT_WATCHDOG);
    const reset = milestonesOf(dog, 'pathfinder').find((m) => text(m.say).includes('watchdog resets the system'));
    expect(reset?.t).toBe(dog.resetAt);
    expect(milestonesOf(run('inheritance', {}, DEFAULT_WATCHDOG), 'pathfinder').some((m) => text(m.say).includes('watchdog'))).toBe(false);
  });
});

describe('the timeline', () => {
  it('draws the red inversion bars exactly where the inversion window is, a violet ring on the lock holder, and the labels "L as 3" while raised', () => {
    const sch = run('inheritance');
    const bars = barsOf(sch, 'generic');
    expect(bars.filter((b) => b.lane === 'L' && b.label === 'L as 3').length).toBeGreaterThan(0);
    expect(bars.filter((b) => b.ring === 'violet').every((b) => b.lane === 'L' || b.lane === 'H')).toBe(true);
    const none = run('none');
    const window = barsOf(none, 'generic').filter((b) => b.lane === WINDOW_LANE).map((b): [number, number] => [b.start, b.end]);
    expect(window).toEqual(runsOf(inversionWindow(none)));
    expect(window).toEqual([[4, 12]]);
    expect(barsOf(run('inheritance'), 'generic').filter((b) => b.lane === WINDOW_LANE)).toHaveLength(0);
  });

  it('colours H\'s waiting orange, dashed when blocked and hatched when held back, and everyone else\'s waiting dim', () => {
    const none = barsOf(run('none'), 'generic');
    expect(none.filter((b) => b.lane === 'H' && b.kind === 'blocked').every((b) => b.tone === 'orange')).toBe(true);
    expect(none.filter((b) => b.lane === 'L' && b.kind === 'wait').every((b) => b.tone === 'dim')).toBe(true);
    const ceiling = barsOf(run('ceiling'), 'generic');
    expect(ceiling.filter((b) => b.lane === 'H' && b.kind === 'wait').length).toBe(1);
    expect(ceiling.some((b) => b.lane === 'H' && b.kind === 'blocked')).toBe(false);
  });

  it('the deadline marker is green when H met it and red when it did not, and the Pathfinder scene has none', () => {
    expect(markersOf(run('inheritance'), true)[0].tone).toBe('ok');
    expect(markersOf(run('none'), true)[0].tone).toBe('bad');
    expect(markersOf(run('none'), false)).toEqual([]);
  });

  it('the lanes are named by the scene: H, M, L, or the Pathfinder\'s own task names, and always the window lane', () => {
    expect(lanesOf('generic').map((l) => l.label)).toEqual(['H (3)', 'M (2)', 'L (1)', 'inversion window']);
    expect(lanesOf('pathfinder').map((l) => l.label)).toEqual(['bus management (3)', 'communications (2)', 'meteorological data (1)', 'inversion window']);
    expect(NAMES.pathfinder.H).toBe('bus management');
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('the deadline does not move the schedule, and a watchdog that is off never resets', () => {
    for (const protocol of PROTOCOLS) {
      const a = run(protocol, { deadline: 1 });
      const b = run(protocol, { deadline: 40 });
      expect(a.ticks).toEqual(b.ticks);
      expect(a.finish).toEqual(b.finish);
      expect(a.resetAt).toBeNull();
    }
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('priority-inversion');
    expect(elements.map((e) => e.component)).toEqual(['SchedScene', 'SchedScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });

  it('each scene opens on its documented state, as a pure function, and visiting every scene twice changes nothing', () => {
    const walk = () => Object.values(SCENE_OPENINGS).map((open) => open());
    expect(walk()).toEqual(walk());
    expect(openingOf('generic')).not.toBe(openingOf('generic'));
    expect(openingOf('generic').scenario).not.toBe(openingOf('generic').scenario);
    for (const variant of ['generic', 'pathfinder'] as const) expect(openingOf(variant)).toMatchObject({ protocol: 'none', fromSeed: null });
  });
});
