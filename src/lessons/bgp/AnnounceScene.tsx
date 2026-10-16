import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { AsMap } from './AsMap';
import { CandidateTable } from './CandidateTable';
import { GRAPH, ORIGIN, ORIGIN_PREFIX, asName, edgeId } from './asgraph';
import { pathLinks, propagate } from './bgp';
import { announceFrames } from './captions';
import { baseConfig, initialAnnounce } from './init';
import { AS_OPTIONS } from './options';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'the origin AS' },
      { color: 'var(--info)', label: 'an UPDATE sent in this round' },
      { color: 'var(--hi)', label: "the chosen path of the AS whose table is shown" },
      { color: 'var(--dim)', label: 'a path discarded because it already contains the receiver' },
      { color: 'var(--violet)', label: 'solid link: customer to provider (arrow at the provider); dashed link: peers', shape: 'line' },
    ]}
  />
);

export function AnnounceScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialAnnounce);
  const run = useMemo(() => propagate(baseConfig()), []);
  const frames = useMemo(() => announceFrames(run), [run]);
  const player = usePlayer(frames, { interval: 1500, autoplay: true });
  const round = run.rounds[player.frame.round];
  const sending = new Set(round.updates.map((u) => edgeId(u.from, u.to)));
  const mine = new Set(pathLinks(st.selected, round.best[st.selected]).map(([a, b]) => edgeId(a, b)));
  const loops = Object.values(round.candidates).reduce((n, list) => n + list.filter((c) => c.status === 'loop').length, 0);
  const holding = GRAPH.ases.filter((a) => round.best[a]).length;

  return (
    <StageFrame
      height={560}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="ASes holding a route" value={holding} sub={`of ${GRAPH.ases.length}, after round ${player.frame.round}`} />
          <Stat label="UPDATEs this round" value={round.updates.length} color={round.updates.length > 0 ? 'var(--info)' : undefined} sub="sent by ASes whose best route just changed" />
          <Stat label="Discarded as loops" value={loops} sub="paths that already contain the receiver" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Table of AS" value={st.selected} options={AS_OPTIONS} onChange={(selected) => setSt({ selected })} />
        </>,
      ]}
    >
      <div className="bgp-stage stage-pad">
        <Box>
          <SectionTitle hint={`${asName(ORIGIN)} owns ${ORIGIN_PREFIX}; press an AS to see its table`}>Eight autonomous systems</SectionTitle>
          <AsMap
            edgeMark={(e) => {
              const id = edgeId(e.a, e.b);
              if (sending.has(id)) return { tone: 'info', dashed: e.kind === 'p2p', width: 5 };
              if (mine.has(id)) return { tone: 'hi', dashed: e.kind === 'p2p', width: 5 };
              return null;
            }}
            nodeMark={(a) => (a === ORIGIN ? { tone: 'ok', fill: 'solid' } : a === st.selected ? { tone: 'hi', fill: 'tint' } : null)}
            onNodeClick={(selected) => setSt({ selected })}
            ariaLabel="Eight autonomous systems in three tiers with their customer-to-provider and peer links; press one to see the routes it has been sent"
          />
        </Box>
        <Box>
          <SectionTitle hint="one route per neighbour that sent one; Pref is local preference, Len the AS_PATH length">Routes {asName(st.selected)} has been sent</SectionTitle>
          <CandidateTable candidates={round.candidates[st.selected]} caption={`Routes ${asName(st.selected)} has been sent, with the one it chose`} />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">eight made-up ASes; the real internet has many tens of thousands (from memory)</Provenance>
          <Provenance kind="not-run">shown, not run: no BGP session exists here (real ones run over TCP port 179)</Provenance>
          <Provenance kind="toy">this model also sends a route back to the AS it came from, so the loop check has something to catch; many real routers skip that (from memory)</Provenance>
          <Provenance kind="from-memory">AS numbers 64496-64511 are reserved for documentation (RFC 5398: verify)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
