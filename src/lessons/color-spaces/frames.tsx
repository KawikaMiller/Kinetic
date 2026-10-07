import type { ReactNode } from 'react';
import { contrastRatio, formatRatio, grade, THRESHOLDS } from '../../core/contrast';
import { encode8, GRADIENT_SAMPLES, linearOf8, oklabOf, oklchOf, pureGamma, rgbToHsl, hexToRgb, type Profile } from './model';

export const f3 = (v: number) => v.toFixed(3);
export const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** What the three lightness profiles show, worked out from them. */
export function gradientCaption(from: string, to: string, profiles: Record<'srgb' | 'srgb-linear' | 'oklch', Profile>): ReactNode {
  const s = profiles.srgb;
  const o = profiles.oklch;
  const ends = `${f3(s.L[0])} and ${f3(s.L[GRADIENT_SAMPLES])}`;
  const gamut = o.outOfGamut > 0
    ? <> {o.outOfGamut} of the {GRADIENT_SAMPLES + 1} oklch samples are outside sRGB, so your browser maps them into what your screen can show.</>
    : null;
  if (s.dip) {
    const low = s.L[Math.round(s.dip.t * GRADIENT_SAMPLES)];
    return (
      <>{from} → {to}: in srgb the strip <span className="hl bad">dips to L = {f3(low)}</span> around t = {s.dip.t.toFixed(2)}, darker than both ends ({ends}): that's the muddy band.
        In oklch, lightness runs in a straight line between the ends.{gamut}</>
    );
  }
  return (
    <>{from} → {to}: no strip dips below its ends this time (perceived lightness {ends} at the ends). Compare how evenly each one gets there:
      in oklch it's a straight line.{gamut}</>
  );
}

/** sRGB's linear toe covers 0.04045 × 255 ≈ 10.3, so 8-bit values 0 to 10. */
export const TOE_MAX_8BIT = 10;

export function gammaCaption(v: number): ReactNode {
  const lin = linearOf8(v);
  if (v === 0) return <>sRGB 0 is no light at all, in every encoding.</>;
  if (v === 255) return <>sRGB 255 is full light: 100% in every encoding.</>;
  return (
    <>sRGB {v} is {pct1(v / 255)} of the way up the stored numbers, but only <span className="hl info">{pct1(lin)} of the light</span>.
      Half the light (50% linear) is sRGB {encode8(0.5)}.{v <= TOE_MAX_8BIT ? <> Down here a plain 2.2 gamma would say {pct1(pureGamma(v / 255))}: from sRGB 0 to {TOE_MAX_8BIT} the real curve is a straight line.</> : null}</>
  );
}

export function modelsCaption(hex: string): ReactNode {
  const hsl = rgbToHsl(hexToRgb(hex));
  const lch = oklchOf(hex);
  return (
    <>{hex}: HSL calls its lightness {Math.round(hsl.l * 100)}%, while OKLCH, built to track how light it looks, gives L = {f3(lch.L)}.
      The HSL row shows how far apart those can drift.</>
  );
}

export function contrastCaption(fg: string, bg: string): ReactNode {
  const r = contrastRatio(fg, bg);
  const g = grade(r);
  const dL = Math.abs(oklabOf(fg).L - oklabOf(bg).L);
  const verdict = g.aaNormal
    ? <span className="hl ok">passes AA for body text</span>
    : g.aaLarge
      ? <><span className="hl bad">fails AA for body text</span> (needs {THRESHOLDS.aa.normal}:1) but passes for large text ({THRESHOLDS.aa.large}:1)</>
      : <span className="hl bad">fails AA even for large text</span>;
  return <>{fg} on {bg}: {formatRatio(r)}, so it {verdict}. The OKLCH lightness difference is ΔL = {f3(dL)}.</>;
}
