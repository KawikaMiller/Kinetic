import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { SAME_WITHIN, buildFrames } from './frames';
import { PRESET_IDS, agreement, bestOfRestarts, finalStep, initCentroids, lloyd, preset, standardise, type InitMethod } from './model';
import { MAX_K, num } from './view';

describe('k-means captions', () => {
  it('every preset × start × k × raw/standardised: each frame names its own phase and numbers, and the verdict matches the inertias', () => {
    for (const id of PRESET_IDS) {
      const p = preset(id);
      for (const scaled of [false, true]) {
        const pts = scaled ? standardise(p.points) : p.points;
        for (const method of ['random', 'plusplus', 'fixed'] as InitMethod[]) {
          for (let k = 1; k <= MAX_K; k++) {
            if (method === 'fixed' && (!p.fixedStart || k !== p.k || scaled)) continue;
            const steps = lloyd(pts, method === 'fixed' ? p.fixedStart! : initCentroids(pts, k, method, 3));
            const best = bestOfRestarts(pts, k, 3).inertia;
            const last = finalStep(steps);
            const agree = agreement(last.assign!, p.groups, k);
            const frames = buildFrames(steps, { k, method, bestInertia: best, agreement: agree });
            frames.forEach((f, i) => {
              const c = text(f.say);
              const s = steps[i];
              expect(c).not.toMatch(/NaN|undefined|null/);
              if (s.phase === 'init') expect(c).toContain('The points are grey');
              if (s.phase === 'assign') expect(c).toContain(`is ${num(s.inertia!)}.`);
              if (s.phase === 'update') {
                expect(c).toContain(`Inertia ${num(steps[i - 1].inertia!)} → ${num(s.inertia!)}`);
                expect(c.includes('won no points')).toBe(s.reseeded.length > 0);
              }
              if (s.phase === 'done') {
                expect(c.includes('got stuck in a worse local optimum')).toBe(s.inertia! > best * (1 + SAME_WITHIN));
                expect(c.includes('within 1% of the best')).toBe(Math.abs(s.inertia! - best) <= best * SAME_WITHIN);
                expect(c.includes('generated from')).toBe(agree !== null);
              }
            });
          }
        }
      }
    }
  });

  it('"Bad start" ends by saying it got stuck; "Stranded centroid" narrates its reseed at the first update', () => {
    const bad = preset('badinit');
    const steps = lloyd(bad.points, bad.fixedStart!);
    const frames = buildFrames(steps, { k: 3, method: 'fixed', bestInertia: bestOfRestarts(bad.points, 3, 1).inertia, agreement: null });
    expect(text(frames[frames.length - 1].say)).toContain('got stuck in a worse local optimum');
    const st = preset('stranded');
    const s2 = lloyd(st.points, st.fixedStart!);
    const f2 = buildFrames(s2, { k: 3, method: 'fixed', bestInertia: 1, agreement: null });
    expect(text(f2[2].say)).toContain('centroid won no points, so it is reseeded');
  });
});
