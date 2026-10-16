import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Provenance, ProvenanceRow, Segmented, SortTh, Stat, Stats, Legend } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { usePlayer } from '../../core/usePlayer';
import { forwardFrames } from './captions';
import { FORWARDING_TABLES, FORWARDING_TOPO, ROUTERS, TEACH_DESTINATIONS, TEACH_ROUTES, lookup, tableRows, walk, type TableRow } from './forwarding';
import { initialForward, type ForwardState } from './init';
import { RouterGraph } from './RouterGraph';
import { FORWARDING_PRESET, linkId } from './topology';

const ROUTER_OPTIONS = ROUTERS.map((r) => ({ value: r, label: r }));
const DESTINATION_OPTIONS = TEACH_DESTINATIONS.map((d) => ({ value: d, label: d }));
const COLUMNS = { dest: (r: TableRow) => r.dest, next: (r: TableRow) => r.next, cost: (r: TableRow) => r.cost };

/** After picking a source that equals the destination, the destination moves to the next router. */
const other = (r: string) => ROUTERS.find((x) => x !== r) ?? r;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the router holding the packet, and the links it has crossed' },
      { color: 'var(--ok)', label: 'the destination' },
      { color: 'var(--info)', label: 'the next hop in the table on screen' },
    ]}
  />
);

export function ForwardScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<ForwardState>(initialForward);
  const frames = useMemo(() => forwardFrames(st.src, st.dst), [st.src, st.dst]);
  const player = usePlayer(frames, { interval: 1200, autoplay: true });
  const w = useMemo(() => walk(FORWARDING_TABLES, FORWARDING_TOPO, st.src, st.dst), [st.src, st.dst]);
  const { at, done } = player.frame;
  const rows = useMemo(() => tableRows(FORWARDING_TABLES, at), [at]);
  const { sorted, headerProps } = useSortedRows(rows, COLUMNS);
  const nextHop = at === st.dst ? null : FORWARDING_TABLES[at][st.dst].next;
  const travelled = w.hops.slice(0, done + 1);
  const crossedLinks = travelled.slice(1).map((h, i) => linkId(travelled[i], h));
  const crossed = new Set(crossedLinks);
  const costSoFar = crossedLinks.reduce((sum, id) => sum + (FORWARDING_TOPO.links.find((l) => l.id === id)?.cost ?? 0), 0);
  const find = lookup(st.destination);

  return (
    <StageFrame
      height={520}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Hops so far" value={done} sub={`of ${w.hops.length - 1} on this path`} />
          <Stat label="Cost so far" value={costSoFar} sub={`of ${w.cost} in all`} />
          <Stat label={`${at}'s table says`} value={nextHop ?? 'here'} color="var(--info)" sub={nextHop ? `next hop for ${st.dst}; nothing about the rest of the path` : 'the packet has arrived'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="From" value={st.src} options={ROUTER_OPTIONS} onChange={(src) => setSt((s) => ({ ...s, src, dst: s.dst === src ? other(src) : s.dst }))} />
          <Segmented label="To" value={st.dst} options={ROUTER_OPTIONS} onChange={(dst) => setSt((s) => ({ ...s, dst, src: s.src === dst ? other(dst) : s.src }))} />
        </>,
        <>
          <Segmented label="Packet for" value={st.destination} options={DESTINATION_OPTIONS} onChange={(destination) => setSt((s) => ({ ...s, destination }))} />
        </>,
      ]}
    >
      <div className="ra-stage stage-pad">
        <div className="ra-pair">
          <Box>
            <SectionTitle hint="the links the packet crossed are lit; click nothing, just watch the hops">Six routers, link costs 1-9</SectionTitle>
            <RouterGraph
              routers={FORWARDING_PRESET.routers}
              positions={FORWARDING_PRESET.positions}
              links={FORWARDING_TOPO.links}
              edgeMark={(l) => (crossed.has(l.id) ? { tone: 'hi' } : nextHop && l.id === linkId(at, nextHop) ? { tone: 'info', dashed: true } : null)}
              nodeMark={(r) => (r === at ? { tone: 'hi', fill: 'solid' } : r === st.dst ? { tone: 'ok', fill: 'tint' } : null)}
              ariaLabel="Six routers and the costs of the links between them"
            />
          </Box>
          <Box>
            <SectionTitle hint={`router ${at}'s own table; the row for ${st.dst} is the one used`}>Routing table of {at}</SectionTitle>
            <table className="data-table ra-table">
              <thead>
                <tr>
                  <SortTh {...headerProps('dest')}>To</SortTh>
                  <SortTh {...headerProps('next')}>Next hop</SortTh>
                  <SortTh {...headerProps('cost')}>Cost</SortTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.dest} className={r.dest === st.dst ? 'ra-row-use' : undefined}>
                    <td>{r.dest}</td>
                    <td>{r.next}</td>
                    <td>{r.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </div>
        <Box>
          <SectionTitle hint="a teaching table for router A, with overlapping prefixes on purpose">Longest-prefix match: which row wins</SectionTitle>
          <table className="data-table ra-table" aria-label="Router A's prefix table for the destination address">
            <thead>
              <tr>
                <th scope="col">Prefix</th>
                <th scope="col">Next hop</th>
                <th scope="col">Match?</th>
              </tr>
            </thead>
            <tbody>
              {TEACH_ROUTES.map((r) => {
                const match = find.matches.includes(r);
                const wins = find.winner === r;
                return (
                  <tr key={r.text} className={wins ? 'ra-row-use' : match ? undefined : 'ra-row-dim'}>
                    <td>{r.text}</td>
                    <td>{r.via}</td>
                    <td>{wins ? 'yes, the longest' : match ? 'yes' : 'no'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="ra-note">
            {st.destination} matches {find.matches.length} {find.matches.length === 1 ? 'row' : 'rows'}
            {find.winner ? `; the longest prefix is ${find.winner.text}, so the packet goes to ${find.winner.via}` : ''}. A default route (0.0.0.0/0) matches everything and loses to any longer match.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">six routers and their costs are made up</Provenance>
          <Provenance kind="simulated">the tables are the ones the distance-vector rounds of the next scene settle on</Provenance>
          <Provenance kind="toy">the prefix table is a teaching table with documentation addresses</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
