import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Plot2D, Points, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal, pctText } from '../../core/format';
import { Charts } from './Charts';
import { STEP_TICKS, initialLoop, loopCaption, phaseText, sustainText, type LoopState } from './init';
import { CAPACITY, LOAD, RETRIES, RUN_TICKS, SWEEP_SEEDS, TIMEOUT, TRIGGER, collapseShare, crossoverLoad, phaseOf, runMeta, type MetaParams } from './model';

const SWEEP_LOADS: readonly number[] = [10, 15, 20, 22, 24, 26, 28, 30, 40, 60, 80, 95];
const SWEEP_TRIGGER = 30;

const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'goodput: requests served while their client still waits' },
      { color: 'var(--bad)', label: 'wasted work: capacity spent on abandoned requests' },
      { color: 'var(--info)', label: 'new requests' },
      { color: 'var(--orange)', label: 'retries (a labelled category, not an error)' },
      { color: 'var(--hi)', label: 'queue length' },
      { color: 'var(--violet)', label: 'the trigger window' },
    ]}
  />
);

export function LoopScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<LoopState>(initialLoop);
  const { params, shown } = s;
  const patch = (p: Partial<MetaParams>) => setS((x) => ({ ...x, params: { ...x.params, ...p }, shown: 0 }));
  const run = useMemo(() => runMeta(params), [params]);
  const { phase, recoveredAt } = useMemo(() => phaseOf(run), [run]);
  const now = run.stats[Math.min(shown, run.stats.length - 1)];
  const measure = () =>
    setS((x) => ({
      ...x,
      sweep: { retries: x.params.retries, timeout: x.params.timeout, points: SWEEP_LOADS.map((lambda) => ({ lambda, share: collapseShare({ ...x.params, lambda }, SWEEP_TRIGGER, SWEEP_SEEDS) })) },
    }));
  const sweep = s.sweep !== null && s.sweep.retries === params.retries && s.sweep.timeout === params.timeout ? s.sweep.points : null;
  const dots = useMemo(() => (sweep ?? []).map((p) => ({ x: p.lambda, y: p.share, tone: 'info' as const })), [sweep]);
  const done = shown >= RUN_TICKS;

  return (
    <StageFrame
      height={760}
      intro={loopCaption(params, shown, phase, recoveredAt)}
      introKey={`${params.lambda}|${params.timeout}|${params.retries}|${params.trigger}|${params.seed}|${shown}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Phase" value={done ? phaseText(phase, recoveredAt) : shown === 0 ? 'not run' : `tick ${shown} of ${RUN_TICKS}`} color={done && phase === 'collapsed' ? 'var(--bad)' : done && phase === 'recovered' ? 'var(--ok)' : undefined} sub="collapsed = goodput under 10% of the load over the last 100 ticks" />
          <Stat label="Goodput now" value={now.goodput} color="var(--ok)" sub={`load ${params.lambda}, capacity ${now.capacity}`} />
          <Stat label="Wasted work now" value={now.wasted} color={now.wasted > 0 ? 'var(--bad)' : undefined} sub="units spent on abandoned requests" />
          <Stat label="Arrivals now" value={now.newArrivals + now.retryArrivals} sub={`${now.newArrivals} new, ${now.retryArrivals} retries`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Load λ" value={params.lambda} min={LOAD.min} max={LOAD.max} format={(v) => `${v} per tick`} onChange={(lambda) => patch({ lambda })} />
          <Slider label="Timeout Tc" value={params.timeout} min={TIMEOUT.min} max={TIMEOUT.max} format={(v) => `${v} ticks`} onChange={(timeout) => patch({ timeout })} />
        </>,
        <>
          <Slider label="Retries R" value={params.retries} min={RETRIES.min} max={RETRIES.max} onChange={(retries) => patch({ retries })} />
          <Slider label="Trigger length d" value={params.trigger} min={TRIGGER.min} max={TRIGGER.max} format={(v) => (v === 0 ? 'none' : `${v} ticks`)} onChange={(trigger) => patch({ trigger })} />
          <SeedField seed={params.seed} onSeed={(seed) => patch({ seed })} />
        </>,
        <>
          <Button variant="primary" onClick={() => setS((x) => ({ ...x, shown: RUN_TICKS }))} softDisabled={done}>Run {RUN_TICKS} ticks</Button>
          <Button onClick={() => setS((x) => ({ ...x, shown: Math.min(RUN_TICKS, x.shown + STEP_TICKS) }))} softDisabled={done}>Step {STEP_TICKS} ticks</Button>
          <Button onClick={() => setS(initialLoop())}>Reset</Button>
        </>,
      ]}
    >
      <div className="mf-stage stage-pad">
        <Charts run={run} shown={shown} />
        <Box>
          <SectionTitle hint="the test the loop has to pass to keep itself alive">Can the loop sustain itself?</SectionTitle>
          <p className="mf-note">{sustainText(params)}</p>
          <Hint tone="muted" block>An exact test of this model: while everything times out, each request offers 1 + R arrivals. The queueing formula for waiting, 1/(μ − λ), does not apply here because it assumes work nobody abandons and nobody retries.</Hint>
        </Box>
        <Box>
          <SectionTitle hint={`trigger ${SWEEP_TRIGGER} ticks, R = ${params.retries}, Tc = ${params.timeout}; dots sampled over ${SWEEP_SEEDS} seeds, the line is exact`}>Where the loop starts to hold</SectionTitle>
          <Plot2D x={{ domain: [0, LOAD.max], label: 'load λ' }} y={{ domain: [0, 1], label: 'share not recovered' }} ariaLabel="Share of seeds that do not recover against the load, with the closed-form crossover">
            <Points data={dots} />
            <VLine at={crossoverLoad(params.retries)} label={`μ / (1 + R) = ${decimal(crossoverLoad(params.retries), 1)}`} tone="dim" />
          </Plot2D>
          <Button onClick={measure}>Measure {SWEEP_SEEDS} seeds at each load (about 3 s)</Button>
          {sweep !== null && <Hint tone="muted" block>{sweep.map((p) => `λ ${p.lambda}: ${pctText(p.share, 0)}`).join(' · ')}. Near the crossover the share rises over a few units of load rather than at a point: slow drains and Poisson noise blur it.</Hint>}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={params.seed}>one queue on the tick simulator, capacity {CAPACITY} per tick, arrivals Poisson</Provenance>
          <Provenance kind="illustrative">every constant (capacity, load, timeout, retries, the trigger) is made up</Provenance>
          <Provenance kind="toy">a single queue: real systems have many queues, partial failures and load balancers</Provenance>
          <Provenance kind="from-memory">this failure class is studied as "metastable failures" (a HotOS 2021 paper); retry amplification is one sustaining effect named there and in practice; verify before citing</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
