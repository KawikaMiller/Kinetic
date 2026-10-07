import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { descentFrames, lossText, verdict } from './frames';
import { DEFAULT_START, RATE_PRESETS, SURFACE_IDS, presetRate, runDescent, type Run } from './model';

const runs: Run[] = [];
for (const id of SURFACE_IDS) {
  for (const p of RATE_PRESETS) {
    for (const momentum of [0, 0.8]) runs.push(runDescent(id, { start: DEFAULT_START[id], rate: presetRate(id, p), momentum, batchSeed: null }));
  }
}
runs.push(runDescent('regression', { start: DEFAULT_START.regression, rate: presetRate('regression', 'justRight'), momentum: 0, batchSeed: 3 }));
runs.push(runDescent('saddle', { start: [-1.8, 0], rate: presetRate('saddle', 'justRight'), momentum: 0, batchSeed: null }));

describe('descentFrames', () => {
  it('for every surface × preset × momentum, each step frame names the real position, loss and push, and ends on the verdict', () => {
    for (const run of runs) {
      for (const perPress of [1, 5, 20]) {
        const frames = descentFrames(run, perPress);
        expect(frames.at(-1)!.iter).toBe(run.steps.length);
        for (const f of frames.slice(0, -1)) {
          const st = run.steps[f.iter];
          const c = text(f.say);
          expect(c).toContain(`loss ${lossText(st.loss)}`);
          expect(c).toContain('−η∇L =');
          expect(c).not.toMatch(/NaN|Infinity/);
        }
        expect(text(frames.at(-1)!.say)).toBe(text(verdict(run)));
      }
    }
  });

  it('the verdict matches the outcome kind, never the preset name', () => {
    for (const run of runs) {
      const v = text(verdict(run));
      const o = run.outcome.kind;
      expect(v.includes('Converged')).toBe(o === 'minimum');
      expect(v.includes('Diverged')).toBe(o === 'diverged');
      expect(v.includes('saddle')).toBe(o === 'saddle');
      if (o === 'budget') expect(v).toMatch(/still crawling|still bouncing|still jitters/);
    }
  });

  it('calls a minimum "the" minimum only on convex surfaces, and says "local" when a lower one exists', () => {
    const shallow = runDescent('twoMinima', { start: [0.5, 1], rate: presetRate('twoMinima', 'justRight'), momentum: 0, batchSeed: null });
    expect(text(verdict(shallow))).toContain('only a local minimum: a lower one exists');
    const deep = runDescent('twoMinima', { start: [-0.5, 1], rate: presetRate('twoMinima', 'justRight'), momentum: 0, batchSeed: null });
    expect(text(verdict(deep))).toContain("gradient descent can't know that");
    const bowl = runDescent('bowl', { start: DEFAULT_START.bowl, rate: 0.3, momentum: 0, batchSeed: null });
    expect(text(verdict(bowl))).toContain('On a convex surface like this one, that is the minimum.');
  });

  it('mentions momentum only on runs that use it, and mini-batches only on mini-batch runs', () => {
    for (const run of runs) {
      const second = text(descentFrames(run, 1)[1]?.say ?? '');
      if (run.steps.length > 1) expect(second.includes('keeps β')).toBe(run.options.momentum > 0);
      expect(text(descentFrames(run, 1)[0].say).includes('mini-batch')).toBe(run.options.batchSeed !== null);
    }
  });
});

describe('lossText', () => {
  it('uses exponents only for tiny and huge losses', () => {
    expect(lossText(0.3209)).toBe('0.3209');
    expect(lossText(1e-7)).toBe('1.00e−7');
    expect(lossText(2.5e6)).toBe('2.50e+6');
    expect(lossText(0)).toBe('0');
  });
});
