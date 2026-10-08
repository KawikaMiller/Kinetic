import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import lesson from './index';
import { batchCaption, runCaption, runLines, toggleCaption } from './frames';
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
