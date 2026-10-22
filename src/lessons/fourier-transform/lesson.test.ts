import { describe, expect, it } from 'vitest';
import { decimal, integer } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { epicycleCaption, harmonicsCaption, samplingCaption, spectrumCaption, workCaption } from './captions';
import { SAMPLES as SHAPE_SAMPLES, SHAPES, circlesOf, shapeError, shapeSamples } from './epicycles';
import { TARGETS, initialHarmonics, rmsError, snapToDft, type HarmonicsState } from './harmonics';
import lesson from './index';
import { FS_CHOICES, F_RANGE, SAMPLES, WINDOWS, analyse, binWidth, initialSampling, type SamplingState } from './sampling';
import { SIGNAL_SIZES, WORK_SIZES, amplitudes, filtered, initialSpectrum, lowPass, spectrumOf, toggleBin, toneBins, twoToneSignal, workCounts } from './spectrum';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const styles = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').split('\r').join('');
const clean = (s: string) => {
  expect(s).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return s;
};
const n2 = (v: number) => decimal(v, 2);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('fourier-transform');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('fourier-transform')).toEqual([]);
  });

  it('each scene opens on a pure state with the values its try-this relies on', () => {
    expect(initialHarmonics()).toEqual(initialHarmonics());
    expect(initialHarmonics()).toMatchObject({ target: 'square', mode: 'sine', amps: [1, 0, 0, 0, 0, 0, 0, 0] });
    expect(initialSpectrum(64).removed.some(Boolean)).toBe(false);
    expect(initialSampling()).toEqual({ fs: 32, f: 5, window: 'rect' });
    expect(sources['./EpicycleScene.tsx']).toContain("shape: 'letter', used: 3");
  });

  it('stays inside the page: no network call, no eval, no storage, nothing played', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(forbiddenCalls(sources, { also: ['localStorage', 'sessionStorage', 'indexedDB'] })).toEqual([]);
    for (const text of Object.values(sources)) expect(text).not.toMatch(/AudioContext|new Audio|\.play\(\)/);
  });

  it('chips every scene, with the transform marked real and the noise simulated', () => {
    for (const file of ['./HarmonicsScene.tsx', './EpicycleScene.tsx', './SpectrumScene.tsx', './SamplingScene.tsx']) expect(sources[file]).toContain('<Provenance kind="real">');
    expect(sources['./SpectrumScene.tsx']).toContain('kind="simulated" seed={NOISE_SEED}');
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: snapping lowers the error and sets the odd harmonics; the triangle needs free phase', () => {
    const h = initialHarmonics();
    const snap = snapToDft(h);
    const t = lesson.tryThis[0];
    expect(rmsError(snap)).toBeLessThan(rmsError(h));
    expect(t).toContain(`the RMS error is ${n2(rmsError(h))}`);
    expect(t).toContain(`${[1, 3, 5, 7].map((k) => n2(snap.amps[k - 1])).join(', ')}`);
    expect(t).toContain(`the error falls to ${n2(rmsError(snap))}`);
    const tri: HarmonicsState = { ...h, target: 'triangle' };
    expect(rmsError(snapToDft({ ...tri, mode: 'free' }))).toBeLessThan(rmsError(snapToDft(tri)));
    expect(t).toContain(`only reaches ${n2(rmsError(snapToDft(tri)))}`);
    expect(t).toContain(`it reaches ${n2(rmsError(snapToDft({ ...tri, mode: 'free' })))}`);
  });

  it('try-this 2: the letter L from 3 circles has the stated error and 64 circles redraw it exactly', () => {
    const z = shapeSamples('letter');
    const circles = circlesOf(z);
    const t = lesson.tryThis[1];
    expect(shapeError(z, circles, 3)).toBeGreaterThan(0.2);
    expect(shapeError(z, circles, SHAPE_SAMPLES)).toBeLessThan(1e-9);
    expect(t).toContain(`the error is ${decimal(shapeError(z, circles, 3), 3)}`);
    expect(clean(epicycleCaption('letter', 3))).toContain(`the error is ${decimal(shapeError(z, circles, 3), 3)}`);
    expect(t).toContain('the error is 0 and the circles redraw the letter exactly');
  });

  it('try-this 3: low-pass removes the upper tone and keeps the lower; 1024 samples cost the counted totals', () => {
    const [lower, upper] = toneBins(64);
    const original = amplitudes(spectrumOf(twoToneSignal(64)));
    const after = amplitudes(spectrumOf(filtered(twoToneSignal(64), lowPass(64)).signal));
    expect(after[upper]).toBeLessThan(1e-9);
    expect(after[lower]).toBeGreaterThan(0.7);
    const work = workCounts(1024);
    const t = lesson.tryThis[2];
    expect(t).toContain(`the bar at bin ${upper} (a tone of amplitude ${n2(original[upper])} in the signal) drops to ${n2(after[upper])}`);
    expect(t).toContain(`the bar at bin ${lower} stays`);
    expect(t).toContain(`${integer(work.dft)} multiplications and the FFT ${integer(work.fft)}`);
    expect(work.dft).toBe(1024 * 1024);
    expect(work.fft).toBe(512 * 10);
  });

  it('try-this 4: 5 Hz has one bin; 20 Hz moves the strongest bin to 12 Hz; 5.25 Hz leaks into more bins without a window than with Hann', () => {
    const s = initialSampling();
    const at = analyse(s);
    expect(at.smearBins).toHaveLength(1);
    const twenty = analyse({ ...s, f: 20 });
    expect(twenty.peakBin * binWidth(s)).toBe(12);
    const rect = analyse({ ...s, f: 5.25 });
    const hann = analyse({ ...s, f: 5.25, window: 'hann' });
    expect(hann.smearBins.length).toBeLessThan(rect.smearBins.length);
    const t = lesson.tryThis[3];
    expect(t).toContain(`one bin is above 1% of the peak, at ${n2(at.peakBin * binWidth(s))} Hz`);
    expect(t).toContain(`the strongest bin is at ${n2(twenty.peakBin * binWidth(s))} Hz`);
    expect(t).toContain(`${rect.smearBins.length} bins leak, and with the Hann window ${hann.smearBins.length}`);
  });
});

