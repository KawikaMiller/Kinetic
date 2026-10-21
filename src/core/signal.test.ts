import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  aliasOf, applyWindow, cAbs, cConj, conjugatePartner, cx, dft, energy, fft, fromReal, idft, ifft, isPowerOfTwo, magnitudes, mse, newOpCount, phases, psnr, realParts,
  window as windowOf, type Complex,
} from './signal';

const TOL = 1e-9;

/** The definition, written out in the test with its own trig (no shared twiddle table): X[k] = sum x[n] e^(-2 pi i k n / N). */
function definitionDft(x: readonly Complex[]): Complex[] {
  const n = x.length;
  return Array.from({ length: n }, (_, k) => {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      re += x[t].re * Math.cos(a) - x[t].im * Math.sin(a);
      im += x[t].re * Math.sin(a) + x[t].im * Math.cos(a);
    }
    return cx(re, im);
  });
}

const randomSignal = (n: number, rnd: () => number): Complex[] => Array.from({ length: n }, () => cx(rnd() * 2 - 1, rnd() * 2 - 1));
const realSignal = (n: number, rnd: () => number): Complex[] => Array.from({ length: n }, () => cx(rnd() * 2 - 1));
const expectNear = (a: readonly Complex[], b: readonly Complex[], tol = TOL) => {
  expect(a).toHaveLength(b.length);
  a.forEach((z, i) => {
    expect(Math.abs(z.re - b[i].re)).toBeLessThan(tol);
    expect(Math.abs(z.im - b[i].im)).toBeLessThan(tol);
  });
};

describe('dft', () => {
  it('hand vector: the DFT of [1, 2, 3, 4] is [10, -2+2i, -2, -2-2i]', () => {
    expectNear(dft(fromReal([1, 2, 3, 4])), [cx(10), cx(-2, 2), cx(-2), cx(-2, -2)]);
  });

  it('an impulse has a flat spectrum and a constant has one DC bin', () => {
    expectNear(dft(fromReal([1, 0, 0, 0, 0, 0])), Array.from({ length: 6 }, () => cx(1)));
    expectNear(dft(fromReal(new Array(8).fill(3))), [cx(24), ...Array.from({ length: 7 }, () => cx(0))]);
  });

  it('a real sine of amplitude A at integer bin k has magnitude A*N/2 in bins k and N-k and nothing elsewhere', () => {
    const n = 32;
    const a = 1.5;
    const k = 5;
    const mags = magnitudes(dft(fromReal(Array.from({ length: n }, (_, t) => a * Math.sin((2 * Math.PI * k * t) / n)))));
    mags.forEach((m, i) => expect(m).toBeCloseTo(i === k || i === n - k ? (a * n) / 2 : 0, 9));
  });

  it('matches the definition for lengths that are not powers of two', () => {
    const rnd = mulberry32(3);
    for (const n of [1, 3, 5, 6, 12]) {
      const x = randomSignal(n, rnd);
      expectNear(dft(x), definitionDft(x));
    }
  });

  it('idft undoes dft at any length', () => {
    const rnd = mulberry32(4);
    for (const n of [5, 12, 16]) {
      const x = realSignal(n, rnd);
      expectNear(idft(dft(x)), x);
    }
  });
});

describe('fft', () => {
  it('equals the DFT definition within 1e-9 on 100 seeded signals, lengths 8 to 256', () => {
    const rnd = mulberry32(11);
    const sizes = [8, 16, 32, 64, 128, 256];
    for (let i = 0; i < 100; i++) {
      const x = randomSignal(sizes[i % sizes.length], rnd);
      expectNear(fft(x), definitionDft(x));
    }
  });

  it('ifft(fft(x)) and idft(fft(x)) return x within 1e-9', () => {
    const rnd = mulberry32(12);
    for (const n of [8, 64, 256]) {
      const x = randomSignal(n, rnd);
      expectNear(ifft(fft(x)), x);
      expectNear(idft(fft(x)), x);
    }
  });

  it('Parseval: the sum of |x|^2 equals (1/N) times the sum of |X|^2', () => {
    const rnd = mulberry32(13);
    for (const n of [8, 32, 128]) {
      const x = randomSignal(n, rnd);
      expect(energy(x)).toBeCloseTo(energy(fft(x)) / n, 9);
    }
  });

  it('refuses a length that is not a power of two', () => {
    expect(() => fft(fromReal([1, 2, 3]))).toThrow(RangeError);
    expect([1, 2, 8, 1024].every(isPowerOfTwo)).toBe(true);
    expect([0, 3, 12, 1.5].some(isPowerOfTwo)).toBe(false);
  });

  it('counted work: the DFT does N^2 multiplications and the FFT (N/2)·log2 N, N = 8 to 1024', () => {
    const rnd = mulberry32(14);
    for (let n = 8; n <= 1024; n *= 2) {
      const x = realSignal(n, rnd);
      const slow = newOpCount();
      const fast = newOpCount();
      dft(x, slow);
      fft(x, fast);
      expect(slow.complexMuls).toBe(n * n);
      expect(slow.complexAdds).toBe(n * (n - 1));
      expect(fast.complexMuls).toBe((n / 2) * Math.log2(n));
      expect(fast.complexAdds).toBe(n * Math.log2(n));
    }
  });
});

