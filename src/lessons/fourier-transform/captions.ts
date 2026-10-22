/** Captions for every scene, built from the model so each number is the one on screen. Plain strings. */
import { decimal, integer, pct, plural } from '../../core/format';
import { circlesOf, shapeError, shapeSamples, SAMPLES as SHAPE_SAMPLES, type ShapeId } from './epicycles';
import { HARMONICS, TARGETS, rmsError, snapToDft, targetSamples, type HarmonicsState } from './harmonics';
import { removedBins, type SpectrumState, type Work } from './spectrum';
import { aliasHz, analyse, binWidth, cyclesInWindow, isWholeCycles, nyquist, type SamplingState } from './sampling';

const n2 = (v: number) => decimal(v, 2);
/** An error is "nothing" below this. */
const NEGLIGIBLE = 0.1;
/** Two errors this close are the same to the two decimals shown. */
const SAME_ERROR = 0.005;
/** How many removed bin groups the caption names before it says "and N more". */
const MAX_LISTED = 4;

const targetMean = (s: HarmonicsState): number => {
  const t = targetSamples(s.target, s.drawn);
  return t.reduce((a, b) => a + b, 0) / t.length;
};

/** A share to one decimal that never rounds a partial share up to a full 100%. */
export const shareText = (kept: number): string => (kept < 1 && pct(kept, 1) === '100.0%' ? 'just under 100%' : pct(kept, 1));

export function harmonicsCaption(s: HarmonicsState): string {
  const label = TARGETS.find((t) => t.value === s.target)?.label ?? s.target;
  if (s.target === 'drawn' && s.drawn.length === 0) return 'Target drawn: there is no curve yet. Click on the plot, or move the cursor with the arrow keys and press Add point, to draw one.';
  const here = rmsError(s);
  const best = rmsError(snapToDft(s));
  const freeBest = rmsError(snapToDft({ ...s, mode: 'free' }));
  const used = s.amps.filter((a) => a > 0).length;
  const lead = `Target ${label}, ${plural(used, 'harmonic')} in use out of ${HARMONICS}: the RMS error is ${n2(here)}.`;
  const cause = s.mode === 'sine' && freeBest < best / 2
    ? 'the sine mode has no phase, so it cannot make a shape that is not a sum of sines'
    : Math.abs(targetMean(s)) > Math.max(best * 0.5, NEGLIGIBLE)
      ? 'none of the sliders can add a constant offset, and this target has one'
      : `${HARMONICS} harmonics are too few for a target this sharp`;
  const atBest = here <= best + SAME_ERROR;
  const tail = best < NEGLIGIBLE
    ? atBest
      ? ' That is as close as the coefficients of the DFT get.'
      : ` Snapping to the DFT would bring it down to ${n2(best)}.`
    : atBest
      ? ` That is as close as the sliders can get: ${cause}.`
      : ` Snapping to the DFT would only reach ${n2(best)}: ${cause}.`;
  return `${lead}${tail}`;
}

export function epicycleCaption(shape: ShapeId, used: number): string {
  const z = shapeSamples(shape);
  const circles = circlesOf(z);
  const err = shapeError(z, circles, used);
  const total = circles.reduce((sum, c) => sum + c.radius ** 2, 0);
  const kept = circles.slice(0, used).reduce((sum, c) => sum + c.radius ** 2, 0) / total;
  const name = shape === 'letter' ? 'letter L' : shape;
  if (used >= SHAPE_SAMPLES) return `The ${name} from all ${SHAPE_SAMPLES} circles: the error at the ${SHAPE_SAMPLES} samples is ${n2(err)}, so the circles redraw it exactly.`;
  return `The ${name} from the ${used} largest of ${SHAPE_SAMPLES} circles: the error is ${decimal(err, 3)} (the shape is about 2 across), and these circles hold ${shareText(kept)} of its energy.`;
}

export function spectrumCaption(s: SpectrumState, imagMax: number): string {
  const bins = removedBins(s);
  if (bins.length === 0) return `Nothing removed: the filtered signal is the original. Click a bar in the spectrum, or pick a bin with the slider, to remove it; its mirror bin ${s.n} minus k goes too.`;
  const named = bins.map((k) => (k === 0 || k === s.n / 2 ? `${k}` : `${k} and ${s.n - k}`));
  const list = named.length > MAX_LISTED ? `${named.slice(0, MAX_LISTED).join(', ')}, and ${named.length - MAX_LISTED} more` : named.join(', ');
  const total = bins.reduce((sum, k) => sum + (k === 0 || k === s.n / 2 ? 1 : 2), 0);
  return `Removed ${plural(total, 'bin')} (${list}): a real signal's bin ${s.n} minus k is the complex conjugate of bin k, so both go together; bins 0 and ${s.n / 2} are their own mirror. The largest imaginary part left in the filtered signal is ${imagMax.toExponential(1)}, rounding only, so it stays real.`;
}

export function workCaption(w: Work): string {
  const log = Math.log2(w.n);
  return `For ${integer(w.n)} samples the definition made ${integer(w.dft)} complex multiplications (${integer(w.n)} squared) and the FFT ${integer(w.fft)} ((${w.n} / 2) · ${log}), ${decimal(w.dft / w.fft, 1)} times fewer.`;
}

export function samplingCaption(s: SamplingState): string {
  const r = analyse(s);
  const lead = `Tone ${n2(s.f)} Hz sampled at ${s.fs} Hz (half of that, ${nyquist(s)} Hz, is the highest frequency it can show).`;
  if (r.silent) return `${lead} Every sample is zero: a sine at a multiple of half the sampling rate is sampled only where it crosses zero, so the spectrum is empty.`;
  const alias = aliasHz(s);
  const peak = r.peakBin * binWidth(s);
  const nearest = `the strongest bin is the one nearest it, at ${n2(peak)} Hz (the bins are ${n2(binWidth(s))} Hz apart)`;
  const whole = isWholeCycles(s);
  const where = s.f > nyquist(s)
    ? whole
      ? ` It is above that, so it folds back and the strongest bin is at ${n2(alias)} Hz, the distance from ${n2(s.f)} to the nearest multiple of ${s.fs}.`
      : ` It is above that, so it folds back to an alias at ${n2(alias)} Hz, the distance from ${n2(s.f)} to the nearest multiple of ${s.fs}; ${nearest}.`
    : whole
      ? ` The strongest bin is at ${n2(peak)} Hz, the tone itself.`
      : ` The tone falls between bins, so ${nearest.replace('nearest it', 'nearest the tone')}.`;
  const cycles = cyclesInWindow(s);
  const withoutWindow = analyse({ ...s, window: 'rect' }).smearBins.length;
  const smear = isWholeCycles(s)
    ? ` The window holds ${n2(cycles)} cycles, a whole number, so ${plural(r.smearBins.length, 'bin')} ${r.smearBins.length === 1 ? 'is' : 'are'} above 1% of the peak (${s.window === 'hann' ? `the Hann window widens the peak itself; ${withoutWindow} without it` : 'no leakage'}).`
    : ` The window holds ${n2(cycles)} cycles, not a whole number, so ${plural(r.smearBins.length, 'bin')} ${r.smearBins.length === 1 ? 'is' : 'are'} above 1% of the peak: the energy leaks across the spectrum${s.window === 'hann' ? `, against ${withoutWindow} without a window` : ''}.`;
  return `${lead}${where}${smear}`;
}
