import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { alertRows, predictionTicket } from './alerts';
import { ruleCaption, symptomCaption, triageCaption } from './captions';
import { FOR_MAX, THRESHOLD_RANGE, incidentAt, judge, minutesToFull, neverClears, pageMinutes, predictionFires, PREDICT_HORIZON } from './rules';
import { ALERTS, allTo, byRubric, rubricRoute, totals } from './triage';
import { BLIP_COUNT, BLIP_LEVEL, BASELINE_ERRORS, DISK_CLEANUP_AT, DISK_FULL_AT, INCIDENTS, LEAK_START, POD_RESTARTS, SPIKE_COUNT, WEEK, WEEK_MINUTES, buildWeek, incidentEnd } from './week';

/** The reference: one pass over the minutes with a counter, written from the rule's sentence. */
function referenceFires(series: readonly number[], threshold: number, forMinutes: number): number[] {
  const need = Math.max(1, forMinutes);
  const fires: number[] = [];
  let run = 0;
  for (let t = 0; t < series.length; t++) {
    if (series[t] > threshold) {
      run++;
      if (run === need) fires.push(t);
    } else run = 0;
  }
  return fires;
}

/** The reference verdict, by looking at each page and each incident in turn. */
function referenceVerdict(fires: readonly number[]) {
  let useful = 0;
  for (const f of fires) if (INCIDENTS.some((i) => f >= i.start && f < i.start + i.length)) useful++;
  const first = INCIDENTS.map((i) => {
    for (let t = i.start; t < i.start + i.length; t++) if (fires.includes(t)) return t - i.start;
    return null;
  });
  return { pages: fires.length, useful, falsePages: fires.length - useful, missedIds: INCIDENTS.filter((_, k) => first[k] === null).map((i) => i.id), first };
}

describe('the synthetic week', () => {
  it('has the authored incidents at their levels, 15 isolated 8% blips and 20 CPU spikes that avoid the incidents', () => {
    expect(INCIDENTS.map((i) => [i.length, i.level])).toEqual([[40, 5], [12, 30], [90, 1.5]]);
    for (const i of INCIDENTS) for (let t = i.start; t < incidentEnd(i); t++) expect(WEEK.errors[t]).toBe(i.level);
    expect(WEEK.blips).toHaveLength(BLIP_COUNT);
    for (const b of WEEK.blips) {
      expect(WEEK.errors[b]).toBe(BLIP_LEVEL);
      expect(WEEK.errors[b - 1]).toBeLessThan(BASELINE_ERRORS[1] + 1e-9);
      expect(WEEK.errors[b + 1]).toBeLessThan(BASELINE_ERRORS[1] + 1e-9);
    }
    expect(WEEK.spikes).toHaveLength(SPIKE_COUNT);
    for (const s of WEEK.spikes) for (const i of INCIDENTS) expect(s.start + s.length <= i.start || s.start >= incidentEnd(i)).toBe(true);
    expect(WEEK.restarts).toHaveLength(POD_RESTARTS);
    expect(WEEK.errors).toHaveLength(WEEK_MINUTES);
  });

  it('is the same for the same seed and different for another', () => {
    expect(buildWeek(4207).errors).toEqual(WEEK.errors);
    expect(buildWeek(4208).errors).not.toEqual(WEEK.errors);
  });

  it('keeps the baseline CPU below every threshold the lesson uses, so only the spikes can page', () => {
    const baseline = WEEK.cpu.filter((_, t) => !WEEK.spikes.some((s) => t >= s.start && t < s.start + s.length));
    expect(Math.max(...baseline)).toBeLessThan(50);
  });
});

