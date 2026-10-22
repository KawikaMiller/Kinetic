import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { punchFrames, punchMessages } from './captions';
import { initialPunch } from './init';
import { NatPair } from './NatPair';
import { NAT_NAME, NAT_TYPES, OFFSET_MAX, matrix, punch } from './nat';

const ACTORS = [
  { id: 'a', label: 'peer A' },
  { id: 'na', label: 'NAT A' },
  { id: 'sig', label: 'signalling', tone: 'violet' as const },
  { id: 'nb', label: 'NAT B' },
  { id: 'b', label: 'peer B' },
];
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a probe that crossed, or a pair that punches' },
      { color: 'var(--bad)', label: 'a probe dropped by a NAT' },
      { color: 'var(--violet)', label: 'the signalling path' },
      { color: 'var(--orange)', label: 'a pair that needs the relay (a labelled fallback, not a failure)' },
    ]}
  />
);
const CELL = { cell: 66, font: 11 } as const;
const SHORT_NAME = ['full', 'restricted', 'port-restr.', 'symmetric'];

export function PunchScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialPunch);
  const p = useMemo(() => punch(st.a, st.b, st.offset), [st.a, st.b, st.offset]);
  const m = useMemo(() => matrix(st.offset), [st.offset]);
  const messages = useMemo(() => punchMessages(p), [p]);
  const frames = useMemo(() => punchFrames(p, st.a, st.b, st.offset), [p, st.a, st.b, st.offset]);
  const player = usePlayer(frames, { interval: 1500, autoplay: true });
  const ai = NAT_TYPES.indexOf(st.a);
  const bi = NAT_TYPES.indexOf(st.b);
  const punching = m.flat().filter(Boolean).length;

  return (
    <StageFrame
      height={560}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="This pair" value={p.connected ? 'connected' : 'needs a relay'} color={p.connected ? 'var(--ok)' : 'var(--orange)'} sub={`${NAT_NAME[st.a]} against ${NAT_NAME[st.b]}`} />
          <Stat label="First through" value={p.connected ? `A at ${p.firstDelivered.A}, B at ${p.firstDelivered.B}` : 'nothing'} sub="tick of the first delivered probe" />
          <Stat label="Dropped by NATs" value={p.dropped} color={p.dropped > 0 ? 'var(--bad)' : undefined} sub={`of ${p.probes.length} probes`} />
          <Stat label="Pairs that punch" value={`${punching} of ${NAT_TYPES.length * NAT_TYPES.length}`} sub="in the matrix below" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <NatPair value={{ a: st.a, b: st.b, sameLan: false }} onChange={(s) => setSt((x) => ({ ...x, a: s.a, b: s.b }))} />
        </>,
        <>
          <Slider label="Peer B starts" value={st.offset} min={0} max={OFFSET_MAX} format={(n) => (n === 0 ? 'with A' : `${n} tick${n === 1 ? '' : 's'} late`)} onChange={(offset) => setSt((x) => ({ ...x, offset }))} />
        </>,
      ]}
    >
      <div className="nat-stage stage-pad">
        <Box>
          <SectionTitle hint="A probes first in every tick; each side probes for six ticks, aiming at what it learned">Swap addresses, then punch</SectionTitle>
          <SequenceDiagram actors={ACTORS} messages={messages} step={Math.min(player.frame.index, messages.length - 1)} fit="shown" ariaLabel="The signalling exchange and the probes between the two NATs, with dropped probes marked" />
        </Box>
        <Box>
          <SectionTitle hint="rows: peer A's NAT, columns: peer B's NAT. Press a cell to try that pair">Which pairs punch</SectionTitle>
          <div className="nat-matrix">
            <CellGrid
              rows={NAT_TYPES.length}
              cols={NAT_TYPES.length}
              size={CELL}
              rowLabels={SHORT_NAME}
              colLabels={SHORT_NAME}
              cell={(r, c) => (m[r][c] ? { text: 'direct', tone: 'ok', fill: 'tint', intensity: 0.28 } : { text: 'relay', tone: 'orange', fill: 'tint', intensity: 0.28 })}
              highlight={[{ r: ai, c: bi, tone: 'hi' }]}
              onCellClick={(r, c) => setSt((x) => ({ ...x, a: NAT_TYPES[r], b: NAT_TYPES[c] }))}
              cellAriaLabel={(r, c) => `A ${NAT_NAME[NAT_TYPES[r]]}, B ${NAT_NAME[NAT_TYPES[c]]}: ${m[r][c] ? 'punches a hole' : 'needs the relay'}`}
              ariaLabel="Outcome of hole punching for every pair of NAT types"
            />
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">computed packet by packet from the NAT model: a probe is dropped or forwarded by each NAT's own table; no connection is opened by this page</Provenance>
          <Provenance kind="from-memory">NAT behaviour varies by device; carrier-grade NAT is often more restrictive; verify against RFC 4787 and the peer-to-peer NAT traversal paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
