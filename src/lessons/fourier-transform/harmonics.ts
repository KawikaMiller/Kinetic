/**
 * Scene 1: a waveform built from eight harmonics against a target, with the DFT as the answer key.
 * The target has N samples over one period (sample n at time n/N); harmonic k is a sine that fits k
 * times into the period. All numbers come from core/signal.
 */
import { fft, fromReal, mse } from '../../core/signal';

export const N = 64;
export const HARMONICS = 8;
export const AMP_MAX = 1.5;
export const AMP_STEP = 0.01;
/** The phase slider covers -3.14 to 3.14 in steps of 0.01 radian, so a snapped value is exactly what the slider can show. */
export const PHASE_MAX = 3.14;
export const PHASE_STEP = 0.01;
export const Y_LIMIT = 1.5;
export const MAX_DRAWN = 64;

export type TargetId = 'square' | 'sawtooth' | 'triangle' | 'spike' | 'drawn';
export const TARGETS: readonly { value: TargetId; label: string }[] = [
  { value: 'square', label: 'square' },
  { value: 'sawtooth', label: 'sawtooth' },
  { value: 'triangle', label: 'triangle' },
  { value: 'spike', label: 'spike' },
  { value: 'drawn', label: 'drawn' },
];

export interface DrawnPoint {
  x: number;
  y: number;
}

/** The target's N samples. The square and sawtooth are zero at their jumps (the series' own value there); the triangle and the spike peak at n = 0. */
export function targetSamples(id: TargetId, drawn: readonly DrawnPoint[] = []): number[] {
  const idx = Array.from({ length: N }, (_, n) => n);
  switch (id) {
    case 'square': return idx.map((n) => (n === 0 || n === N / 2 ? 0 : n < N / 2 ? 1 : -1));
    case 'sawtooth': return idx.map((n) => (n === 0 ? 0 : 1 - (2 * n) / N));
    case 'triangle': return idx.map((n) => (n <= N / 2 ? 1 - (4 * n) / N : -3 + (4 * n) / N));
    case 'spike': return idx.map((n) => (n === 0 ? 1 : 0));
    case 'drawn': return resample(drawn);
  }
}

// ── the drawn curve ──

export type AddResult = { points: DrawnPoint[]; refusal: string | null };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Two points closer than this in x are one point: x stays strictly ordered. */
const SAME_X = 1e-6;

/** Add a point (x across one period, y clamped to the plot): kept sorted by x, replacing a point at the same x, refused beyond 64. */
export function addPoint(points: readonly DrawnPoint[], p: DrawnPoint): AddResult {
  const x = clamp(p.x, 0, 1 - 1 / N);
  const y = clamp(p.y, -Y_LIMIT, Y_LIMIT);
  const same = points.findIndex((q) => Math.abs(q.x - x) < SAME_X);
  if (same >= 0) return { points: points.map((q, i) => (i === same ? { x: q.x, y } : q)), refusal: null };
  if (points.length >= MAX_DRAWN) return { points: [...points], refusal: `The curve already has ${MAX_DRAWN} points, the most it can hold: clear it or move an existing one.` };
  return { points: [...points, { x, y }].sort((a, b) => a.x - b.x), refusal: null };
}

/** The curve's N samples by linear interpolation; before the first point and after the last it holds their values; no points is flat zero. */
export function resample(points: readonly DrawnPoint[]): number[] {
  return Array.from({ length: N }, (_, n) => {
    const t = n / N;
    if (points.length === 0) return 0;
    if (t <= points[0].x) return points[0].y;
    const last = points[points.length - 1];
    if (t >= last.x) return last.y;
    const j = points.findIndex((q) => q.x >= t);
    const [a, b] = [points[j - 1], points[j]];
    return a.y + ((b.y - a.y) * (t - a.x)) / (b.x - a.x);
  });
}

// ── the sliders ──

export type PhaseMode = 'sine' | 'free';
export interface HarmonicsState {
  target: TargetId;
  /** Amplitude of each harmonic 1..8. */
  amps: number[];
  /** Phase of each harmonic in radians; used only in the free mode. */
  phases: number[];
  mode: PhaseMode;
  drawn: DrawnPoint[];
}
export const initialHarmonics = (): HarmonicsState => ({
  target: 'square',
  amps: [1, 0, 0, 0, 0, 0, 0, 0],
  phases: new Array<number>(HARMONICS).fill(0),
  mode: 'sine',
  drawn: [],
});

