import { describe, expect, it } from 'vitest';
import { contrastRatio, formatRatio, luminance } from '../../core/contrast';
import { mulberry32 } from '../../core/random';
import {
  CONTRAST_PRESETS, GRADIENT_PRESETS, GRADIENT_SAMPLES, HSL_HALF, OKLCH_EVEN, encode8, hexToRgb, hslToRgb, hsvToRgb, inGamut,
  labToLch, lchToLab, linearOf8, linearToOklab, linearToSrgb, mix, oklabOf, oklabToLinear, oklchOf, oklchToRgb, profile, pureGamma,
  rgbToHex, rgbToHsl, rgbToHsv, srgbToLinear, toLinear, type RGB,
} from './model';

const rnd = mulberry32(99);
const randomRgb = (): RGB => [rnd(), rnd(), rnd()];

describe('sRGB transfer function (IEC 61966-2-1)', () => {
  it('round-trips all 256 8-bit values', () => {
    for (let v = 0; v < 256; v++) expect(encode8(linearOf8(v))).toBe(v);
  });

  it('uses the 0.04045 / 0.0031308 knees, and both pieces meet there', () => {
    expect(srgbToLinear(0.04045)).toBe(0.04045 / 12.92);
    expect(srgbToLinear(0.0405)).toBe(((0.0405 + 0.055) / 1.055) ** 2.4);
    expect(Math.abs(0.04045 / 12.92 - ((0.04045 + 0.055) / 1.055) ** 2.4)).toBeLessThan(1e-7);
    expect(linearToSrgb(0.0031308)).toBe(12.92 * 0.0031308);
    expect(Math.abs(12.92 * 0.0031308 - (1.055 * 0.0031308 ** (1 / 2.4) - 0.055))).toBeLessThan(1e-7);
  });

  it('is monotonic, with ends at 0 and 1, and the two directions invert each other', () => {
    for (let i = 1; i <= 1000; i++) expect(srgbToLinear(i / 1000)).toBeGreaterThan(srgbToLinear((i - 1) / 1000));
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 15);
    for (let i = 0; i <= 1000; i++) expect(linearToSrgb(srgbToLinear(i / 1000))).toBeCloseTo(i / 1000, 12);
  });

  it('sRGB 128 is about 22% linear light, and 50% linear light is sRGB 188', () => {
    expect(linearOf8(128)).toBeCloseTo(0.2159, 4);
    expect(Math.round(linearOf8(128) * 100)).toBe(22);
    expect(encode8(0.5)).toBe(188);
  });

  it('differs from a plain 2.2 gamma most near black', () => {
    expect(linearOf8(10) / pureGamma(10 / 255)).toBeGreaterThan(2);
    expect(Math.abs(linearOf8(200) - pureGamma(200 / 255))).toBeLessThan(0.01);
  });

  it('WCAG 2.x\'s 0.03928 knee gives the same luminance for every 8-bit grey', () => {
    // No 8-bit value lies between 0.03928 and 0.04045 (10/255 = 0.0392, 11/255 = 0.0431).
    for (let v = 0; v < 256; v++) expect(luminance([v, v, v])).toBeCloseTo(srgbToLinear(v / 255), 14);
    // and for coloured inputs too: luminance is the 0.2126/0.7152/0.0722 sum of the same linear channels
    for (let n = 0; n < 500; n++) {
      const c = [0, 1, 2].map(() => Math.floor(rnd() * 256)) as [number, number, number];
      const lin = c.map((v) => srgbToLinear(v / 255));
      expect(luminance(c)).toBeCloseTo(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2], 14);
    }
  });
});

