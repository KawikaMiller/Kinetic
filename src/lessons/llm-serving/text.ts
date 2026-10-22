import { bytes, pctText } from '../../core/format';

/** Seconds as milliseconds with two decimals: 0.02 is "20.00 ms". */
export const milliseconds = (seconds: number): string => `${(seconds * 1000).toFixed(2)} ms`;

/** A 0..1 share as a percentage with one decimal. */
export const share = (x: number): string => pctText(x, 1);

/** Decimal bytes, the way the hand arithmetic reads them: 50331648 is "50.3 MB". */
export const decimalBytes = (n: number, dp = 1): string => bytes(n, { base: 1000, dp });

/** Two byte counts to one decimal when that tells them apart, else to the fewest decimals that do (22.05 GB against 22.00 GB, never "22.0 GB against 22.0 GB"). */
export function distinctBytes(a: number, b: number): [string, string] {
  for (let dp = 1; dp <= 9; dp += 1) {
    const [x, y] = [decimalBytes(a, dp), decimalBytes(b, dp)];
    if (x !== y || a === b) return [x, y];
  }
  return [decimalBytes(a, 9), decimalBytes(b, 9)];
}

export const plainSeconds = (s: number): string => (s < 1 ? `${(s * 1000).toFixed(0)} ms` : `${s.toFixed(2)} s`);
