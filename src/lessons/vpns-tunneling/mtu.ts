/**
 * The MTU scene's model: what happens to a packet that goes into a tunnel whose MTU is the link MTU minus the
 * tunnel's fixed overhead. Pure.
 *
 * Decision list (the documented behaviour of IP fragmentation and path MTU discovery, from memory: verify):
 *   1. With MSS clamping on, the TCP sender's segments are cut to the tunnel MTU (an MSS of tunnel MTU minus 40,
 *      the IPv4 and TCP headers), so a segment never exceeds it.
 *   2. A packet that fits the tunnel MTU is delivered.
 *   3. A packet that does not fit, with don't-fragment clear, is split into fragments and delivered.
 *   4. A packet that does not fit, with don't-fragment set, is dropped by the tunnel entrance, which sends an ICMP
 *      "fragmentation needed" message back: if ICMP is allowed the sender learns the size and retries smaller;
 *      if ICMP is blocked nothing tells the sender, and the packet silently vanishes (the black hole).
 * The outer header of every tunnel here is IPv4, and the ESP suite and NAT traversal are pinned to their defaults,
 * so the controls of the other scenes cannot reach these numbers.
 */
import { DEFAULT_OPTIONS, TUNNEL_NAME, fixedOverheadOf, type TunnelId } from './tunnels';

export const LINK_MTU = { min: 576, max: 9000, step: 4, ethernet: 1500, jumbo: 9000 } as const;
export const PACKET_SIZE = { min: 100, max: 9000, step: 4 } as const;
/** IPv4 header and TCP header with no options, in bytes: what an MSS leaves out of a packet. */
export const TCP_IP_HEADERS = 40;
export const IPV4_HEADER = 20;
/** Sizes of the packets that open a connection and make a small request, all below any tunnel MTU this scene can produce. */
export const SMALL = { ping: 84, syn: 60, request: 300 } as const;

export interface MtuInput {
  tunnel: TunnelId;
  linkMtu: number;
  packet: number;
  df: boolean;
  icmp: boolean;
  clamp: boolean;
}
export const DEFAULT_MTU_INPUT: MtuInput = { tunnel: 'wireguard', linkMtu: 1500, packet: 1500, df: true, icmp: false, clamp: false };

export type Outcome = 'delivered' | 'fragmented' | 'dropped-silent' | 'dropped-icmp';

export interface MtuResult {
  overhead: number;
  tunnelMtu: number;
  /** The size actually sent: the packet, or the tunnel MTU when clamping cut it. */
  sent: number;
  clamped: boolean;
  fits: boolean;
  outcome: Outcome;
  fragments: number;
}

export const tunnelMtuOf = (tunnel: TunnelId, linkMtu: number): number => linkMtu - fixedOverheadOf(tunnel, DEFAULT_OPTIONS);

/** Fragments an IPv4 packet of `size` needs over a path of `mtu`: payload per fragment is a multiple of 8 bytes. */
export function fragmentCount(size: number, mtu: number): number {
  if (size <= mtu) return 1;
  const per = Math.floor((mtu - IPV4_HEADER) / 8) * 8;
  return Math.ceil((size - IPV4_HEADER) / per);
}

export function decide(i: MtuInput): MtuResult {
  const overhead = fixedOverheadOf(i.tunnel, DEFAULT_OPTIONS);
  const tunnelMtu = i.linkMtu - overhead;
  const clamped = i.clamp && i.packet > tunnelMtu;
  const sent = clamped ? tunnelMtu : i.packet;
  const fits = sent <= tunnelMtu;
  let outcome: Outcome;
  if (fits) outcome = 'delivered';
  else if (!i.df) outcome = 'fragmented';
  else outcome = i.icmp ? 'dropped-icmp' : 'dropped-silent';
  return { overhead, tunnelMtu, sent, clamped, fits, outcome, fragments: outcome === 'fragmented' ? fragmentCount(sent, tunnelMtu) : 1 };
}

// ---- the transfer as a ladder -----------------------------------------------------------------

export interface Step {
  id: string;
  from: 'client' | 'ingress' | 'server';
  to: 'client' | 'ingress' | 'server';
  label: string;
  note?: string;
  lost?: boolean;
}

const RETRANSMISSIONS = 3;

/** The simulated TCP transfer: a ping and a handshake and a small request work, then the full-size segments. */
export function transferSteps(i: MtuInput): { steps: Step[]; result: MtuResult; stalls: boolean } {
  const r = decide(i);
  const steps: Step[] = [
    { id: 'ping', from: 'client', to: 'server', label: `ping, ${SMALL.ping} bytes`, note: 'fits' },
    { id: 'syn', from: 'client', to: 'server', label: `SYN, ${SMALL.syn} bytes`, note: i.clamp ? `MSS rewritten to ${r.tunnelMtu - TCP_IP_HEADERS}` : 'fits' },
    { id: 'synack', from: 'server', to: 'client', label: `SYN-ACK, ${SMALL.syn} bytes`, note: 'fits' },
    { id: 'req', from: 'client', to: 'server', label: `request, ${SMALL.request} bytes`, note: 'fits' },
  ];
  const big = `data segment, ${r.sent} bytes`;
  if (r.outcome === 'delivered') {
    steps.push({ id: 'seg', from: 'server', to: 'client', label: big, note: r.clamped ? `cut to the tunnel MTU ${r.tunnelMtu}` : `fits the tunnel MTU ${r.tunnelMtu}` });
  } else if (r.outcome === 'fragmented') {
    steps.push({ id: 'seg', from: 'server', to: 'client', label: big, note: `split into ${r.fragments} fragments of at most ${r.tunnelMtu} bytes` });
  } else if (r.outcome === 'dropped-icmp') {
    steps.push({ id: 'seg', from: 'server', to: 'ingress', label: big, lost: true, note: `over ${r.tunnelMtu} with don't-fragment set` });
    steps.push({ id: 'icmp', from: 'ingress', to: 'server', label: `ICMP: fragmentation needed, MTU ${r.tunnelMtu}` });
    steps.push({ id: 'retry', from: 'server', to: 'client', label: `data segment, ${r.tunnelMtu} bytes`, note: 'the sender learned the size and retried smaller' });
  } else {
    steps.push({ id: 'seg', from: 'server', to: 'ingress', label: big, lost: true, note: `over ${r.tunnelMtu} with don't-fragment set; nothing is sent back` });
    for (let k = 1; k <= RETRANSMISSIONS; k++) {
      steps.push({ id: `rto${k}`, from: 'server', to: 'ingress', label: `retransmit ${k}, ${r.sent} bytes`, lost: true, note: `after a timeout, the same size again` });
    }
  }
  return { steps, result: r, stalls: r.outcome === 'dropped-silent' };
}

export const tunnelLabel = (t: TunnelId) => TUNNEL_NAME[t];
