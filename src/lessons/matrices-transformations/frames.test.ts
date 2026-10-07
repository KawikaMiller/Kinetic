import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { composeFrames, composeStageMatrix, homogeneousCaption, num, sig, transformCaption } from './frames';
import { mulberry32 } from '../../core/random';
import { COMPOSE_PRESETS, IDENTITY, PRESETS, TRANSFORM_PRESETS, collapse, det2, homogeneous, inverse2, isSingular, sameMatrix, thenApply, type M2 } from './model';

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

describe('sweep: tiny and typed matrices (review B8)', () => {
  it('a tiny but invertible matrix keeps a nonzero det in the caption and a real inverse', () => {
    expect(text(transformCaption([[0.01, 0], [0, 0.01]]))).toContain('det = 0.0001: every area is scaled by 0.0001');
    const tiny: M2 = [[1e-5, 0], [0, 1e-5]];
    expect(isSingular(tiny)).toBe(false);
    expect(text(transformCaption(tiny))).toContain('det = 1.00e−10');
    expect(text(transformCaption(tiny))).not.toContain('collapses');
    expect(text(transformCaption(tiny))).toContain('î lands on (1.00e−5, 0)');
    const inv = inverse2(tiny)!;
    expect(inv[0][0]).toBeCloseTo(1e5, 6);
  });

  it('line vs point comes from the rank: a nonzero singular matrix collapses onto a line, only the zero matrix onto a point', () => {
    expect(collapse([[1e-5, 0], [0, 0]])).toBe('line');
    expect(collapse([[0, 0], [0, 0]])).toBe('point');
    expect(text(transformCaption([[0, 1e-8], [0, 0]]))).toContain('onto a line');
  });

  it('over 5,000 typed matrices (decimals at many scales), the caption never prints "det = 0" for an invertible one, and inverse·M = I', () => {
    const rnd = mulberry32(99);
    const entry = () => {
      const scale = 10 ** -Math.floor(rnd() * 8);
      return rnd() < 0.2 ? 0 : Number(((rnd() * 6 - 3) * scale).toPrecision(3));
    };
    for (let t = 0; t < 5000; t++) {
      const m: M2 = [[entry(), entry()], [entry(), entry()]];
      const c = text(transformCaption(m));
      if (isSingular(m)) {
        expect(c).toContain('det = 0:');
        continue;
      }
      expect(c).not.toContain('det = 0:');
      expect(c).not.toContain('collapses');
      expect(sig(det2(m))).not.toBe('0');
      const inv = inverse2(m)!;
      const prod = thenApply(m, inv);
      prod.flat().forEach((v, i) => expect(Math.abs(v - [1, 0, 0, 1][i])).toBeLessThan(1e-6));
    }
  });
});

describe('sig', () => {
  it('keeps significant figures, with exponents only when tiny or huge', () => {
    expect(sig(4)).toBe('4');
    expect(sig(-1)).toBe('−1');
    expect(sig(0.0001)).toBe('0.0001');
    expect(sig(0.00001)).toBe('1.00e−5');
    expect(sig(0.866)).toBe('0.866');
    expect(sig(0)).toBe('0');
  });
});