describe('OKLab and OKLCH (Ottosson)', () => {
  it('#ff0000 → (0.6280, 0.2249, 0.1258); white → L 1; black → 0', () => { // allow-color: test name
    const red = oklabOf('#ff0000'); // allow-color: test vector
    expect(Math.abs(red.L - 0.628)).toBeLessThan(1e-3);
    expect(Math.abs(red.a - 0.2249)).toBeLessThan(1e-3);
    expect(Math.abs(red.b - 0.1258)).toBeLessThan(1e-3);
    const white = oklabOf('#ffffff'); // allow-color: test vector
    expect(Math.abs(white.L - 1)).toBeLessThan(1e-3);
    expect(Math.hypot(white.a, white.b)).toBeLessThan(1e-3);
    expect(oklabOf('#000000').L).toBe(0); // allow-color: test vector
  });

  it('agrees with the independent route through CIE XYZ and Ottosson\'s XYZ → LMS matrix', () => {
    const SRGB_TO_XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
    const XYZ_TO_LMS = [[0.8189330101, 0.3618667424, -0.1288597137], [0.0329845436, 0.9293118715, 0.0361456387], [0.0482003018, 0.2643662691, 0.633851707]];
    const LMS_TO_LAB = [[0.2104542553, 0.793617785, -0.0040720468], [1.9779984951, -2.428592205, 0.4505937099], [0.0259040371, 0.7827717662, -0.808675766]];
    const mul = (m: number[][], v: readonly number[]) => m.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));
    for (let n = 0; n < 300; n++) {
      const lin = randomRgb();
      const [L, a, b] = mul(LMS_TO_LAB, mul(XYZ_TO_LMS, mul(SRGB_TO_XYZ, lin)).map(Math.cbrt));
      const ours = linearToOklab(lin);
      expect(Math.abs(ours.L - L)).toBeLessThan(2e-3);
      expect(Math.abs(ours.a - a)).toBeLessThan(2e-3);
      expect(Math.abs(ours.b - b)).toBeLessThan(2e-3);
    }
  });

  it('round-trips sRGB → OKLab → OKLCH → OKLab → sRGB', () => {
    for (let n = 0; n < 500; n++) {
      const lin = randomRgb();
      const back = oklabToLinear(lchToLab(labToLch(linearToOklab(lin))));
      // The published forward and inverse matrices are rounded to 10 places, so they only invert each other to
      // ~3e-7 (worst of 20,000 random colours): far below one 8-bit step (1/255 ≈ 4e-3).
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - lin[i])).toBeLessThan(1e-6);
    }
  });

  it('flags colours outside sRGB, and clips them for display', () => {
    expect(inGamut(oklabToLinear(lchToLab({ L: 0.7, C: 0.4, h: 150 })))).toBe(false);
    const { rgb, clipped } = oklchToRgb({ L: 0.7, C: 0.4, h: 150 });
    expect(clipped).toBe(true);
    expect(rgb.every((c) => c >= 0 && c <= 1)).toBe(true);
  });
});