describe('page counting against an independent per-minute state machine', () => {
  const errorThresholds = [0, 0.1, 0.14, 0.5, 1, 1.5, 2, 5, 8, 10, 30, 31, 40];
  const cpuThresholds = [0, 40, 50, 80, 85, 90, 95, 100];
  it('agrees over the whole threshold by for-duration grid, for pages, useful pages, misses and time to page', () => {
    for (const [series, thresholds] of [[WEEK.errors, errorThresholds], [WEEK.cpu, cpuThresholds]] as const) {
      for (const thr of thresholds) {
        for (let n = 0; n <= FOR_MAX; n++) {
          const fires = pageMinutes(series, thr, n);
          expect(fires, `${thr} for ${n}`).toEqual(referenceFires(series, thr, n));
          const v = judge(fires);
          const ref = referenceVerdict(fires);
          expect([v.pages, v.useful, v.falsePages, v.missed.map((i) => i.id), v.timeToPage]).toEqual([ref.pages, ref.useful, ref.falsePages, ref.missedIds, ref.first]);
        }
      }
    }
  });

  it('pages a one-minute 8% blip at for-duration 0 and 1 and not at 2 (threshold 2%: 15 blips and two incidents)', () => {
    const at = (n: number) => judge(pageMinutes(WEEK.errors, 2, n));
    expect([at(0).pages, at(0).useful, at(0).falsePages]).toEqual([17, 2, 15]);
    expect(at(1).pages).toBe(17);
    expect([at(2).pages, at(2).useful, at(2).falsePages]).toEqual([2, 2, 0]);
    expect(at(2).missed.map((i) => i.id)).toEqual(['disk']);
  });

  it('measures minutes to the first page from the incident start: for 5 minutes the first page is at minute 4, and a 12-minute incident is missed by a 15-minute wait', () => {
    expect(judge(pageMinutes(WEEK.errors, 1, 5)).timeToPage).toEqual([4, 4, 4]);
    expect(judge(pageMinutes(WEEK.errors, 1, 15)).timeToPage).toEqual([14, null, 14]);
    expect(judge(pageMinutes(WEEK.errors, 1, 3)).timeToPage).toEqual([2, 2, 2]);
  });

  it('treats a value equal to the threshold as not above it: 1.5% does not page the third incident', () => {
    expect(judge(pageMinutes(WEEK.errors, 1.5, 0)).missed.map((i) => i.id)).toEqual(['disk']);
  });

  it('pins the extremes: threshold 0 is one page that never clears, threshold 100% on CPU is no pages and three misses', () => {
    const zero = pageMinutes(WEEK.errors, 0, 0);
    expect(zero).toEqual([0]);
    expect(neverClears(WEEK.errors, 0)).toBe(true);
    expect(judge(zero).useful).toBe(0);
    const top = judge(pageMinutes(WEEK.cpu, 100, 0));
    expect([top.pages, top.missed.length]).toEqual([0, 3]);
    expect(THRESHOLD_RANGE.errors.max).toBeGreaterThan(Math.max(...WEEK.errors));
    expect(judge(pageMinutes(WEEK.errors, THRESHOLD_RANGE.errors.max, 0)).pages).toBe(0);
  });

  it('says never clears and never pages in the captions at those extremes, and otherwise gives the numbers', () => {
    expect(expectCaption(ruleCaption('errors', 0, 0, pageMinutes(WEEK.errors, 0, 0)))).toContain('never clears');
    expect(expectCaption(ruleCaption('errors', 0, 0, pageMinutes(WEEK.errors, 0, 0)))).not.toContain('keeps paging');
    expect(expectCaption(ruleCaption('cpu', 100, 0, []))).toContain('never pages');
    const mid = expectCaption(ruleCaption('errors', 2, 0, pageMinutes(WEEK.errors, 2, 0)));
    expect(mid).toContain('17 pages');
    expect(mid).toContain('15 with none');
    expect(mid).toContain('1 of 3 incidents never paged');
  });
});

