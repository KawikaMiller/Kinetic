import { describe, expect, it } from 'vitest';
import { choose, enumeratePaths, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { calibrationCaption, coneCaption, sumCaption, talkCaption, threePointCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import {
  CORRELATION, MAX_TASKS, MIN_TASKS, QUANTITIES, RUNS, SPREAD, STATISTICS, SUM_DEFAULT, THREE_POINT_DEFAULT, checkOrder, chanceBy, independentSd, outcomePoints,
  outsideCone, readGuess, scoreCalibration, simulateTotal, statisticOf, sumFacts, sumSpec, threePointResult,
} from './model';
import { OPENING } from './opening';
import { MANAGER, METER, RISK, SLACK, STORY, TRUST } from './scenario';
import { mulberry32 } from '../../core/random';
import { normal } from '../../core/distributions';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('estimation');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('estimation')).toEqual([]);
  });

  it('every scene opens on one fixed state, equal to the documented defaults', () => {
    expect(OPENING.scene).toBe('cone');
    expect(OPENING.cone.show).toBe('none');
    expect(OPENING.sum).toMatchObject({ n: 8, sigma: 0.6, rho: 0, statistic: 'mode', deadline: 36 });
    expect(OPENING.three).toEqual({ optimistic: '3', likely: '5', pessimistic: '13' });
    const a = OPENING.calibration.guesses();
    expect(a).toEqual(OPENING.calibration.guesses());
    expect(a.every((g) => g.low === '' && g.high === '')).toBe(true);
    expect(OPENING.calibration.scored).toBe(false);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: bands 16 and 1.22 times wide; the flat model leaves 34 of 60 outside, the cone model 0', () => {
    expect([FACTS.conceptRatio, FACTS.detailedRatio]).toEqual(['16', '1.22']);
    expect([FACTS.flatOutside, FACTS.points, FACTS.coneOutside]).toEqual([34, 60, 0]);
    expect(outsideCone(outcomePoints('flat'))).toBe(34);
    expect(lesson.tryThis[0]).toContain('34 of 60 invented outcomes fall outside their band');
  });

  it('try-this 2: the sum of modes is day 25.1 (1%), of medians day 36 (27%), P50 at 41.5, and the spread goes from 11 to 25.8 days at rho 0.8', () => {
    const spec = sumSpec(OPENING.sum.n, OPENING.sum.sigma, OPENING.sum.rho, OPENING.sum.seed);
    const run = simulateTotal(spec);
    const f = sumFacts(spec, run);
    expect([f.sumModes.toFixed(1), f.sumMedians]).toEqual(['25.1', 36]);
    expect(Math.round(chanceBy(run, f.sumModes) * 100)).toBe(1);
    expect(Math.round(chanceBy(run, f.sumMedians) * 100)).toBe(27);
    expect(f.p50.toFixed(1)).toBe('41.5');
    const base = sumSpec(SUM_DEFAULT.n, SUM_DEFAULT.sigma, 0, SUM_DEFAULT.seed);
    expect(simulateTotal(base).sd.toFixed(1)).toBe('11.0');
    expect(simulateTotal({ ...base, rho: 0.8 }).sd.toFixed(1)).toBe('25.8');
    expect(Math.round((0.8 - CORRELATION.min) / CORRELATION.step)).toBe(8);
    expect(lesson.tryThis[1]).toContain('the spread becomes 25.8 days');
    expect(lesson.tryThis[1]).toContain('day 25.1 and 1% of the runs');
    expect(lesson.tryThis[1]).toContain('day 36 and 27% finish by it, while P50 is day 41.5');
  });

  it('try-this 3: PERT mean 6 vs fitted 6.9 at 3, 5, 13; a pessimistic of 2 is refused naming most likely', () => {
    const r = threePointResult(THREE_POINT_DEFAULT);
    expect([r.pert.mean, Number(r.fit.mean.toFixed(1))]).toEqual([6, 6.9]);
    expect(checkOrder({ ...THREE_POINT_DEFAULT, pessimistic: 2 })).toContain('Most likely (5) is larger than pessimistic (2)');
    expect(lesson.tryThis[2]).toContain('mean of 6 days and the fitted log-normal 6.9');
  });

  it('try-this 4: 1,000,000 to 1,100,000 holds the 1,048,576 bytes in a MiB, 1 of 1', () => {
    const row = readGuess({ low: '1,000,000', high: '1,100,000' }, QUANTITIES[0].value);
    expect(row).toMatchObject({ kind: 'answered', hit: true });
    const s = scoreCalibration([row]);
    expect([s.hits, s.answered]).toEqual([1, 1]);
    expect(lesson.tryThis[3]).toContain('1,048,576');
  });

  it('try-this 5: one date reads 57% risk and 0 slack, a range 21%', () => {
    const one = choose(MANAGER, startWalk(MANAGER), 'one-date');
    expect([one.meters[METER.risk], one.meters[METER.slack]]).toEqual([57, 0]);
    expect(choose(MANAGER, startWalk(MANAGER), 'range').meters[METER.risk]).toBe(21);
    expect(lesson.tryThis[4]).toContain('57% and slack reads 0 days');
    expect(lesson.tryThis[4]).toContain('reads 21%');
  });
});

