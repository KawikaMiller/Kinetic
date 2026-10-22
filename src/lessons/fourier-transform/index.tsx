import { decimal, integer, pct } from '../../core/format';
import { aliasOf } from '../../core/signal';
import type { LessonModule } from '../../core/types';
import { SAMPLES as SHAPE_SAMPLES, circlesOf, shapeError, shapeSamples } from './epicycles';
import { GIBBS_LIMIT, initialHarmonics, overshootShare, rmsError, snapToDft, type HarmonicsState } from './harmonics';
import { analyse, binWidth, initialSampling, type SamplingState } from './sampling';
import { Stage } from './Stage';
import { amplitudes, filtered, lowPass, spectrumOf, toneBins, twoToneSignal, workCounts } from './spectrum';

const n2 = (v: number) => decimal(v, 2);

const H0 = initialHarmonics();
const H0Snap = snapToDft(H0);
const triangle: HarmonicsState = { ...H0, target: 'triangle' };
const triangleSine = rmsError(snapToDft(triangle));
const triangleFree = rmsError(snapToDft({ ...triangle, mode: 'free' }));
const oddAmps = [1, 3, 5, 7].map((k) => n2(H0Snap.amps[k - 1]));

const letterUsed = 3;
const letter = shapeSamples('letter');
const letterCircles = circlesOf(letter);
const letterError = shapeError(letter, letterCircles, letterUsed);

const lowPassed = filtered(twoToneSignal(64), lowPass(64));
const upperTone = toneBins(64)[1];
const lowerTone = toneBins(64)[0];
const lowPassAmps = amplitudes(spectrumOf(lowPassed.signal));
const originalAmps = amplitudes(spectrumOf(twoToneSignal(64)));
const work = workCounts(1024);

const S0 = initialSampling();
const atFive = analyse(S0);
const toTwenty: SamplingState = { ...S0, f: 20 };
const twentyBin = analyse(toTwenty).peakBin;
const fractional: SamplingState = { ...S0, f: 5.25 };
const smearRect = analyse(fractional).smearBins.length;
const smearHann = analyse({ ...fractional, window: 'hann' }).smearBins.length;