describe('every control combination gives a clean caption that matches the model', () => {
  it('scene 1: every target, both phase modes and the default, snapped or not', () => {
    for (const target of TARGETS.map((t) => t.value)) for (const mode of ['sine', 'free'] as const) for (const snapped of [false, true]) {
      const base: HarmonicsState = { ...initialHarmonics(), target, mode, drawn: target === 'drawn' ? [{ x: 0.1, y: 1 }, { x: 0.6, y: -1 }] : [] };
      const h = snapped ? snapToDft(base) : base;
      const text = clean(expectCaption(harmonicsCaption(h)));
      expect(text).toContain(`RMS error is ${n2(rmsError(h))}`);
    }
    expect(expectCaption(harmonicsCaption({ ...initialHarmonics(), target: 'drawn' }))).toContain('there is no curve yet');
  });

  it('scene 1: the caption blames the right thing for the error left after snapping', () => {
    const square = snapToDft(initialHarmonics());
    expect(rmsError(snapToDft({ ...square, mode: 'free' }))).toBeCloseTo(rmsError(square), 1);
    expect(expectCaption(harmonicsCaption(square))).toContain('8 harmonics are too few');
    const triangle: HarmonicsState = { ...initialHarmonics(), target: 'triangle' };
    expect(expectCaption(harmonicsCaption(triangle))).toContain('the sine mode has no phase');
    const freeTriangle = snapToDft({ ...triangle, mode: 'free' });
    expect(expectCaption(harmonicsCaption(freeTriangle))).toContain('as close as the coefficients of the DFT get');
    expect(expectCaption(harmonicsCaption({ ...freeTriangle, amps: [1, 0, 0, 0, 0, 0, 0, 0] }))).toContain('bring it down to');
  });

  it('scene 2: every shape at every circle count states the error of the model', () => {
    for (const { value } of SHAPES) {
      const z = shapeSamples(value);
      const circles = circlesOf(z);
      for (const used of [1, 2, 6, 33, 63, 64]) {
        const text = clean(expectCaption(epicycleCaption(value, used)));
        expect(text).toContain(`error ${used >= SHAPE_SAMPLES ? 'at the 64 samples is' : 'is'} ${(used >= SHAPE_SAMPLES ? n2 : (v: number) => decimal(v, 3))(shapeError(z, circles, used))}`);
      }
    }
  });

  it('scene 3: no removal, a filter, and every size state the removed bins and the real-signal check', () => {
    for (const n of SIGNAL_SIZES) {
      const x = twoToneSignal(n);
      expect(expectCaption(spectrumCaption(initialSpectrum(n), 0))).toContain('Nothing removed');
      const s = lowPass(n);
      const text = clean(expectCaption(spectrumCaption(s, filtered(x, s).imagMax)));
      expect(text).toContain('conjugate');
      const one = toggleBin(initialSpectrum(n), 3);
      expect(expectCaption(spectrumCaption(one, 0))).toContain(`3 and ${n - 3}`);
    }
    for (const n of WORK_SIZES) {
      const w = workCounts(n);
      expect(expectCaption(workCaption(w))).toContain(`${integer(w.dft)} complex multiplications`);
    }
  });

  it('scene 4: every sampling rate, window and a spread of tone frequencies, with the claims following the model', () => {
    const steps = Math.round((F_RANGE.max - F_RANGE.min) / F_RANGE.step);
    for (const fs of FS_CHOICES) for (const { value: window } of WINDOWS) {
      for (let i = 0; i <= steps; i += 7) {
        const s: SamplingState = { fs, f: F_RANGE.min + i * F_RANGE.step, window };
        const r = analyse(s);
        const text = clean(expectCaption(samplingCaption(s)));
        expect(text.includes('Every sample is zero')).toBe(r.silent);
        if (r.silent) continue;
        expect(text).toContain(s.f > fs / 2 ? 'folds back' : 'the tone');
        // Independent oracle: the alias is the distance to the nearest multiple of fs, and the strongest bin is within half a bin of it.
        const alias = Math.abs(s.f - Math.round(s.f / fs) * fs);
        const bw = fs / SAMPLES;
        const peakHz = r.peakBin * bw;
        expect(Math.abs(peakHz - alias)).toBeLessThanOrEqual(bw / 2 + 1e-9);
        const whole = Math.abs((s.f * SAMPLES) / fs - Math.round((s.f * SAMPLES) / fs)) < 1e-9;
        expect(text.includes('the tone itself')).toBe(whole && s.f <= fs / 2);
        if (!whole) expect(text).toContain(`${n2(peakHz)} Hz`);
      }
    }
  });
});

