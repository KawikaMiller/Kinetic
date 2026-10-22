import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, Plot2D, PointerLayer, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { spectrumCaption, workCaption } from './captions';
import {
  NOISE_SEED, SIGNAL_SIZES, WORK_SIZES, amplitudes, bandPass, filtered, initialSpectrum, lowPass, notch, removedBins, spectrumOf, toggleBin, twoToneSignal, workCounts,
  type SignalSize, type SpectrumState,
} from './spectrum';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--dim)', label: 'the signal as it was', shape: 'line' },
      { color: 'var(--dim)', label: '✕ a removed bin (its mirror bin goes with it)', shape: 'square' },
      { color: 'var(--hi)', label: 'the filtered signal', shape: 'line' },
      { color: 'var(--info)', label: 'a bin that is kept', shape: 'square' },
    ]}
  />
);
const FILTERS = [
  { id: 'low', label: 'low-pass', make: lowPass },
  { id: 'band', label: 'band-pass', make: bandPass },
  { id: 'notch', label: 'notch', make: notch },
] as const;

export function SpectrumScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<SpectrumState>(() => initialSpectrum(64));
  const [cursor, setCursor] = useState(5);
  const [workN, setWorkN] = useState<number>(256);
  const x = useMemo(() => twoToneSignal(s.n as SignalSize), [s.n]);
  const amps = useMemo(() => amplitudes(spectrumOf(x)), [x]);
  const out = useMemo(() => filtered(x, s), [x, s]);
  const work = useMemo(() => workCounts(workN), [workN]);
  const half = s.n / 2;
  const bars = amps.map((y, k) => ({ x0: k - 0.4, x1: k + 0.4, y, tone: s.removed[k] ? ('dim' as const) : ('info' as const) }));
  const line = (v: readonly number[]) => v.map((y, i) => [i, y] as [number, number]);
  const caption = spectrumCaption(s, out.imagMax);
  const toggle = (k: number) => setS((c) => toggleBin(c, Math.min(half, Math.max(0, Math.round(k)))));
  const changeSize = (n: SignalSize) => { setS(initialSpectrum(n)); setCursor((k) => Math.min(k * (n / s.n), n / 2)); };
  return (
    <StageFrame
      height={820}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Bin pairs removed" value={removedBins(s).length} />
          <Stat label="Largest imaginary part left" value={out.imagMax.toExponential(1)} sub="zero up to rounding: still a real signal" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Samples" value={s.n} onChange={changeSize} options={SIGNAL_SIZES.map((n) => ({ value: n, label: String(n) }))} />
          <ControlGroup label="Filters" inline>
            {FILTERS.map((f) => <ChipButton key={f.id} tone="info" onClick={() => setS(f.make(s.n as SignalSize))}>{f.label}</ChipButton>)}
          </ControlGroup>
        </>,
        <>
          <Slider label="Bin" value={cursor} min={0} max={half} onChange={setCursor} />
          <Button onClick={() => toggle(cursor)}>{s.removed[cursor] ? 'Restore the bin' : 'Remove the bin'}</Button>
          <Button onClick={() => setS(initialSpectrum(s.n as SignalSize))}>Restore all</Button>
        </>,
      ]}
    >
      <div className="ft-stage stage-pad">
        <div className="ft-row">
          <div className="ft-col">
            <Box>
              <SectionTitle hint={`${s.n} samples: two tones plus seeded noise`}>In time</SectionTitle>
              <Plot2D x={{ domain: [0, s.n - 1], label: 'sample' }} y={{ domain: [-2.2, 2.2] }} ariaLabel="The signal and the filtered signal in time">
                <Curve points={line(x)} tone="dim" width={1.5} />
                <Curve points={line(out.signal)} tone="hi" width={2} />
              </Plot2D>
            </Box>
          </div>
          <div className="ft-col">
            <Box>
              <SectionTitle hint="click a bar to remove it, or use the bin slider">In frequency</SectionTitle>
              <Plot2D x={{ domain: [-0.5, half + 0.5], label: 'bin (cycles per window)' }} y={{ domain: [0, 1.2], label: 'amplitude' }} ariaLabel="Amplitude of each frequency bin of the signal">
                <PointerLayer onDown={(p) => toggle(p[0])} />
                <Bars bars={bars} />
                <VLine at={cursor} tone="hi" />
              </Plot2D>
            </Box>
          </div>
        </div>
        <Box>
          <SectionTitle hint="counted from instrumented runs, not from the formula">Work: the definition against the FFT</SectionTitle>
          <Segmented label="Samples" value={workN} onChange={setWorkN} options={WORK_SIZES.map((n) => ({ value: n, label: String(n) }))} />
          <Stats>
            <Stat label="DFT multiplications" value={integer(work.dft)} sub="N squared, counted" color="var(--bad)" />
            <Stat label="FFT multiplications" value={integer(work.fft)} sub="(N / 2) log2 N, counted" color="var(--ok)" />
          </Stats>
          <p className="hint is-muted">{workCaption(work)}</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">the transform is computed here: radix-2 FFT, inverse FFT, instrumented counts</Provenance>
          <Provenance kind="simulated" seed={NOISE_SEED}>the noise is seeded</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
