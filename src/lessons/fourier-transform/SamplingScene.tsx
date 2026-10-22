import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { samplingCaption } from './captions';
import {
  DRAW_CYCLES_MAX, F_RANGE, FS_CHOICES, SAMPLES, WINDOWS, aliasHz, aliasSign, analyse, binWidth, cyclesInWindow, initialSampling, nyquist, samples, type SampleRate, type SamplingState,
  type WindowChoice,
} from './sampling';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--dim)', label: 'the tone itself (drawn while it is slow enough to see)', shape: 'line' },
      { color: 'var(--info)', label: 'the samples, and a bin of the spectrum', shape: 'dot' },
      { color: 'var(--orange)', label: 'the alias: the tone the samples fit, and the strongest bin', shape: 'line' },
      { color: 'var(--violet)', label: 'leakage: a bin above 1% of the peak', shape: 'square' },
    ]}
  />
);

export function SamplingScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<SamplingState>(initialSampling);
  const r = useMemo(() => analyse(s), [s]);
  const xs = useMemo(() => samples(s), [s]);
  const duration = SAMPLES / s.fs;
  const width = binWidth(s);
  const alias = aliasHz(s);
  const aliased = s.f > nyquist(s);
  const cycles = cyclesInWindow(s);
  const caption = samplingCaption(s);
  const bars = r.amps.map((y, k) => ({
    x0: k * width - width * 0.4,
    x1: k * width + width * 0.4,
    y,
    tone: r.silent ? ('info' as const) : k === r.peakBin ? ('orange' as const) : r.smearBins.includes(k) ? ('violet' as const) : ('info' as const),
  }));
  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Tone" value={`${decimal(s.f, 2)} Hz`} sub={`${decimal(cycles, 2)} cycles in the window`} />
          <Stat label="Strongest bin" value={r.silent ? 'none' : `${decimal(r.peakBin * width, 2)} Hz`} sub={r.silent ? 'every sample is zero' : aliased ? `alias of ${decimal(s.f, 2)} Hz` : 'the tone itself'} color={r.silent || !aliased ? undefined : 'var(--orange)'} />
          <Stat label="Bins above 1% of the peak" value={r.silent ? 0 : r.smearBins.length} color={r.smearBins.length > 3 ? 'var(--violet)' : undefined} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Sampling rate" value={s.fs} onChange={(fs: SampleRate) => setS((c) => ({ ...c, fs }))} options={FS_CHOICES.map((f) => ({ value: f, label: `${f} Hz` }))} />
          <Segmented label="Window" value={s.window} onChange={(window: WindowChoice) => setS((c) => ({ ...c, window }))} options={[...WINDOWS]} />
        </>,
        <>
          <Slider label="Tone frequency" value={s.f} min={F_RANGE.min} max={F_RANGE.max} step={F_RANGE.step} format={(v) => `${decimal(v, 2)} Hz`} onChange={(f) => setS((c) => ({ ...c, f }))} />
          <Button onClick={() => setS(initialSampling())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ft-stage stage-pad">
        <div className="ft-row">
          <div className="ft-col">
            <Box>
              <SectionTitle hint={`${SAMPLES} samples over ${decimal(duration, 2)} s`}>In time</SectionTitle>
              <Plot2D x={{ domain: [0, duration], label: 'time (s)' }} y={{ domain: [-1.2, 1.2] }} ariaLabel="The tone, its samples and the alias the samples fit">
                {cycles <= DRAW_CYCLES_MAX && <Curve fn={(t) => Math.sin(2 * Math.PI * s.f * t)} tone="dim" width={1.5} />}
                {aliased && <Curve fn={(t) => aliasSign(s) * Math.sin(2 * Math.PI * alias * t)} tone="orange" width={2} />}
                <Points data={xs.map((y, n) => ({ x: (n * duration) / SAMPLES, y, tone: 'info' as const }))} r={2.5} />
              </Plot2D>
            </Box>
          </div>
          <div className="ft-col">
            <Box>
              <SectionTitle hint={`bins ${decimal(width, 2)} Hz apart, up to half the sampling rate`}>In frequency</SectionTitle>
              <Plot2D x={{ domain: [-width / 2, nyquist(s) + width / 2], label: 'frequency (Hz)' }} y={{ domain: [0, 1.1], label: 'amplitude' }} ariaLabel="Amplitude of each frequency bin of the sampled tone">
                <Bars bars={bars} />
              </Plot2D>
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="real">the spectrum is a real FFT of 64 samples of the tone</Provenance>
          <Provenance kind="illustrative">the DFT treats the 64 samples as one period of an endless repeat; that is why a tone that does not fit the window leaks</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