describe('sampling caption at off-bin tones (the strongest bin is the nearest bin, not the tone)', () => {
  it('5.25 Hz at 32 Hz names the nearest bin and does not call it the tone itself', () => {
    for (const window of ['rect', 'hann'] as const) {
      const text = clean(expectCaption(samplingCaption({ fs: 32, f: 5.25, window })));
      expect(text).not.toContain('the tone itself');
      expect(text).toContain('nearest the tone');
    }
  });

  it('20.25 Hz at 32 Hz names both the 11.75 Hz alias and the bin it lands on', () => {
    for (const window of ['rect', 'hann'] as const) {
      const s: SamplingState = { fs: 32, f: 20.25, window };
      const text = clean(expectCaption(samplingCaption(s)));
      expect(text).toContain('alias at 11.75 Hz');
      expect(text).toContain(`${n2(analyse(s).peakBin * binWidth(s))} Hz (the bins`);
    }
  });
});

describe('spectrum caption counts bins, not pairs', () => {
  it('removing bin 0 reports one bin and the mirror remark', () => {
    const text = clean(expectCaption(spectrumCaption(toggleBin(initialSpectrum(64), 0), 0)));
    expect(text).toContain('Removed 1 bin (0)');
    expect(text).not.toContain('pair');
  });
});

describe('harmonics caption cause', () => {
  it('a flat drawn line (all offset, no shape) blames the missing constant, not sharpness', () => {
    const h: HarmonicsState = { ...initialHarmonics(), target: 'drawn', drawn: [{ x: 0.5, y: 0.19 }] };
    const text = clean(expectCaption(harmonicsCaption(h)));
    expect(text).toContain('constant offset');
    expect(text).not.toContain('too few');
  });
});

describe('drawn-curve click layer', () => {
  it('the curves, residuals and points above the click layer do not take pointer events', () => {
    const rule = /\.ft-drawn-plot \.plot-curve,\s*\.ft-drawn-plot \.plot-segments,\s*\.ft-drawn-plot \.plot-points \{ pointer-events: none; \}/;
    expect(styles).toMatch(rule);
    expect(sources['./HarmonicsScene.tsx']).toContain("className={drawn ? 'ft-drawn-plot' : ''}");
  });
});

describe('hostile input', () => {
  it('the controls cannot reach a size the transform refuses: only the powers of two the lesson offers', () => {
    for (const n of [...SIGNAL_SIZES, ...WORK_SIZES]) expect(Number.isInteger(Math.log2(n))).toBe(true);
    expect(() => workCounts(48)).toThrow(RangeError);
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });

  it('the quiz alias question quotes the alias the model computes', () => {
    expect(lesson.quiz[2].options[2]).toContain('12 Hz');
    expect(lesson.quiz[2].why).toContain('|20 - 32| = 12');
  });
});
