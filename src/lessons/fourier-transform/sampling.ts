/**
 * Scene 4: a tone of frequency f sampled at rate fs, N = 64 samples. Above fs/2 it shows up at its alias; a tone with a
 * non-integer number of cycles in the window smears across bins (leakage), and a Hann window shrinks the far smear.
 * The DFT treats the window as one period of an endless repeat, which is why leakage exists.
 */
import { aliasOf, applyWindow, cAbs, fft, fromReal, window as windowOf, type WindowKind } from '../../core/signal';

export const SAMPLES = 64;
export const FS_CHOICES = [16, 32, 64] as const;
export type SampleRate = (typeof FS_CHOICES)[number];
export const F_RANGE = { min: 1, max: 96, step: 0.25 } as const;
export type WindowChoice = Extract<WindowKind, 'rect' | 'hann'>;
export const WINDOWS: readonly { value: WindowChoice; label: string }[] = [
  { value: 'rect', label: 'none (rectangular)' },
  { value: 'hann', label: 'Hann' },
];
/** A bin counts as smear when it is above this share of the strongest bin. */
export const SMEAR_SHARE = 0.01;
/** The true tone is drawn only when the window holds at most this many of its cycles (more would alias on the screen itself). */
export const DRAW_CYCLES_MAX = 40;
/** Amplitudes under this are rounding noise. */
const SILENT_BELOW = 1e-9;

export interface SamplingState {
  fs: SampleRate;
  /** Tone frequency in hertz. */
  f: number;
  window: WindowChoice;
}
export const initialSampling = (): SamplingState => ({ fs: 32, f: 5, window: 'rect' });

export const nyquist = (s: SamplingState) => s.fs / 2;
export const binWidth = (s: SamplingState) => s.fs / SAMPLES;
/** Cycles of the tone in the window of N samples. */
export const cyclesInWindow = (s: SamplingState) => (s.f * SAMPLES) / s.fs;
export const isWholeCycles = (s: SamplingState) => Math.abs(cyclesInWindow(s) - Math.round(cyclesInWindow(s))) < 1e-9;
export const aliasHz = (s: SamplingState) => aliasOf(s.f, s.fs);
/** The alias's sign: the samples equal sign · sin(2 pi alias n / fs). */
export const aliasSign = (s: SamplingState) => (s.f - Math.round(s.f / s.fs) * s.fs >= 0 ? 1 : -1);

export const samples = (s: SamplingState): number[] => Array.from({ length: SAMPLES }, (_, n) => Math.sin((2 * Math.PI * s.f * n) / s.fs));

export interface SamplingResult {
  /** Amplitude of bins 0..N/2, scaled so a tone that fits the window reads 1 whichever window is used. */
  amps: number[];
  peakBin: number;
  /** Bins above SMEAR_SHARE of the strongest bin, in ascending bin order. */
  smearBins: number[];
  /** Every sample is zero (a sine at a multiple of fs/2 is sampled only at its zero crossings): there is no peak to speak of. */
  silent: boolean;
}

export function analyse(s: SamplingState): SamplingResult {
  const w = windowOf(s.window, SAMPLES);
  const X = fft(fromReal(applyWindow(samples(s), w)));
  const gain = w.reduce((a, b) => a + b, 0);
  const amps = Array.from({ length: SAMPLES / 2 + 1 }, (_, k) => (k === 0 || k === SAMPLES / 2 ? cAbs(X[k]) / gain : (2 * cAbs(X[k])) / gain));
  const peakBin = amps.indexOf(Math.max(...amps));
  const smearBins = amps.flatMap((a, k) => (a > SMEAR_SHARE * amps[peakBin] ? [k] : []));
  return { amps, peakBin, smearBins, silent: amps[peakBin] < SILENT_BELOW };
}
