import type { Tone } from '../../core/tone';

/** Cluster colours: plain categories, never --ok/--bad. Six of them, hence k ≤ 6 on the stage. */
export const CLUSTER_TONES: readonly Tone[] = ['info', 'violet', 'orange', 'pink', 'sky', 'amber'];
export const CLUSTER_NAMES = ['blue', 'violet', 'orange', 'pink', 'light blue', 'amber'] as const;
export const MAX_K = CLUSTER_TONES.length;

/** A number at 3 significant figures, with thousands separators once it's big. */
export function num(v: number): string {
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
  return String(Number(v.toPrecision(3)));
}
