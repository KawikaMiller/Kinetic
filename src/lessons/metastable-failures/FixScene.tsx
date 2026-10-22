import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { pctText } from '../../core/format';
import { Charts } from './Charts';
import { anyMitigation, backlogAtTriggerEnd, effectiveFor, fixCaption, fixParams, initialFix, noMitigation, phaseText, shedText, tippingText, type FixState } from './init';
import { FIX_RUN_TICKS, JITTER, QMAX, RATIO, SWEEP_SEEDS, TOKEN_CAP, collapseShare, defaultParams, firstOrderTipping, phaseOf, runMeta } from './model';

const SWEEP_TRIGGERS: readonly number[] = [0, 2, 4, 5, 6, 7, 8, 10, 12, 14];
const SWEEP_TOP = 14;

const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'goodput' },
      { color: 'var(--bad)', label: 'wasted work' },
      { color: 'var(--info)', label: 'new requests' },
      { color: 'var(--orange)', label: 'retries' },
      { color: 'var(--hi)', label: 'queue length' },
      { color: 'var(--dim)', label: 'no mitigation (the sweep)', shape: 'line' },
    ]}
  />
);

const sweepKey = (f: FixState): string => JSON.stringify(fixParams({ ...f, seed: 0, long: false }));

export function FixScene({ picker }: { picker: ReactNode }) {
  const [f, setF] = useState<FixState>(initialFix);
  const set = (p: Partial<FixState>) => setF((x) => ({ ...x, ...p }));
  const params = useMemo(() => fixParams(f), [f]);
  const run = useMemo(() => runMeta(params, FIX_RUN_TICKS), [params]);
  const { phase, recoveredAt } = useMemo(() => phaseOf(run), [run]);
  const caption = fixCaption(params, run, phase, recoveredAt);
  const eff = effectiveFor(params);
  const measure = () =>
    setF((x) => ({
      ...x,
      sweep: {
        key: sweepKey(x),
        points: SWEEP_TRIGGERS.map((trigger) => ({
          trigger,
          none: collapseShare(noMitigation(x), trigger, SWEEP_SEEDS),
          chosen: collapseShare(fixParams(x), trigger, SWEEP_SEEDS),
        })),
      },
    }));
  const sweep = f.sweep !== null && f.sweep.key === sweepKey(f) ? f.sweep.points : null;
  const none = useMemo(() => (sweep ?? []).map((p) => [p.trigger, p.none] as [number, number]), [sweep]);
  const chosen = useMemo(() => (sweep ?? []).map((p) => [p.trigger, p.chosen] as [number, number]), [sweep]);
  const dots = useMemo(() => (sweep ?? []).map((p) => ({ x: p.trigger, y: p.chosen, tone: 'info' as const })), [sweep]);

  return (
    <StageFrame
      height={760}
      intro={caption}
      introKey={`${JSON.stringify(params)}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Phase" value={phaseText(phase, recoveredAt, FIX_RUN_TICKS)} color={phase === 'collapsed' ? 'var(--bad)' : phase === 'recovered' ? 'var(--ok)' : undefined} sub={`this seed, ${FIX_RUN_TICKS} ticks`} />
          <Stat label="Backlog at the end of the trigger" value={backlogAtTriggerEnd(run)} sub="items queued, abandoned or live" />
          <Stat label="Effective load if everything times out" value={eff === null ? 'bounded by shedding' : `${Math.round(eff)} per tick`} color={eff !== null && eff >= 100 ? 'var(--bad)' : undefined} sub="against a capacity of 100" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Abandoned work" value={f.cancel} onChange={(cancel) => set({ cancel })} off="Served anyway" on="Skipped for free" />
          <Toggle label="Long outage" value={f.long} onChange={(long) => set({ long })} off="d = 10" on="d = 60" />
        </>,
        <>
          <Toggle label="Retry budget" value={f.budgetOn} onChange={(budgetOn) => set({ budgetOn })} off="Off" on="On" />
          {f.budgetOn && <Slider label="Refill ratio" value={f.ratio} min={RATIO.min} max={RATIO.max} step={RATIO.step} onChange={(ratio) => set({ ratio })} />}
          <Toggle label="Backoff and jitter" value={f.jitterOn} onChange={(jitterOn) => set({ jitterOn })} off="Off" on="On" />
          {f.jitterOn && <Slider label="Jitter J" value={f.jitter} min={JITTER.min} max={JITTER.max} format={(v) => `0 to ${v} ticks`} onChange={(jitter) => set({ jitter })} />}
        </>,
        <>
          <Toggle label="Shed load" value={f.shedOn} onChange={(shedOn) => set({ shedOn })} off="Off" on="On" />
          {f.shedOn && <Slider label="Reject above Qmax" value={f.qmax} min={QMAX.min} max={QMAX.max} step={QMAX.step} onChange={(qmax) => set({ qmax })} />}
          <SeedField seed={f.seed} onSeed={(seed) => set({ seed })} />
          <Button onClick={() => setF(initialFix())}>Reset</Button>
        </>,
      ]}
    >
      <div className="mf-stage stage-pad">
        <Charts run={run} shown={FIX_RUN_TICKS} />
        <Box>
          <SectionTitle hint={`share of ${SWEEP_SEEDS} seeds not recovered within 60 ticks, by trigger length; dots sampled`}>Moves the tipping point, or removes the loop?</SectionTitle>
          <Plot2D x={{ domain: [0, SWEEP_TOP], label: 'trigger length d (ticks)' }} y={{ domain: [0, 1], label: 'share not recovered' }} ariaLabel="Share of seeds not recovered against the trigger length, with and without the chosen mitigations">
            <Curve points={none} tone="dim" dashed />
            <Curve points={chosen} tone="info" />
            <Points data={dots} />
            <VLine at={firstOrderTipping(defaultParams().lambda, defaultParams().timeout)} label="estimate" tone="dim" />
          </Plot2D>
          <Button onClick={measure}>Measure {SWEEP_SEEDS} seeds per trigger length (about 4 s)</Button>
          {!anyMitigation(f) && <Hint tone="muted" block>No mitigation is on, so the two curves are the same. Switch one on and measure.</Hint>}
          {sweep !== null && <Hint tone="muted" block>{f.sweep?.points.map((p) => `d ${p.trigger}: ${pctText(p.none, 0)} to ${pctText(p.chosen, 0)}`).join(' · ')}. A curve that shifts right moved the tipping point; one that stays at zero removed the loop.</Hint>}
          <Hint tone="muted" block>{tippingText(sweep === null ? null : sweep)}</Hint>
          <Hint tone="muted" block>{shedText()}</Hint>
          <Hint tone="muted" block>The retry budget's bucket holds {TOKEN_CAP} tokens, so at most {TOKEN_CAP} retries leave a tick whatever the ratio: here the cap, not the ratio, bounds the amplification. Shedding rejects the arrival and does not retry it.</Hint>
        </Box>
        <p className="mf-note">
          Related lessons: <Link to="/lesson/backpressure">backpressure</Link>, <Link to="/lesson/circuit-breakers">circuit breakers</Link>, <Link to="/lesson/cache-stampede">cache stampedes</Link>, <Link to="/lesson/queueing-theory">queueing theory</Link> and <Link to="/lesson/timeouts-deadlines">timeouts and deadlines</Link>.
        </p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={f.seed}>the same queue as the first scene, load 70, timeout 4, three retries, with the chosen mitigations</Provenance>
          <Provenance kind="illustrative">every constant is made up</Provenance>
          <Provenance kind="toy">one queue; a real fix is chosen with the real system's failure modes in view</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
