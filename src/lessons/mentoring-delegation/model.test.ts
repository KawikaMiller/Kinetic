import { describe, expect, it } from 'vitest';
import {
  CAPACITY_HOURS, CONTEXTS, DEFAULT_PRESET, LEVEL_MAX, PRESETS, TASKS, TEAM, WEEKS, WORK, bandOf, chanceDone, hoursSummary, payback, quadrantOf, simulate, startPlacement,
  type Context, type Plan,
} from './model';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const ARRIVALS_PER_WEEK = TASKS.length;

/** A plan with every assignee and level combination the board can reach, for the invariants. */
function varied(seed: number): Plan {
  const who = ['me', 'none', ...TEAM.map((p) => p.id)];
  const assignments = Object.fromEntries(TASKS.map((t, i) => [t.id, who[(seed * 7 + i * 3) % who.length]]));
  return { assignments, level: seed % (LEVEL_MAX + 1), context: CONTEXTS[seed % CONTEXTS.length].value };
}

describe('time and task conservation', () => {
  it('your hours never exceed 40 in any week on 200 seeds, for every preset and a varied plan', () => {
    for (const seed of SEEDS) {
      for (const plan of [...PRESETS.map((p) => p.plan), varied(seed)]) {
        for (const w of simulate(plan, seed).weeks) {
          expect(w.hours).toBeLessThanOrEqual(CAPACITY_HOURS + 1e-9);
          expect(w.hours).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('every arrival is in exactly one place each week: finished, in your queue, in someone\'s queue or never started', () => {
    for (const seed of SEEDS) {
      const plan = varied(seed);
      let finished = 0;
      let unstarted = 0;
      for (const w of simulate(plan, seed).weeks) {
        finished += w.completed;
        unstarted += w.unstarted;
        const waiting = Object.values(w.personQueues).reduce((a, b) => a + b, 0);
        expect(finished + w.queue + waiting + unstarted, `seed ${seed} week ${w.week}`).toBe(ARRIVALS_PER_WEEK * w.week);
      }
    }
  });

  it('skill never decreases, stays within 1 to 5, and never moves on a task that is not a stretch', () => {
    for (const seed of SEEDS) {
      const run = simulate(varied(seed), seed);
      for (const p of TEAM) {
        for (const area of ['services', 'interface'] as const) {
          expect(run.skills[p.id][area]).toBeGreaterThanOrEqual(p.skill[area]);
          expect(run.skills[p.id][area]).toBeLessThanOrEqual(5);
        }
      }
    }
    const beyond = { assignments: { ratelimit: 'cy' }, level: 2, context: 'full' as Context };
    expect(bandOf(4 - 1)).toBe('beyond');
    expect(simulate(beyond, 3).skills.cy.services).toBe(1);
  });
});

describe('what the model claims', () => {
  it('the first week of "do everything myself" matches a hand-worked FIFO of 4 hours per complexity point', () => {
    // flaky 8 + ratelimit 16 + settings 12 = 36, then 4 of forms' 16 hours: 3 finish, 3 are left (forms 12 left, report, empty).
    const week1 = simulate(PRESETS[0].plan, 1).weeks[0];
    expect([week1.hours, week1.completed, week1.queue]).toEqual([40, 3, 3]);
  });

  it('everything myself overflows (queue past 3 and growing) while throughput stays at 2 to 4 a week, on 200 seeds', () => {
    for (const seed of SEEDS) {
      const weeks = simulate(PRESETS[0].plan, seed).weeks;
      expect(weeks[WEEKS - 1].queue).toBeGreaterThan(weeks[0].queue);
      expect(weeks[WEEKS - 1].queue).toBeGreaterThan(3);
      expect(Math.max(...weeks.map((w) => w.completed))).toBeLessThanOrEqual(4);
    }
  });

  it('with the same assignment, less context never bounces fewer tasks: none >= brief >= full on every seed', () => {
    for (const seed of SEEDS) {
      const bounced = (context: Context) => simulate({ ...DEFAULT_PRESET.plan, context }, seed).totals.bounced;
      expect(bounced('none')).toBeGreaterThanOrEqual(bounced('brief'));
      expect(bounced('brief')).toBeGreaterThanOrEqual(bounced('full'));
    }
    const total = (context: Context) => SEEDS.reduce((s, seed) => s + simulate({ ...DEFAULT_PRESET.plan, context }, seed).totals.bounced, 0);
    expect(total('none')).toBeGreaterThan(total('brief'));
  });

  it('the chance of coming back done follows the band table, hand-worked for Cy on the flaky test', () => {
    // stretch 0.55, brief context keeps 0.85, level 4 control boost 0.85 + 0.15 * (2 / 6) = 0.9
    expect(chanceDone(1, 2, 4, 'brief')).toBeCloseTo(0.55 * 0.85 * 0.9, 12);
    expect(chanceDone(4, 3, 6, 'none')).toBeCloseTo(0.92 * 0.5 * 0.85, 12);
  });

  it('the pay-back for Cy on the flaky test is hand-worked: 9.57, 8.30, 7.04, 5.78 hours, running total below 8 per repetition at the fourth', () => {
    const pb = payback(TASKS.find((t) => t.id === 'flaky')!, 'cy', 4, 'brief');
    expect(pb.perRep.slice(0, 4).map((r) => r.delegate)).toEqual([
      expect.closeTo(9.567, 2), expect.closeTo(8.305, 2), expect.closeTo(7.043, 2), expect.closeTo(5.781, 2),
    ]);
    expect(pb.perRep[0].self).toBe(8);
    expect(pb.reps).toBe(4);
    // running totals against 8 per repetition: 9.57 > 8, 17.87 > 16, 24.91 > 24, 30.69 < 32
    const cum = pb.perRep.slice(0, 4).reduce<number[]>((acc, r) => [...acc, (acc.at(-1) ?? 0) + r.delegate], []);
    expect(cum.map((c, i) => c < 8 * (i + 1))).toEqual([false, false, false, true]);
  });

  it('a task far above someone never pays back and does not grow them', () => {
    expect(payback(TASKS.find((t) => t.id === 'ratelimit')!, 'cy', 2, 'brief').reps).toBeNull();
    expect(payback(TASKS.find((t) => t.id === 'forms')!, 'ana', 2, 'brief').reps).toBeNull();
  });

  it('bands follow the gap thresholds', () => {
    expect([-2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5].map(bandOf)).toEqual(['easy', 'easy', 'matched', 'matched', 'stretch', 'stretch', 'hard', 'hard', 'beyond']);
  });
});

describe('what to delegate', () => {
  it('the default placement moves 21 hours (a hand sum), returns 15.75 and keeps 14', () => {
    // unique below 5: on-call 6, routine reviews 5, status report 3, dependency upgrades 4, wiki pages 3
    const h = hoursSummary(startPlacement());
    expect([h.moved, h.returned, h.kept, h.added]).toEqual([21, 15.75, 14, 21]);
    expect(h.moved + h.kept).toBe(WORK.reduce((s, w) => s + w.hoursPerWeek, 0));
  });

  it('quadrants split at 5 and 5', () => {
    expect(quadrantOf(9, 9)).toBe('keep');
    expect(quadrantOf(9, 1)).toBe('delegate-coach');
    expect(quadrantOf(1, 9)).toBe('question');
    expect(quadrantOf(1, 1)).toBe('delegate-or-drop');
    expect(quadrantOf(5, 5)).toBe('keep');
  });
});
