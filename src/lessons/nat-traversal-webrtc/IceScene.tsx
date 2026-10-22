import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { SortTh } from '../../components/SortTh';
import { useSortedRows } from '../../components/useSortedRows';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { power } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { iceFrames } from './captions';
import {
  COMPONENT_ID, KIND_NAME, LOCAL_PREFERENCE, TYPE_PREFERENCE, candidatesOf, checksMade, nominatedOf, pairsOf, type Pair, type Scenario,
} from './ice';
import { initialIce } from './init';
import { NatPair } from './NatPair';
import { epText } from './nat';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the pair being checked now' },
      { color: 'var(--ok)', label: 'the nominated pair (ringed), or a check that answered' },
      { color: 'var(--bad)', label: 'a check with no answer' },
      { color: 'var(--dim)', label: 'a pair not tried' },
    ]}
  />
);

interface Row {
  rank: number;
  pair: Pair;
  state: 'untried' | 'failed' | 'answered' | 'nominated';
  now: boolean;
}

export function IceScene({ picker }: { picker: ReactNode }) {
  const [sc, setSc] = useState<Scenario>(initialIce);
  const pairs = useMemo(() => pairsOf(sc), [sc]);
  const made = useMemo(() => checksMade(pairs), [pairs]);
  const frames = useMemo(() => iceFrames(pairs, made, sc), [pairs, made, sc]);
  const player = usePlayer(frames, { interval: 1700, autoplay: true });
  const checked = player.frame.checked;
  const nominated = nominatedOf(pairs);
  const finished = player.index === frames.length - 1;
  const rows: Row[] = pairs.map((pair, i) => {
    const done = i < checked;
    const win = nominated !== null && pair.id === nominated.id;
    return {
      rank: i + 1,
      pair,
      now: done && i === checked - 1 && !finished,
      state: !done ? 'untried' : win && finished ? 'nominated' : pair.works ? 'answered' : 'failed',
    };
  });
  const { sorted, headerProps } = useSortedRows<Row, 'rank' | 'local' | 'remote' | 'works'>(
    rows,
    { rank: (r) => r.rank, local: (r) => r.pair.local.kind, remote: (r) => r.pair.remote.kind, works: (r) => (r.state === 'untried' ? 2 : r.pair.works ? 0 : 1) },
    { key: 'rank' },
  );
  const mine = candidatesOf('A', sc);

  return (
    <StageFrame
      height={780}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat
            label="Nominated pair"
            value={!finished ? 'checking' : nominated ? `${KIND_NAME[nominated.local.kind]} to ${KIND_NAME[nominated.remote.kind]}` : 'none'}
            color={finished ? (nominated ? 'var(--ok)' : 'var(--bad)') : undefined}
            sub={!finished ? 'the first pair that answers wins' : nominated?.local.kind === 'relay' || nominated?.remote.kind === 'relay' ? 'goes through the relay' : 'the media goes directly'}
          />
          <Stat label="Checks made" value={`${checked} of ${pairs.length}`} sub="the pairs below the winner stay untried" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <NatPair value={sc} onChange={setSc} lan />
        </>,
      ]}
    >
      <div className="nat-stage stage-pad">
        <Box>
          <SectionTitle hint="peer A's candidates, from the formula in the next column">Gathering candidates</SectionTitle>
          <div className="nat-table-wrap" role="region" aria-label="Peer A's candidates and their priorities" tabIndex={0}>
            <table className="data-table nat-table">
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Address</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Worked out</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((c) => (
                  <tr key={c.kind}>
                    <td>{KIND_NAME[c.kind]}</td>
                    <td>{epText(c.addr)}</td>
                    <td>{c.priority}</td>
                    <td>
                      {power(24)} x {TYPE_PREFERENCE[c.kind]} + {power(8)} x {LOCAL_PREFERENCE} + (256 - {COMPONENT_ID})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`pair priority = ${power(32)} x min(G, D) + 2 x max(G, D) + (1 if G > D); A is the controlling agent`}>Candidate pairs, checked from the top</SectionTitle>
          <div className="nat-table-wrap" role="region" aria-label="Candidate pairs in priority order" tabIndex={0}>
            <table className="data-table nat-table">
              <thead>
                <tr>
                  <SortTh {...headerProps('rank')}>Rank</SortTh>
                  <SortTh {...headerProps('local')}>A's candidate</SortTh>
                  <SortTh {...headerProps('remote')}>B's candidate</SortTh>
                  <th scope="col">Pair priority</th>
                  <SortTh {...headerProps('works')}>Check</SortTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.pair.id} className={`nat-pair is-${r.state}${r.now ? ' is-now' : ''}`}>
                    <td>{r.rank}</td>
                    <td>{KIND_NAME[r.pair.local.kind]} {epText(r.pair.local.addr)}</td>
                    <td>{KIND_NAME[r.pair.remote.kind]} {epText(r.pair.remote.addr)}</td>
                    <td>{r.pair.priority.toString()}</td>
                    <td>{{ untried: 'not tried', failed: 'no answer', answered: 'answers', nominated: 'nominated' }[r.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">the priority formulas and the recommended type preferences (host 126, server-reflexive 100, relayed 0) are recalled from RFC 8445: verify against its sections on candidate and pair priority</Provenance>
          <Provenance kind="simulated">which checks answer comes from the NAT simulation; no connection is opened</Provenance>
          <Provenance kind="not-run">names only, not run: the offer and answer (SDP) carry the candidates, media is encrypted with DTLS-SRTP, and data channels run over SCTP over DTLS</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
