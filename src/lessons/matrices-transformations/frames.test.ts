import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { composeFrames, composeStageMatrix, homogeneousCaption, num, transformCaption } from './frames';
import { COMPOSE_PRESETS, IDENTITY, PRESETS, TRANSFORM_PRESETS, homogeneous, sameMatrix, thenApply, type M2 } from './model';

describe('transformCaption', () => {
  it('says what each preset does, from its determinant', () => {
    const c = (id: keyof typeof PRESETS) => text(transformCaption(PRESETS[id].m));
    expect(c('identity')).toBe('î lands on (1, 0) and ĵ on (0, 1): the matrix\'s two columns. det = 1: areas are unchanged, and the F still reads the right way round.');
    expect(c('rotate')).toContain('î lands on (0.866, 0.5) and ĵ on (−0.5, 0.866)');
    expect(c('rotate')).toContain('areas are unchanged');
    expect(c('scale')).toContain('det = 4: every area is scaled by 4');
    expect(c('reflect')).toContain('det = −1: areas scale by 1, and the minus sign means the plane was flipped');
    expect(c('project')).toContain('collapses onto a line');
    expect(c('singular')).toContain('det = 0: the whole plane collapses onto a line');
    expect(c('singular')).toContain('no inverse');
    expect(text(transformCaption([[0, 0], [0, 0]]))).toContain('collapses onto a single point, the origin');
  });

  it('never claims a flip or a collapse that isn’t there, for every preset and some typed matrices', () => {
    const typed: M2[] = [[[1.5, 0], [0, -0.5]], [[0.2, 0.6], [0.4, 1.2]], [[-1, 0], [0, -1]], [[3, 3], [-3, 3]]];
    for (const m of [...TRANSFORM_PRESETS.map((id) => PRESETS[id].m), ...typed]) {
      const c = text(transformCaption(m));
      const d = m[0][0] * m[1][1] - m[0][1] * m[1][0];
      expect(c.includes('flipped')).toBe(d < 0);
      expect(c.includes('collapses')).toBe(d === 0);
      expect(c).not.toMatch(/NaN|Infinity/);
    }
  });

  it('rotating by 180° has det +1: no flip, even though both axes reverse', () => {
    expect(text(transformCaption([[-1, 0], [0, -1]]))).toContain('det = 1: areas are unchanged');
  });
});

describe('composeFrames, every A × B pair', () => {
  it('walks 0 → 1 → 2 steps, and the last caption’s verdict matches the real products', () => {
    for (const a of COMPOSE_PRESETS) {
      for (const b of COMPOSE_PRESETS) {
        const frames = composeFrames(a, b);
        expect(frames.map((f) => f.stage)).toEqual([0, 1, 2]);
        const same = sameMatrix(thenApply(PRESETS[a].m, PRESETS[b].m), thenApply(PRESETS[b].m, PRESETS[a].m));
        const last = text(frames[2].say);
        expect(last.includes('B·A = A·B')).toBe(same);
        expect(last.includes('B·A ≠ A·B')).toBe(!same);
        expect(text(frames[1].say)).toContain(PRESETS[a].label.toLowerCase());
      }
    }
  });

  it('the default pair (rotate, stretch) disagrees; scale with anything agrees', () => {
    expect(text(composeFrames('rotate', 'stretch')[2].say)).toContain('B·A ≠ A·B');
    expect(text(composeFrames('rotate', 'scale')[2].say)).toContain('commute');
  });

  it('each side’s matrix at each step: identity, then its first transform, then both', () => {
    expect(composeStageMatrix('rotate', 'stretch', 0)).toEqual(IDENTITY);
    expect(composeStageMatrix('rotate', 'stretch', 1)).toEqual(PRESETS.rotate.m);
    expect(sameMatrix(composeStageMatrix('rotate', 'stretch', 2), thenApply(PRESETS.rotate.m, PRESETS.stretch.m))).toBe(true);
  });
});

describe('homogeneousCaption', () => {
  it('says the origin stays put without translation, and names the shift otherwise', () => {
    expect(text(homogeneousCaption(homogeneous(PRESETS.rotate.m, [0, 0])))).toContain('the origin stays put');
    expect(text(homogeneousCaption(homogeneous(PRESETS.rotate.m, [1.5, -2])))).toContain('Translate by (1.5, −2)');
  });
});

describe('num', () => {
  it('formats with a real minus and no trailing zeros', () => {
    expect(num(Math.sqrt(3) / 2)).toBe('0.866');
    expect(num(-0.5)).toBe('−0.5');
    expect(num(-1e-12)).toBe('0');
  });
});
