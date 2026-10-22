import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { relayIntro } from './captions';
import { initialRelay } from './init';
import { NatPair } from './NatPair';
import { punch } from './nat';
import { BITRATE_MBPS, CALLS, PRICE_PER_GB, SHARE, latencies, relayLoad } from './relay';
import { Topology } from './Topology';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'the direct path, when the hole is punched' },
      { color: 'var(--orange)', label: 'the relay path: a labelled fallback, not a failure' },
    ]}
  />
);

export function RelayScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialRelay);
  const connected = useMemo(() => punch(st.a, st.b).connected, [st.a, st.b]);
  const lat = latencies();
  const load = relayLoad(st.calls, st.share);

  return (
    <StageFrame
      height={700}
      legend={LEGEND}
      intro={relayIntro(connected, st.calls, st.share)}
      introKey={`${connected}|${st.calls}|${st.share}`}
      stats={
        <Stats>
          <Stat label="Path in use" value={connected ? 'direct' : 'relay'} color={connected ? 'var(--ok)' : 'var(--orange)'} sub="for the two NATs chosen" />
          <Stat label="One-way delay" value={`${connected ? lat.direct : lat.relayed} ms`} sub={connected ? 'illustrative' : `illustrative: ${lat.direct} ms direct, ${lat.extra} ms more`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <NatPair value={{ a: st.a, b: st.b, sameLan: false }} onChange={(s) => setSt((x) => ({ ...x, a: s.a, b: s.b }))} />
        </>,
        <>
          <Slider label="Concurrent calls" value={st.calls} min={CALLS.min} max={CALLS.max} step={CALLS.step} format={(n) => n.toLocaleString('en-US')} onChange={(calls) => setSt((x) => ({ ...x, calls }))} />
          <Slider label="Your assumption: calls that need a relay" value={st.share} min={SHARE.min} max={SHARE.max} step={SHARE.step} format={(n) => `${n}%`} onChange={(share) => setSt((x) => ({ ...x, share }))} />
        </>,
      ]}
    >
      <div className="nat-stage stage-pad">
        <Box>
          <SectionTitle hint="a TURN relay is a public server both peers can reach">When no hole opens</SectionTitle>
          <Topology
            middle="TURN relay"
            natA={st.a}
            natB={st.b}
            route={connected ? 'direct' : 'relay'}
            on={connected ? ['a', 'na', 'nb', 'b'] : ['a', 'na', 'stun', 'nb', 'b']}
            ariaLabel={`Peer A and peer B behind their NATs: ${connected ? 'the media goes straight between the NATs' : 'the media goes through the TURN relay in the middle'}`}
          />
        </Box>
        <Box>
          <SectionTitle hint="what the relay pays for">Cost of the relay at your assumption</SectionTitle>
          <Stats>
            <Stat label="Calls through the relay" value={load.relayedCalls.toLocaleString('en-US')} color="var(--orange)" sub={`${load.directCalls.toLocaleString('en-US')} calls stay direct`} />
            <Stat label="Relay bandwidth out" value={`${load.egressMbps.toLocaleString('en-US')} Mbit/s`} sub={`${load.relayedCalls.toLocaleString('en-US')} calls x 2 directions x ${BITRATE_MBPS} Mbit/s`} />
            <Stat label="Sent per hour" value={`${load.gbPerHour.toLocaleString('en-US')} GB`} sub={`${load.egressMbps.toLocaleString('en-US')} Mbit/s for 3,600 s`} />
            <Stat label="Cost per hour" value={`$${load.costPerHour.toFixed(2)}`} color="var(--hi)" sub={`at $${PRICE_PER_GB.toFixed(2)} per GB, illustrative`} />
          </Stats>
          <p className="nat-note">The share of calls that need a relay is your own assumption: it is not a measured figure, and it does not depend on the NATs picked above, which show one pair.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">the delays, the {BITRATE_MBPS} Mbit/s stream, the price per gigabyte and the share of relayed calls are made-up numbers, not measurements</Provenance>
          <Provenance kind="simulated">whether this pair punches comes from the NAT simulation; no TURN server is contacted</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
