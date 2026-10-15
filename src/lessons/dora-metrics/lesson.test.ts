import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { hours, logCaption, logClock, minutes, perWeek, pipelineCaption } from './frames';
import lesson from './index';
import {
  DEFINITIONS_DEFAULT, FAILURE_DEFS, LEAD_STARTS, LOG_SEED, PIPELINE_DEFAULT, QA_GATE_HOURS, RESTORE_ENDS, SCENE1_SEED, SPLIT_FACTOR, GAMING_OPTIONS, leadTimeLabel,
  logMetrics, makeLog, reportedMetrics, runDelivery, type Definitions, type Pipeline,
} from './model';
import { pctText, sig } from '../../core/format';

const text = expectCaption;
const real = (over: Partial<Pipeline> = {}) => runDelivery({ ...PIPELINE_DEFAULT, ...over }, SCENE1_SEED);
const log = makeLog(LOG_SEED);
const at = (over: Partial<Definitions>) => logMetrics(log, { ...DEFINITIONS_DEFAULT, ...over });

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the defaults give the four numbers the text quotes, and the caption quotes the same ones', () => {
    const m = real();
    const c = text(pipelineCaption(PIPELINE_DEFAULT, m, reportedMetrics(m, 'none'), 'none'));
    expect(c).toContain(`${sig(m.deploymentsPerWeek)} releases a week`);
    expect(c).toContain(`a median ${hours(m.leadHoursMedian!)} from merge to live`);
    expect(c).toContain(`${pctText(m.failureRate!, 0)} of releases failing`);
    expect(lesson.tryThis[0]).toContain(perWeek(m.deploymentsPerWeek));
    expect(lesson.tryThis[0]).toContain(hours(m.leadHoursMedian!));
    expect(lesson.tryThis[0]).toContain(pctText(m.failureRate!, 0));
    expect(m.restoreMedianMin === null || m.restoreMedianMin === 90).toBe(true);
  });

  it('try-this 2: with a batch of 1 all four numbers are better than at the defaults', () => {
    const big = real();
    const one = real({ batch: 1 });
    expect(one.deploymentsPerWeek).toBeGreaterThan(big.deploymentsPerWeek);
    expect(one.leadHoursMedian!).toBeLessThan(big.leadHoursMedian!);
    expect(one.failureRate!).toBeLessThan(big.failureRate!);
    expect(one.restoreMedianMin!).toBeLessThan(big.restoreMedianMin!);
    expect(one.restoreMedianMin).toBe(30);
    expect(lesson.tryThis[1]).toContain(`${minutes(30)}`);
  });

  it('try-this 3: switching the QA gate off lowers the median lead time by exactly 16 working hours', () => {
    const withQa = real();
    const without = real({ manualQa: false });
    expect(withQa.leadHoursMedian! - without.leadHoursMedian!).toBeCloseTo(QA_GATE_HOURS, 9);
    expect(lesson.tryThis[2]).toContain(`${QA_GATE_HOURS} working hours`);
  });

  it('try-this 4: splitting each change into five deploys reads 5× the frequency and the same lead time', () => {
    const m = real();
    const shown = reportedMetrics(m, 'split');
    expect(shown.deploymentsPerWeek).toBeCloseTo(SPLIT_FACTOR * m.deploymentsPerWeek, 12);
    expect(shown.leadHoursMedian).toBe(m.leadHoursMedian);
    const c = text(pipelineCaption(PIPELINE_DEFAULT, m, shown, 'split'));
    expect(c).toContain(`reports ${perWeek(shown.deploymentsPerWeek)}`);
    expect(c).toContain(`stays ${hours(m.leadHoursMedian!)}`);
    expect(lesson.tryThis[3]).toContain(perWeek(shown.deploymentsPerWeek));
  });

  it('try-this 5: from the first commit the median is longer than from the merge, and an incident definition gives 6 failures against 3 rollbacks', () => {
    expect(DEFINITIONS_DEFAULT).toEqual({ leadStart: 'merge', failure: 'rollback', restoreEnd: 'restored' });
    expect(at({ leadStart: 'commit' }).leadMedian).toBeGreaterThan(at({}).leadMedian);
    expect(at({}).failures).toBe(3);
    expect(at({ failure: 'incident' }).failures).toBe(6);
    expect(lesson.tryThis[4]).toContain(`${hours(at({}).leadMedian)} to ${hours(at({ leadStart: 'commit' }).leadMedian)}`);
    expect(lesson.tryThis[4]).toContain('3 failures become 6');
  });
});

