import { bytes, pctText } from '../../core/format';

/** Seconds as milliseconds with two decimals: 0.02 is "20.00 ms". */
export const milliseconds = (seconds: number): string => `${(seconds * 1000).toFixed(2)} ms`;

/** A 0..1 share as a percentage with one decimal. */
export const share = (x: number): string => pctText(x, 1);

/** Decimal bytes, the way the hand arithmetic reads them: 50331648 is "50.3 MB". */
export const decimalBytes = (n: number): string => bytes(n, { base: 1000, dp: 1 });

export const plainSeconds = (s: number): string => (s < 1 ? `${(s * 1000).toFixed(0)} ms` : `${s.toFixed(2)} s`);
