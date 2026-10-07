import type { ReactNode } from 'react';
import { humanDuration } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  APIPA_FIRST, APIPA_LAST, BROADCAST, RETRY_S, emptyConfig, leaseTimers, type Config, type PoolView, type Scene, type Step,
} from './model';

export interface DhcpFrame extends Frame {
  /** Index of the current message in the ladder; -1 before the first. */
  step: number;
  config: Config;
  pools: PoolView[];
  /** Scripted seconds. */
  t: number;
}

const ep = (e: { ip: string; port: number }) => `${e.ip}:${e.port}`;

/** What one step means, built from its own addressing. */
export function stepCaption(s: Step): ReactNode {
  const w = s.wire;
  switch (s.event) {
    case 'discover':
      return <>The laptop has no address yet, so it sends <b>DHCPDISCOVER</b> from {ep(w!.src)} to <span className="hl info">{ep(w!.dst)}</span>:
        a broadcast every machine on the link hears, asking "is there a DHCP server?"</>;
    case 'offer':
      return <>A server answers with <b>DHCPOFFER</b>: address <b>{w!.addr}</b> plus mask, router, DNS and a lease time. It's sent to{' '}
        {ep(w!.dst)} at the laptop's MAC, because the laptop can't answer for that address yet. It's only an offer: nothing is configured.</>;
    case 'request':
      return <><b>DHCPREQUEST</b> for {w!.addr}, still a <span className="hl info">broadcast</span> to {BROADCAST}, naming server {w!.server}: every
        server sees which offer was taken.</>;
    case 'ack':
      return <><span className="hl ok">DHCPACK</span> from {w!.src.ip}: the lease on {w!.addr} is confirmed and the laptop configures its
        interface. Four messages, not one: offer and acceptance are separate, so two servers can't both hand out the address.</>;
    case 'withdraw':
      return <>Server B saw the broadcast REQUEST name server A, so it <b>withdraws</b> its offer and puts that address back in
        its pool.</>;
    case 'no-offer':
      return <><span className="hl bad">{s.label}</span>. Every address in the pool is leased, so the server has nothing to offer and stays silent.</>;
    case 'retry':
      return <>The laptop broadcasts DHCPDISCOVER to {ep(w!.dst)} again, backing off ({RETRY_S.join(' s, then ')} s here; real clients randomise it).</>;
    case 'apipa':
      return <>Giving up for now, the laptop picks a <span className="hl orange">link-local</span> address ({s.label.replace('use ', '')}) from{' '}
        {APIPA_FIRST}-{APIPA_LAST} (RFC 3927). It can talk to neighbours on this link, but there's no router and no DNS: "why does my
        laptop say 169.254…" means DHCP never answered.</>;
    case 'relay-up':
      return <>The relay agent on the router (giaddr {w!.giaddr}) forwards it as <span className="hl violet">unicast</span> from {ep(w!.src)} to{' '}
        {ep(w!.dst)}. Broadcasts don't cross routers; the relay is how one server serves many subnets.</>;
    case 'relay-down':
      return <>The relay passes the server's {w!.type.replace('DHCP', '')} to the laptop at {ep(w!.dst)}. The server chose a{' '}
        {w!.addr?.split('.').slice(0, 3).join('.')}.x address because giaddr {w!.giaddr} told it which subnet the client is on.</>;
    case 'renew':
      return s.lost ? (
        <>T1 (half the lease): the laptop asks its server to renew, by <span className="hl violet">unicast</span> to {ep(w!.dst)}. The server is down,
          so the request is lost. (Real clients retry a few times before T2; here one try stands for them.)</>
      ) : (
        <>T1 (half the lease): the laptop asks its own server to extend the lease, by <span className="hl violet">unicast</span> to {ep(w!.dst)}.</>
      );
    case 'renew-ack':
      return <><span className="hl ok">DHCPACK</span>: the lease is extended from now. A lease isn't permanent: the client keeps renewing it
        every half-lease for as long as it stays on the network.</>;
    case 'rebind':
      return <>T2 (7/8 of the lease): no luck with its own server, so the laptop <span className="hl info">broadcasts</span> the request to any
        server that can vouch for the address.</>;
    case 'rebind-lost':
      return <><span className="hl bad">No answer</span> from any server. The laptop may keep using the address only until the lease ends.</>;
    case 'expire':
      return <><span className="hl bad">The lease is over</span>: the laptop must stop using the address and start again from DHCPDISCOVER.</>;
    default:
      return s.label;
  }
}

const INTRO: Record<string, ReactNode> = {
  dora: <>A new laptop joins the LAN with no IP address. Press play to watch DORA: Discover, Offer, Request, Acknowledge.</>,
  two: <>Two DHCP servers on one LAN. Both will answer the laptop's DISCOVER; watch how the REQUEST settles which one wins.</>,
  exhausted: <>This server's pool is full: every address is leased to another device. Press play to see what the laptop does.</>,
  relay: <>The DHCP server is on another subnet, behind a router. Broadcasts stop at routers, so how does the laptop reach it?</>,
};

/** One frame per ladder step, after an intro frame with nothing on the wire yet. */
export function sceneFrames(scene: Scene, intro: ReactNode, start: Omit<DhcpFrame, 'step' | 'say'>): DhcpFrame[] {
  return [
    { step: -1, ...start, say: intro },
    ...scene.steps.map((s, i) => ({ step: i, config: s.config, pools: s.pools, t: s.t, say: stepCaption(s), hold: s.event === 'apipa' || s.event === 'ack' ? 2 : 1 })),
  ];
}

export function introFor(scene: 'dora' | 'two' | 'exhausted' | 'relay'): ReactNode {
  return INTRO[scene];
}

/** The lease clock's opening frame: the timers, from the lease the learner picked. */
export function leaseIntro(lease: number, serverUp: boolean): ReactNode {
  const { t1, t2 } = leaseTimers(lease);
  return <>Bound with a {humanDuration(lease)} lease. The laptop will try to renew at T1 = {humanDuration(t1)} and, failing that, rebind at
    T2 = {humanDuration(t2)}. {serverUp ? 'Its server is up.' : 'Its server has gone down.'} Timings are compressed: press play.</>;
}

export const blankStart = (pools: PoolView[]): Omit<DhcpFrame, 'step' | 'say'> => ({ config: emptyConfig(), pools, t: 0 });
