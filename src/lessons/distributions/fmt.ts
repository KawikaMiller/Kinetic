/**
 * Number formatting shared by the Tier 3 statistics lessons. Phase 2: `sig` and `pctText` belong in
 * core/format; they live here because batches never edit shared code.
 */

/** `x` to `digits` significant figures with thousands separators: 1234.5 → "1,230", 0.012345 → "0.0123". */
export function sig(x: number, digits = 3): string {
  if (Number.isNaN(x)) return '–';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const rounded = Number(x.toPrecision(digits));
  const text = Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 20 });
  return rounded < 0 ? `−${text}` : text;
}

/** A share 0..1 as a percentage with `dp` decimals: 0.691 → "69.1%". */
export function pctText(share: number, dp = 1): string {
  if (Number.isNaN(share)) return '–';
  return `${(share * 100).toFixed(dp)}%`;
}

/** A ratio to two decimals: 0.9987 → "1.00", so a ratio near 1 never reads as a bare "1". */
export const ratioText = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : '–');