describe('captions across the control cross product', () => {
  it('the summing caption is clean for every task count, statistic and shared-cause extreme', () => {
    for (let n = MIN_TASKS; n <= MAX_TASKS; n += 5) {
      for (const sigma of [SPREAD.min, SPREAD.max]) {
        for (const rho of [CORRELATION.min, CORRELATION.max]) {
          const spec = sumSpec(n, sigma, rho, 7);
          const run = simulateTotal(spec);
          const facts = sumFacts(spec, run);
          for (const stat of STATISTICS) {
            const yours = spec.medians.reduce((acc, m) => acc + statisticOf(stat.value, m, sigma), 0);
            const text = expectCaption(sumCaption(spec, facts, run, stat.value, yours, 36, independentSd(spec.medians, sigma)));
            expect(text).not.toMatch(NO_JUNK);
            expect(text).toContain(`Adding the ${n}`);
            expect(text).toContain(`${Math.round(chanceBy(run, yours) * 100)}% of the ${RUNS.toLocaleString('en-US')}`);
          }
        }
      }
    }
  });

  it('the cone, three-point, calibration and talk captions are clean in every state', () => {
    expect(expectCaption(coneCaption(null))).not.toMatch(NO_JUNK);
    expect(expectCaption(coneCaption(outcomePoints('flat')))).toContain('34 of 60 invented outcomes');
    expect(expectCaption(threePointCaption(threePointResult(THREE_POINT_DEFAULT), null))).toContain('mean of 6 days');
    expect(expectCaption(threePointCaption(null, 'Optimistic (6) is larger than most likely (5).'))).toContain('Optimistic (6)');
    const rows = QUANTITIES.map(() => readGuess({ low: '', high: '' }, 1));
    expect(expectCaption(calibrationCaption(scoreCalibration(rows), false, 8))).toContain('none answered');
    const scored = scoreCalibration([readGuess({ low: '1', high: '9' }, 5), readGuess({ low: '6', high: '9' }, 5)]);
    expect(expectCaption(calibrationCaption(scored, true, 8))).toContain('1 of 2 ranges contained the true value');
    const w = choose(MANAGER, startWalk(MANAGER), 'one-date');
    expect(expectCaption(talkCaption(MANAGER, w))).toContain('a 57% chance of missing the planned day');
    expect(expectCaption(talkCaption(MANAGER, startWalk(MANAGER)))).not.toMatch(NO_JUNK);
  });
});

describe('the conversation', () => {
  it('validates, reaches all four endings, and keeps every meter in bounds on all 16 paths', () => {
    expect(validateScenario(MANAGER)).toEqual([]);
    const paths = enumeratePaths(MANAGER);
    expect(paths).toHaveLength(16);
    expect(new Set(paths.map((p) => p.endingId)).size).toBe(MANAGER.endings.length);
  });

  it('schedule risk matches an independent Monte Carlo of the same story within 3 points', () => {
    const rnd = mulberry32(99);
    const medians = [3, 5, 2, 8, 4, 6, 3, 5];
    const totals = Array.from({ length: 40_000 }, () => {
      const shared = normal(rnd);
      return medians.reduce((acc, m) => acc + Math.exp(Math.log(m) + STORY.sigma * (Math.sqrt(STORY.rho) * shared + Math.sqrt(1 - STORY.rho) * normal(rnd))), 0);
    });
    const miss = (day: number) => (100 * totals.filter((t) => t > day).length) / totals.length;
    expect(Math.abs(miss(36) - RISK.date)).toBeLessThan(3);
    expect(Math.abs(miss(STORY.hopeDay) - RISK.unknowable)).toBeLessThan(3);
  });

  it('the story is pinned to named constants, so scene 2 sliders cannot move it', () => {
    expect(STORY).toMatchObject({ n: 8, sigma: 0.6, rho: 0.5 });
    expect(SLACK.date).toBe(0);
    expect(SLACK.range).toBeGreaterThan(SLACK.scope);
  });

  it('no first answer is at least as good as another on trust, risk and slack at once', () => {
    const first = MANAGER.nodes[0].choices.map((c) => ({ id: c.id, trust: c.effects![METER.trust], risk: -c.effects![METER.risk], slack: c.effects![METER.slack] }));
    for (const a of first) {
      for (const b of first) {
        if (a.id === b.id) continue;
        const dominates = a.trust >= b.trust && a.risk >= b.risk && a.slack >= b.slack;
        expect(dominates, `${a.id} dominates ${b.id}`).toBe(false);
      }
    }
    expect(first.map((f) => f.trust)).toContain(TRUST.date);
  });

  it('each choice\'s explanation quotes the numbers its effects carry', () => {
    for (const c of MANAGER.nodes[0].choices) {
      const risk = c.effects![METER.risk];
      expect(c.because).toContain(String(risk));
    }
  });
});
