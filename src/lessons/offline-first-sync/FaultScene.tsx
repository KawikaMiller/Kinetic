import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { toSequence } from '../../core/distSim';
import { delivered } from './check';
import { faultCaption, traceCounts } from './captions';
import { initialFaults } from './init';
import type { Msg } from './nodes';
import { FAULTS_UNTIL_MS, FAULT_LIMITS, faultConfig } from './scenarios';
import { ReplicaCard } from './ReplicaCard';
import { runConfig } from './runs';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a counter that is right' },
      { color: 'var(--bad)', label: 'a counter that over-counts, or a rolled-back edit' },
      { color: 'var(--info)', label: 'a message that crossed' },
    ]}
  />
);
const SEQUENCE_CAP = 16;

const labelOf = (m: Msg): string => (m.type === 'push' ? `push ${m.ops.map((o) => o.id).join(' ')}` : m.type === 'ack' ? `ack ${m.ids.join(' ')}` : m.type === 'reject' ? `reject ${m.id}` : m.type);

export function FaultScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialFaults);
  const run = useMemo(() => runConfig(faultConfig(st, st.seed), FAULTS_UNTIL_MS), [st]);
  const counts = traceCounts(run);
  const expected = new Set(run.accepted.filter((o) => o.kind === 'inc').map((o) => o.id)).size;
  const rows = useMemo(() => run.trace.filter((r) => r.payload && ['push', 'ack', 'reject'].includes(r.payload.type)).slice(0, 80), [run]);
  const seq = useMemo(() => toSequence(rows, { label: labelOf }), [rows]);
  const messages = seq.messages.slice(0, SEQUENCE_CAP);
  const patch = (p: Partial<typeof st>) => setSt((s) => ({ ...s, ...p }));
  const wrong = [run.views.phone.counter, run.views.laptop.counter, run.views.server.counter].some((n) => n !== expected);

  return (
    <StageFrame
      height={720}
      legend={LEGEND}
      intro={faultCaption(run, st.dedupe)}
      introKey={`${st.delay}|${st.reorder}|${st.lossPct}|${st.dupPct}|${st.dedupe}|${st.blank}|${st.seed}`}
      stats={
        <Stats>
          <Stat label="Counter should read" value={expected} sub="one per increment pressed" />
          <Stat label="Counter reads" value={`${run.views.phone.counter}, ${run.views.laptop.counter}, ${run.views.server.counter}`} color={wrong ? 'var(--bad)' : 'var(--ok)'} sub="phone, laptop, server" />
          <Stat label="Messages" value={counts.sent} sub={`${counts.lost} lost, ${counts.duplicates} delivered twice`} />
          <Stat label="Everything delivered" value={delivered({ time: run.snap.time, nodes: run.snap.nodes }) ? 'yes' : 'not yet'} color={delivered({ time: run.snap.time, nodes: run.snap.nodes }) ? 'var(--ok)' : 'var(--orange)'} sub={`by ${(FAULTS_UNTIL_MS / 1000).toFixed(0)} s`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Operation ids" value={st.dedupe} off="no deduplication" on="deduplicate by id" onChange={(dedupe) => patch({ dedupe })} />
          <Toggle label="Laptop also sends" value={st.blank} off="nothing more" on="a blank rename" onChange={(blank) => patch({ blank })} />
          <SeedField seed={st.seed} onSeed={(seed) => patch({ seed })} />
        </>,
        <>
          <Slider label="Delay" value={st.delay} min={FAULT_LIMITS.delay.min} max={FAULT_LIMITS.delay.max} step={FAULT_LIMITS.delay.step} format={(n) => `${n} ms`} onChange={(delay) => patch({ delay })} />
          <Slider label="Reordering (extra delay up to)" value={st.reorder} min={FAULT_LIMITS.reorder.min} max={FAULT_LIMITS.reorder.max} step={FAULT_LIMITS.reorder.step} format={(n) => `${n} ms`} onChange={(reorder) => patch({ reorder })} />
          <Slider label="Loss" value={st.lossPct} min={FAULT_LIMITS.lossPct.min} max={FAULT_LIMITS.lossPct.max} step={FAULT_LIMITS.lossPct.step} format={(n) => `${n}%`} onChange={(lossPct) => patch({ lossPct })} />
          <Slider label="Duplication" value={st.dupPct} min={FAULT_LIMITS.dupPct.min} max={FAULT_LIMITS.dupPct.max} step={FAULT_LIMITS.dupPct.step} format={(n) => `${n}%`} onChange={(dupPct) => patch({ dupPct })} />
        </>,
      ]}
    >
      <div className="ofs-stage stage-pad">
        <div className="ofs-devices ofs-three">
          <ReplicaCard name="Phone" view={run.views.phone} rolledBack={run.phone.notices} skipped={run.phone.skipped} />
          <ReplicaCard name="Laptop" view={run.views.laptop} rolledBack={run.laptop.notices} skipped={run.laptop.skipped} />
          <ReplicaCard name="Server" view={run.views.server} />
        </div>
        <Box>
          <SectionTitle hint={`the first ${SEQUENCE_CAP} pushes and replies; the pulls are left out`}>What crossed the network</SectionTitle>
          {messages.length === 0 ? (
            <p className="ofs-note">No push was sent.</p>
          ) : (
            <SequenceDiagram actors={seq.actors} messages={messages} fit="all" ariaLabel="The pushes, acknowledgements and rejections between the devices and the server, lost ones marked" />
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={st.seed}>every message is delayed, lost or duplicated by the simulated network: nothing is sent</Provenance>
          <Provenance kind="toy">a replicated list, not Automerge or Yjs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
