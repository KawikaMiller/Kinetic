import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../core/palette';
import { COLOUR_HEX } from './colors';

/** CIEDE2000 between two sRGB hex colours (Sharma, Wu and Dalal's reference formulation), written out here as the oracle. */
function deltaE2000(h1: string, h2: string): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lab = (hex: string): [number, number, number] => {
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
    const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
    const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
    const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const rad = Math.PI / 180;
  const [L1, a1, b1] = lab(h1);
  const [L2, a2, b2] = lab(h2);
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360);
  const hp1 = hue(b1, a1p);
  const hp2 = hue(b2, a2p);
  let dh = hp2 - hp1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2;
  const Cb = (C1 + C2) / 2;
  const hs = hp1 + hp2;
  const hb = Math.abs(hp1 - hp2) <= 180 ? hs / 2 : (hs + (hs < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const Rc = 2 * Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7));
  const Rt = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * Rc;
  const dLs = (L2 - L1) / (1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2));
  const dCs = (C2 - C1) / (1 + 0.045 * Cb);
  const dHs = dH / (1 + 0.015 * Cb * T);
  return Math.sqrt(dLs ** 2 + dCs ** 2 + dHs ** 2 + Rt * dCs * dHs);
}

const MIN_DISTANCE = 15;
const SEMANTIC = ['hi', 'ok', 'bad', 'info', 'violet', 'dim'] as const;

describe('the node colour palette', () => {
  it('the distance oracle is sane: identical colours 0, black against white 100', () => {
    expect(deltaE2000('#ffffff', '#ffffff')).toBe(0); // allow-color: test input for the distance oracle
    expect(deltaE2000('#000000', '#ffffff')).toBeCloseTo(100, 0); // allow-color: test input for the distance oracle
  });

  it('has twelve colours, every pair at least 15 apart (CIEDE2000)', () => {
    expect(COLOUR_HEX).toHaveLength(12);
    for (let i = 0; i < COLOUR_HEX.length; i++) {
      for (let j = i + 1; j < COLOUR_HEX.length; j++) {
        expect(deltaE2000(COLOUR_HEX[i], COLOUR_HEX[j]), `colours ${i + 1} and ${j + 1}`).toBeGreaterThanOrEqual(MIN_DISTANCE);
      }
    }
  });

  it('keeps every colour at least 15 from each status token and from the panel it sits on', () => {
    for (const [i, hex] of COLOUR_HEX.entries()) {
      for (const t of [...SEMANTIC, 'bg', 'panel', 'cell'] as const) {
        expect(deltaE2000(hex, TOKENS[t]), `colour ${i + 1} against --${t}`).toBeGreaterThanOrEqual(MIN_DISTANCE);
      }
    }
  });
});