describe('real signals and the mirrored half', () => {
  it('bin N-k is the conjugate of bin k, so the upper half is not a bug', () => {
    const x = fft(realSignal(64, mulberry32(21)));
    for (let k = 0; k < 64; k++) {
      const partner = x[conjugatePartner(k, 64)];
      expect(Math.abs(partner.re - cConj(x[k]).re)).toBeLessThan(TOL);
      expect(Math.abs(partner.im - cConj(x[k]).im)).toBeLessThan(TOL);
    }
    expect(conjugatePartner(0, 64)).toBe(0);
    expect(conjugatePartner(5, 64)).toBe(59);
  });

  it('removing a bin and its partner keeps the inverse real; removing only one does not', () => {
    const n = 64;
    const spectrum = fft(realSignal(n, mulberry32(22)));
    const both = spectrum.map((z, k) => (k === 7 || k === conjugatePartner(7, n) ? cx(0) : z));
    const one = spectrum.map((z, k) => (k === 7 ? cx(0) : z));
    expect(Math.max(...ifft(both).map((z) => Math.abs(z.im)))).toBeLessThan(TOL);
    expect(Math.max(...ifft(one).map((z) => Math.abs(z.im)))).toBeGreaterThan(1e-3);
  });

  it('phase reads 0 for a bin with no magnitude instead of rounding noise', () => {
    const p = phases([cx(1, 1), cx(1e-15, -1e-15), cx(-1)]);
    expect(p[0]).toBeCloseTo(Math.PI / 4, 12);
    expect(p[1]).toBe(0);
    expect(p[2]).toBeCloseTo(Math.PI, 12);
  });
});

describe('windows and leakage', () => {
  it('periodic Hann hits 0 at the start, 1 in the middle and sums to N/2; Hamming starts at 0.08', () => {
    const n = 16;
    const hann = windowOf('hann', n);
    expect(hann[0]).toBeCloseTo(0, 12);
    expect(hann[n / 2]).toBeCloseTo(1, 12);
    expect(hann.reduce((s, v) => s + v, 0)).toBeCloseTo(n / 2, 12);
    expect(windowOf('hamming', n)[0]).toBeCloseTo(0.08, 12);
    expect(windowOf('rect', 4)).toEqual([1, 1, 1, 1]);
  });

  it('a symmetric window is symmetric and zero at both ends', () => {
    const w = windowOf('hann', 9, { symmetric: true });
    expect(w[0]).toBeCloseTo(0, 12);
    expect(w[8]).toBeCloseTo(0, 12);
    w.forEach((v, i) => expect(v).toBeCloseTo(w[8 - i], 12));
  });

  it('applyWindow multiplies sample by sample and refuses a size mismatch', () => {
    expect(applyWindow([2, 4, 6], [1, 0.5, 0])).toEqual([2, 2, 0]);
    expect(() => applyWindow([1, 2], [1])).toThrow(RangeError);
  });

  it('a whole number of cycles does not leak; a fractional one does, and Hann pulls the far bins down', () => {
    const n = 64;
    const tone = (cycles: number) => Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * cycles * t) / n));
    const far = (xs: number[]) => Math.max(...magnitudes(fft(fromReal(xs))).slice(12, n / 2));
    expect(far(tone(8))).toBeLessThan(1e-9);
    const plain = far(tone(8.5));
    const hann = far(applyWindow(tone(8.5), windowOf('hann', n)));
    expect(plain).toBeGreaterThan(0.1);
    expect(hann).toBeLessThan(plain / 10);
  });
});

describe('aliasing', () => {
  it('hand cases: 900 Hz sampled at 1000 Hz appears at 100 Hz, and so does 1100 Hz; below Nyquist is unchanged', () => {
    expect(aliasOf(900, 1000)).toBe(100);
    expect(aliasOf(1100, 1000)).toBe(100);
    expect(aliasOf(300, 1000)).toBe(300);
    expect(aliasOf(1000, 1000)).toBe(0);
  });

  it('the strongest bin of the real FFT sits at the alias for 200 seeded (f, fs) pairs with a whole number of cycles', () => {
    const rnd = mulberry32(31);
    const n = 64;
    for (let i = 0; i < 200; i++) {
      const fs = 100 + Math.floor(rnd() * 900);
      const cycles = 1 + Math.floor(rnd() * 3 * n);
      const f = (cycles * fs) / n;
      const x = Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * f * t) / fs + 0.3));
      const mags = magnitudes(fft(fromReal(x))).slice(0, n / 2 + 1);
      const peak = mags.indexOf(Math.max(...mags));
      expect((peak * fs) / n).toBeCloseTo(aliasOf(f, fs), 6);
    }
  });
});

describe('mse and psnr', () => {
  it('hand values', () => {
    expect(mse([0, 0], [3, 4])).toBe(12.5);
    expect(psnr([10, 20], [11, 21])).toBeCloseTo(10 * Math.log10(255 * 255), 12);
    expect(psnr([1, 2, 3], [1, 2, 3])).toBe(Infinity);
    expect(psnr([0, 0], [1, 1], 1)).toBeCloseTo(0, 12);
  });

  it('refuses mismatched or empty signals', () => {
    expect(() => mse([1], [1, 2])).toThrow(RangeError);
    expect(() => mse([], [])).toThrow(RangeError);
  });

  it('complex helpers agree with hand values', () => {
    expect(realParts([cx(1, 2), cx(3, 4)])).toEqual([1, 3]);
    expect(cAbs(cx(3, 4))).toBe(5);
  });
});
