import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import type { Tone } from '../../core/tone';
import { ModelNotes, NumaLegend } from './Notes';
import { DEFAULT_SOCKETS, LINK_GBPS, NODE_GBPS, THREAD_GBPS, bandwidth, gbps, initNote, place, type Init, type Policy } from './numa';
import { PlacementControls } from './PlacementControls';

interface Meter { id: string; label: string; load: number; tone: Tone }

/** One bar: the node's own colour while it has room, red past 100%. */
const meter = (id: string, label: string, load: number, tone: Tone): Meter => ({ id, label, load, tone: load > 1 ? 'bad' : tone });

/** Scene 3: four threads stream their own pages; the interconnect and each controller share what is asked of them. */
export function BandwidthScene({ picker }: { picker: ReactNode }) {
  const [policy, setPolicy] = useState<Policy>('first-touch');
  const [init, setInit] = useState<Init>('parallel');
  const machine = useMemo(() => ({ sockets: [...DEFAULT_SOCKETS], homes: place(policy, init, DEFAULT_SOCKETS) }), [policy, init]);
  const bw = useMemo(() => bandwidth(machine), [machine]);
  const meters: Meter[] = [
    meter('n0', 'memory controller, node 0', bw.nodeLoad[0], 'sky'),
    meter('n1', 'memory controller, node 1', bw.nodeLoad[1], 'amber'),
    meter('l0', 'interconnect from node 0 to socket 1', bw.linkLoad[0], 'sky'),
    meter('l1', 'interconnect from node 1 to socket 0', bw.linkLoad[1], 'amber'),
  ];
  const saturated = meters.filter((m) => m.load > 1);

  return (
    <StageFrame
      height={520}
      intro={`Total ${gbps(bw.total)} of the ${gbps(bw.demand)} the four threads ask for.${saturated.length ? ` ${saturated.map((m) => m.label).join(' and ')} ${saturated.length > 1 ? 'are' : 'is'} past capacity.` : ' Nothing is past capacity.'}`}
      introKey={`bw|${policy}|${init}`}
      legend={<NumaLegend />}
      stats={
        <Stats>
          <Stat label="Total bandwidth" value={gbps(bw.total)} color={bw.total < bw.demand ? 'var(--bad)' : 'var(--ok)'} sub={`of ${gbps(bw.demand)} asked for`} />
          {bw.perThread.map((v, t) => <Stat key={t} label={`T${t}`} value={gbps(v)} sub={`asked for ${gbps(THREAD_GBPS)}`} />)}
        </Stats>
      }
      controls={[<>{picker}<PlacementControls policy={policy} init={init} onPolicy={setPolicy} onInit={setInit} /></>]}
    >
      <div className="numa-stage stage-pad">
        <Box>
          <SectionTitle hint="load is what reaches a resource over its capacity; a bar past 100% is saturated">Controllers and links</SectionTitle>
          <div className="numa-bars">
            {meters.map((m) => (
              <Bar key={m.id} value={Math.min(m.load, 1)} tone={m.tone} ariaLabel={`${m.label}: ${pct(m.load)} of capacity`} label={<span className="numa-bar-label">{m.label}: {pct(m.load)} of {m.id.startsWith('n') ? gbps(NODE_GBPS) : gbps(LINK_GBPS)}</span>} />
            ))}
          </div>
          <Hint block tone="faint">{initNote(policy)} The model: each thread asks for {gbps(THREAD_GBPS)} spread over its own pages; demand that crosses the interconnect is scaled by capacity over demand, then each controller serves what reaches it, scaled the same way.</Hint>
        </Box>
        <ModelNotes />
        <ProvenanceRow>
          <Provenance kind="illustrative">named constants, not any machine: controller {gbps(NODE_GBPS)}, link {gbps(LINK_GBPS)} per direction, thread demand {gbps(THREAD_GBPS)}; no real machine was measured</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
