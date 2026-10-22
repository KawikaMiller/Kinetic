import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { aliasOf, cAbs, cx, dft, fft, fromReal, idft, ifft, newOpCount, energy, type Complex } from '../../core/signal';
import {
  AMP_MAX, GIBBS_LIMIT, HARMONICS, MAX_DRAWN, N, PHASE_MAX, Y_LIMIT, addPoint, builtAt, builtSamples, effectivePhases, initialHarmonics, overshootShare, resample, rmsError,
  sineIntegralPi, snapToDft, squarePeak, squareSum, targetSamples, type DrawnPoint, type HarmonicsState,
} from './harmonics';
import { SAMPLES as EPI_SAMPLES, chainAt, circlesOf, pathOf, pointAt, polygonSamples, shapeError, shapeSamples, vertices } from './epicycles';
import {
  NOISE_AMP, SIGNAL_SIZES, TONE_CYCLES, WORK_SIZES, amplitudes, bandPass, filtered, initialSpectrum, lowPass, notch, removeOnlyBin, removedBins, spectrumOf, toggleBin, toneBins,
  twoToneSignal, workCounts,
} from './spectrum';
import { F_RANGE, FS_CHOICES, SAMPLES, aliasHz, aliasSign, analyse, cyclesInWindow, isWholeCycles, samples, type SamplingState } from './sampling';

const randomSignal = (rnd: Rnd, n: number): Complex[] => Array.from({ length: n }, () => cx(rnd() * 2 - 1, rnd() * 2 - 1));
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

describe('the transforms behind the lesson (the kit, checked again through the lesson\'s own uses)', () => {
  it('fft equals dft within 1e-9 on 100 seeded signals for every power of two from 8 to 256, and idft(fft(x)) returns x', () => {
    const rnd = mulberry32(8);
    for (let i = 0; i < 100; i++) {
      const n = 8 * 2 ** (i % 6);
      const x = randomSignal(rnd, n);
      const a = fft(x);
      const b = dft(x);
      a.forEach((z, k) => {
        expect(close(z.re, b[k].re)).toBe(true);
        expect(close(z.im, b[k].im)).toBe(true);
      });
      idft(a).forEach((z, k) => {
        expect(close(z.re, x[k].re)).toBe(true);
        expect(close(z.im, x[k].im)).toBe(true);
      });
      ifft(a).forEach((z, k) => expect(close(z.re, x[k].re)).toBe(true));
      expect(close(energy(x), energy(a) / n, 1e-9)).toBe(true);
    }
  });

  it('known vectors: [1, 2, 3, 4], an impulse, a constant, and a real sine of amplitude A at bin k reads A·N/2', () => {
    const X = fft(fromReal([1, 2, 3, 4]));
    const want: [number, number][] = [[10, 0], [-2, 2], [-2, 0], [-2, -2]];
    X.forEach((z, k) => {
      expect(z.re).toBeCloseTo(want[k][0], 12);
      expect(z.im).toBeCloseTo(want[k][1], 12);
    });
    fft(fromReal([1, 0, 0, 0, 0, 0, 0, 0])).forEach((z) => expect(cAbs(z)).toBeCloseTo(1, 12));
    const flat = fft(fromReal(new Array<number>(16).fill(3)));
    expect(flat[0].re).toBeCloseTo(48, 12);
    flat.slice(1).forEach((z) => expect(cAbs(z)).toBeLessThan(1e-9));
    const sine = fft(fromReal(Array.from({ length: 64 }, (_, t) => 0.7 * Math.sin((2 * Math.PI * 9 * t) / 64))));
    expect(cAbs(sine[9])).toBeCloseTo((0.7 * 64) / 2, 9);
    expect(cAbs(sine[64 - 9])).toBeCloseTo((0.7 * 64) / 2, 9);
  });
});

