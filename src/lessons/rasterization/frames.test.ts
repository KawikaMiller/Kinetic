import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { coverageFrames, depthCaption, num, sharedCaption } from './frames';
import { COVERAGE_PRESET, DEPTH_PRESET, SHARED_PRESET, SLIVER_PRESET, TINY_PRESET, drawDepth, sharedEdge, wrongPixels, type FillRule, type Tri } from './model';

const TRIS: Tri[] = [COVERAGE_PRESET, SLIVER_PRESET, TINY_PRESET];

describe('coverage frames, every preset × sample count', () => {
  it('one frame per tested pixel, and the summary counts are the raster\'s own', () => {
    for (const tri of TRIS) {
      for (const n of [1, 2, 4]) {
        const { raster, frames } = coverageFrames(tri, n);
        const count = raster.tested.length;
        expect(frames).toHaveLength(count ? count + 2 : 1);
        for (const f of frames) expect(text(f.say)).not.toMatch(/NaN|undefined|Infinity/);
        if (count) {
          const last = text(frames[frames.length - 1].say);
          expect(last).toContain(`${count} pixels tested, ${raster.covered} `);
        }
      }
    }
  });

  it('a pixel caption says "lights" exactly when its centre is inside (centre-only mode)', () => {
    for (const tri of TRIS) {
      const { raster, frames } = coverageFrames(tri, 1);
      raster.tested.forEach((p, i) => {
        const c = text(frames[i + 1].say);
        expect(c.includes('it lights')).toBe(p.centre.inside);
        expect(c.includes('outside')).toBe(p.centre.w.some((w) => w < 0));
      });
    }
  });

  it('supersampled captions report the real sample count and shade', () => {
    const { raster, frames } = coverageFrames(COVERAGE_PRESET, 4);
    raster.tested.forEach((p, i) => {
      expect(text(frames[i + 1].say)).toContain(`${Math.round(p.cover * 16)} of 16 sample points are inside`);
    });
  });

  it('the tiny preset tests nothing in centre mode, and says so', () => {
    const { frames } = coverageFrames(TINY_PRESET, 1);
    expect(frames).toHaveLength(1);
    expect(text(frames[0].say)).toContain('nothing is tested and nothing lights');
  });

  it('a zero-area triangle says so', () => {
    const { frames } = coverageFrames([{ x: 1, y: 1 }, { x: 5, y: 5 }, { x: 9, y: 9 }], 1);
    expect(text(frames[0].say)).toContain('no area');
  });
});

describe('sharedCaption, every rule on the preset and on edits', () => {
  const { s0, s1, pa, pb } = SHARED_PRESET;
  const cases = [
    { name: 'preset', pts: [s0, s1, pa, pb] },
    // Shared edge moved off the pixel centres (quarter positions): no centre lies on it.
    { name: 'edge off centres', pts: [{ x: 2.25, y: 13.25 }, { x: 20.25, y: 1.25 }, pa, pb] },
    // Far corners on the same side: the triangles overlap.
    { name: 'overlapping', pts: [s0, s1, pa, { x: 6, y: 3 }] },
  ];
  it('the verdict and every number match the computed result', () => {
    expect(sharedEdge(cases[1].pts[0], cases[1].pts[1], pa, pb, 'inclusive').overdraw).toHaveLength(0); // the zero branch is exercised
    for (const c of cases) {
      for (const rule of ['inclusive', 'exclusive', 'topLeft'] as FillRule[]) {
        const r = sharedEdge(c.pts[0], c.pts[1], c.pts[2], c.pts[3], rule);
        const cap = text(sharedCaption(r, rule));
        if (!r.proper) {
          expect(cap, c.name).toContain('the triangles overlap');
          continue;
        }
        if (rule === 'inclusive') expect(cap).toContain(r.overdraw.length > 0 ? 'so they are drawn twice' : 'so nothing is drawn twice');
        if (rule === 'exclusive') expect(cap).toContain(r.gaps.length > 0 ? 'so they are never drawn' : 'nothing goes missing');
        if (rule === 'topLeft') {
          expect(r.overdraw).toHaveLength(0);
          expect(r.gaps).toHaveLength(0);
          expect(cap).toContain('exactly one of the two');
        }
        if (r.overdraw.length && rule === 'inclusive') expect(cap).toContain(`${r.overdraw.length} pixel centre`);
        if (r.gaps.length && rule === 'exclusive') expect(cap).toContain(`${r.gaps.length} pixel centre`);
      }
    }
  });

  it('the preset shows both failures without the rule', () => {
    const cap = (rule: FillRule) => text(sharedCaption(sharedEdge(s0, s1, pa, pb, rule), rule));
    expect(cap('inclusive')).toContain('drawn twice');
    expect(cap('exclusive')).toContain('5 pixel centres along the shared edge, between its ends');
  });
});

describe('depthCaption, z-buffer × order', () => {
  it('numbers come from the drawn picture, in all four combinations', () => {
    for (const z of [false, true]) {
      for (const order of [[0, 1], [1, 0]] as [number, number][]) {
        const cap = text(depthCaption(DEPTH_PRESET, order, z));
        const wrong = wrongPixels(drawDepth(DEPTH_PRESET, order, z));
        if (z) {
          expect(wrong).toBe(0);
          expect(cap).toContain('every overlap pixel shows the nearer triangle');
        } else {
          expect(cap).toContain(`${wrong} pixels now show the farther triangle`);
          expect(cap).toContain('no draw order is right everywhere');
          expect(cap).toContain(order[1] === 0 ? 'violet triangle is drawn second' : 'amber triangle is drawn second');
        }
      }
    }
  });
});

describe('num', () => {
  it('writes exact sixteenths without rounding them to zero, with a real minus', () => {
    expect(num(0.0625)).toBe('0.0625');
    expect(num(-1.25)).toBe('−1.25');
    expect(num(0)).toBe('0');
  });
});
