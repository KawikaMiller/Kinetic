import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { sig } from '../../core/format';
import { brownoutCaption, msText } from './captions';
import { initialBrownout, type BrownoutState } from './init';
import {
  FULL_RATE, LOAD_RANGE, QUEUE_BOUND, SIM_SECONDS, THRESHOLD_RANGE, TIERS, brownoutPoint, runQueue,
} from './model';

/** The plot's top: a response time at or above it (or an unbounded one) is drawn at the ceiling. */
const RESPONSE_CAP_MS = 400;
const TOO_HIGH_THRESHOLD = 1.4;
const SPIKE_LOAD = 150;

const responseMs = (lambda: number, threshold: number, degrade: boolean) => Math.min(RESPONSE_CAP_MS, brownoutPoint(lambda, threshold, degrade).responseS * 1000);

export function BrownoutScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<BrownoutState>(initialBrownout);
  const point = useMemo(() => brownoutPoint(s.lambda, s.threshold, s.degrade), [s.lambda, s.threshold, s.degrade]);
  const run = useMemo(() => runQueue(s.seed, s.lambda, point.mu), [s.seed, s.lambda, point.mu]);
  const set = (patch: Partial<BrownoutState>) => setS((x) => ({ ...x, ...patch }));
  const brownoutLoad = s.threshold * FULL_RATE;
  const saturated = point.rho >= 1;

  useIntroCaption(brownoutCaption(s.lambda, s.threshold, s.degrade, point, run, s.seed), [s.lambda, s.threshold, s.degrade, s.seed]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Full page at this load" value={`${sig((s.lambda / FULL_RATE) * 100)}%`} color={s.lambda / FULL_RATE >= s.threshold ? 'var(--hi)' : undefined} sub={['the brownout line is on this scale']} />
          <Stat label="Tiers on" value={`${point.on.filter(Boolean).length} of ${TIERS.length}`} sub={[`${sig(TIERS.reduce((a, t, i) => a + (point.on[i] ? t.costMs : 0), 0))} ms of work per request`]} />
          <Stat label="Capacity" value={`${sig(point.mu)}/s`} sub={[`against ${s.lambda}/s arriving`]} />
          <Stat label="Mean time in system" value={saturated ? 'grows without bound' : msText(point.responseS * 1000)} color={saturated ? 'var(--bad)' : 'var(--ok)'} sub={['from 1 / (capacity − load)']} />
          <Stat label="Longest queue" value={run.maxQueued} color={run.brokeAtS !== null ? 'var(--bad)' : undefined} sub={[`over ${SIM_SECONDS} s on seed ${s.seed}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'no degradation', shape: 'line' },
            { color: 'var(--ok)', label: 'with brownout', shape: 'line' },
            { color: 'var(--hi)', label: 'the load, and the brownout line', shape: 'line' },
            { color: 'var(--bad)', label: 'queue past the bound' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" onClick={() => set({ threshold: TOO_HIGH_THRESHOLD })}>threshold too high</ChipButton>
          <ChipButton tone="info" onClick={() => set({ lambda: SPIKE_LOAD })}>traffic spike</ChipButton>
          <Button onClick={() => setS(initialBrownout())}>Reset</Button>
        </>,
        <>
          <Slider label="Load" value={s.lambda} {...LOAD_RANGE} format={(v) => `${v}/s`} onChange={(lambda) => set({ lambda })} />
          <Slider label="Brownout starts at" value={s.threshold} {...THRESHOLD_RANGE} format={(v) => `${sig(v * 100)}% of the full page`} onChange={(threshold) => set({ threshold })} />
          <Toggle label="Brownout" value={s.degrade} onChange={(degrade) => set({ degrade })} off="off" on="on" />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="gd-stage stage-pad">
        <div className="gd-tiers" aria-label="Feature tiers">
          {TIERS.map((t, i) => (
            <span key={t.id} className={`chip gd-tier tone-${point.on[i] ? 'ok' : 'dim'}`}>
              {t.id} {t.name}: {point.on[i] ? 'on' : 'off'} ({t.costMs} ms)
            </span>
          ))}
        </div>
        <div className="gd-plots">
          <Box>
            <SectionTitle hint="a single queue, 1 / (capacity − load)">Response time against load</SectionTitle>
            <Plot2D
              x={{ domain: [LOAD_RANGE.min, LOAD_RANGE.max], label: 'requests per second' }}
              y={{ domain: [0, RESPONSE_CAP_MS], label: 'mean time (ms)' }}
              ariaLabel="Mean time in the system against load, with and without the brownout"
            >
              <Curve fn={(l) => responseMs(l, s.threshold, false)} tone="info" />
              <Curve fn={(l) => responseMs(l, s.threshold, true)} tone="ok" />
              <VLine at={brownoutLoad} label="brownout line" tone="hi" dashed />
              <VLine at={s.lambda} label="load" tone="hi" />
            </Plot2D>
          </Box>
          <Box>
            <SectionTitle hint={`seed ${s.seed}, ${SIM_SECONDS} s`}>The queue over time</SectionTitle>
            <Plot2D
              x={{ domain: [0, SIM_SECONDS], label: 'seconds' }}
              y={{ domain: [0, QUEUE_BOUND * 1.2], label: 'requests waiting' }}
              ariaLabel="Queue length over time in the simulation, with the bound"
            >
              <HLine at={QUEUE_BOUND} label="bound" tone="dim" />
              <Curve points={run.series} tone={run.brokeAtS === null ? 'ok' : 'bad'} />
            </Plot2D>
          </Box>
        </div>
        <Hint tone="muted" block>
          A brownout lowers the work per request, so the same requests all get served. Any response above the top of the plot is drawn at the top. The brownout threshold has no effect while the brownout is off.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>a seeded queue ticking every 0.2 ms; the same seed replays the same run</Provenance>
          <Provenance kind="illustrative">one worker, the work per tier and the load range are made up; real fleets are many workers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
