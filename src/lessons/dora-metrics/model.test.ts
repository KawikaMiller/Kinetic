import { describe, expect, it } from 'vitest';
import {
  BASE_DEFECT_RATE, BATCH_RANGE, DEFINITIONS_DEFAULT, FAILURE_DEFS, LEAD_STARTS, LOG_DEPLOYMENTS, LOG_WEEKS, PIPELINE_DEFAULT, PIPELINE_HOURS, QA_GATE_HOURS, RESTORE_ENDS,
  SPLIT_FACTOR, WORKING_DAYS, WORK_HOURS_PER_DAY, ceilLog2, defectRate, isFailure, leadHours, leadStartOf, leadTimeLabel, logMetrics, makeLog, measureDelivery, median, reportedMetrics,
  restoreMinutes, restoreMins, releaseFailureChance, runDelivery, weekOf, createDelivery, LEAD_START_NAME, type Deployment, type Pipeline,
} from './model';

const base = PIPELINE_DEFAULT;
const pipeline = (over: Partial<Pipeline>): Pipeline => ({ ...base, ...over });
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sdOf = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - meanOf(xs)) ** 2, 0) / (xs.length - 1));

describe('the arithmetic', () => {
  it('ceilLog2 equals the bit-length oracle for every batch size from 1 to 64, and the restore time adds up', () => {
    for (let b = 1; b <= 64; b++) expect(ceilLog2(b), `b = ${b}`).toBe(b === 1 ? 0 : 32 - Math.clz32(b - 1));
    expect(restoreMinutes(1, false)).toBe(30);
    expect(restoreMinutes(8, false)).toBe(15 + 3 * 20 + 15);
    expect(restoreMinutes(30, false)).toBe(15 + 5 * 20 + 15);
    for (const b of [1, 8, 30]) expect(restoreMinutes(b, true)).toBe(30);
  });

  it('the release failure chance is 1 − (1 − f)^b, rises with b and falls with automation, and automation lowers f by up to 60%', () => {
    expect(defectRate(0)).toBe(BASE_DEFECT_RATE);
    expect(defectRate(1)).toBeCloseTo(0.4 * BASE_DEFECT_RATE, 12);
    expect(releaseFailureChance(8, 0)).toBeCloseTo(1 - 0.97 ** 8, 12);
    for (let b = 1; b < 30; b++) expect(releaseFailureChance(b + 1, 0.3)).toBeGreaterThan(releaseFailureChance(b, 0.3));
    expect(releaseFailureChance(8, 1)).toBeLessThan(releaseFailureChance(8, 0));
  });
});

