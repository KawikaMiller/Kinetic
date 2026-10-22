import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { PhoneLadder } from '../../components/PhoneLadder';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { mtuFrames, outcomeLabel } from './captions';
import { initialMtu } from './init';
import { LINK_MTU, PACKET_SIZE, transferSteps, transferSub } from './mtu';
import { TUNNEL_OPTIONS } from './options';

const ACTORS = [
  { id: 'client', label: 'client' },
  { id: 'ingress', label: 'tunnel entrance' },
  { id: 'server', label: 'server' },
];

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'the tunnel MTU: room for the inner packet' },
      { color: 'var(--hi)', label: 'overhead of the tunnel' },
      { color: 'var(--info)', label: 'a packet that fits' },
      { color: 'var(--bad)', label: 'a packet that does not fit, or one dropped' },
    ]}
  />
);

/** Link MTU as tunnel MTU plus overhead, and the packet under it on the same scale. */
function MtuBars({ link, overhead, packet }: { link: number; overhead: number; packet: number }) {
  const scale = Math.max(link, packet);
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const mtu = link - overhead;
  const fits = packet <= mtu;
  return (
    <div className="vpn-mtu" role="img" aria-label={`Link MTU ${link} bytes: ${mtu} for the inner packet and ${overhead} overhead. The packet is ${packet} bytes and ${fits ? 'fits' : 'does not fit'}.`}>
      <div className="vpn-mtu-row">
        <span className="vpn-mtu-label">link MTU {link}</span>
        <div className="vpn-mtu-track">
          <span className="vpn-mtu-seg is-ok" style={{ width: pct(mtu) }}>tunnel MTU {mtu}</span>
          <span className="vpn-mtu-seg is-hi" style={{ width: pct(overhead) }} title={`overhead ${overhead}`} />
        </div>
      </div>
      <div className="vpn-mtu-row">
        <span className="vpn-mtu-label">packet {packet}</span>
        <div className="vpn-mtu-track">
          <span className="vpn-mtu-seg is-info" style={{ width: pct(Math.min(packet, mtu)) }} />
          {!fits && <span className="vpn-mtu-seg is-bad" style={{ width: pct(packet - mtu) }} title={`${packet - mtu} bytes over`} />}
        </div>
      </div>
    </div>
  );
}

export function MtuScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialMtu);
  const { steps, result: r, stalls } = useMemo(() => transferSteps(st), [st]);
  const frames = useMemo(() => mtuFrames(st), [st]);
  const player = usePlayer(frames, { interval: 1500, autoplay: true });
  const messages = useMemo(
    () => steps.map((s) => ({ id: s.id, from: s.from, to: s.to, label: s.label, lost: s.lost, note: s.note })),
    [steps],
  );
  const patch = (p: Partial<typeof st>) => setSt((s) => ({ ...s, ...p }));

  return (
    <StageFrame
      height={620}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Tunnel MTU" value={`${r.tunnelMtu} bytes`} color="var(--ok)" sub={`${st.linkMtu} - ${r.overhead} of overhead`} />
          <Stat label="The big packet" value={outcomeLabel(r.outcome)} color={r.outcome === 'dropped-silent' ? 'var(--bad)' : undefined} sub={`${r.sent} bytes sent${r.clamped ? ', cut by MSS clamping' : ''}`} />
          <Stat label="Large transfer" value={stalls ? 'stalls' : 'completes'} color={stalls ? 'var(--bad)' : 'var(--ok)'} sub={transferSub({ steps, result: r, stalls })} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Tunnel" value={st.tunnel} options={TUNNEL_OPTIONS} onChange={(tunnel) => patch({ tunnel })} />
        </>,
        <>
          <Slider label="Link MTU" value={st.linkMtu} min={LINK_MTU.min} max={LINK_MTU.max} step={LINK_MTU.step} format={(n) => `${n} bytes`} onChange={(linkMtu) => patch({ linkMtu })} />
          <ControlGroup label="Link" inline>
            <ChipButton on={st.linkMtu === LINK_MTU.ethernet} onClick={() => patch({ linkMtu: LINK_MTU.ethernet })}>1,500</ChipButton>
            <ChipButton on={st.linkMtu === LINK_MTU.jumbo} onClick={() => patch({ linkMtu: LINK_MTU.jumbo })}>jumbo 9,000</ChipButton>
          </ControlGroup>
          <Slider label="Packet size" value={st.packet} min={PACKET_SIZE.min} max={PACKET_SIZE.max} step={PACKET_SIZE.step} format={(n) => `${n} bytes`} onChange={(packet) => patch({ packet })} />
        </>,
        <>
          <Toggle label="Don't fragment" value={st.df} off="clear" on="set" onChange={(df) => patch({ df })} />
          <Toggle label="ICMP 'fragmentation needed'" value={st.icmp} off="blocked" on="allowed" onChange={(icmp) => patch({ icmp })} />
          <Toggle label="MSS clamping" value={st.clamp} off="off" on="on" onChange={(clamp) => patch({ clamp })} />
        </>,
      ]}
    >
      <div className="vpn-stage stage-pad">
        <Box>
          <SectionTitle hint="the same scale for both bars">Room inside the tunnel</SectionTitle>
          <MtuBars link={st.linkMtu} overhead={r.overhead} packet={r.sent} />
          <p className="vpn-note">The sender's own link is assumed to carry packets up to {PACKET_SIZE.max.toLocaleString('en-US')} bytes; the tunnel is the narrow part. The tunnel's overhead here is the fixed part (IPv4 outer header; ESP with AES-GCM and no NAT traversal), without padding.</p>
        </Box>
        <Box>
          <SectionTitle hint="one TCP download through the tunnel">What the transfer sees</SectionTitle>
          <PhoneLadder actors={ACTORS} messages={messages} step={Math.min(player.frame.index, messages.length - 1)} fit="shown" ariaLabel="The ping, handshake, request and large segment crossing the tunnel, with lost packets marked" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a model of one TCP download; nothing is sent</Provenance>
          <Provenance kind="from-memory">the path MTU discovery behaviour (ICMP fragmentation needed, don't-fragment, MSS clamping to the MTU minus 40) is recalled from the IP and TCP documents: verify against them</Provenance>
          <Provenance kind="scripted">the retransmission count is fixed at 3 and the timeouts are not timed</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
