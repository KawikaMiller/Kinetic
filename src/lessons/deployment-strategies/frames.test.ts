import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { deployFrames, sayFor } from './frames';
import { DEFAULTS, HORIZON, ROLLOUT_PCT_STEP, REPLICAS, REQ_PER_TICK, STRATEGIES, served, simulate, type Config } from './model';
import { PRESETS } from './presets';

const SETTINGS: Partial<Config>[] = [];
for (const strategy of STRATEGIES) {
  for (const bugRate of [0, 0.03, 0.2]) {
    for (const schema of ['compatible', 'breaking'] as const) {
      for (const drain of [true, false]) {
        for (const analysis of [true, false]) {
          for (const [bakeTicks, surgePct, unavailablePct] of [[1, 0, 5], [8, 25, 25], [12, 100, 0]] as const) {
            SETTINGS.push({ strategy, bugRate, schema, drain, analysis, bakeTicks, surgePct, unavailablePct });
          }
        }
      }
    }
  }
}

const caption = (run: ReturnType<typeof simulate>, t: number) => expectCaption(sayFor(run, t));
const has = (text: string, phrase: string) => text.includes(phrase);

describe('captions, over every combination of strategy, bug, migration, drain, analysis and rollout sizes', () => {
  it('are free of glued sentences and say how many requests failed that minute, from the sample', () => {
    for (const patch of SETTINGS) {
      const run = simulate({ ...DEFAULTS, ...patch });
      for (let t = 0; t < HORIZON; t++) {
        const text = caption(run, t);
        const tl = run.tallies[t];
        expect(text, JSON.stringify(patch)).toContain(`Minute ${t}: ${tl.failed1 + tl.failed2 + tl.outage} of ${REQ_PER_TICK} requests failed`);
        expect(text.includes('in-flight'), 'dropped requests are mentioned exactly when there are some').toBe(tl.dropped > 0);
        if (tl.dropped > 0) expect(text).toContain(`${tl.dropped} in-flight request`);
      }
    }
  });

  it('judge events only on the minutes they happen', () => {
    for (const patch of SETTINGS) {
      const run = simulate({ ...DEFAULTS, ...patch });
      const { trigger } = run;
      for (let t = 0; t < HORIZON; t++) {
        const text = caption(run, t);
        const label = `${JSON.stringify(patch)} minute ${t}`;
        expect(has(text, 'The alert fires'), label).toBe(trigger?.kind === 'alert' && trigger.tick === t);
        expect(has(text, 'Rollback starts'), label).toBe(!!trigger && !trigger.blocked && t === trigger.tick + 1);
        expect(has(text, 'There is no rollback'), label).toBe(!!trigger?.blocked && t === trigger.tick);
        expect(has(text, 'Back on v1'), label).toBe(run.rolledBackAt === t);
        expect(has(text, 'The deploy is complete'), label).toBe(!trigger && run.completedAt === t);
        expect(has(text, 'No server is up'), label).toBe(!served(run.ticks[t]) && t > 0);
        if (trigger?.kind === 'analysis' && trigger.tick === t) expect(text, label).toContain(trigger.blocked ? 'wants to roll back' : 'rolls back automatically');
      }
    }
  });

  it('quote the canary evidence from the requests: its counts and the baseline counts in the failing window', () => {
    for (const seed of [1, 2, 3, 4]) {
      const run = simulate({ ...DEFAULTS, strategy: 'canary', seed });
      const w = run.trigger!.window!;
      const text = caption(run, run.trigger!.tick);
      expect(text).toContain(`the canary failed ${w.canaryErrors} of ${w.canaryN} request`);
      expect(text).toContain(`the baseline ${w.baseErrors} of ${w.baseN} request`);
    }
  });

  it('a passing window is announced as passing, and the failing one is not', () => {
    const run = simulate({ ...DEFAULTS, strategy: 'canary', bugRate: 0, seed: 1 });
    const text = captionText(sayFor(run, 10));
    expect(text).toContain('passes');
    expect(text).not.toContain('rolls back automatically');
  });

  it('say the strategy-specific start, with the rolling arithmetic from the settings', () => {
    const rolling = caption(simulate({ ...DEFAULTS, strategy: 'rolling', surgePct: 33, unavailablePct: 33 }), 1);
    expect(rolling).toContain('maxSurge 33% of 20 rounds up to 7 extra servers');
    expect(rolling).toContain('maxUnavailable 33% rounds down to 6 missing');
    expect(rolling).toContain('at most 27 servers run and at least 14 serve');
    expect(caption(simulate({ ...DEFAULTS, strategy: 'rolling', surgePct: 0, unavailablePct: 0 }), 1)).toContain('rejects 0% and 0%');
    expect(caption(simulate({ ...DEFAULTS, strategy: 'bluegreen' }), 1)).toContain(`${REPLICAS * 2} servers`);
  });

  it('the 33% example is reachable on the rollout sliders', () => {
    expect(33 % ROLLOUT_PCT_STEP).toBe(0);
  });

  it('a canary rolled back after full promotion says it is a rolling undo, and one rolled back early says the weight drops', () => {
    const late = simulate(PRESETS.find((p) => p.id === 'short-bake')!.cfg);
    expect(late.ticks[late.trigger!.tick].v1).toBe(0);
    const lateText = captionText(sayFor(late, late.trigger!.tick + 1));
    expect(lateText).toContain('rolling update back to v1');
    expect(lateText).not.toContain('straight away');
    const early = simulate({ ...DEFAULTS, strategy: 'canary', bugRate: 0.2, bakeTicks: 8, seed: 1 });
    expect(early.ticks[early.trigger!.tick].v1).toBeGreaterThan(0);
    expect(captionText(sayFor(early, early.trigger!.tick + 1))).toContain('straight away');
  });

  it('every preset plays a full set of captions with its own opening', () => {
    for (const p of PRESETS) {
      const frames = deployFrames(simulate(p.cfg));
      expect(frames).toHaveLength(HORIZON);
      expect(frames.every((f) => f.say !== undefined)).toBe(true);
      expect(captionText(frames[0].say)).toContain('All 20 servers run v1');
    }
  });
});