/** What the model uses for phases: zero in the sine mode, whatever the hidden sliders say. */
export const effectivePhases = (s: HarmonicsState): number[] => (s.mode === 'sine' ? new Array<number>(HARMONICS).fill(0) : s.phases);

/** The sum at time t (in periods): amplitude · sin(2 pi k t + phase) over the harmonics. */
export function builtAt(s: HarmonicsState, t: number): number {
  const ph = effectivePhases(s);
  return s.amps.reduce((sum, a, i) => sum + a * Math.sin(2 * Math.PI * (i + 1) * t + ph[i]), 0);
}

/** One harmonic alone at time t. */
export const harmonicAt = (s: HarmonicsState, k: number, t: number): number => s.amps[k] * Math.sin(2 * Math.PI * (k + 1) * t + effectivePhases(s)[k]);

export const builtSamples = (s: HarmonicsState): number[] => Array.from({ length: N }, (_, n) => builtAt(s, n / N));

/** Root-mean-square gap between the built signal and the target at the N samples. */
export const rmsError = (s: HarmonicsState): number => Math.sqrt(mse(builtSamples(s), targetSamples(s.target, s.drawn)));

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * "Snap to the DFT": the sliders set to the target's own coefficients. With X[k] = sum x e^(-2 pi i k n / N),
 * x contains a·cos + b·sin with a = 2·Re X / N and b = -2·Im X / N. The free mode writes that as A·sin(w + phi) with
 * A = hypot(a, b) and phi = atan2(a, b); the sine mode can only use b, and only when it is positive (amplitudes start at 0).
 */
export function snapToDft(s: HarmonicsState): HarmonicsState {
  const X = fft(fromReal(targetSamples(s.target, s.drawn)));
  const amps: number[] = [];
  const phases: number[] = [];
  for (let k = 1; k <= HARMONICS; k++) {
    const a = (2 * X[k].re) / N;
    const b = (-2 * X[k].im) / N;
    if (s.mode === 'sine') {
      amps.push(clamp(round2(Math.max(0, b)), 0, AMP_MAX));
      phases.push(0);
    } else {
      amps.push(clamp(round2(Math.hypot(a, b)), 0, AMP_MAX));
      phases.push(clamp(round2(Math.atan2(a, b)), -PHASE_MAX, PHASE_MAX));
    }
  }
  return { ...s, amps, phases };
}

// ── Gibbs overshoot ──

/** Partial sum of the odd harmonics of a +-1 square wave: (4/pi) · sum over j < terms of sin((2j+1) theta) / (2j+1). */
export function squareSum(terms: number, theta: number): number {
  let sum = 0;
  for (let j = 0; j < terms; j++) sum += Math.sin((2 * j + 1) * theta) / (2 * j + 1);
  return (4 / Math.PI) * sum;
}

/**
 * The peak of that sum. The derivative is (4/pi)·sum of cos((2j+1) theta) = (2/pi)·sin(2·terms·theta) / sin(theta), whose
 * first zero after 0 is theta = pi / (2·terms), where the sum is largest.
 */
export const squarePeak = (terms: number): number => squareSum(terms, Math.PI / (2 * terms));

/** Si(pi), the sine integral at pi, by Simpson's rule (the integrand sin(x)/x is 1 at 0). */
export function sineIntegralPi(intervals = 2000): number {
  const f = (x: number) => (x === 0 ? 1 : Math.sin(x) / x);
  const h = Math.PI / intervals;
  let sum = f(0) + f(Math.PI);
  for (let i = 1; i < intervals; i++) sum += f(i * h) * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3;
}

/** The limit of the peak as terms grow: 1 + 2·(Si(pi)/pi - 1/2), the Gibbs constant (a bit under 9% of the jump of 2, above 1). */
export const GIBBS_LIMIT = 1 + 2 * (sineIntegralPi() / Math.PI - 0.5);
/** The overshoot as a share of the jump of 2. */
export const overshootShare = (peak: number): number => (peak - 1) / 2;
export const GIBBS_TERMS_MAX = 100;