describe('scene 1: harmonics', () => {
  it('the targets are what they say: the square is odd with a zero at each jump, the triangle peaks at 0, the spike is one sample', () => {
    const sq = targetSamples('square');
    expect(sq[0]).toBe(0);
    expect(sq[N / 2]).toBe(0);
    expect(sq.slice(1, N / 2).every((v) => v === 1)).toBe(true);
    expect(sq.slice(N / 2 + 1).every((v) => v === -1)).toBe(true);
    const tri = targetSamples('triangle');
    expect([tri[0], tri[N / 4], tri[N / 2], tri[(3 * N) / 4]]).toEqual([1, 0, -1, 0]);
    expect(targetSamples('spike').reduce((a, b) => a + b, 0)).toBe(1);
    const saw = targetSamples('sawtooth');
    for (let n = 1; n < N; n++) expect(saw[N - n]).toBeCloseTo(-saw[n], 12);
  });

  it('snapping to the DFT in the sine mode makes the square wave match to the rounding of the sliders, and the error falls from the default', () => {
    const s = initialHarmonics();
    const before = rmsError(s);
    const snapped = snapToDft(s);
    expect(rmsError(snapped)).toBeLessThan(before);
    // the first eight harmonics of a square wave are the odd ones: 4/(pi k) over the sample sum
    [1, 3, 5, 7].forEach((k) => expect(Math.abs(snapped.amps[k - 1] - (4 / (Math.PI * k)) * 1)).toBeLessThan(0.05));
    [2, 4, 6, 8].forEach((k) => expect(snapped.amps[k - 1]).toBeLessThan(0.02));
    snapped.amps.forEach((a) => expect(a >= 0 && a <= AMP_MAX).toBe(true));
  });

  it('the free mode snaps every target exactly: the error is rounding only for the triangle, and the sine mode cannot match it', () => {
    const tri: HarmonicsState = { ...initialHarmonics(), target: 'triangle' };
    const sineMode = rmsError(snapToDft(tri));
    const free = rmsError(snapToDft({ ...tri, mode: 'free' }));
    expect(free).toBeLessThan(sineMode);
    expect(free).toBeLessThan(0.1);
    expect(sineMode).toBeGreaterThan(0.2);
    snapToDft({ ...tri, mode: 'free' }).phases.forEach((p) => expect(Math.abs(p)).toBeLessThanOrEqual(PHASE_MAX));
  });

  it('with all N/2 harmonics the free DFT coefficients reproduce any target exactly (the DFT is its own answer key)', () => {
    const rnd = mulberry32(3);
    const x = Array.from({ length: N }, () => rnd() * 2 - 1);
    const X = fft(fromReal(x));
    const mean = X[0].re / N;
    for (let n = 0; n < N; n++) {
      let sum = mean;
      for (let k = 1; k < N / 2; k++) sum += (2 / N) * (X[k].re * Math.cos((2 * Math.PI * k * n) / N) - X[k].im * Math.sin((2 * Math.PI * k * n) / N));
      sum += (X[N / 2].re / N) * Math.cos(Math.PI * n);
      expect(close(sum, x[n], 1e-9)).toBe(true);
    }
  });

  it('the phase sliders are hidden in the sine mode and then change nothing', () => {
    const base = { ...initialHarmonics(), amps: [1, 0.5, 0.25, 0, 0, 0, 0, 0] };
    for (const p of [0, PHASE_MAX, -PHASE_MAX]) {
      const s = { ...base, phases: new Array<number>(HARMONICS).fill(p) };
      expect(effectivePhases(s)).toEqual(new Array<number>(HARMONICS).fill(0));
      expect(builtSamples(s)).toEqual(builtSamples(base));
      expect(rmsError(s)).toBe(rmsError(base));
      expect(snapToDft(s).phases.every((v) => v === 0)).toBe(true);
    }
    const free = { ...base, mode: 'free' as const, phases: new Array<number>(HARMONICS).fill(1) };
    expect(builtAt(free, 0.1)).not.toBeCloseTo(builtAt({ ...free, mode: 'sine' }, 0.1), 3);
  });

  it('Gibbs: the peak of the odd-harmonic partial sum up to harmonic 199 is within 0.01 of 1.179 and the constant is Si(pi)', () => {
    expect(Math.abs(squarePeak(100) - 1.179)).toBeLessThan(0.01);
    expect(sineIntegralPi()).toBeCloseTo(1.851937051982466, 9);
    expect(GIBBS_LIMIT).toBeCloseTo(1.17898, 4);
    expect(overshootShare(GIBBS_LIMIT)).toBeCloseTo(0.0895, 3);
    for (const terms of [1, 2, 4, 10, 40, 100, 400]) {
      let densest = 0;
      for (let i = 1; i <= 4000; i++) densest = Math.max(densest, squareSum(terms, (i * Math.PI) / (2 * 4000)));
      expect(squarePeak(terms)).toBeGreaterThanOrEqual(densest - 1e-9);
      expect(Math.abs(squarePeak(terms) - densest)).toBeLessThan(0.002);
    }
    expect(squarePeak(1000)).toBeCloseTo(GIBBS_LIMIT, 2);
  });

  it('the drawn curve keeps at most 64 points, x strictly ordered, y clamped, and resamples by linear interpolation', () => {
    let pts: DrawnPoint[] = [];
    const rnd = mulberry32(2);
    for (let i = 0; i < 200; i++) {
      const r = addPoint(pts, { x: rnd() * 1.4 - 0.2, y: rnd() * 6 - 3 });
      pts = r.points;
      expect(pts.length).toBeLessThanOrEqual(MAX_DRAWN);
      pts.forEach((p, j) => {
        expect(Math.abs(p.y)).toBeLessThanOrEqual(Y_LIMIT);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(1);
        if (j > 0) expect(p.x).toBeGreaterThan(pts[j - 1].x);
      });
    }
    expect(pts).toHaveLength(MAX_DRAWN);
    expect(addPoint(pts, { x: 0.123456, y: 0 }).refusal).toContain('64 points');
    const same = addPoint(pts, { x: pts[3].x, y: 1 });
    expect(same.refusal).toBeNull();
    expect(same.points).toHaveLength(MAX_DRAWN);
    const line = resample([{ x: 0.25, y: -1 }, { x: 0.75, y: 1 }]);
    expect(line[0]).toBe(-1);
    expect(line[N / 2]).toBeCloseTo(0, 12);
    expect(line[N - 1]).toBe(1);
    expect(resample([]).every((v) => v === 0)).toBe(true);
  });
});

