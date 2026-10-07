// WCAG 2.x contrast: relative luminance, the contrast ratio, AA/AAA grading and the ratio as
// tools print it. Moved unchanged from the accessibility lesson (rollout K-21); color-spaces is
// the second user.

/** "#777" or "#777777" → [r, g, b] in 0..255. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of an sRGB colour. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** (L1 + 0.05) / (L2 + 0.05), lighter over darker: 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.x thresholds: AA 4.5 (normal) / 3 (large); AAA 7 / 4.5. */
export const THRESHOLDS = { aa: { normal: 4.5, large: 3 }, aaa: { normal: 7, large: 4.5 } } as const;

export function grade(ratio: number) {
  return {
    aaNormal: ratio >= THRESHOLDS.aa.normal,
    aaLarge: ratio >= THRESHOLDS.aa.large,
    aaaNormal: ratio >= THRESHOLDS.aaa.normal,
    aaaLarge: ratio >= THRESHOLDS.aaa.large,
  };
}

const LIMITS = [THRESHOLDS.aa.large, THRESHOLDS.aa.normal, THRESHOLDS.aaa.normal];

/**
 * The ratio to two decimals, as WCAG tools show it (#777 on #fff → "4.48:1"). Pass/fail
 * always uses the raw ratio; if rounding up would make a failing ratio *look* like it
 * reaches a threshold (4.496 → "4.50"), round down instead.
 */
export function formatRatio(r: number): string {
  const rounded = Math.round(r * 100) / 100;
  const misleading = LIMITS.some((t) => r < t && rounded >= t);
  return `${(misleading ? Math.floor(r * 100) / 100 : rounded).toFixed(2)}:1`;
}
