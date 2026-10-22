import { WideRegion } from '../../components/WideRegion';
import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { natLine, stunFrames, tableText } from './captions';
import { initialStun } from './init';
import { NAT_NAME, NAT_TYPES, epText, stunTable, type NatType, type Peer } from './nat';
import { Topology } from './Topology';

/** Narrowest width where this table still reads; below it the table scrolls sideways inside its box. */
const TABLE_MIN_WIDTH = 480;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'the STUN reply: the address the server saw' },
      { color: 'var(--hi)', label: 'an outgoing request, and the mapping it makes' },
    ]}
  />
);
const NAT_OPTIONS = NAT_TYPES.map((t) => ({ value: t, label: NAT_NAME[t] }));

function NatTable({ peer, type, rows }: { peer: Peer; type: NatType; rows: number }) {
  const t = tableText(peer, type);
  return (
    <WideRegion minWidth={TABLE_MIN_WIDTH} label={`The NAT table of NAT ${peer}`} hint="swipe to see the whole table">
      <table className="data-table nat-table">
        <caption>NAT {peer}: {natLine(type)}</caption>
        <thead>
          <tr>
            <th scope="col">Inside</th>
            <th scope="col">Outside</th>
            <th scope="col">Made for</th>
            <th scope="col">Lets in</th>
          </tr>
        </thead>
        <tbody>
          {rows === 0 ? (
            <tr>
              <td colSpan={4}>empty: nothing has gone out yet</td>
            </tr>
          ) : (
            <tr className="nat-row is-new">
              <td>{t.inside}</td>
              <td>{t.outside}</td>
              <td>{t.dest}</td>
              <td>{t.letsIn}</td>
            </tr>
          )}
        </tbody>
      </table>
    </WideRegion>
  );
}

export function StunScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialStun);
  const frames = useMemo(() => stunFrames(st.a, st.b), [st.a, st.b]);
  const player = usePlayer(frames, { interval: 1700, autoplay: true });
  const f = player.frame;
  const a = stunTable('A', st.a)[0].outside;
  const b = stunTable('B', st.b)[0].outside;
  const index = player.index;

  return (
    <StageFrame
      height={640}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Peer A learned" value={f.learned.A ? epText(a) : 'nothing yet'} color={f.learned.A ? 'var(--info)' : undefined} sub="from the STUN reply" />
          <Stat label="Peer B learned" value={f.learned.B ? epText(b) : 'nothing yet'} color={f.learned.B ? 'var(--info)' : undefined} sub="from the STUN reply" />
          <Stat label="NAT mappings" value={f.rows.A + f.rows.B} color="var(--hi)" sub="one per NAT, made by the request" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented<NatType> label="NAT of peer A" value={st.a} options={NAT_OPTIONS} onChange={(a2) => setSt((s) => ({ ...s, a: a2 }))} />
          <Segmented<NatType> label="NAT of peer B" value={st.b} options={NAT_OPTIONS} onChange={(b2) => setSt((s) => ({ ...s, b: b2 }))} />
        </>,
      ]}
    >
      <div className="nat-stage stage-pad">
        <Box>
          <SectionTitle hint="the signalling server and the relay come in the next scenes">Who am I, from outside?</SectionTitle>
          <Topology
            middle="STUN server"
            natA={st.a}
            natB={st.b}
            on={[...(f.rows.A ? (['a', 'na'] as const) : []), ...(f.rows.B ? (['b', 'nb'] as const) : [])]}
            packet={f.packet ? { path: f.packet.path, label: f.packet.label, color: f.packet.reply ? 'var(--info)' : 'var(--hi)' } : null}
            packetKey={`${st.a}${st.b}${index}`}
            ariaLabel="Peer A and peer B, each behind a NAT, and a STUN server between them; the chosen NAT types are named under each NAT"
          />
        </Box>
        <div className="nat-tables">
          <NatTable peer="A" type={st.a} rows={f.rows.A} />
          <NatTable peer="B" type={st.b} rows={f.rows.B} />
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">a model of NAT mapping and filtering; no STUN or TURN server is contacted and this page opens no connection</Provenance>
          <Provenance kind="from-memory">the vocabulary (mapping and filtering behaviour, and the older cone and symmetric names) is recalled from RFC 4787 and RFC 3489: verify against them. NAT behaviour varies by device</Provenance>
          <Provenance kind="illustrative">all addresses are private or from the documentation ranges, and the NATs' first ports are chosen for the example</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