describe('scene 2: epicycles', () => {
  it('uniform polygon samples lie on the polygon and the star has ten corners', () => {
    expect(vertices('star')).toHaveLength(10);
    const pts = polygonSamples(vertices('square'), 64);
    expect(pts).toHaveLength(64);
    pts.forEach((p) => expect(Math.max(Math.abs(p.re), Math.abs(p.im))).toBeCloseTo(1, 9));
    expect(pts[0]).toEqual(cx(-1, -1));
  });

  it('using all N circles reproduces the shape at every sample (1e-9) for every shape, and the error falls as circles are added', () => {
    for (const id of ['circle', 'square', 'star', 'letter'] as const) {
      const z = shapeSamples(id);
      const circles = circlesOf(z);
      expect(circles).toHaveLength(EPI_SAMPLES);
      expect(shapeError(z, circles, EPI_SAMPLES)).toBeLessThan(1e-9);
      let last = Infinity;
      for (let m = 1; m <= EPI_SAMPLES; m++) {
        const e = shapeError(z, circles, m);
        expect(e).toBeLessThanOrEqual(last + 1e-12);
        last = e;
      }
    }
  });

  it('the error after m circles is the energy of the circles left out (Parseval), worked independently from the coefficients', () => {
    const z = shapeSamples('star');
    const circles = circlesOf(z);
    for (const m of [1, 5, 12, 40]) {
      const left = circles.slice(m).reduce((s, c) => s + c.radius ** 2, 0);
      expect(shapeError(z, circles, m)).toBeCloseTo(Math.sqrt(left), 9);
    }
  });

  it('a circle is one circle: its largest circle has radius 1 and the rest are nothing', () => {
    const circles = circlesOf(shapeSamples('circle'));
    expect(circles[0].radius).toBeCloseTo(1, 12);
    expect(circles[0].freq).toBe(1);
    expect(circles[1].radius).toBeLessThan(1e-12);
    expect(shapeError(shapeSamples('circle'), circles, 1)).toBeLessThan(1e-12);
  });

  it('the chain starts at the origin, ends at the sum, and the path closes', () => {
    const circles = circlesOf(shapeSamples('letter'));
    const chain = chainAt(circles, 6, 0.3);
    expect(chain).toHaveLength(7);
    expect(chain[0]).toEqual(cx(0, 0));
    expect(chain[6].re).toBeCloseTo(pointAt(circles, 6, 0.3).re, 12);
    const path = pathOf(circles, 6);
    expect(path[0].re).toBeCloseTo(path[path.length - 1].re, 9);
    expect(path[0].im).toBeCloseTo(path[path.length - 1].im, 9);
  });
});