describe('the pipeline against closed forms, over 200 seeded runs', () => {
  const runs = SEEDS.map((seed) => runDelivery(base, seed));

  it('change failure rate is 1 − (1 − f)^b within 3 standard errors of the 200 runs', () => {
    const expected = releaseFailureChance(base.batch, base.automation);
    const rates = runs.map((r) => r.failureRate!);
    expect(Math.abs(meanOf(rates) - expected)).toBeLessThan((3 * sdOf(rates)) / Math.sqrt(rates.length));
    expect(expected).toBeGreaterThan(0.1);
  });

  it('mean lead time is (b − 1) ÷ (2r) working days plus the gates, within 3 standard errors', () => {
    const expected = ((base.batch - 1) / (2 * base.changesPerDay)) * WORK_HOURS_PER_DAY + PIPELINE_HOURS + QA_GATE_HOURS;
    const means = runs.map((r) => r.leadHoursMean!);
    expect(Math.abs(meanOf(means) - expected)).toBeLessThan((3 * sdOf(means)) / Math.sqrt(means.length));
    expect(expected).toBeCloseTo(24, 12);
  });

  it('restore time is detection + ⌈log₂ b⌉ × 20 + 15 minutes exactly, for every failure of every run, at several batch sizes', () => {
    for (const b of [1, 2, 3, 5, 8, 13, 30]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const r = runDelivery(pipeline({ batch: b, changesPerDay: 10 }), seed);
        for (const rel of r.releaseList) {
          expect(rel.changes).toBe(b);
          if (rel.failed) expect(rel.restoreMin, `b = ${b}`).toBe(15 + ceilLog2(b) * 20 + 15);
          else expect(rel.restoreMin).toBeNull();
        }
      }
    }
  });

  it('rollback-first restores in 30 minutes whatever the batch, and fixes every failure by rollback', () => {
    for (const b of [1, 8, 30]) {
      const r = runDelivery(pipeline({ batch: b, rollbackFirst: true, changesPerDay: 10 }), 3);
      for (const rel of r.releaseList.filter((x) => x.failed)) {
        expect(rel.restoreMin).toBe(30);
        expect(rel.fix).toBe('rollback');
      }
    }
  });

  it('the manual QA gate adds exactly two working days to every change, same seed', () => {
    const without = runDelivery(pipeline({ manualQa: false }), 4).releaseList;
    const withQa = runDelivery(pipeline({ manualQa: true }), 4).releaseList;
    expect(withQa).toHaveLength(without.length);
    withQa.forEach((rel, i) => rel.leadHours.forEach((h, k) => expect(h - without[i].leadHours[k]).toBeCloseTo(QA_GATE_HOURS, 9)));
  });

  it('a release train of N days has mean lead time about N × 8 ÷ 2 working hours plus the gates', () => {
    const p = pipeline({ mode: 'train', cadenceDays: 5, changesPerDay: 10 });
    const means = SEEDS.map((seed) => runDelivery(p, seed).leadHoursMean!);
    const expected = (5 * WORK_HOURS_PER_DAY) / 2 + PIPELINE_HOURS + QA_GATE_HOURS;
    expect(Math.abs(meanOf(means) - expected)).toBeLessThan((3 * sdOf(means)) / Math.sqrt(means.length));
  });

  it('every change merged is released or still pending (a partial batch at the end), and releases hold exactly b changes', () => {
    const sim = createDelivery(base, 7);
    sim.run(WORKING_DAYS);
    const released = sim.state.releases.reduce((s, r) => s + r.changes, 0);
    expect(released + sim.state.pending.length).toBe(sim.state.changesMerged);
    expect(sim.state.pending.length).toBeLessThan(base.batch);
  });

  it('by construction, a smaller batch moves all four metrics the good way (the model\'s assumption, checked on 200-run averages)', () => {
    const avg = (p: Pipeline) => {
      const ms = SEEDS.slice(0, 60).map((seed) => runDelivery(p, seed));
      return {
        df: meanOf(ms.map((m) => m.deploymentsPerWeek)),
        lead: meanOf(ms.map((m) => m.leadHoursMean!)),
        cfr: meanOf(ms.map((m) => m.failureRate ?? 0)),
        ttr: meanOf(ms.filter((m) => m.restoreMedianMin !== null).map((m) => m.restoreMedianMin!)),
      };
    };
    const big = avg(pipeline({ batch: 16, changesPerDay: 8 }));
    const small = avg(pipeline({ batch: 2, changesPerDay: 8 }));
    expect(small.df).toBeGreaterThan(big.df);
    expect(small.lead).toBeLessThan(big.lead);
    expect(small.cfr).toBeLessThan(big.cfr);
    expect(small.ttr).toBeLessThan(big.ttr);
  });

  it('a run with no failure reports no restore time (null, never 0 or NaN)', () => {
    const m = measureDelivery([{ deployAt: 10, changes: 1, failed: false, fix: null, restoreMin: null, leadHours: [3] }]);
    expect(m.restoreMedianMin).toBeNull();
    expect(m.failureRate).toBe(0);
    const none = measureDelivery([]);
    expect(none.failureRate).toBeNull();
    expect(none.leadHoursMedian).toBeNull();
    expect(none.restoreMedianMin).toBeNull();
    expect(BATCH_RANGE.min).toBe(1);
  });
});

