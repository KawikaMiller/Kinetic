import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { decimal, pct } from '../../core/format';
import { TwoSockets } from './Machine';
import { ModelNotes, NumaLegend } from './Notes';
import { LOCAL_NS, DEFAULT_SOCKETS, PATTERN_LABEL, PATTERN_OPTIONS, initNote, latency, latencyFormula, nsText, place, type Init, type Pattern, type Policy } from './numa';
import { PlacementControls } from './PlacementControls';

const MACHINE_SOCKETS = DEFAULT_SOCKETS;

/** Scene 2: first touch. Where a page lands depends on a placement policy and on who initialises the array. */
export function TouchScene({ picker }: { picker: ReactNode }) {
  const [policy, setPolicy] = useState<Policy>('first-touch');
  const [init, setInit] = useState<Init>('serial');
  const [pattern, setPattern] = useState<Pattern>('own');
  const machine = useMemo(() => ({ sockets: [...MACHINE_SOCKETS], homes: place(policy, init, MACHINE_SOCKETS) }), [policy, init]);
  const lat = useMemo(() => latency(machine, pattern), [machine, pattern]);

  return (
    <StageFrame
      height={520}
      intro={`${policy === 'first-touch' ? 'First touch' : policy === 'interleave' ? 'Interleaved' : 'Bound to node 0'}${policy === 'first-touch' ? `, ${init === 'serial' ? 'the main thread on socket 0 fills the array' : 'each worker fills its own chunk'}` : ''}; reads: ${PATTERN_LABEL[pattern]}: mean latency ${nsText(lat.mean)}, ${pct(lat.remoteShare)} remote, ${decimal(lat.slowdown, 3)}x the all-local ${nsText(LOCAL_NS)}.`}
      introKey={`touch|${policy}|${init}|${pattern}`}
      legend={<NumaLegend />}
      stats={
        <Stats>
          <Stat label="Mean latency" value={nsText(lat.mean)} color={lat.remoteShare === 0 ? 'var(--ok)' : 'var(--bad)'} sub={`reads: ${PATTERN_LABEL[pattern]}`} />
          <Stat label="Remote share" value={pct(lat.remoteShare)} color={lat.remoteShare === 0 ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Slowdown" value={`${decimal(lat.slowdown, 3)}x`} sub="against all-local" />
        </Stats>
      }
      controls={[<>{picker}<PlacementControls policy={policy} init={init} onPolicy={setPolicy} onInit={setInit} /><Segmented label="Access pattern" value={pattern} onChange={setPattern} options={PATTERN_OPTIONS} /></>]}
    >
      <div className="numa-stage stage-pad">
        <Box>
          <SectionTitle hint="T0 and T1 run on socket 0, T2 and T3 on socket 1">Where the pages landed</SectionTitle>
          <TwoSockets machine={machine} latency={lat} />
          <Hint block tone="faint">{initNote(policy)} {latencyFormula()}</Hint>
        </Box>
        <ModelNotes />
        <ProvenanceRow>
          <Provenance kind="illustrative">named constants, not any machine; no real machine was measured</Provenance>
          <Provenance kind="from-memory">Linux&apos;s default policy places a page on the node of the CPU that first touches it, and numactl and mbind change that; verify against man numa(7)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