const aliased = aliasOf(20, 32);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The Fourier transform splits a signal into sine waves, and the FFT computes the same transform with far fewer multiplications; a real signal\'s spectrum is mirrored, and sampling too slowly folds a tone onto a lower frequency.',
    what: 'Any signal sampled N times can be written as a sum of N sine and cosine waves, one per frequency bin, and the discrete Fourier transform (DFT) finds how much of each. For a real signal the upper half of the spectrum is the complex conjugate of the lower half, so it adds nothing new. The FFT is the same DFT, computed in about (N/2) log2 N multiplications instead of N squared. Sampling at a rate fs can only show frequencies up to fs/2; a faster tone appears at an alias, and a tone that does not fit the window a whole number of times smears across bins unless a window such as Hann tapers the ends.',
    analogy: 'A chord on a piano. Your ear hears one sound; the transform tells you which keys were pressed and how hard. Filtering is lifting some of those fingers and playing what is left.',
    useCases: [
      'Audio and image tools: equalisers, noise removal and compression all work on a spectrum',
      'Reading why a sensor or a recording shows a slow tone that was never there (aliasing)',
      'Spectrum analysers, vibration monitoring and finding the repeating period in a time series',
      'Fast multiplication of big numbers and polynomials, which uses the FFT as a subroutine',
    ],
    why: 'Frequency space turns hard questions into easy ones: which tone is this, what is noise, how fast must I sample. Building a wave from harmonics, filtering a spectrum and aliasing a tone on purpose shows what a spectrum analyser or an audio filter is actually doing.',
    watch: 'Harmonics: the dark grey line is the target, the yellow line is the sum of your harmonics, red segments are the error at each of the 64 samples, and thin lines in amber, pink, light blue and orange are harmonics 1 to 8. Epicycles: the dark grey outline is the shape, the yellow line the path the circles trace, and circles with arms in amber, pink, light blue and orange are the circles from largest to smallest. Spectrum: bars are blue when kept and dark grey when removed; the yellow line in the time plot is the filtered signal, and a yellow marker shows the bin the slider is on. Sampling: dark grey is the tone itself, blue dots are samples, orange is the alias and the strongest bin, and violet bars are leakage. The chips say what is real, simulated or illustrative.',
  },
  tryThis: [
    `In "Harmonics" (target square, only harmonic 1 at ${n2(H0.amps[0])}) the RMS error is ${n2(rmsError(H0))}. Press "Snap to the DFT": the odd harmonics 1, 3, 5 and 7 become ${oddAmps.join(', ')} and the error falls to ${n2(rmsError(H0Snap))}. Pick the triangle: snapping in the sine mode only reaches ${n2(triangleSine)}; switch to free phase and snap again and it reaches ${n2(triangleFree)}.`,
    `In "Epicycles" (the letter L from its ${letterUsed} largest circles of ${SHAPE_SAMPLES}) the error is ${n2(letterError)}. Slide "Circles used" to ${SHAPE_SAMPLES}: the error is ${n2(shapeError(letter, letterCircles, SHAPE_SAMPLES))} and the circles redraw the letter exactly.`,
    `In "Spectrum and filtering" press low-pass: the tone at bin ${upperTone} goes from ${n2(originalAmps[upperTone])} to ${n2(lowPassAmps[upperTone])} and the one at bin ${lowerTone} stays at ${n2(lowPassAmps[lowerTone])}, and the bins above 10 and their mirror bins are removed together. In the work panel pick 1024 samples: the definition needs ${integer(work.dft)} multiplications and the FFT ${integer(work.fft)}.`,
    `In "Sampling and leakage" (5 Hz at 32 Hz, no window) one bin is above 1% of the peak, at ${n2(atFive.peakBin * binWidth(S0))} Hz. Move the tone to 20 Hz, above half the sampling rate: the strongest bin is at ${n2(twentyBin * binWidth(S0))} Hz. Set it to 5.25 Hz: ${smearRect} bins leak, and with the Hann window ${smearHann}.`,
  ],
  keyIdeas: [
    'A waveform is a sum of sine waves and the DFT finds each one\'s amplitude and phase; a sharp edge needs many of them, which is why the square wave\'s Gibbs overshoot stays near 9% of the jump however many harmonics are added.',
    'The mirrored half of a real signal\'s spectrum is not a bug: bin N minus k is the complex conjugate of bin k, so a filter has to remove both or the result stops being real.',
    'The FFT is not a different transform: it is the same DFT computed in (N/2) log2 N multiplications instead of N squared, a saving that grows with N.',
    'Sampling at fs can show frequencies up to fs/2, and a faster tone folds back to an alias; a tone that does not fit the window a whole number of times leaks across bins, which a Hann window reduces.',
  ],
  quiz: [
    {
      q: 'The spectrum of a real signal is mirrored: the upper half repeats the lower half. What is the mirrored half?',
      options: [
        'An error from the transform that the FFT introduces by splitting the signal in two',
        'The conjugate of the lower half, so it carries no new information for a real signal',
        'A second copy of the signal at twice the frequency, added by the sampling',
        'The negative frequencies of noise, which a good filter drops without comment',
      ],
      answer: 1,
      why: `For a real signal, bin N minus k is the complex conjugate of bin k. That is why the lesson removes the bins in pairs and the filtered signal keeps an imaginary part under 1e-9 (just rounding).`,
    },
    {
      q: 'How does the FFT relate to the discrete Fourier transform?',
      options: [
        'It is the same transform, computed with fewer multiplications',
        'It is a faster but rougher estimate that gives only the strongest bins',
        'It is a newer transform that sees frequencies the DFT misses',
        'It is the inverse transform, used when going from spectrum to signal',
      ],
      answer: 0,
      why: `Both give the same numbers. For 1024 samples the definition took ${integer(work.dft)} counted multiplications and the FFT ${integer(work.fft)}, which is ${decimal(work.dft / work.fft, 0)} times fewer.`,
    },
    {
      q: 'A 20 Hz tone is sampled at 32 Hz. At which frequency does its strongest bin appear?',
      options: [
        'At 20 Hz, because the spectrum shows the tone as it was',
        'At 16 Hz, because that is half the sampling rate and the limit',
        `At ${aliased} Hz, because 20 is ${aliased} away from the sampling rate of 32`,
        'Nowhere, because a tone above half the sampling rate is lost',
      ],
      answer: 2,
      why: `The alias is the distance from the tone to the nearest multiple of the sampling rate: |20 - 32| = ${aliased}. The samples of the two tones are identical, so no spectrum can tell them apart. In the lesson the strongest bin lands at ${n2(twentyBin * binWidth(S0))} Hz.`,
    },
    {
      q: 'More and more odd harmonics are added to a square wave. What happens to the overshoot at the jump?',
      options: [
        'It shrinks toward nothing, because the sum gets closer to the square wave',
        'It grows, because each harmonic adds a new bump near the edge',
        'It stays near 9% of the jump, but moves in closer to the edge',
        'It splits into several smaller bumps of equal height along the plateau',
      ],
      answer: 2,
      why: `The peak of the partial sum settles at ${decimal(GIBBS_LIMIT, 3)}, an overshoot of ${pct(overshootShare(GIBBS_LIMIT), 1)} of the jump. The spike gets narrower but not lower, and the sum is exact at the samples.`,
    },
    {
      q: 'A tone that does not fit the analysis window a whole number of times is transformed. What does the spectrum show?',
      options: [
        'One clean bin at the tone, with a small error in its height',
        'Nothing, because a tone that does not fit has no frequency at all',
        'Two bins, one just below the tone and one just above it',
        'The energy leaking across many bins, which a Hann window shrinks',
      ],
      answer: 3,
      why: `The DFT treats the window as one period of an endless repeat, so a partial cycle has a jump at the join. In the lesson 5.25 Hz leaks into ${smearRect} bins above 1% of the peak, and ${smearHann} with a Hann window.`,
    },
  ],
};

export default lesson;