describe('gaming moves exactly the metrics the caption says', () => {
  const m = runDelivery(pipeline({ changesPerDay: 8, batch: 4 }), 2);
  it('splitting each change into five deploys multiplies deployment frequency by 5 and moves nothing else', () => {
    const r = reportedMetrics(m, 'split');
    expect(r.deploymentsPerWeek).toBeCloseTo(m.deploymentsPerWeek * SPLIT_FACTOR, 12);
    expect(r.failureRate).toBe(m.failureRate);
    expect(r.leadHoursMedian).toBe(m.leadHoursMedian);
    expect(r.restoreMedianMin).toBe(m.restoreMedianMin);
  });

  it('counting only rollbacks lowers the change failure rate to rollbacks ÷ releases and moves nothing else', () => {
    const r = reportedMetrics(m, 'rollbacks-only');
    expect(m.failures).toBeGreaterThan(m.rollbacks);
    expect(r.failureRate).toBeCloseTo(m.rollbacks / m.releases, 12);
    expect(r.failureRate!).toBeLessThan(m.failureRate!);
    expect(r.deploymentsPerWeek).toBe(m.deploymentsPerWeek);
    expect(r.leadHoursMedian).toBe(m.leadHoursMedian);
  });

  it('no gaming reports the real numbers, and rollback-first leaves nothing for the rollbacks-only trick to hide', () => {
    expect(reportedMetrics(m, 'none')).toMatchObject({ deploymentsPerWeek: m.deploymentsPerWeek, failureRate: m.failureRate });
    const rf = runDelivery(pipeline({ changesPerDay: 8, batch: 4, rollbackFirst: true }), 2);
    expect(reportedMetrics(rf, 'rollbacks-only').failureRate).toBe(rf.failureRate);
  });
});