describe('scene 3: spectrum and filtering', () => {
  it('the two tones sit at their bins with their amplitudes, and the noise stays under its own amplitude', () => {
    for (const n of SIGNAL_SIZES) {
      const amps = amplitudes(spectrumOf(twoToneSignal(n)));
      const [b1, b2] = toneBins(n);
      expect(Math.abs(amps[b1] - 1)).toBeLessThan(NOISE_AMP);
      expect(Math.abs(amps[b2] - 0.6)).toBeLessThan(NOISE_AMP);
      amps.forEach((a, k) => {
        if (k !== b1 && k !== b2) expect(a).toBeLessThan(NOISE_AMP);
      });
    }
    expect(TONE_CYCLES).toEqual([5, 17]);
  });

  it('removing a bin removes its conjugate partner too, so the filtered signal stays real (imaginary part < 1e-9)', () => {
    const n = 64;
    const x = twoToneSignal(n);
    let s = initialSpectrum(n);
    for (const k of [5, 17, 0, 32, 40]) s = toggleBin(s, k <= n / 2 ? k : n - k);
    expect(removedBins(s)).toEqual([0, 5, 17, 24, 32]);
    expect(s.removed[n - 5] && s.removed[n - 17]).toBe(true);
    expect(filtered(x, s).imagMax).toBeLessThan(1e-9);
  });

  it('removing only one of a pair does not keep it real, so the caption about partners is true', () => {
    const x = twoToneSignal(64);
    const one = removeOnlyBin(initialSpectrum(64), 5);
    expect(filtered(x, one).imagMax).toBeGreaterThan(1e-3);
  });

  it('toggling twice restores the signal exactly, and an empty filter returns the input', () => {
    const x = twoToneSignal(64);
    const s = toggleBin(toggleBin(initialSpectrum(64), 9), 9);
    expect(removedBins(s)).toEqual([]);
    filtered(x, s).signal.forEach((v, i) => expect(close(v, x[i])).toBe(true));
  });

  it('the filters do what they name: low-pass keeps the lower tone, band-pass the upper, notch the lower and the noise but not the upper', () => {
    for (const n of SIGNAL_SIZES) {
      const x = twoToneSignal(n);
      const [b1, b2] = toneBins(n);
      const gain = (s: ReturnType<typeof initialSpectrum>, k: number) => amplitudes(spectrumOf(filtered(x, s).signal))[k];
      const [lp, bp, nt] = [lowPass(n), bandPass(n), notch(n)];
      expect(gain(lp, b1)).toBeGreaterThan(0.7);
      expect(gain(lp, b2)).toBeLessThan(1e-9);
      expect(gain(bp, b1)).toBeLessThan(1e-9);
      expect(gain(bp, b2)).toBeGreaterThan(0.4);
      expect(gain(nt, b1)).toBeGreaterThan(0.7);
      expect(gain(nt, b2)).toBeLessThan(1e-9);
      [lp, bp, nt].forEach((s) => expect(filtered(x, s).imagMax).toBeLessThan(1e-9));
    }
  });

  it('counted work: the FFT does (N/2)·log2 N multiplications and the DFT N squared, for N from 8 to 1024, from instrumented runs', () => {
    for (const n of WORK_SIZES) {
      const w = workCounts(n);
      expect(w.fft).toBe((n / 2) * Math.log2(n));
      expect(w.dft).toBe(n * n);
    }
    const count = newOpCount();
    fft(fromReal(new Array<number>(8).fill(1)), count);
    expect(count.complexMuls).toBe(12);
  });
});

