/**
 * Scene 3: two tones plus seeded noise, its magnitude spectrum, removing bins and the inverse transform, and the
 * counted work of the DFT against the FFT. A real signal's spectrum is mirrored: bin N-k holds the complex conjugate of
 * bin k, so removing a bin means removing its partner too.
 */
import { mulberry32 } from '../../core/random';
import { cAbs, cx, conjugatePartner, dft, fft, fromReal, ifft, newOpCount, type Complex } from '../../core/signal';

export const SIGNAL_SIZES = [64, 256] as const;
export type SignalSize = (typeof SIGNAL_SIZES)[number];
/** The two tones in cycles per window at N = 64; at N = 256 they scale by 4, so they keep their place in the spectrum. */
export const TONE_CYCLES = [5, 17] as const;
export const TONE_AMPS = [1, 0.6] as const;
export const NOISE_AMP = 0.3;
export const NOISE_SEED = 3;
export const WORK_SIZES = [8, 16, 32, 64, 128, 256, 512, 1024] as const;

const scaleOf = (n: number) => n / 64;
export const toneBins = (n: number): number[] => TONE_CYCLES.map((c) => c * scaleOf(n));

/** Tone 1 + tone 2 + noise of amplitude NOISE_AMP, N samples over one window. */
export function twoToneSignal(n: SignalSize, seed = NOISE_SEED): number[] {
  const rnd = mulberry32(seed);
  const bins = toneBins(n);
  return Array.from({ length: n }, (_, t) => {
    const tones = bins.reduce((sum, k, i) => sum + TONE_AMPS[i] * Math.sin((2 * Math.PI * k * t) / n), 0);
    return tones + NOISE_AMP * (2 * rnd() - 1);
  });
}

export interface SpectrumState {
  n: SignalSize;
  /** Per bin 0..N-1: removed. A removed bin and its partner are always flagged together. */
  removed: boolean[];
}
export const initialSpectrum = (n: SignalSize = 64): SpectrumState => ({ n, removed: new Array<boolean>(n).fill(false) });

/** Toggle bin k (0..N/2) and its conjugate partner N-k together. */
export function toggleBin(s: SpectrumState, k: number): SpectrumState {
  const partner = conjugatePartner(k, s.n);
  const flag = !s.removed[k];
  return { ...s, removed: s.removed.map((r, i) => (i === k || i === partner ? flag : r)) };
}

/** Remove only bin k, leaving its partner (not reachable from the lesson: a test uses it to show why the partner goes too). */
export const removeOnlyBin = (s: SpectrumState, k: number): SpectrumState => ({ ...s, removed: s.removed.map((r, i) => (i === k ? true : r)) });

export const removedBins = (s: SpectrumState): number[] => Array.from({ length: s.n / 2 + 1 }, (_, k) => k).filter((k) => s.removed[k]);

export interface Filtered {
  /** The filtered signal's real part, one value per sample. */
  signal: number[];
  /** The largest imaginary part left over: zero (rounding only) when every removal came with its partner. */
  imagMax: number;
}

export function spectrumOf(x: readonly number[]): Complex[] {
  return fft(fromReal(x));
}

/** Zero the removed bins and transform back. */
export function filtered(x: readonly number[], s: SpectrumState): Filtered {
  const X = spectrumOf(x).map((z, k) => (s.removed[k] ? cx(0, 0) : z));
  const back = ifft(X);
  return { signal: back.map((z) => z.re), imagMax: Math.max(...back.map((z) => Math.abs(z.im))) };
}

/** Amplitude of each bin from 0 to N/2: a sine of amplitude A at bin k reads A (the DC bin and the Nyquist bin are not doubled). */
export function amplitudes(X: readonly Complex[]): number[] {
  const n = X.length;
  return Array.from({ length: n / 2 + 1 }, (_, k) => (k === 0 || k === n / 2 ? cAbs(X[k]) / n : (2 * cAbs(X[k])) / n));
}

// ── chips ──

const flagBins = (n: SignalSize, keep: (k: number) => boolean): boolean[] => {
  const removed = new Array<boolean>(n).fill(false);
  for (let k = 0; k <= n / 2; k++) {
    if (keep(k)) continue;
    removed[k] = true;
    removed[conjugatePartner(k, n)] = true;
  }
  return removed;
};

/** Keep the bins up to 10 cycles (at N = 64): removes the upper tone and the noise above it. */
export const lowPass = (n: SignalSize): SpectrumState => ({ n, removed: flagBins(n, (k) => k <= 10 * scaleOf(n)) });
/** Keep the bins from 13 to 21 cycles: the upper tone alone, with its neighbours. */
export const bandPass = (n: SignalSize): SpectrumState => ({ n, removed: flagBins(n, (k) => k >= 13 * scaleOf(n) && k <= 21 * scaleOf(n)) });
/** Remove the bins within one step of the upper tone (the three bins around it at N = 64; the same width in the spectrum at N = 256). */
export const notch = (n: SignalSize): SpectrumState => ({ n, removed: flagBins(n, (k) => Math.abs(k - 17 * scaleOf(n)) > scaleOf(n)) });

// ── counted work ──

export interface Work {
  n: number;
  dft: number;
  fft: number;
}

/** Multiplications counted while running the definition and the FFT on the same seeded signal. */
export function workCounts(n: number): Work {
  const rnd = mulberry32(n);
  const x = fromReal(Array.from({ length: n }, () => rnd() - 0.5));
  const slow = newOpCount();
  const fast = newOpCount();
  dft(x, slow);
  fft(x, fast);
  return { n, dft: slow.complexMuls, fft: fast.complexMuls };
}
