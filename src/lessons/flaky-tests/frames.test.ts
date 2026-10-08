import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import lesson from './index';
import { batchCaption, replayCaption, runCaption, runLines, toggleCaption } from './frames';
import { MAX_RETRIES, SOURCES, TEST_OF, exactGreen, runSeed, runSuite, summarise, type Config, type SourceId } from './sim';

const cfg = (fixed: SourceId[] = [], retries = 0, quarantined: string[] = []): Config => ({ fixed: new Set(fixed), retries, quarantined: new Set(quarantined) });
const batch = (c: Config, b = 1) => Array.from({ length: 100 }, (_, i) => runSuite(runSeed(b, i), c));

describe('batch caption', () => {
  const configs: Config[] = [
    cfg(), cfg([], MAX_RETRIES), cfg([...SOURCES]), cfg([...SOURCES], MAX_RETRIES), cfg(['sleep', 'order', 'clock', 'random']),
    cfg(['sleep', 'order', 'clock', 'random'], MAX_RETRIES), cfg(['sleep', 'order', 'clock', 'random'], 0, [TEST_OF.race]),
  ];
  it.each(configs.map((c, i) => [i, c] as const))('quotes the summary and the exact chance (config %i)', (_, c) => {
    for (const b of [1, 2, 3]) {
      const s = summarise(batch(c, b));
      const t = text(batchCaption(s, c));
      expect(t).toContain(`${s.pass + s.retried} of 100 runs green`);
      expect(t).toContain(`${(exactGreen(c) * 100).toFixed(1)}%`);
      expect(t.includes('after a retry')).toBe(s.retried > 0);
      expect(t.includes('without being reported')).toBe(s.realBugsHidden > 0);
      if (s.realBugsHidden > 0) expect(t).toContain(`${s.realBugsHidden} run`);
      expect(t.includes('passed first time')).toBe(s.fail === 0 && s.retried === 0 && s.realBugsHidden === 0);
    }
  });

  it('calls a clean batch lucky only when something can still flake', () => {
    const clean = cfg([...SOURCES]);
    expect(text(batchCaption(summarise(batch(clean)), clean))).toContain('nothing left can flake');
    // Only the 4.9%-a-run race left: some 100-run batch is all green by luck, and the caption must say so.
    const raceOnly = cfg(['sleep', 'order', 'clock', 'random']);
    const lucky = Array.from({ length: 200 }, (_, b) => b + 1).find((b) => summarise(batch(raceOnly, b)).fail === 0);
    if (lucky !== undefined) expect(text(batchCaption(summarise(batch(raceOnly, lucky)), raceOnly))).toContain('lucky');
  });
});

describe('run detail', () => {
  it("prints each test's recorded outcome and reason", () => {
    const c = cfg([], MAX_RETRIES, [TEST_OF.clock]);
    for (let i = 0; i < 100; i++) {
      const run = runSuite(runSeed(4, i), c);
      const lines = runLines(run);
      run.tests.forEach((t, k) => {
        const line = lines[k];
        expect(line.text).toContain(t.id);
        if (t.quarantined) expect(line.tone).toBe('muted');
        else expect(line.tone).toBe(t.outcome === 'passed' ? 'ok' : t.outcome === 'retried' ? 'orange' : 'bad');
        if (t.outcome !== 'passed' && !t.quarantined) expect(line.text).toContain(t.outcome === 'retried' ? t.attempts[0].reason : t.attempts[t.attempts.length - 1].reason);
      });
    }
  });

  it('says red only for a failed run, and blames the real race only when it was hidden', () => {
    for (const c of [cfg(), cfg([], MAX_RETRIES), cfg(['sleep', 'order', 'clock', 'random'], MAX_RETRIES)]) {
      for (let i = 0; i < 100; i++) {
        const run = runSuite(runSeed(5, i), c);
        const t = text(runCaption(run));
        expect(t.includes('red')).toBe(run.status === 'fail');
        expect(t.includes('real race')).toBe(run.realBugHidden);
      }
    }
  });

  it('describes a toggle with the new exact chance', () => {
    expect(text(toggleCaption('Retry until green', true, 0.5))).toBe('Retry until green: on. The exact chance a run is green is now 50.0%. Press Run ×100 to watch it.');
  });
});

