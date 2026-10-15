import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { momentCaption, scheduleCaption, summaryCaption } from './captions';
import { ALL_AT_ONCE, FLEET, PEAK_DELAY, REGION_SIZE, changeOf, planFrom, simulate, statusAt, type ChangeId, type Plan } from './model';
import { DEFAULT_PLAN } from './plan';
import { DEFAULT_START_HOUR, PEAKS, calendarStart, landingsInPeak, peakWindow, scheduleBars, scheduleLanes } from './schedule';

const staged = (o: Partial<Pick<Plan, 'bake' | 'gate' | 'validate' | 'autoRollback'>> = {}): Plan =>
  planFrom(DEFAULT_PLAN.stages, { bake: DEFAULT_PLAN.bake, gate: DEFAULT_PLAN.gate, validate: DEFAULT_PLAN.validate, autoRollback: DEFAULT_PLAN.autoRollback, ...o });
const run = (id: ChangeId, plan: Plan) => simulate(changeOf(id), plan);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: pushing Crashes on load everywhere costs 1,200 server-minutes (48 servers for 25 minutes), and the one-region change 300', () => {
    expect(run('crash', ALL_AT_ONCE).serverMinutes).toBe(1200);
    expect(run('region', ALL_AT_ONCE).serverMinutes).toBe(300);
  });

  it('try-this 2: the default staged plan stops Crashes on load at the canary for 3 server-minutes', () => {
    const r = run('crash', staged());
    expect([r.reached, r.detectedBy, r.serverMinutes]).toEqual([1, 'gate', 3]);
  });

  it('try-this 3: Bad only at peak with the 5 minute bake reaches all 48 servers and costs 137; a 25 minute bake stops it at the canary for 3', () => {
    const short = run('peak', staged());
    expect([short.reached, short.serverMinutes]).toEqual([FLEET, 137]);
    const long = run('peak', staged({ bake: 25 }));
    expect([long.reached, long.detectedBy, long.serverMinutes]).toEqual([1, 'gate', 3]);
    expect(expectCaption(summaryCaption(changeOf('peak'), staged(), short, true))).toContain('staging only helps if each bake is longer than the change takes to show itself');
    expect(expectCaption(summaryCaption(changeOf('peak'), staged({ bake: 25 }), long, true))).not.toContain('staging only helps');
  });

  it('try-this 4: Fails validation costs 3 through the gate, and is refused with 0 and nothing shipped once validation is on', () => {
    expect(run('validation', staged()).serverMinutes).toBe(3);
    const refused = run('validation', staged({ validate: true }));
    expect([refused.refused, refused.serverMinutes, refused.reached]).toEqual([true, 0, 0]);
    expect(expectCaption(summaryCaption(changeOf('validation'), staged({ validate: true }), refused, true))).toContain('a refusal is not an outage');
  });

  it('try-this 5: Bad for one region’s data passes the canary, one region and half, and costs 12 x 3 = 36 once the last stage reaches it', () => {
    const r = run('region', staged());
    expect(r.stages.map((s) => [s.size, s.outcome])).toEqual([[1, 'passed'], [12, 'passed'], [24, 'passed'], [48, 'stopped']]);
    expect([r.serverMinutes, r.peakFailing]).toEqual([REGION_SIZE * 3, REGION_SIZE]);
  });
});

describe('captions and the fleet at each minute', () => {
  it('says what is true at the first, a middle and the last minute, from the result', () => {
    const plan = staged({ bake: 25 });
    const r = run('peak', plan);
    const c = changeOf('peak');
    expect(expectCaption(momentCaption(c, plan, r, 0, true))).toContain('stage 1 lands');
    expect(expectCaption(momentCaption(c, plan, r, PEAK_DELAY, true))).toContain('the gate sees more than 5%');
    expect(expectCaption(momentCaption(c, plan, r, r.revertAt!, true))).toContain('no server runs the change');
    expect(expectCaption(summaryCaption(c, plan, r, true))).toContain('3 server-minutes affected');
  });

  it('shows no server failing before it can, and every reached server rolled back once the rollback is done', () => {
    const r = run('crash', ALL_AT_ONCE);
    for (let s = 0; s < FLEET; s++) {
      expect(statusAt(r, s, 0)).toBe('failing');
      expect(statusAt(r, s, r.revertAt!)).toBe('rolledback');
    }
    const staged5 = run('peak', staged());
    expect(statusAt(staged5, 0, PEAK_DELAY - 1)).toBe('healthy');
    expect(statusAt(staged5, FLEET - 1, 0)).toBe('unreached');
  });
});

describe('the schedule', () => {
  const plan = staged();
  const r = run('crash', plan);

  it('puts a bake bar, a landing and a gate result on the lanes of the regions each stage reaches', () => {
    const lanes = scheduleLanes().map((l) => l.id);
    const bars = scheduleBars(plan, r, DEFAULT_START_HOUR);
    for (const b of bars) expect(lanes).toContain(b.lane);
    expect(bars.filter((b) => b.id.startsWith('land-')).map((b) => b.lane)).toEqual(['us-east']);
    expect(bars.some((b) => b.tone === 'bad' && b.start === b.end)).toBe(true);
  });

  it('wraps a peak window over midnight and drops one outside the hours shown', () => {
    expect(peakWindow(0, DEFAULT_START_HOUR, 3)).toEqual([0, 3]);
    expect(peakWindow(3, DEFAULT_START_HOUR, 3)).toBeNull();
    const lateStart = PEAKS[0].start + 24 - 1;
    expect(peakWindow(0, lateStart % 24, 3)).not.toBeNull();
    expect(calendarStart(5)).toBe('2026-03-02T05:00:00Z');
  });

  it('counts a stage that lands inside a peak and says so only when it does', () => {
    const inPeak = landingsInPeak(plan, r, DEFAULT_START_HOUR);
    expect(inPeak).toEqual([{ stage: 0, region: 0 }]);
    expect(expectCaption(scheduleCaption(plan, r, inPeak))).toContain('does not simulate load');
    expect(expectCaption(scheduleCaption(plan, r, []))).toContain('No stage lands inside');
  });
});
