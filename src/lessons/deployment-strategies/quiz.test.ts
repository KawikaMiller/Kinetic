import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { PRESETS } from './presets';
import { sayFor } from './frames';
import lesson from './index';
import { DEFAULTS, DROP_PER_SERVER, REPLICAS, REQ_PER_TICK, resolveFenceposts, simulate, type Config } from './model';

const preset = (id: string): Config => PRESETS.find((p) => p.id === id)!.cfg;
const cfg = (patch: Partial<Config>): Config => ({ ...DEFAULTS, ...patch });

describe('the quiz numbers come from the model', () => {
  it('Q1: blue-green puts every user on v2 at the switch', () => {
    expect(simulate(cfg({ strategy: 'bluegreen' })).peakExposure).toBe(1);
    expect(lesson.quiz[0].why).toContain('everyone is on v2');
  });

  it('Q2: 33% of 20 is 7 extra servers and 6 missing, so 27 run and 14 serve', () => {
    const f = resolveFenceposts(REPLICAS, 33, 33);
    expect([f.surge, f.unavailable]).toEqual([7, 6]);
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toBe(`${f.surge} extra servers and ${f.unavailable} missing servers`);
    expect(lesson.quiz[1].why).toContain(`(${f.surge}, so up to ${REPLICAS + f.surge} servers run)`);
    expect(lesson.quiz[1].why).toContain(`(${f.unavailable}, so at least ${REPLICAS - f.unavailable} serve)`);
  });

  it('Q3: 1% of the traffic for an 8 minute bake is about 16 requests, and a 5% bug misses all of them about 44% of the time', () => {
    const requests = REQ_PER_TICK * 0.01 * 8;
    expect(requests).toBe(16);
    expect(0.95 ** requests).toBeCloseTo(0.44, 2);
    expect(lesson.quiz[2].why).toContain('about 44%');
    expect(lesson.quiz[2].why).toContain('about 16 requests');
  });

  it('Q4: a breaking migration on a rolling update costs about 667 requests, against 400 for Recreate', () => {
    const rolling = simulate(preset('breaking'));
    const recreate = simulate({ ...preset('breaking'), strategy: 'recreate' });
    expect(Math.round(rolling.expectedHit)).toBe(667);
    expect(recreate.expectedHit).toBe(400);
    expect(lesson.quiz[3].why).toContain('about 667 requests');
    expect(lesson.quiz[3].why).toContain('400 for Recreate');
  });

  it('Q5: replacing all 20 servers without draining drops 60 requests, with no bug at all', () => {
    const run = simulate(cfg({ strategy: 'rolling', bugRate: 0, drain: false }));
    expect(run.expectedHit).toBe(REPLICAS * DROP_PER_SERVER);
    expect(lesson.quiz[4].why).toContain('3 requests in flight');
    expect(lesson.quiz[4].why).toContain('60 requests');
  });
});

describe('the try-this steps work from the default state, as written', () => {
  it('1: the default rolling deploy reaches 100% on v2 before its alert fires; blue-green can be compared on the same seed', () => {
    const run = simulate(DEFAULTS);
    const full = run.ticks.find((t) => t.weight === 1)!;
    expect(full.t).toBeLessThan(run.trigger!.tick);
    expect(run.trigger!.kind).toBe('alert');
    expect(simulate({ ...DEFAULTS, strategy: 'bluegreen' }).trigger).not.toBeNull();
  });

  it('2: the short-bake preset slips past the canary and the long bake catches it at 10%', () => {
    const short = simulate(preset('short-bake'));
    expect(short.trigger?.kind).toBe('alert');
    expect(short.peakExposure).toBe(1);
    const long = simulate({ ...preset('short-bake'), bakeTicks: 8 });
    expect(long.trigger?.kind).toBe('analysis');
    expect(long.peakExposure).toBe(0.1);
  });

  it('3: 33% of 20 reads as 7 and 6 in the hint, and 0% with 5% is one server at a time', () => {
    expect(resolveFenceposts(REPLICAS, 33, 33)).toMatchObject({ surge: 7, unavailable: 6 });
    expect(resolveFenceposts(REPLICAS, 0, 5)).toMatchObject({ surge: 0, unavailable: 1 });
  });

  it('4: the breaking-migration preset alerts and then cannot roll back, and the canary suffers it longer', () => {
    const run = simulate(preset('breaking'));
    expect(run.trigger).toMatchObject({ kind: 'alert', blocked: true });
    expect(captionText(sayFor(run, run.trigger!.tick))).toContain('There is no rollback');
    const canary = simulate({ ...preset('breaking'), strategy: 'canary' });
    expect(canary.expectedHit).toBeGreaterThan(run.expectedHit);
  });

  it('5: killing servers on Recreate drops requests, and the caption says so', () => {
    const run = simulate(cfg({ strategy: 'recreate', drain: false }));
    expect(captionText(sayFor(run, 1))).toContain(`${REPLICAS * DROP_PER_SERVER} in-flight requests`);
  });
});
