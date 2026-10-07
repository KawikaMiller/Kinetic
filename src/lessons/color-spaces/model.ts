// Colour maths for the lesson: the sRGB transfer function (IEC 61966-2-1), OKLab/OKLCH
// (Björn Ottosson, 2020), HSL and HSV, gradient mixing in three spaces, and gamut checks.
// Channels are 0..1 unless a name says 8-bit. WCAG contrast lives in core/contrast.
import { clamp, lerp } from '../../core/math';
import { parseHex } from '../../core/contrast';

export type RGB = readonly [number, number, number];
export interface Lab { L: number; a: number; b: number }
export interface Lch { L: number; C: number; h: number }

// ── sRGB transfer function ──────────────────────────────────────────

/** IEC 61966-2-1 decoding: a linear toe below 0.04045, then a 2.4 power curve. Not a plain 2.2 gamma. */
export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** IEC 61966-2-1 encoding, the inverse: linear below 0.0031308. */
export const linearToSrgb = (l: number) => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
/** A pure power-law gamma, for comparison only. */
export const pureGamma = (c: number, gamma = 2.2) => c ** gamma;

export const to8 = (c: number) => Math.round(clamp(c, 0, 1) * 255);
/** An 8-bit sRGB value → linear light (0..1). */
export const linearOf8 = (v: number) => srgbToLinear(v / 255);
/** Linear light → the nearest 8-bit sRGB value. */
export const encode8 = (l: number) => to8(linearToSrgb(l));

// ── Hex ─────────────────────────────────────────────────────────────

export const HEX_RE = /^#[0-9a-f]{6}$/i;
export const hexToRgb = (hex: string): RGB => parseHex(hex).map((v) => v / 255) as unknown as RGB;
export const rgbToHex = (rgb: RGB) => `#${rgb.map((c) => to8(c).toString(16).padStart(2, '0')).join('')}`;
export const rgb8 = (rgb: RGB) => rgb.map(to8) as [number, number, number];
export const toLinear = (rgb: RGB): RGB => rgb.map(srgbToLinear) as unknown as RGB;
export const fromLinear = (lin: RGB): RGB => lin.map(linearToSrgb) as unknown as RGB;

// ── OKLab / OKLCH (Ottosson's published matrices) ───────────────────

const cbrt = (x: number) => Math.sign(x) * Math.abs(x) ** (1 / 3);