describe('captions are computed from the model', () => {
  it('the pipeline caption quotes the same four numbers for every release rule, QA, automation, rollback-first and gaming setting', () => {
    for (const mode of ['batch', 'train'] as const) {
      for (const manualQa of [false, true]) {
        for (const automation of [0, 1]) {
          for (const rollbackFirst of [false, true]) {
            for (const gaming of GAMING_OPTIONS) {
              for (const [batch, changesPerDay] of [[1, 1], [30, 1], [8, 20]]) {
                const p: Pipeline = { ...PIPELINE_DEFAULT, mode, batch, changesPerDay, manualQa, automation, rollbackFirst };
                const m = runDelivery(p, 2);
                const shown = reportedMetrics(m, gaming);
                const c = text(pipelineCaption(p, m, shown, gaming));
                const label = JSON.stringify({ mode, manualQa, automation, rollbackFirst, gaming, batch, changesPerDay });
                expect(c, label).toContain(`${sig(m.deploymentsPerWeek)} releases a week`);
                if (m.leadHoursMedian !== null) expect(c, label).toContain(`a median ${hours(m.leadHoursMedian)} from merge to live`);
                else expect(c, label).toContain('no release yet');
                if (m.failureRate !== null) expect(c, label).toContain(`${pctText(m.failureRate, 0)} of releases failing`);
                expect(c.includes('nothing to restore from'), label).toBe(m.restoreMedianMin === null);
                if (m.restoreMedianMin !== null) expect(c, label).toContain(`a median ${minutes(m.restoreMedianMin)} to restore`);
                expect(c.includes('Splitting each change'), label).toBe(gaming === 'split');
                expect(c.includes('Counting only rollbacks') && m.failureRate !== null, label).toBe(gaming === 'rollbacks-only' && m.failureRate !== null);
              }
            }
          }
        }
      }
    }
  });

  it('the log caption quotes the median, the mean, the skew, the failures and the restore time for every combination of definitions', () => {
    for (const leadStart of LEAD_STARTS) {
      for (const failure of FAILURE_DEFS) {
        for (const restoreEnd of RESTORE_ENDS) {
          const d: Definitions = { leadStart, failure, restoreEnd };
          const m = logMetrics(log, d);
          const c = text(logCaption(m, d));
          expect(c).toContain(`lead time (${leadTimeLabel(leadStart)}) has a median of ${hours(m.leadMedian)} and a mean of ${hours(m.leadMean)}`);
          expect(c).toContain(`${m.failures} of 50`);
          expect(c).toContain(`${pctText(m.failureRate, 0)}`);
          expect(c).toContain(`median ${minutes(m.restoreMedian!)}, mean ${minutes(m.restoreMean!)}`);
          expect(c.includes('pull the mean up')).toBe(m.leadMean / m.leadMedian > 1.05);
        }
      }
    }
  });

  it('the log caption on a log with no failure says there is nothing to restore, never a 0 or a NaN', () => {
    const clean = log.map((d) => ({ ...d, outcome: 'ok' as const, incident: false, restoredMin: null, fixHours: null }));
    const m = logMetrics(clean, DEFINITIONS_DEFAULT);
    const c = text(logCaption(m, DEFINITIONS_DEFAULT));
    expect(c).toContain('There is no failure, so there is no time to restore');
    expect(c).not.toContain('NaN');
  });

  it('the clock labels are "Mon 09:00"-style in UTC, from the log\'s own start', () => {
    expect(logClock(0)).toBe('Mon 00:00');
    expect(logClock(33)).toBe('Tue 09:00');
    expect(logClock(168 + 9)).toBe('Mon 09:00');
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q2: splitting changes the count only: failure rate, lead time and restore time are untouched, by the same function the pipeline caption uses', () => {
    const m = real();
    const shown = reportedMetrics(m, 'split');
    expect(shown.failureRate).toBe(m.failureRate);
    expect(shown.leadHoursMedian).toBe(m.leadHoursMedian);
    expect(shown.restoreMedianMin).toBe(m.restoreMedianMin);
    expect(shown.deploymentsPerWeek).not.toBe(m.deploymentsPerWeek);
  });

  it('Q3: counting only rollbacks lowers the rate while the same failures happen', () => {
    const m = real();
    const shown = reportedMetrics(m, 'rollbacks-only');
    expect(m.failures).toBeGreaterThan(m.rollbacks);
    expect(shown.failureRate!).toBeLessThan(m.failureRate!);
    expect(m.failures).toBe(real().failures);
  });

  it('Q4: commit precedes PR precedes merge in every row, so lead time from the commit is the longest, from the merge the shortest', () => {
    for (const d of log) {
      expect(d.commitAt).toBeLessThan(d.prAt);
      expect(d.prAt).toBeLessThan(d.mergeAt);
    }
    expect(at({ leadStart: 'commit' }).leadMedian).toBeGreaterThan(at({ leadStart: 'pr' }).leadMedian);
    expect(at({ leadStart: 'pr' }).leadMedian).toBeGreaterThan(at({ leadStart: 'merge' }).leadMedian);
    expect(at({ leadStart: 'commit' }).leadMean).toBeGreaterThan(at({ leadStart: 'merge' }).leadMean);
  });

  it('Q1: different failure definitions give different rates on one log, so one team\'s number depends on its definition', () => {
    const rates = FAILURE_DEFS.map((failure) => at({ failure }).failureRate);
    expect(new Set(rates).size).toBe(3);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('the batch size is read only in batch mode, and the cadence only in train mode', () => {
    expect(real({ mode: 'train', batch: 3 })).toEqual(real({ mode: 'train', batch: 25 }));
    expect(real({ mode: 'batch', cadenceDays: 1 })).toEqual(real({ mode: 'batch', cadenceDays: 9 }));
    expect(real({ mode: 'batch', batch: 3 }).deploymentsPerWeek).not.toBe(real({ mode: 'batch', batch: 25 }).deploymentsPerWeek);
  });

  it('the gaming choice moves only the reported numbers, never the pipeline run', () => {
    const m = real();
    for (let repeat = 0; repeat < GAMING_OPTIONS.length; repeat++) expect(real()).toEqual(m);
    expect(reportedMetrics(m, 'none').deploymentsPerWeek).toBe(m.deploymentsPerWeek);
  });

  it('the log scene\'s week selector shows deploys, never changes them: the table and the four weeks hold the same 50 rows', () => {
    expect(makeLog(LOG_SEED)).toEqual(log);
    expect(log).toHaveLength(50);
  });
});