describe('scene 4: sampling, aliasing and leakage', () => {
  it('for 200 seeded (f, fs) pairs with whole cycles in the window the strongest bin is the alias, except where the samples are all zero', () => {
    const rnd = mulberry32(11);
    let checked = 0;
    let silent = 0;
    for (let i = 0; i < 200; i++) {
      const fs = FS_CHOICES[Math.floor(rnd() * FS_CHOICES.length)];
      const steps = Math.round((F_RANGE.max - F_RANGE.min) / F_RANGE.step);
      const s: SamplingState = { fs, f: F_RANGE.min + Math.floor(rnd() * (steps + 1)) * F_RANGE.step, window: 'rect' };
      if (!isWholeCycles(s)) continue;
      const r = analyse(s);
      if (r.silent) {
        silent++;
        expect(samples(s).every((v) => Math.abs(v) < 1e-9)).toBe(true);
        expect(cyclesInWindow(s) % (SAMPLES / 2)).toBe(0);
        continue;
      }
      expect(r.peakBin, `f ${s.f} fs ${s.fs}`).toBe(Math.round((aliasOf(s.f, s.fs) * SAMPLES) / s.fs));
      expect(aliasHz(s)).toBe(aliasOf(s.f, s.fs));
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(silent).toBeGreaterThanOrEqual(0);
  });

  it('the samples equal the signed alias tone at every sample, which is why the two cannot be told apart', () => {
    const rnd = mulberry32(4);
    for (let i = 0; i < 100; i++) {
      const fs = FS_CHOICES[Math.floor(rnd() * FS_CHOICES.length)];
      const s: SamplingState = { fs, f: F_RANGE.min + Math.floor(rnd() * 380) * F_RANGE.step, window: 'rect' };
      samples(s).forEach((v, n) => expect(close(v, aliasSign(s) * Math.sin((2 * Math.PI * aliasHz(s) * n) / s.fs), 1e-9)).toBe(true));
    }
  });

  it('a whole number of cycles concentrates on one bin; a fractional number smears, and Hann shrinks the far smear', () => {
    const whole = analyse({ fs: 32, f: 5, window: 'rect' });
    expect(whole.smearBins).toEqual([10]);
    const smeared = analyse({ fs: 32, f: 5.25, window: 'rect' });
    const hann = analyse({ fs: 32, f: 5.25, window: 'hann' });
    expect(isWholeCycles({ fs: 32, f: 5.25, window: 'rect' })).toBe(false);
    expect(smeared.smearBins.length).toBeGreaterThan(20);
    expect(hann.smearBins.length).toBeLessThan(smeared.smearBins.length / 3);
    expect(hann.smearBins.length).toBeGreaterThanOrEqual(3);
  });

  it('a tone below Nyquist appears at its own frequency and one above it folds back to the stated alias', () => {
    const below = analyse({ fs: 32, f: 5, window: 'rect' });
    expect((below.peakBin * 32) / SAMPLES).toBe(5);
    const above = analyse({ fs: 32, f: 20, window: 'rect' });
    expect((above.peakBin * 32) / SAMPLES).toBe(12);
    expect(aliasOf(20, 32)).toBe(12);
  });

  it('the strongest bin reads 1 for a whole-cycle tone with either window (the window gain is divided out)', () => {
    for (const w of ['rect', 'hann'] as const) {
      const r = analyse({ fs: 64, f: 8, window: w });
      expect(r.amps[r.peakBin]).toBeCloseTo(1, 9);
    }
  });
});