describe('try-this entries, from the default state (CPU above 80% for one minute), as written', () => {
  it('try-this 1: the default rule pages 20 times, none during an incident, and misses all three; the error ratio above 1% for 3 minutes pages 3 times, all useful', () => {
    const cpu = judge(pageMinutes(WEEK.cpu, 80, 0));
    expect([cpu.pages, cpu.useful, cpu.missed.length]).toEqual([20, 0, 3]);
    const errors = judge(pageMinutes(WEEK.errors, 1, 3));
    expect([errors.pages, errors.useful, errors.missed.length]).toEqual([3, 3, 0]);
  });

  it('try-this 2: on the error ratio above 1%, no wait pages 18 times with 15 false, and 2 minutes drops the blips to 3 pages', () => {
    const none = judge(pageMinutes(WEEK.errors, 1, 0));
    expect([none.pages, none.falsePages]).toEqual([18, 15]);
    const two = judge(pageMinutes(WEEK.errors, 1, 2));
    expect([two.pages, two.falsePages]).toEqual([3, 0]);
  });

  it('try-this 3: the symptom alert pages 3 times, all in incidents, the CPU alert 20 times with none useful, and the disk prediction ticket comes about four hours before the disk fills', () => {
    const rows = alertRows();
    const by = Object.fromEntries(rows.map((r) => [r.id, r.verdict]));
    expect([by.symptom.pages, by.symptom.useful]).toEqual([3, 3]);
    expect([by.cpu.pages, by.cpu.useful]).toEqual([20, 0]);
    const ticket = predictionTicket()!;
    expect(ticket.lead).toBeGreaterThanOrEqual(PREDICT_HORIZON);
    expect(ticket.lead).toBeLessThan(PREDICT_HORIZON + 30);
    expect(expectCaption(symptomCaption(rows, ticket.lead))).toContain(`${ticket.lead} minutes before the disk filled`);
  });

  it('try-this 4: on the triage board, paging on everything is 70 pages a week and Page on pain is 15, with about 23 and 5 at night', () => {
    const everything = totals(allTo('page'));
    expect([everything.pagesPerWeek, Math.round(everything.nightPages), everything.mismatches]).toEqual([70, 23, 8]);
    const rubric = totals(byRubric());
    expect([rubric.pagesPerWeek, rubric.nightPages, rubric.mismatches, rubric.paging]).toEqual([15, 5, 0, 4]);
    expect(rubric.pagesWithoutRunbook).toEqual(['latency-checkout']);
  });
});

describe('the symptom and cause alerts', () => {
  it('pages the cause alerts with users fine: no CPU, disk or pod page lands inside an incident', () => {
    const rows = alertRows();
    for (const id of ['cpu', 'disk', 'pods'] as const) expect(rows.find((r) => r.id === id)!.verdict.useful, id).toBe(0);
    expect(rows.find((r) => r.id === 'pods')!.verdict.pages).toBe(POD_RESTARTS);
  });

  it('predicts the fill from the disk’s own trend: no ticket before the leak starts, none after the cleanup, and the first is before the fill', () => {
    const fires = predictionFires(WEEK.disk);
    expect(fires.length).toBeGreaterThan(0);
    for (const f of fires) expect(f).toBeGreaterThanOrEqual(LEAK_START);
    expect(fires.filter((f) => f >= DISK_CLEANUP_AT)).toEqual([]);
    expect(Math.min(...fires)).toBeLessThan(DISK_FULL_AT);
    expect(minutesToFull(WEEK.disk, 10)).toBe(Infinity);
    expect(incidentAt(DISK_FULL_AT)?.id).toBe('disk');
  });

  it('would not call a flat or falling disk full: the baseline day never predicts a fill within the horizon', () => {
    const quiet = predictionFires(WEEK.disk.map((v, t) => (t < LEAK_START ? v : 60)));
    expect(quiet).toEqual([]);
  });
});

describe('the triage board', () => {
  it('has twelve alerts, four of each rubric route, and a reason for each', () => {
    expect(ALERTS).toHaveLength(12);
    const routes = ALERTS.map((a) => rubricRoute(a));
    expect(['page', 'ticket', 'dashboard'].map((r) => routes.filter((x) => x.route === r).length)).toEqual([4, 4, 4]);
    for (const r of routes) expect(r.because.length).toBeGreaterThan(10);
  });

  it('routes by the three questions: a page needs both urgency now and a hurt user (an independent restatement)', () => {
    for (const a of ALERTS) {
      const expected = a.urgency === 'now' && a.userHurt ? 'page' : a.urgency === 'none' ? 'dashboard' : 'ticket';
      expect(rubricRoute(a).route, a.id).toBe(expected);
    }
  });

  it('counts pages a week from the fire counts of the paging alerts only, and a page with no runbook is flagged', () => {
    const t = totals({ ...allTo('dashboard'), 'latency-checkout': 'page', 'db-down': 'page' });
    expect(t.pagesPerWeek).toBe(6 + 3);
    expect(t.pagesWithoutRunbook).toEqual(['latency-checkout']);
    expect(expectCaption(triageCaption(allTo('dashboard')))).toContain('0 alerts page');
    expect(expectCaption(triageCaption(byRubric()))).toContain('Every routing matches the rubric');
  });
});
