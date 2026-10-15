import type { Tone } from '../core/tone';

/** One band of a metric: values up to `upTo` (inclusive) are in it. The last band's `upTo` is only the meter's end. */
export interface MeterBand {
  upTo: number;
  tone: Tone;
  /** Named next to the value: "good", "needs improvement". */
  label: string;
  /** A tick (with a label under the track) at this band's upper edge. */
  tick?: { label: string; tone: Tone };
}

/** The first band that contains `value` (the last one catches everything above). */
export const bandOfValue = (value: number, bands: readonly MeterBand[]): MeterBand => bands.find((b) => value <= b.upTo) ?? bands[bands.length - 1];
