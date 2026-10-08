import { describe, expect, it } from 'vitest';
import { contrastRatio, formatRatio, grade } from '../../core/contrast';
import { captionText as text } from '../../core/testing/captions';
import { contrastCaption, f3, gammaCaption, gradientCaption, modelsCaption, pct1, TOE_MAX_8BIT } from './frames';
import lesson from './index';
import {
  CONTRAST_PRESETS, GRADIENT_PRESETS, GRADIENT_SAMPLES, MIX_SPACES, encode8, hslToRgb, linearOf8, linearToOklab, linearToSrgb,
  oklabOf, profile, rgbToHsl, toLinear, hexToRgb, type MixSpace, type Profile,
} from './model';

const profilesOf = (from: string, to: string) => Object.fromEntries(MIX_SPACES.map((s) => [s, profile(from, to, s)])) as Record<MixSpace, Profile>;

describe('gradientCaption', () => {
  it('claims a dip exactly when the srgb profile has one, and prints numbers that differ', () => {
    const pairs = [...GRADIENT_PRESETS.map((p) => [p.from, p.to]), ['#ff0000', '#0000ff'], ['#ffffff', '#ff00ff'], ['#336699', '#996633']]; // allow-color: test vectors
    for (const [a, b] of pairs) {
      const ps = profilesOf(a, b);
      const c = text(gradientCaption(a, b, ps));
      const s = ps.srgb;
      expect(c.includes('dips to L =')).toBe(s.dip !== null);
      if (s.dip) {
        const low = f3(s.L[Math.round(s.dip.t * GRADIENT_SAMPLES)]);
        expect(c).toContain(`dips to L = ${low}`);
        // never "dips to 0.628, darker than 0.628": three decimals always tell them apart
        expect(low).not.toBe(f3(s.L[0]));
        expect(low).not.toBe(f3(s.L[GRADIENT_SAMPLES]));
      }
      expect(c.includes('outside sRGB')).toBe(ps.oklch.outOfGamut > 0);
      if (ps.oklch.outOfGamut) expect(c).toContain(`${ps.oklch.outOfGamut} of the ${GRADIENT_SAMPLES + 1} oklch samples`);
    }
  });
});

describe('gammaCaption', () => {
  it('uses the model\'s numbers for every 8-bit value, and mentions the toe only where it is', () => {
    for (let v = 1; v < 255; v++) {
      const c = text(gammaCaption(v));
      expect(c).toContain(`sRGB ${v} is ${pct1(v / 255)} of the way up`);
      expect(c).toContain(`only ${pct1(linearOf8(v))} of the light`);
      expect(linearOf8(v)).toBeLessThan(v / 255); // "only" is true for every value in between
      expect(c.includes('straight line')).toBe(v <= TOE_MAX_8BIT);
    }
    expect(0.04045 * 255).toBeGreaterThan(TOE_MAX_8BIT);
    expect(0.04045 * 255).toBeLessThan(TOE_MAX_8BIT + 1);
    expect(text(gammaCaption(128))).toContain('21.6% of the light');
    expect(text(gammaCaption(128))).toContain('Half the light (50% linear) is sRGB 188');
  });
});

describe('modelsCaption and contrastCaption', () => {
  it('report HSL L and OKLCH L from the model', () => {
    const c = text(modelsCaption('#ffff00')); // allow-color: test vector
    expect(c).toContain('HSL calls its lightness 50%');
    expect(c).toContain(`L = ${f3(oklabOf('#ffff00').L)}`); // allow-color: test vector
  });

  it('gives the verdict core/contrast gives, for the presets and a spread of pairs', () => {
    const pairs = [...CONTRAST_PRESETS.map((p) => [p.fg, p.bg]), ['#000000', '#ffffff'], ['#767676', '#ffffff'], ['#949494', '#ffffff'], ['#ffff00', '#ffffff']]; // allow-color: test vectors
    for (const [fg, bg] of pairs) {
      const r = contrastRatio(fg, bg);
      const g = grade(r);
      const c = text(contrastCaption(fg, bg));
      expect(c).toContain(formatRatio(r));
      expect(c.includes('passes AA for body text')).toBe(g.aaNormal);
      expect(c.includes('passes for large text')).toBe(!g.aaNormal && g.aaLarge);
      expect(c.includes('fails AA even for large text')).toBe(!g.aaLarge);
    }
  });
});

describe('the quiz\'s numbers come from the model', () => {
  const whys = lesson.quiz.map((q) => q.why).join(' ');
  it('Q1 and Q5: 128 → 0.216 of the light, 50% light → 188, and 50% encoded reads 0.735', () => {
    expect(linearOf8(128).toFixed(3)).toBe('0.216');
    expect(encode8(0.5)).toBe(188);
    expect(linearToSrgb(0.5).toFixed(3)).toBe('0.735');
    expect(whys).toContain('0.216');
    expect(whys).toContain('0.735');
    expect(whys).toContain('sRGB 188');
  });
  it('Q2: HSL 50% yellow and blue have OKLCH L about 0.97 and 0.45', () => {
    const L = (h: number) => linearToOklab(toLinear(hslToRgb({ h, s: 1, l: 0.5 }))).L;
    expect(L(60).toFixed(2)).toBe('0.97');
    expect(L(240).toFixed(2)).toBe('0.45');
    expect(rgbToHsl(hexToRgb('#ffff00')).l).toBe(0.5); // allow-color: test vector
  });
  it('Q4: 4.48:1 and 2.44:1', () => {
    expect(formatRatio(contrastRatio(CONTRAST_PRESETS[0].fg, CONTRAST_PRESETS[0].bg))).toBe('4.48:1');
    expect(formatRatio(contrastRatio(CONTRAST_PRESETS[1].fg, CONTRAST_PRESETS[1].bg))).toBe('2.44:1');
  });
});
