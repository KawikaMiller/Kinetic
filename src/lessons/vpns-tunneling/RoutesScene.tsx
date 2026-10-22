import { WideRegion } from '../../components/WideRegion';
import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { SortTh } from '../../components/SortTh';
import { useSortedRows } from '../../components/useSortedRows';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { IPV4_MAX_INPUT, ipToString } from '../../core/ipv4';
import { routesIntro } from './captions';
import { initialRoutes, typeDestination } from './init';
import { TIE_OPTIONS } from './options';
import { PRESETS, SAMPLES, lookup, presetRows, split, type RouteRow } from './routing';

/** Narrowest width where this table still reads; below it the table scrolls sideways inside its box. */
const TABLE_MIN_WIDTH = 480;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--violet)', label: 'the tunnel path' },
      { color: 'var(--info)', label: 'the direct path' },
      { color: 'var(--hi)', label: 'the route that carries this destination' },
      { color: 'var(--bad)', label: 'two routes tie for the same block' },
    ]}
  />
);

interface Row extends RouteRow {
  id: number;
  matches: boolean;
  winner: boolean;
  tied: boolean;
}

export function RoutesScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialRoutes);
  const rows = useMemo(() => presetRows(st.preset), [st.preset]);
  const l = useMemo(() => lookup(rows, st.dest, st.policy), [rows, st.dest, st.policy]);
  const counts = useMemo(() => split(rows, st.policy), [rows, st.policy]);
  const table: Row[] = rows.map((r, id) => ({ ...r, id, matches: l.matches.includes(r), winner: l.winner === r, tied: l.conflict && l.ties.includes(r) }));
  const { sorted, headerProps } = useSortedRows<Row, 'prefix' | 'dest' | 'goes'>(
    table,
    { prefix: (r) => r.prefix, dest: (r) => `${ipToString(r.net)}/${r.prefix}`, goes: (r) => r.goes },
  );
  const preset = PRESETS.find((p) => p.id === st.preset);
  const signature = `${st.preset}|${st.policy}|${st.dest}`;

  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={routesIntro(rows, st.dest, l, st.policy)}
      introKey={signature}
      stats={
        <Stats>
          <Stat label="This destination" value={l.winner ? (l.winner.goes === 'tunnel' ? 'tunnel' : 'direct') : 'no route'} color={l.winner?.goes === 'tunnel' ? 'var(--violet)' : 'var(--info)'} sub={ipToString(st.dest)} />
          <Stat label="Sample destinations through the tunnel" value={`${counts.tunnel} of ${SAMPLES.length}`} color="var(--violet)" sub={`${counts.direct} go direct${counts.conflicts ? `, ${counts.conflicts} on a tie` : ''}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Routes" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={st.preset === p.id} onClick={() => setSt((s) => ({ ...s, preset: p.id }))}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Destination" value={st.text} onChange={(t) => setSt((s) => typeDestination(s, t))} width={150} maxLength={IPV4_MAX_INPUT} spellCheck={false} />
          <ControlGroup label="Try" inline>
            {SAMPLES.map((s) => (
              <ChipButton key={s.name} tone="info" on={st.dest === s.addr && st.error === null} onClick={() => setSt((x) => typeDestination(x, ipToString(s.addr)))}>
                {ipToString(s.addr)}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="On a tie, prefer" value={st.policy} options={TIE_OPTIONS} onChange={(policy) => setSt((s) => ({ ...s, policy }))} />
          <Hint tone="muted">
            <span role="status">{st.error ?? 'Type an IPv4 address, or press one of the samples.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="vpn-stage stage-pad">
        <Box>
          <SectionTitle hint={preset?.note}>The route list: WireGuard calls the tunnel's part "allowed IPs"</SectionTitle>
          <WideRegion minWidth={TABLE_MIN_WIDTH} label="The route list: scroll sideways to see all of it" hint="swipe to see the whole table">
            <table className="data-table vpn-table">
              <thead>
                <tr>
                  <SortTh {...headerProps('dest')}>Destination block</SortTh>
                  <SortTh {...headerProps('prefix')}>Prefix length</SortTh>
                  <SortTh {...headerProps('goes')}>Goes</SortTh>
                  <th scope="col">Whose</th>
                  <th scope="col">For this destination</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const tied = r.tied;
                  return (
                    <tr key={r.id} className={`vpn-route is-${r.goes}${r.winner ? ' is-winner' : ''}${tied ? ' is-tie' : ''}`}>
                      <td>{ipToString(r.net)}/{r.prefix}</td>
                      <td>/{r.prefix}</td>
                      <td>{r.goes === 'tunnel' ? 'through the tunnel' : 'directly'}</td>
                      <td>{r.label}</td>
                      <td>{r.winner ? 'carries it' : tied ? 'ties, but is not preferred' : r.matches ? 'matches, shorter prefix' : 'no match'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </WideRegion>
          <p className="vpn-note">Longest prefix wins. Sending only the office ranges through the tunnel (split) and sending everything (full) are both routing choices with trade-offs, not a stronger and a weaker VPN: full sends all your traffic through the far network, split sends only what has to go there.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">allowed IPs work as a route plus an access list (a peer's packets are accepted only from its allowed IPs); IPsec uses routes or traffic selectors: verify against the WireGuard and IPsec documentation</Provenance>
          <Provenance kind="illustrative">the office and home ranges and the sample destinations are made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