describe('quiz numbers', () => {
  it('recomputes the 5 × 2% suite answer from P(red) = 1 − (1 − p)ⁿ', () => {
    const q = lesson.quiz[1];
    const red = 1 - (1 - 0.02) ** 5;
    expect(q.options[q.answer]).toBe(`About ${(red * 100).toFixed(1)}%`);
    expect(0.02 ** 5).toBeLessThan(0.0001);
  });
});

describe('the try-this prompts, at the default state (first Run ×100, seeds 1001-1100)', () => {
  const none = cfg();
  const retry = cfg([], MAX_RETRIES);

  it('#2 retry on: some red runs turn orange, many stay red because the shared cart stays dirty', () => {
    const off = summarise(batch(none));
    const on = batch(retry);
    const s = summarise(on);
    expect(s.pass).toBe(off.pass);
    expect(s.retried).toBeGreaterThan(0);
    expect(s.fail).toBeGreaterThan(s.pass); // still mostly red: "many stay red"
    expect(s.fail).toBeLessThan(off.fail);
    expect(s.realBugsHidden).toBeGreaterThan(0);
    const red = on.filter((r) => r.status === 'fail');
    const dirty = red.filter((r) => r.tests.find((t) => t.id === 'emptyCartTotal')!.outcome === 'failed');
    expect(dirty.length / red.length).toBeGreaterThan(0.8);
  });

  it('#5 fix the other four, quarantine the race: all 100 go green and the ! marks show it tripping', () => {
    const c = cfg(['sleep', 'order', 'clock', 'random'], 0, [TEST_OF.race]);
    const s = summarise(batch(c));
    expect(s.fail).toBe(0);
    expect(s.realBugsHidden).toBeGreaterThan(0);
  });

  it('...whereas quarantining the race alone leaves the build red', () => {
    expect(summarise(batch(cfg([], 0, [TEST_OF.race]))).fail).toBeGreaterThan(0);
  });
});

describe('quarantined flakes are not "fixed"', () => {
  const parkedAll = cfg([], 0, SOURCES.map((s) => TEST_OF[s]));
  it('never says nothing left can flake while a quarantined test still flakes', () => {
    const fixRaceParkRest = cfg(['race'], 0, SOURCES.filter((s) => s !== 'race').map((s) => TEST_OF[s]));
    expect(exactGreen(fixRaceParkRest)).toBe(1);
    const s = summarise(batch(fixRaceParkRest));
    expect(s.fail).toBe(0);
    const t = text(batchCaption(s, fixRaceParkRest));
    expect(t).not.toContain('nothing left can flake');
    expect(t).toContain('nothing left can fail the build');
    expect(t).toContain('4 quarantined tests still flake');
    expect(t).toContain('not counting the 4 quarantined flaky tests');
  });
  it('says it only when every source is fixed', () => {
    const t = text(batchCaption(summarise(batch(cfg([...SOURCES]))), cfg([...SOURCES])));
    expect(t).toContain('nothing left can flake');
    expect(t).not.toContain('quarantined');
  });
  it('a retry-hidden or quarantined run still names the parked tests', () => {
    const t = text(batchCaption(summarise(batch(parkedAll)), parkedAll));
    expect(t).toContain('5 quarantined tests still flake');
  });
});

describe('replay caption', () => {
  it('states the run real outcome for pass, retried and failed', () => {
    const c = cfg([], MAX_RETRIES);
    const runs = batch(c);
    for (const status of ['pass', 'retried', 'fail'] as const) {
      const run = runs.find((r) => r.status === status)!;
      const t = text(replayCaption(run));
      expect(t).toContain(`seed ${run.seed}`);
      expect(t).toContain(status === 'pass' ? 'passed first time' : status === 'retried' ? 'went green after a retry' : 'failed');
    }
  });
});