describe('HSL and HSV', () => {
  /** CSS Color 4's sample hslToRgb, a different formula from ours. */
  const cssHsl = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  };
  /** The standard f(n) form of HSV → RGB. */
  const refHsv = (h: number, s: number, v: number) => {
    const f = (n: number) => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5), f(3), f(1)];
  };

  it('match the reference formulas on a grid of hues, saturations and lightnesses', () => {
    for (let h = 0; h < 360; h += 7.5) {
      for (let s = 0; s <= 1; s += 0.125) {
        for (let l = 0; l <= 1; l += 0.125) {
          const ours = hslToRgb({ h, s, l });
          const ref = cssHsl(h, s, l);
          for (let i = 0; i < 3; i++) expect(ours[i]).toBeCloseTo(ref[i], 12);
          const oursV = hsvToRgb({ h, s, v: l });
          const refV = refHsv(h, s, l);
          for (let i = 0; i < 3; i++) expect(oursV[i]).toBeCloseTo(refV[i], 12);
        }
      }
    }
  });

  it('know the primaries and greys', () => {
    expect(rgbToHsl(hexToRgb('#ff0000'))).toEqual({ h: 0, s: 1, l: 0.5 }); // allow-color: test vector
    expect(rgbToHsl(hexToRgb('#00ff00')).h).toBe(120); // allow-color: test vector
    expect(rgbToHsl(hexToRgb('#0000ff')).h).toBe(240); // allow-color: test vector
    expect(rgbToHsl(hexToRgb('#800080')).h).toBe(300); // allow-color: test vector
    const grey = rgbToHsl(hexToRgb('#808080')); // allow-color: test vector
    expect(grey.s).toBe(0);
    expect(rgbToHsv(hexToRgb('#ffff00'))).toEqual({ h: 60, s: 1, v: 1 }); // allow-color: test vector
  });

  it('round-trip every colour on an 18-step grid, and every 8-bit hex on it exactly', () => {
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const rgb: RGB = [r / 255, g / 255, b / 255];
          const viaHsl = hslToRgb(rgbToHsl(rgb));
          const viaHsv = hsvToRgb(rgbToHsv(rgb));
          for (let i = 0; i < 3; i++) {
            expect(viaHsl[i]).toBeCloseTo(rgb[i], 12);
            expect(viaHsv[i]).toBeCloseTo(rgb[i], 12);
          }
          expect(rgbToHex(viaHsl)).toBe(rgbToHex(rgb));
        }
      }
    }
  });

  it('HSL L = 50% gives very different perceived lightness; the OKLCH row is even and inside sRGB', () => {
    const hslL = HSL_HALF.map((c) => linearToOklab(toLinear(hslToRgb(c.hsl))).L);
    expect(Math.max(...hslL) - Math.min(...hslL)).toBeGreaterThan(0.5);
    for (const h of OKLCH_EVEN.hues) {
      const { rgb, clipped } = oklchToRgb({ L: OKLCH_EVEN.L, C: OKLCH_EVEN.C, h: h.h });
      expect(clipped).toBe(false);
      // still even after rounding to an 8-bit hex
      expect(Math.abs(oklchOf(rgbToHex(rgb)).L - OKLCH_EVEN.L)).toBeLessThan(0.005);
    }
  });
});

