import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { poissonPmf } from '../../core/distributions';
import { dispersionVerdict, poissonCaption } from './frames';
import {
  BURST_MEAN, POISSON_DEFAULT, TIMELINE_WINDOWS, WINDOWS, arrivalSummary, countArrivals, countAxisMax, countShares, type ArrivalEvent,
} from './model';
import { SeedField } from '../../components/SeedField';
import { sig } from '../../core/format';

const HEADROOM = 1.15;
const TIMELINE_W = 360;
const TIMELINE_H = 64;
const TICK_BASE = 52;
const TICK_UNIT = 10;
const RATE = { min: 1, max: 10 } as const;
const WINDOW = { min: 0.5, max: 2, step: 0.5 } as const;

/** The arrivals of the first few windows as ticks on a time axis, taller for a batch. */
function Timeline({ events, windowSec }: { events: readonly ArrivalEvent[]; windowSec: number }) {
  const span = TIMELINE_WINDOWS * windowSec;
  const x = (t: number) => 4 + (t / span) * (TIMELINE_W - 8);
  return (
    <svg className="dist-timeline" viewBox={`0 0 ${TIMELINE_W} ${TIMELINE_H}`} role="img" aria-label={`Arrivals in the first ${TIMELINE_WINDOWS} windows`}>
      {Array.from({ length: TIMELINE_WINDOWS + 1 }, (_, i) => (
        <line key={i} className="dist-window-edge" x1={x(i * windowSec)} x2={x(i * windowSec)} y1={4} y2={TICK_BASE} />
      ))}
      {events.map((e, i) => (
        <line key={i} className="dist-arrival" x1={x(e.t)} x2={x(e.t)} y1={TICK_BASE} y2={TICK_BASE - TICK_UNIT * Math.min(e.size, 5)} />
      ))}
      <text className="dist-timeline-label" x={4} y={TIMELINE_H - 4}>time: windows of {windowSec} s</text>
    </svg>
  );
}

export function PoissonScene({ picker }: { picker: ReactNode }) {
  const [rate, setRate] = useState(POISSON_DEFAULT.rate);
  const [windowSec, setWindowSec] = useState(POISSON_DEFAULT.window);
  const [bursty, setBursty] = useState(POISSON_DEFAULT.bursty);
  const [seed, setSeed] = useState(POISSON_DEFAULT.seed);

  const options = useMemo(() => ({ rate, window: windowSec, windows: WINDOWS, seed, bursty }), [rate, windowSec, seed, bursty]);
  const run = useMemo(() => countArrivals(options), [options]);
  const summary = arrivalSummary(options, run.counts);
  const kMax = countAxisMax(run.counts, summary.lambda);
  const shares = countShares(run.counts, kMax);
  const exact = Array.from({ length: kMax + 1 }, (_, k) => poissonPmf(k, summary.lambda));
  const top = Math.max(...shares, ...exact) * HEADROOM;
  const verdict = dispersionVerdict(summary.dispersion);
  const beyond = run.counts.filter((c) => c > kMax).length;

  useIntroCaption(poissonCaption(summary), [options]);

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label={<><span className="keep-case">λ</span> = rate × window</>} value={sig(summary.lambda)} sub={[`${rate}/s × ${windowSec} s`]} />
          <Stat label="Mean · variance" value={`${sig(summary.mean)} · ${sig(summary.variance)}`} sub={[`${WINDOWS.toLocaleString('en-US')} windows counted`]} />
          <Stat
            label="Dispersion index"
            value={sig(summary.dispersion)}
            color={verdict === 'poisson' ? 'var(--ok)' : undefined}
            sub={['variance ÷ mean; Poisson gives 1']}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'counted share of windows' },
            { color: 'var(--violet)', label: 'exact Poisson(λ)', shape: 'dot' },
            { color: 'var(--muted)', label: 'an arrival', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Arrivals per second" value={rate} {...RATE} onChange={setRate} />
          <Slider label="Window (s)" value={windowSec} {...WINDOW} format={(v) => v.toFixed(1)} onChange={setWindowSec} />
        </>,
        <>
          <Toggle label="Arrivals" value={bursty} onChange={setBursty} off="Independent" on="Bursty (clumps)" />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="stage-pad dist-stage">
        <Box className="dist-timeline-box">
          <SectionTitle hint="gaps between arrival events are exponential; each window counts the arrivals inside it">Arrivals on a clock</SectionTitle>
          <Timeline events={run.events} windowSec={windowSec} />
        </Box>
        <Plot2D
          x={{ domain: [-0.5, kMax + 0.5], label: 'arrivals in one window', ticks: Math.min(kMax + 1, 8) }}
          y={{ domain: [0, top], label: 'share of windows', format: (v) => `${Math.round(v * 100)}%`, ticks: 4 }}
          ariaLabel={`Counts per window against Poisson ${sig(summary.lambda)}; dispersion index ${sig(summary.dispersion)}`}
        >
          <Bars bars={shares.map((y, k) => ({ x0: k - 0.4, x1: k + 0.4, y }))} tone="info" />
          <Points data={exact.map((y, k) => ({ x: k, y, tone: 'violet' as const }))} r={3.5} hollow />
        </Plot2D>
        {beyond > 0 && <Hint className="dist-note">{beyond} windows held more than {kMax} arrivals and sit past the right edge.</Hint>}
        <Hint tone="muted" className="dist-note">
          {bursty
            ? `Bursty: each arrival event brings a batch (mean ${BURST_MEAN}), with the same overall rate. The violet dots are still Poisson(λ) with that mean, for comparison.`
            : 'Poisson has variance equal to its mean: check yours in the dispersion index.'}
        </Hint>
        <div className="dist-chips">
          <Provenance kind="simulated" seed={seed}>{WINDOWS.toLocaleString('en-US')} counted windows from exponential gaps</Provenance>
          <Provenance kind="illustrative">the rates are made up</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
