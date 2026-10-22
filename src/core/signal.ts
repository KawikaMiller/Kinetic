/**
 * Discrete signals: complex numbers, the DFT (by its definition) and the radix-2 FFT (same
 * transform, fewer multiplications), windows, magnitude and phase, aliasing, and the error
 * measures MSE and PSNR. Pure and deterministic; nothing mutates its inputs.
 *
 * Convention: X[k] = sum over n of x[n] * e^(-2 pi i k n / N), and the inverse carries the 1/N.
 * The block transforms JPEG uses (DCT, quantisation, zig-zag) live in core/dct.
 */

export interface Complex {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): Complex => ({ re, im });
export const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const cMul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const cConj = (a: Complex): Complex => ({ re: a.re, im: -a.im });
export const cAbs = (a: Complex) => Math.hypot(a.re, a.im);
export const cArg = (a: Complex) => Math.atan2(a.im, a.re);
/** e^(i theta). */
export const cExp = (theta: number): Complex => ({ re: Math.cos(theta), im: Math.sin(theta) });

/** A real signal as complex samples. */
export const fromReal = (xs: readonly number[]): Complex[] => xs.map((re) => cx(re));
export const realParts = (xs: readonly Complex[]): number[] => xs.map((z) => z.re);

/** How many complex multiplications and additions a transform performed, counted as it ran. */
export interface OpCount {
  complexMuls: number;
  complexAdds: number;
}
export const newOpCount = (): OpCount => ({ complexMuls: 0, complexAdds: 0 });

export const isPowerOfTwo = (n: number) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;

/** e^(-2 pi i m / n) for m = 0..n-1, so a product k*n can be reduced mod n before the lookup. */
function twiddles(n: number): Complex[] {
  return Array.from({ length: n }, (_, m) => cExp((-2 * Math.PI * m) / n));
}

/** The DFT straight from the definition: N complex multiplications for each of N bins (N squared), any length. */
export function dft(x: readonly Complex[], count?: OpCount): Complex[] {
  const n = x.length;
  const w = twiddles(n);
  return Array.from({ length: n }, (_, k) => {
    let sum = cx(0);
    for (let t = 0; t < n; t++) {
      sum = cAdd(sum, cMul(x[t], w[(k * t) % n]));
      if (count) {
        count.complexMuls++;
        if (t > 0) count.complexAdds++;
      }
    }
    return sum;
  });
}

/** The inverse DFT from the definition (any length), with the 1/N. */
export function idft(spectrum: readonly Complex[], count?: OpCount): Complex[] {
  const n = spectrum.length;
  const conj = dft(spectrum.map(cConj), count);
  return conj.map((z) => cx(z.re / n, -z.im / n));
}

function bitReverse(i: number, bits: number): number {
  let r = 0;
  for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
  return r;
}

/**
 * The iterative radix-2 decimation-in-time FFT: the same numbers as `dft`, in (N/2)·log2 N
 * multiplications (one per butterfly) instead of N squared. The length must be a power of two.
 */
export function fft(x: readonly Complex[], count?: OpCount): Complex[] {
  const n = x.length;
  if (!isPowerOfTwo(n)) throw new RangeError(`fft needs a power-of-two length, got ${n}`);
  const bits = Math.log2(n);
  const a = Array.from({ length: n }, (_, i) => x[bitReverse(i, bits)]);
  const w = twiddles(n);
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const t = cMul(w[j * stride], a[start + j + half]);
        const u = a[start + j];
        a[start + j] = cAdd(u, t);
        a[start + j + half] = cSub(u, t);
        if (count) {
          count.complexMuls++;
          count.complexAdds += 2;
        }
      }
    }
  }
  return a;
}

/** The inverse FFT (conjugate in, `fft`, conjugate out, divide by N); power-of-two lengths. */
export function ifft(spectrum: readonly Complex[], count?: OpCount): Complex[] {
  const n = spectrum.length;
  return fft(spectrum.map(cConj), count).map((z) => cx(z.re / n, -z.im / n));
}

/** The bin that carries the complex conjugate of bin k when the signal is real: N-k, with bin 0 its own partner. */
export const conjugatePartner = (k: number, n: number) => (n - k) % n;

export const magnitudes = (spectrum: readonly Complex[]): number[] => spectrum.map(cAbs);

/** Phases in radians. A bin whose magnitude is under `floor` has no meaningful phase (rounding noise) and reads 0. */
export function phases(spectrum: readonly Complex[], floor = 1e-9): number[] {
  return spectrum.map((z) => (cAbs(z) < floor ? 0 : cArg(z)));
}

/** Sum of squares of a real or complex signal. Parseval: energy(x) = energy(X) / N. */
export const energy = (xs: readonly (number | Complex)[]): number => xs.reduce<number>((s, v) => s + (typeof v === 'number' ? v * v : v.re * v.re + v.im * v.im), 0);

export type WindowKind = 'rect' | 'hann' | 'hamming';

/**
 * Window weights for N samples. Periodic (the default) is the right shape for spectrum analysis
 * because the DFT treats the window as one period of an endless repeat; `symmetric: true` divides by N-1 instead.
 */
export function window(kind: WindowKind, n: number, { symmetric = false }: { symmetric?: boolean } = {}): number[] {
  const denom = symmetric ? Math.max(1, n - 1) : n;
  return Array.from({ length: n }, (_, i) => {
    if (kind === 'rect') return 1;
    const c = Math.cos((2 * Math.PI * i) / denom);
    return kind === 'hann' ? 0.5 - 0.5 * c : 0.54 - 0.46 * c;
  });
}

export function applyWindow(x: readonly number[], w: readonly number[]): number[] {
  if (x.length !== w.length) throw new RangeError(`signal has ${x.length} samples but the window has ${w.length}`);
  return x.map((v, i) => v * w[i]);
}

/** The frequency a tone of `f` appears at when sampled at `fs`: the distance to the nearest multiple of fs. */
export const aliasOf = (f: number, fs: number) => Math.abs(f - Math.round(f / fs) * fs);

/** Mean squared error between two equal-size signals. */
export function mse(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) throw new RangeError('mse needs two non-empty signals of the same size');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s / a.length;
}

/** Peak signal-to-noise ratio in dB: 10·log10(peak² / MSE). Infinity when the signals are identical. */
export function psnr(a: readonly number[], b: readonly number[], peak = 255): number {
  const e = mse(a, b);
  return e === 0 ? Infinity : 10 * Math.log10((peak * peak) / e);
}