describe('gradients', () => {
  const RG = GRADIENT_PRESETS[0];
  const BW = GRADIENT_PRESETS[2];

  it('in srgb, the red → green midpoint is darker than in oklch, and dips below both ends', () => {
    expect(mix(RG.from, RG.to, 0.5, 'srgb').L).toBeLessThan(mix(RG.from, RG.to, 0.5, 'oklch').L);
    // and for the colours actually shown (the oklch midpoint is outside sRGB and gets clipped)
    expect(profile(RG.from, RG.to, 'srgb').L[GRADIENT_SAMPLES / 2]).toBeLessThan(profile(RG.from, RG.to, 'oklch').L[GRADIENT_SAMPLES / 2]);
    const p = profile(RG.from, RG.to, 'srgb');
    expect(p.dip).not.toBeNull();
    expect(p.L[GRADIENT_SAMPLES / 2]).toBeLessThan(Math.min(p.L[0], p.L[GRADIENT_SAMPLES]));
  });

  it('the srgb midpoint of red → green is #808000, (128, 128, 0)', () => { // allow-color: test name
    expect(profile(RG.from, RG.to, 'srgb').hex[GRADIENT_SAMPLES / 2]).toBe('#808000'); // allow-color: test vector
  });

  it('the plotted L is the L of the colour actually shown, checked through its 8-bit hex', () => {
    for (let n = 0; n < 100; n++) {
      const a = rgbToHex(randomRgb());
      const b = rgbToHex(randomRgb());
      for (const space of ['srgb', 'srgb-linear', 'oklch'] as const) {
        const p = profile(a, b, space);
        // independent route: the drawn stop's hex, decoded again (8-bit rounding moves L by well under 0.005)
        p.hex.forEach((h, i) => expect(Math.abs(oklabOf(h).L - p.L[i])).toBeLessThan(0.005));
      }
    }
  });

  it('oklch’s own L (before mapping) is a straight line in t; where the mix leaves sRGB the shown L bends away from it', () => {
    for (let n = 0; n < 100; n++) {
      const p = profile(rgbToHex(randomRgb()), rgbToHex(randomRgb()), 'oklch');
      p.Lmix.forEach((L, i) => expect(L).toBeCloseTo(p.Lmix[0] + ((p.Lmix[GRADIENT_SAMPLES] - p.Lmix[0]) * i) / GRADIENT_SAMPLES, 12));
    }
    // the review's case: blue → yellow at t = 0.375 (sample 12) is out of gamut
    const by = profile('#0000ff', '#ffff00', 'oklch'); // allow-color: test vector
    expect(by.outOfGamut).toBe(23);
    expect(by.Lmix[12]).toBeCloseTo(0.646, 3);
    expect(by.L[12]).toBeCloseTo(0.71, 2);
    // in-gamut strips: what is shown is the mix itself
    for (const g of GRADIENT_PRESETS) for (const space of ['srgb', 'srgb-linear'] as const) expect(profile(g.from, g.to, space).L).toEqual(profile(g.from, g.to, space).Lmix);
  });

  it('black → white: no dip anywhere, and linear light rushes bright (its midpoint is ∛0.5 ≈ 0.79)', () => {
    for (const space of ['srgb', 'srgb-linear', 'oklch'] as const) expect(profile(BW.from, BW.to, space).dip).toBeNull();
    expect(mix(BW.from, BW.to, 0.5, 'srgb-linear').L).toBeCloseTo(Math.cbrt(0.5), 3);
    expect(mix(BW.from, BW.to, 0.5, 'oklch').L).toBeCloseTo(0.5, 6);
  });

  it('a grey end takes the other end\'s hue in oklch, so grey → red keeps red\'s hue all the way', () => {
    const redHue = oklchOf('#ff0000').h; // allow-color: test vector
    for (let i = 1; i < 10; i++) {
      const lin = mix('#808080', '#ff0000', i / 10, 'oklch').lin; // allow-color: test vector
      // to 0.001°: the round trip through the rounded matrices moves the hue by ~1e-5°
      expect(Math.abs(labToLch(linearToOklab(lin)).h - redHue)).toBeLessThan(1e-3);
    }
  });

  it('oklch red → green leaves sRGB in the middle (so a fallback has to clip), srgb never does', () => {
    expect(profile(RG.from, RG.to, 'oklch').outOfGamut).toBeGreaterThan(0);
    for (const g of GRADIENT_PRESETS) {
      expect(profile(g.from, g.to, 'srgb').outOfGamut).toBe(0);
      expect(profile(g.from, g.to, 'srgb-linear').outOfGamut).toBe(0);
    }
  });
});

describe('contrast presets (core/contrast)', () => {
  it('for greys with the same OKLab ΔL, the pair at the dark end always scores lower than the pair at the light end', () => {
    const greyWithL = (L: number) => {
      const v = encode8(L ** 3); // a grey's OKLab L is the cube root of its linear light
      return rgbToHex([v / 255, v / 255, v / 255]);
    };
    for (let d = 0.1; d <= 0.9; d += 0.05) {
      const dark = contrastRatio(greyWithL(0), greyWithL(d));
      const light = contrastRatio(greyWithL(1 - d), greyWithL(1));
      expect(dark, `ΔL ${d.toFixed(2)}`).toBeLessThan(light);
    }
  });

  it('#777 on #fff is 4.48:1; blue on black is 2.44:1, with almost the same OKLCH ΔL', () => { // allow-color: test name
    const [grey, blue] = CONTRAST_PRESETS;
    expect(formatRatio(contrastRatio(grey.fg, grey.bg))).toBe('4.48:1');
    expect(formatRatio(contrastRatio(blue.fg, blue.bg))).toBe('2.44:1');
    const dL = (p: { fg: string; bg: string }) => Math.abs(oklabOf(p.fg).L - oklabOf(p.bg).L);
    expect(Math.abs(dL(grey) - dL(blue))).toBeLessThan(0.03);
    expect(contrastRatio(grey.fg, grey.bg) / contrastRatio(blue.fg, blue.bg)).toBeGreaterThan(1.8);
  });
});
