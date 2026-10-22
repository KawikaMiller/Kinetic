import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Band, Curve, HLine, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { integer, pctText } from '../../core/format';
import { experimentCaption, hypothesisBelowAbort, initialExperiment, noAbortWarning, outcomeText, runnable, successFloor, type ExperimentState } from './init';
import {
  ABORT_SHARE, ABORT_W, ERROR_SHARES, EXPOSURES, FAULT_FROM, FAULT_TO, HYPOTHESIS, INSTANCES, RUN_TICKS, SERVICES, evaluate, successProbability,
  type FaultKind, type Service,
} from './model';

const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s, label: s }));
const KIND_OPTIONS: { value: FaultKind; label: string }[] = [
  { value: 'kill', label: 'kill instances' },
  { value: 'errors', label: 'inject errors' },
];
const EXPOSURE_OPTIONS = EXPOSURES.map((e) => ({ value: e, label: pctText(e, 0) }));
const ERROR_OPTIONS = ERROR_SHARES.map((p) => ({ value: p, label: pctText(p, 0) }));

const legend = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'observed checkout success', shape: 'line' },
      { color: 'var(--ok)', label: 'the hypothesis', shape: 'line' },
      { color: 'var(--bad)', label: 'the abort threshold', shape: 'line' },
      { color: 'var(--violet)', label: 'the fault window' },
    ]}
  />
);

export function ExperimentScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ExperimentState>(initialExperiment);
  const card = s.card;
  const setCard = (p: Partial<typeof card>) => setS((x) => ({ ...x, card: { ...x.card, ...p } }));
  const setFault = (p: Partial<typeof card.fault>) => setS((x) => ({ ...x, card: { ...x.card, fault: { ...x.card.fault, ...p } } }));
  const run = useMemo(() => runnable(s), [s]);
  const e = useMemo(() => evaluate(run), [run]);
  const floor = successFloor(e, card.hypothesis, card.abort.belowShare);
  const points = useMemo(() => e.ticks.map((t, i) => [i + 1, t.success] as [number, number]), [e]);
  const warning = s.abortOn ? null : noAbortWarning(e, card.abort);
  const expected = successProbability(card);
  const aborted = e.outcome.kind === 'aborted';

  return (
    <StageFrame
      height={420}
      intro={experimentCaption(s, e)}
      introKey={JSON.stringify(s)}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Outcome" value={aborted ? `aborted at tick ${e.outcome.kind === 'aborted' ? e.outcome.tick : ''}` : e.outcome.kind === 'held' ? 'hypothesis held' : 'hypothesis refuted'} color={e.outcome.kind === 'held' ? 'var(--ok)' : 'var(--bad)'} sub={outcomeText(e, card)} />
          <Stat label="Cost" value={integer(e.failedTotal)} color={e.failedTotal > 0 ? 'var(--bad)' : undefined} sub={`failed requests over ${RUN_TICKS} ticks of ${integer(200)} requests`} />
          <Stat label="Expected success under the fault" value={pctText(expected, 2)} sub="1 - exposure x share of the target removed, when the target is on the journey" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Target" value={card.fault.target} onChange={(target: Service) => setFault({ target })} options={SERVICE_OPTIONS} />
        </>,
        <>
          <Segmented label="Fault" value={card.fault.kind} onChange={(kind: FaultKind) => setFault({ kind })} options={KIND_OPTIONS} />
          {card.fault.kind === 'kill' ? (
            <Slider label="Instances killed" value={card.fault.k} min={1} max={INSTANCES} format={(v) => `${v} of ${INSTANCES}`} onChange={(k) => setFault({ k })} />
          ) : (
            <Segmented label="Error share" value={card.fault.p} onChange={(p) => setFault({ p })} options={ERROR_OPTIONS} />
          )}
          <Segmented label="Blast radius (traffic exposed)" value={card.exposure} onChange={(exposure) => setCard({ exposure })} options={EXPOSURE_OPTIONS} />
        </>,
        <>
          <Slider label="Hypothesis: success stays at or above" value={Math.round(card.hypothesis * 1000)} min={HYPOTHESIS.min} max={HYPOTHESIS.max} format={(v) => `${(v / 10).toFixed(1)}%`} onChange={(v) => setCard({ hypothesis: v / 1000 })} />
          <Toggle label="Abort condition" value={s.abortOn} onChange={(abortOn) => setS((x) => ({ ...x, abortOn }))} off="None" on="Abort" />
          <Slider label="Abort when below" value={Math.round(card.abort.belowShare * 100)} min={ABORT_SHARE.min} max={ABORT_SHARE.max} format={(v) => `${v}%`} onChange={(v) => setCard({ abort: { ...card.abort, belowShare: v / 100 } })} />
          <Slider label="for this many ticks" value={card.abort.w} min={ABORT_W.min} max={ABORT_W.max} onChange={(w) => setCard({ abort: { ...card.abort, w } })} />
        </>,
        <>
          <SeedField seed={card.seed} onSeed={(seed) => setCard({ seed })} />
          <Button onClick={() => setS(initialExperiment())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ce-stage stage-pad">
        <Box>
          <SectionTitle hint={`${RUN_TICKS} ticks, the fault on from tick ${FAULT_FROM} to ${FAULT_TO}; 200 seeded requests a tick`}>The experiment</SectionTitle>
          <Plot2D x={{ domain: [1, RUN_TICKS], label: 'tick' }} y={{ domain: [floor, 1], label: 'checkout success' }} ariaLabel="Observed checkout success per tick, with the hypothesis and the abort threshold">
            <Band lo={floor} hi={1} from={FAULT_FROM} to={FAULT_TO} tone="violet" />
            <HLine at={card.hypothesis} tone="ok" dashed={false} />
            <HLine at={card.abort.belowShare} tone="bad" />
            <Curve points={points} tone="info" />
          </Plot2D>
        </Box>
        {warning !== null && <Hint tone="bad" block>{warning}</Hint>}
        {hypothesisBelowAbort(run) && <Hint tone="muted" block>This experiment will abort before it can refute the hypothesis: the abort threshold sits above it.</Hint>}
        <Hint tone="muted" block>A held hypothesis says only that: held for this fault, this exposure and these 100 ticks. It does not say the system is resilient. An error budget would set the abort number in practice; here it is a slider.</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={card.seed}>200 requests a tick, each a seeded draw; the fault changes the chance a request on the journey fails</Provenance>
          <Provenance kind="illustrative">four instances, 200 requests a tick and every threshold are made up</Provenance>
          <Provenance kind="toy">no retries, no health-check ejection, no queueing</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