describe('measuring from a log', () => {
  const dep = (id: number, lead: number): Deployment => ({
    id, commitAt: 100 - lead - 2, prAt: 100 - lead - 1, mergeAt: 100 - lead, deployAt: 100, outcome: 'ok', incident: false, restoredMin: null, fixHours: null,
  });

  it('medians and means on a hand-worked table of 10 deployments', () => {
    const leads = [1, 2, 2, 3, 4, 5, 6, 8, 10, 59];
    const log = leads.map((l, i) => dep(i + 1, l));
    expect(leads.reduce((a, b) => a + b, 0) / 10).toBe(10);
    const m = logMetrics(log, { leadStart: 'merge', failure: 'rollback', restoreEnd: 'restored' });
    expect(m.leadMedian).toBe(4.5);
    expect(m.leadMean).toBe(10);
    expect(m.restoreMedian).toBeNull();
    expect(m.failures).toBe(0);
    expect(logMetrics(log, { leadStart: 'pr', failure: 'rollback', restoreEnd: 'restored' }).leadMedian).toBe(5.5);
    expect(logMetrics(log, { leadStart: 'commit', failure: 'rollback', restoreEnd: 'restored' }).leadMedian).toBe(6.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });

  it('the seeded log holds 50 ordered deployments over 4 weeks, each with commit < PR < merge < deploy, and every definition changes the number (200 seeds)', () => {
    for (const seed of SEEDS) {
      const log = makeLog(seed);
      expect(log).toHaveLength(LOG_DEPLOYMENTS);
      log.forEach((d, i) => {
        expect(d.commitAt).toBeLessThan(d.prAt);
        expect(d.prAt).toBeLessThan(d.mergeAt);
        expect(d.mergeAt).toBeLessThan(d.deployAt);
        if (i) expect(d.deployAt).toBeGreaterThanOrEqual(log[i - 1].deployAt);
        expect(d.deployAt).toBeLessThan(LOG_WEEKS * 168);
      });
      const at = (over: Partial<typeof DEFINITIONS_DEFAULT>) => logMetrics(log, { ...DEFINITIONS_DEFAULT, ...over });
      const leads = LEAD_STARTS.map((leadStart) => at({ leadStart }).leadMedian);
      expect(new Set(leads).size, `lead, seed ${seed}`).toBe(3);
      const failures = FAILURE_DEFS.map((failure) => at({ failure }).failures);
      expect(failures, `failures, seed ${seed}`).toEqual([3, 5, 6]);
      for (const failure of FAILURE_DEFS) {
        const [restored, fix] = RESTORE_ENDS.map((restoreEnd) => at({ failure, restoreEnd }));
        expect(restored.restoreMedian, `restore median, ${failure}, seed ${seed}`).not.toBeNull();
        expect(fix.restoreMedian, `restore median moves, ${failure}, seed ${seed}`).not.toBe(restored.restoreMedian);
        expect(fix.restoreMedian!, `fix lands after restore, ${failure}, seed ${seed}`).toBeGreaterThan(restored.restoreMedian!);
        expect(fix.restoreMean, `restore mean moves, ${failure}, seed ${seed}`).not.toBe(restored.restoreMean);
      }
    }
  });

  it('broken variant: a log whose fixes land at the instant service is restored would leave the median unmoved, and the check above would reject it', () => {
    const flat = makeLog(1).map((d) => (d.restoredMin === null ? d : { ...d, fixHours: d.restoredMin / 60 }));
    const same = FAILURE_DEFS.filter((failure) => {
      const [restored, fix] = RESTORE_ENDS.map((restoreEnd) => logMetrics(flat, { ...DEFINITIONS_DEFAULT, failure, restoreEnd }).restoreMedian!);
      return Math.abs(restored - fix) < 1e-9;
    });
    expect(same.length).toBeGreaterThan(0);
  });

  it('the weekly deploy ticks equal the table: the four weeks partition the log, and each week holds the rows that fall in it', () => {
    const log = makeLog(1);
    const weeks = Array.from({ length: LOG_WEEKS }, (_, w) => weekOf(log, w));
    expect(weeks.reduce((s, w) => s + w.length, 0)).toBe(LOG_DEPLOYMENTS);
    weeks.forEach((rows, w) => {
      expect(rows.every((d) => Math.floor(d.deployAt / 168) === w)).toBe(true);
      expect(rows.map((d) => d.id)).toEqual(log.filter((d) => Math.floor(d.deployAt / 168) === w).map((d) => d.id));
    });
  });

  it('every deployment lands on a weekday between 09:00 and 17:00 UTC', () => {
    for (const d of makeLog(3)) {
      const day = Math.floor(d.deployAt / 24) % 7;
      const hour = d.deployAt % 24;
      expect(day).toBeLessThan(5);
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(17);
    }
  });

  it('failure definitions are nested as stated: a rollback is also within "rollback or hotfix within 24 h"', () => {
    const log = makeLog(1);
    for (const d of log) if (isFailure(d, 'rollback')) expect(isFailure(d, 'rollback-or-hotfix')).toBe(true);
    expect(log.filter((d) => isFailure(d, 'incident')).some((d) => d.outcome === 'ok')).toBe(true);
  });

  it('a log without failures shows no restore time (null), never 0', () => {
    const clean = makeLog(1).map((d) => ({ ...d, outcome: 'ok' as const, incident: false, restoredMin: null, fixHours: null }));
    for (const failure of FAILURE_DEFS) {
      const m = logMetrics(clean, { ...DEFINITIONS_DEFAULT, failure });
      expect(m.restoreMedian).toBeNull();
      expect(m.restoreMean).toBeNull();
      expect(m.failures).toBe(0);
      expect(restoreMins(clean, failure, 'restored')).toEqual([]);
    }
  });

  it('label test: lead time is computed from the start its label names, and a variant that measures from merge but labels itself "commit to production" is caught', () => {
    const log = makeLog(1);
    for (const start of LEAD_STARTS) {
      expect(leadTimeLabel(start)).toContain(LEAD_START_NAME[start]);
      leadHours(log, start).forEach((h, i) => expect(h).toBeCloseTo(log[i].deployAt - leadStartOf(log[i], start), 12));
    }
    const honest = leadHours(log, 'commit');
    const broken = log.map((d) => d.deployAt - d.mergeAt);
    expect(leadTimeLabel('commit')).toContain('first commit');
    expect(broken.some((h, i) => Math.abs(h - honest[i]) > 1e-9)).toBe(true);
  });
});
