import { captionText as text } from '../../core/testing/captions';
import { describe, expect, it } from 'vitest';
import { finishedCaption, resultColor, resultLabel } from './captions';
import { PRESETS, type Bug, type Counts } from './model';
import { advance, createWorld, snapshot, startRun } from './sim';


/** Run `runs` suites to completion and return each one's finished stats. */
function finishedRuns(counts: Counts, bug: Bug | null, runs: number) {
  const w = createWorld();
  return Array.from({ length: runs }, () => {
    startRun(w, counts, bug);
    while (w.running) advance(w, 10);
    return snapshot(w);
  });
}

const pyramid = PRESETS.find((p) => p.id === 'pyramid')!.counts;

describe('finished caption', () => {
  it('Try-this #3: a logic bug with no unit tests is reported as shipped, never as "nothing is broken"', () => {
    const noUnits: Counts = { ...pyramid, unit: 0 };
    for (const s of finishedRuns(noUnits, 'logic', 60)) {
      expect(s.escaped).toBe(true);
      const caption = text(finishedCaption(s));
      expect(caption).toContain('The logic bug shipped');
      expect(caption).not.toContain('nothing is broken');
      expect(caption).not.toContain('All green');
      expect(resultLabel(s)).toMatch(/bug shipped/);
      expect(resultColor(s)).toBe('var(--bad)');
    }
  });

  it('every planted bug without its layer escapes; with its layer it is caught', () => {
    const empty = { logic: 'unit', wiring: 'integration', browser: 'e2e' } as const;
    for (const bug of ['logic', 'wiring', 'browser'] as const) {
      const without: Counts = { ...pyramid, [empty[bug]]: 0 };
      for (const s of finishedRuns(without, bug, 10)) expect(s.escaped).toBe(true);
      for (const s of finishedRuns(pyramid, bug, 10)) {
        expect(s.escaped).toBe(false);
        expect(text(finishedCaption(s))).toContain('Caught');
      }
    }
  });

  it('with no bug planted, nothing escapes and the caption is about flakes or all green', () => {
    for (const s of finishedRuns(PRESETS.find((p) => p.id === 'cone')!.counts, null, 40)) {
      expect(s.escaped).toBe(false);
      const caption = text(finishedCaption(s));
      expect(s.flaky ? caption.includes('nothing is broken') : caption.startsWith('All green')).toBe(true);
    }
  });
});
