import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import type { NetState } from '../../core/pureProtocol';
import { fifoCaption } from './captions';
import { exhaustiveText, sampledText, truncatedText } from './checkText';
import { DEFAULT_OPTIONS, SEED_RANGE, SEEDS_TOTAL, sweepSeeds } from './sim';
import { SENDS, SMALL, searchSmall, type Proc, type SnapMsg } from './snapshot';

const BOUNDS = (sends: number) => `2 processes, 2 tokens each, up to ${sends} transfer${sends === 1 ? '' : 's'} each, one initiator that may start at any time`;

/** One step of the two-process counterexample: each process's tokens and record, and what is on the wire. */
function traceState(state: NetState<Proc, SnapMsg>): ReactNode {
  return (
    <ul className="ds-trace">
      {state.nodes.map((p) => (
        <li key={p.id}>{p.id}: {p.tokens} held{p.recorded === null ? ', not recorded' : `, recorded ${p.recorded}`}{Object.entries(p.channels).map(([from, c]) => (p.recorded === null ? '' : `, from ${from} ${c.status === 'done' ? `closed with ${c.sum}` : c.status}`)).join('')}</li>
      ))}
      <li>on the wire: {state.net.length === 0 ? 'nothing' : state.net.map((m) => `${m.from} to ${m.to}: ${m.payload.type === 'token' ? `${m.payload.amount} token` : m.payload.type}`).join('; ')}</li>
    </ul>
  );
}

export function FifoScene({ picker }: { picker: ReactNode }) {
  const [sends, setSends] = useState<number>(SENDS.min + 1);
  const fifo = useMemo(() => searchSmall(true, sends), [sends]);
  const loose = useMemo(() => searchSmall(false, sends), [sends]);
  const sampledFifo = useMemo(() => sweepSeeds({ ...DEFAULT_OPTIONS, fifo: true }), []);
  const sampledLoose = useMemo(() => sweepSeeds({ ...DEFAULT_OPTIONS, fifo: false }), []);
  const steps = useMemo(() => (loose.violation?.steps ?? []).map((s) => ({ actor: s.actor, text: s.text, state: s.state })), [loose]);

  return (
    <StageFrame
      height={470}
      intro={fifoCaption({ sends, fifoStates: fifo.states, counterexample: loose.violation?.steps.length ?? null, failing: sampledLoose.failing.length, seeds: SEEDS_TOTAL })}
      introKey={`${sends}`}
      stats={
        <Stats>
          <Stat label="FIFO, exhaustive" value={`${integer(fifo.states)} states`} color={fifo.violation ? 'var(--bad)' : 'var(--ok)'} sub={fifo.violation ? 'violation found' : 'total conserved in all of them'} />
          <Stat label="Non-FIFO, shortest counterexample" value={loose.violation ? `${loose.violation.steps.length} steps` : 'none'} color={loose.violation ? 'var(--bad)' : 'var(--ok)'} sub={`found after ${integer(loose.states)} states`} />
          <Stat label="Non-FIFO, sampled" value={`fails on ${sampledLoose.failing.length} of ${SEEDS_TOTAL}`} color="var(--bad)" sub={`busy transfers, seeds ${SEED_RANGE.from} to ${SEED_RANGE.to - 1}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a total that is conserved' }, { color: 'var(--bad)', label: 'a lost or double-counted amount' }, { color: 'var(--violet)', label: 'a marker' }, { color: 'var(--hi)', label: 'the step of the trace' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Transfers each process may send" value={sends} min={SENDS.min} max={SENDS.max} format={(v) => `${v}`} onChange={setSends} />
        </>,
      ]}
    >
      <div className="ds-stage stage-pad">
        <Box>
          <SectionTitle hint="exhaustive: every schedule, with and without FIFO channels">Why the channels must be FIFO</SectionTitle>
          <div className="ds-line"><b>FIFO:</b> {fifo.violation ? fifo.violation.message : fifo.truncated ? truncatedText(fifo.states) : exhaustiveText(fifo.states, BOUNDS(sends)).replace('holds', 'the total is conserved')}.</div>
          <div className="ds-line"><b>Without FIFO:</b> {loose.violation ? `${loose.violation.message}; the shortest counterexample is ${loose.violation.steps.length} steps (below)` : exhaustiveText(loose.states, BOUNDS(sends))}.</div>
          {loose.violation && (
            <TracePlayer initial={loose.init} steps={steps} label="Steps of the shortest non-FIFO counterexample" renderState={traceState} />
          )}
          <Hint block>The marker overtakes a token sent before it, so the receiver records its state without the token and closes the channel before the token arrives: the token appears in nobody&apos;s record. The algorithm assumes reliable channels, so there is no loss slider.</Hint>
        </Box>
        <Hint block>
          Sampled on three processes: FIFO channels {sampledFifo.failing.length === 0 ? sampledText(SEEDS_TOTAL, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1) : `failed on ${sampledFifo.failing.length} of ${SEEDS_TOTAL} seeds`}; without FIFO {sampledLoose.failing.length} of {SEEDS_TOTAL} fail: {sampledLoose.shortfalls} as a shortfall and {sampledLoose.doubleCounts} as a double count.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={`${SEED_RANGE.from} to ${SEED_RANGE.to - 1}`}>the sampled line runs 200 seeded schedules on distSim</Provenance>
          <Provenance kind="toy">{SMALL.processes.length} processes and {SMALL.total} tokens keep the search finite</Provenance>
          <Provenance kind="from-memory">Lai and Yang is a non-FIFO variant: named only, not built; check before relying on it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
