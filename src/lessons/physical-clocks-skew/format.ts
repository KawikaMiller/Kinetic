import { sig } from '../../core/format';

/** A signed time in ms as "−3.52 s" from a second up and "−204 ms" below it. */
export const timeText = (ms: number): string => (Math.abs(ms) >= 1000 ? `${sig(ms / 1000, 4)} s` : `${sig(ms, 4)} ms`);

/** The same without the sign of zero-ish values: "0 ms". */
export const absTimeText = (ms: number): string => timeText(Math.abs(ms));

/** A signed ms value with an explicit plus for positive numbers: "+5 ms". */
export const signedMs = (ms: number): string => `${ms > 0 ? '+' : ''}${sig(ms, 4)} ms`;