export function linearToOklab([r, g, b]: RGB): Lab {
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinear({ L, a, b }: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function labToLch({ L, a, b }: Lab): Lch {
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}
export function lchToLab({ L, C, h }: Lch): Lab {
  const r = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(r), b: C * Math.sin(r) };
}

export const oklabOf = (hex: string) => linearToOklab(toLinear(hexToRgb(hex)));
export const oklchOf = (hex: string) => labToLch(oklabOf(hex));

/** Below this chroma a colour is treated as grey: its hue is "powerless", as CSS Color 4 calls it. */
export const ACHROMATIC_C = 1e-4;
export const GAMUT_EPS = 1e-6;

export const inGamut = (lin: RGB) => lin.every((c) => c >= -GAMUT_EPS && c <= 1 + GAMUT_EPS);

/** Clip each channel into [0, 1]: what the fallback strip does with colours sRGB can't show. */
export const clipLinear = (lin: RGB): RGB => lin.map((c) => clamp(c, 0, 1)) as unknown as RGB;

/** OKLCH → sRGB, with whether it had to be clipped to fit. */
export function oklchToRgb(c: Lch): { rgb: RGB; clipped: boolean } {
  const lin = oklabToLinear(lchToLab(c));
  return { rgb: fromLinear(clipLinear(lin)), clipped: !inGamut(lin) };
}

// ── HSL and HSV ─────────────────────────────────────────────────────

export interface Hsl { h: number; s: number; l: number }
export interface Hsv { h: number; s: number; v: number }

/** Hue in degrees from the max channel's sector; 0 for greys. */
function hueOf([r, g, b]: RGB, max: number, d: number): number {
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function rgbToHsl(rgb: RGB): Hsl {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(rgb, max, d), s, l };
}

export function rgbToHsv(rgb: RGB): Hsv {
  const max = Math.max(...rgb);
  const d = max - Math.min(...rgb);
  return { h: hueOf(rgb, max, d), s: max === 0 ? 0 : d / max, v: max };
}

/** Chroma, hue and a lightness offset → RGB, by hue sector. */
function fromSector(c: number, h: number, m: number): RGB {
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

export function hslToRgb({ h, s, l }: Hsl): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  return fromSector(c, h, l - c / 2);
}

export function hsvToRgb({ h, s, v }: Hsv): RGB {
  const c = v * s;
  return fromSector(c, h, v - c);
}

// ── Gradients ───────────────────────────────────────────────────────

export type MixSpace = 'srgb' | 'srgb-linear' | 'oklch';
export const MIX_SPACES: readonly MixSpace[] = ['srgb', 'srgb-linear', 'oklch'];

/** Shorter hue arc, as CSS's default `shorter` hue interpolation. */
export function mixHue(h0: number, h1: number, t: number): number {
  let d = (((h1 - h0) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return (((h0 + d * t) % 360) + 360) % 360;
}

export interface Mixed {
  /** Linear-light RGB of the mix, possibly outside [0, 1] (OKLCH can leave sRGB). */
  lin: RGB;
  /** Perceived lightness of the mix (OKLab L). */
  L: number;
}

/** The colour a CSS gradient `in <space>` shows at t, from two sRGB colours. */
export function mix(from: string, to: string, t: number, space: MixSpace): Mixed {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (space === 'srgb') {
    const lin = toLinear(a.map((c, i) => lerp(c, b[i], t)) as unknown as RGB);
    return { lin, L: linearToOklab(lin).L };
  }
  if (space === 'srgb-linear') {
    const la = toLinear(a);
    const lb = toLinear(b);
    const lin = la.map((c, i) => lerp(c, lb[i], t)) as unknown as RGB;
    return { lin, L: linearToOklab(lin).L };
  }
  const ca = labToLch(linearToOklab(toLinear(a)));
  const cb = labToLch(linearToOklab(toLinear(b)));
  // A grey's hue is powerless: it takes the other end's hue, so grey → red doesn't swing through other hues.
  const ha = ca.C < ACHROMATIC_C ? cb.h : ca.h;
  const hb = cb.C < ACHROMATIC_C ? ca.h : cb.h;
  const lch = { L: lerp(ca.L, cb.L, t), C: lerp(ca.C, cb.C, t), h: mixHue(ha, hb, t) };
  return { lin: oklabToLinear(lchToLab(lch)), L: lch.L };
}

export const GRADIENT_SAMPLES = 32;

export interface Profile {
  space: MixSpace;
  /** OKLab L of the colour actually shown at t = i / GRADIENT_SAMPLES: after clipping into sRGB, as the fallback strip draws it. */
  L: number[];
  /** OKLab L of the mix itself, before any mapping into sRGB (a straight line for oklch). Equal to L where the mix is in gamut. */
  Lmix: number[];
  /** The sampled colours as #rrggbb (clipped into sRGB where needed). */
  hex: string[];
  /** How many samples fall outside sRGB before clipping. */
  outOfGamut: number;
  /** The deepest sample below the darker end, if the middle dips below both ends. */
  dip: { t: number; depth: number } | null;
}

/** A dip only counts when it is visibly below both ends (0.005 in OKLab L). */
export const DIP_MIN = 0.005;

export function profile(from: string, to: string, space: MixSpace): Profile {
  const samples = Array.from({ length: GRADIENT_SAMPLES + 1 }, (_, i) => mix(from, to, i / GRADIENT_SAMPLES, space));
  const L = samples.map((s) => linearToOklab(clipLinear(s.lin)).L);
  const Lmix = samples.map((s) => s.L);
  const floor = Math.min(L[0], L[GRADIENT_SAMPLES]);
  let dip: Profile['dip'] = null;
  L.forEach((v, i) => {
    if (i === 0 || i === GRADIENT_SAMPLES) return;
    const depth = floor - v;
    if (depth > DIP_MIN && (!dip || depth > dip.depth)) dip = { t: i / GRADIENT_SAMPLES, depth };
  });
  return {
    space,
    L,
    Lmix,
    hex: samples.map((s) => rgbToHex(fromLinear(clipLinear(s.lin)))),
    outOfGamut: samples.filter((s) => !inGamut(s.lin)).length,
    dip,
  };
}

/** A gradient made of the model's own stops, for browsers without `in <space>` support. */
export const fallbackGradient = (p: Profile) => `linear-gradient(to right, ${p.hex.join(', ')})`;
export const cssGradient = (from: string, to: string, space: MixSpace) => `linear-gradient(in ${space} to right, ${from}, ${to})`;

// ── Presets ─────────────────────────────────────────────────────────

export const GRADIENT_PRESETS = [
  { id: 'rg', label: 'red → green', from: '#ff0000', to: '#00ff00' }, // allow-color: preset material
  { id: 'by', label: 'blue → yellow', from: '#0000ff', to: '#ffff00' }, // allow-color: preset material
  { id: 'bw', label: 'black → white', from: '#000000', to: '#ffffff' }, // allow-color: preset material
] as const;

/** HSL's "L = 50%" for three hues: same number, very different lightness. */
export const HSL_HALF = [
  { name: 'yellow', hsl: { h: 60, s: 1, l: 0.5 } },
  { name: 'green', hsl: { h: 120, s: 1, l: 0.5 } },
  { name: 'blue', hsl: { h: 240, s: 1, l: 0.5 } },
] as const;

/** The same three hue families at one OKLCH lightness and chroma, all inside sRGB. */
export const OKLCH_EVEN = { L: 0.7, C: 0.12, hues: [{ name: 'yellow', h: 110 }, { name: 'green', h: 142 }, { name: 'blue', h: 264 }] } as const;

/** Two text/background pairs with almost the same OKLCH ΔL and very different WCAG ratios. */
export const CONTRAST_PRESETS = [
  { id: 'grey', label: '#777 on white', fg: '#777777', bg: '#ffffff' }, // allow-color: preset material
  { id: 'blue', label: 'blue on black', fg: '#0000ff', bg: '#000000' }, // allow-color: preset material
] as const;
