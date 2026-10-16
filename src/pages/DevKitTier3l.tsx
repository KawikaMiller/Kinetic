import { useMemo, useState } from 'react';
import { CellGrid } from '../components/CellGrid';
import { Bars, Plot2D } from '../components/Plot2D';
import { Slider, Stat, Stats, Toggle } from '../components/ui';
import { SectionTitle } from '../components/Panel';
import { JPEG_LUMA_TABLE, dct2, dequantise, idct2, levelShift, quantise, scaleQuantTable, type Grid } from '../core/dct';
import { fft, dft, fromReal, magnitudes, mse, newOpCount, psnr, window as windowOf, applyWindow } from '../core/signal';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 8 to 9, agent L: core/signal, core/dct (#/dev/kit). */

const N = 64;
const SAMPLE_BLOCK: Grid = [
  [52, 55, 61, 66, 70, 61, 64, 73],
  [63, 59, 55, 90, 109, 85, 69, 72],
  [62, 59, 68, 113, 144, 104, 66, 73],
  [63, 58, 71, 122, 154, 106, 70, 69],
  [67, 61, 68, 104, 126, 88, 68, 70],
  [79, 65, 60, 70, 77, 68, 58, 75],
  [85, 71, 64, 59, 55, 61, 65, 83],
  [87, 79, 69, 68, 65, 76, 78, 94],
];

function SpectrumDemo() {
  const [cycles, setCycles] = useState(8.5);
  const [hann, setHann] = useState(false);
  const [bars, work] = useMemo(() => {
    const tone = Array.from({ length: N }, (_, t) => Math.sin((2 * Math.PI * cycles * t) / N));
    const x = hann ? applyWindow(tone, windowOf('hann', N)) : tone;
    const slow = newOpCount();
    const fast = newOpCount();
    dft(fromReal(x), slow);
    const mags = magnitudes(fft(fromReal(x), fast)).slice(0, N / 2);
    return [mags.map((y, k) => ({ x0: k, x1: k + 1, y })), { slow: slow.complexMuls, fast: fast.complexMuls }];
  }, [cycles, hann]);
  return (
    <>
      <Slider label="Cycles in the window" value={cycles} min={1} max={20} step={0.5} format={(v) => `${v}`} onChange={setCycles} />
      <Toggle label="Hann window" value={hann} onChange={setHann} />
      <Plot2D x={{ domain: [0, N / 2], label: 'bin' }} y={{ domain: [0, N / 2], label: 'magnitude' }} ariaLabel="Magnitude spectrum of a sampled tone">
        <Bars bars={bars} tone="info" />
      </Plot2D>
      <Stats>
        <Stat label="DFT multiplications" value={work.slow} sub="N squared, counted" />
        <Stat label="FFT multiplications" value={work.fast} sub="(N/2) log2 N, counted" />
      </Stats>
    </>
  );
}

function DctDemo() {
  const [quality, setQuality] = useState(50);
  const result = useMemo(() => {
    const table = scaleQuantTable(JPEG_LUMA_TABLE, quality);
    const levels = quantise(dct2(levelShift(SAMPLE_BLOCK)), table);
    const reconstructed = levelShift(idct2(dequantise(levels, table)), -128);
    return { levels, error: psnr(SAMPLE_BLOCK.flat(), reconstructed.flat().map((v) => Math.round(v))), mse: mse(SAMPLE_BLOCK.flat(), reconstructed.flat()) };
  }, [quality]);
  const kept = result.levels.flat().filter((v) => v !== 0).length;
  return (
    <>
      <Slider label="Quality" value={quality} min={1} max={100} onChange={setQuality} />
      <CellGrid
        rows={8}
        cols={8}
        size="sm"
        cell={(r, c) => {
          const v = result.levels[r][c];
          return { text: v, tone: r === 0 && c === 0 ? 'amber' : v === 0 ? 'dim' : 'hi', fill: v === 0 ? 'none' : 'tint' };
        }}
      />
      <Stats>
        <Stat label="Non-zero levels" value={`${kept} of 64`} />
        <Stat label="PSNR" value={Number.isFinite(result.error) ? `${result.error.toFixed(1)} dB` : 'infinite'} sub={`MSE ${result.mse.toFixed(2)}`} />
      </Stats>
    </>
  );
}

export function DevKitTier3l() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 8 to 9 round, agent L</SectionTitle>
      <Section title="core/signal · tone spectrum by the FFT, leakage with a fractional number of cycles, the Hann window, counted DFT vs FFT work">
        <SpectrumDemo />
      </Section>
      <Section title="core/dct · an 8 by 8 block through DCT, quantisation (libjpeg quality rule) and back; zeroed levels are dim, DC is amber">
        <DctDemo />
      </Section>
    </>
  );
}
