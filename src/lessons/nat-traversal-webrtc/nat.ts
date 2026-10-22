/**
 * A NAT table model and the hole-punching simulation built on it. Pure; every address is a documentation-range or
 * private example address, and nothing here sends a packet.
 *
 * Vocabulary follows RFC 4787 as recalled from memory (verify against it and against Ford, Srisuresh and Kegel,
 * "Peer-to-peer communication across network address translators"):
 *   mapping behaviour   endpoint-independent: one external port per inside endpoint, whoever it talks to;
 *                       address-and-port-dependent: a new external port for every destination (the "symmetric" case).
 *   filtering behaviour open: any outside host may send to a mapped port; address-restricted: only to an IP the
 *                       inside host has already sent to; port-restricted: only from an IP and port it has sent to.
 * The older names (RFC 3489) are the four types the lesson offers, as aliases of a mapping and a filtering:
 *   full cone = EIM + open, restricted cone = EIM + address-restricted, port-restricted cone = EIM + port-restricted,
 *   symmetric = address-and-port-dependent mapping + port-restricted filtering.
 *
 * The punch: both peers learned their server-reflexive address from a STUN server (one mapping each), swapped them
 * through a signalling server, and now probe the other's address once per tick. A delivered probe teaches the
 * receiver the sender's real source (a peer-reflexive address), which it uses from then on. The pair is connected when a
 * probe has been delivered in each direction. Delivery order inside one tick is fixed (the `first` peer sends first).
 */
import { ipToString, ipv4 } from '../../core/ipv4';

export type NatType = 'full' | 'restricted' | 'port-restricted' | 'symmetric';
export type Mapping = 'endpoint-independent' | 'address-and-port-dependent';
export type Filtering = 'open' | 'address-restricted' | 'port-restricted';
export interface Behaviour {
  mapping: Mapping;
  filtering: Filtering;
}

export const NAT_TYPES: readonly NatType[] = ['full', 'restricted', 'port-restricted', 'symmetric'];
export const NAT_NAME: Record<NatType, string> = {
  full: 'full cone',
  restricted: 'restricted cone',
  'port-restricted': 'port-restricted cone',
  symmetric: 'symmetric',
};
export const BEHAVIOUR: Record<NatType, Behaviour> = {
  full: { mapping: 'endpoint-independent', filtering: 'open' },
  restricted: { mapping: 'endpoint-independent', filtering: 'address-restricted' },
  'port-restricted': { mapping: 'endpoint-independent', filtering: 'port-restricted' },
  symmetric: { mapping: 'address-and-port-dependent', filtering: 'port-restricted' },
};

export interface Endpoint {
  ip: number;
  port: number;
}
export const epText = (e: Endpoint) => `${ipToString(e.ip)}:${e.port}`;
const key = (e: Endpoint) => `${e.ip}:${e.port}`;
const ep = (text: string, port: number): Endpoint => ({ ip: ipv4(text), port });

export type Peer = 'A' | 'B';
export const SCENE = {
  inside: { A: ep('192.168.1.10', 5000), B: ep('10.0.0.5', 5000) },
  natIp: { A: ipv4('198.51.100.20'), B: ipv4('203.0.113.30') },
  /** The first external port each NAT hands out (different, so a port is never mistaken for the other NAT's). */
  firstPort: { A: 40000, B: 50000 },
  stun: ep('192.0.2.10', 3478),
  signalling: ep('192.0.2.20', 443),
  turn: ep('192.0.2.30', 3478),
} as const;

export interface MappingEntry {
  inside: Endpoint;
  outside: Endpoint;
  /** For an address-and-port-dependent mapping, the one destination it was made for. */
  dest: Endpoint | null;
  permittedIps: Set<number>;
  permittedEps: Set<string>;
}

export type Verdict = { ok: true; inside: Endpoint } | { ok: false; reason: string };

export class Nat {
  readonly mappings: MappingEntry[] = [];
  readonly name: string;
  readonly publicIp: number;
  readonly behaviour: Behaviour;
  private next: number;
  constructor(name: string, publicIp: number, behaviour: Behaviour, firstPort: number) {
    this.name = name;
    this.publicIp = publicIp;
    this.behaviour = behaviour;
    this.next = firstPort;
  }

  /** A packet leaving: find or make its mapping, remember who it went to, and return the source the world sees. */
  outbound(inside: Endpoint, dest: Endpoint): Endpoint {
    const perDest = this.behaviour.mapping === 'address-and-port-dependent';
    let m = this.mappings.find((x) => key(x.inside) === key(inside) && (!perDest || (x.dest !== null && key(x.dest) === key(dest))));
    if (!m) {
      m = { inside, outside: { ip: this.publicIp, port: this.next++ }, dest: perDest ? dest : null, permittedIps: new Set(), permittedEps: new Set() };
      this.mappings.push(m);
    }
    m.permittedIps.add(dest.ip);
    m.permittedEps.add(key(dest));
    return m.outside;
  }

  /** A packet arriving from `src` at one of this NAT's external ports. */
  inbound(src: Endpoint, port: number): Verdict {
    const m = this.mappings.find((x) => x.outside.port === port);
    if (!m) return { ok: false, reason: `no mapping on port ${port}` };
    const f = this.behaviour.filtering;
    if (f === 'address-restricted' && !m.permittedIps.has(src.ip)) return { ok: false, reason: `${ipToString(src.ip)} was never contacted from this mapping (address-restricted)` };
    if (f === 'port-restricted' && !m.permittedEps.has(key(src))) return { ok: false, reason: `${epText(src)} was never contacted from this mapping (port-restricted)` };
    return { ok: true, inside: m.inside };
  }
}

export const makeNat = (peer: Peer, type: NatType): Nat => new Nat(`NAT ${peer}`, SCENE.natIp[peer], BEHAVIOUR[type], SCENE.firstPort[peer]);

export const PROBE_TICKS = 6;
export const OFFSET_MAX = 3;

export interface Probe {
  tick: number;
  from: Peer;
  /** The source the other NAT saw. */
  src: Endpoint;
  dst: Endpoint;
  delivered: boolean;
  /** Why the receiving NAT dropped it. */
  reason: string | null;
  /** The receiver learned a new address for the sender from this probe. */
  learned: boolean;
}

export interface Punch {
  /** What each peer learned from the STUN server. */
  reflexive: Record<Peer, Endpoint>;
  probes: Probe[];
  connected: boolean;
  /** The tick of the first probe delivered in each direction, or null. */
  firstDelivered: Record<Peer, number | null>;
  dropped: number;
}

export function punch(typeA: NatType, typeB: NatType, offset = 0, first: Peer = 'A'): Punch {
  const nat: Record<Peer, Nat> = { A: makeNat('A', typeA), B: makeNat('B', typeB) };
  // Each peer asked the STUN server for its address: one mapping, made for the STUN server.
  const reflexive: Record<Peer, Endpoint> = { A: nat.A.outbound(SCENE.inside.A, SCENE.stun), B: nat.B.outbound(SCENE.inside.B, SCENE.stun) };
  const target: Record<Peer, Endpoint> = { A: reflexive.B, B: reflexive.A };
  const start: Record<Peer, number> = { A: 0, B: offset };
  const order: Peer[] = first === 'A' ? ['A', 'B'] : ['B', 'A'];
  const other = (p: Peer): Peer => (p === 'A' ? 'B' : 'A');
  const probes: Probe[] = [];
  const firstDelivered: Record<Peer, number | null> = { A: null, B: null };
  const end = Math.max(start.A, start.B) + PROBE_TICKS;
  for (let tick = 0; tick < end; tick++) {
    for (const p of order) {
      if (tick < start[p] || tick >= start[p] + PROBE_TICKS) continue;
      const dst = target[p];
      const src = nat[p].outbound(SCENE.inside[p], dst);
      const receiver = other(p);
      const v = dst.ip === SCENE.natIp[receiver] ? nat[receiver].inbound(src, dst.port) : ({ ok: false, reason: 'the address is not this peer\'s NAT' } as const);
      const learned = v.ok && key(target[receiver]) !== key(src);
      if (v.ok) {
        target[receiver] = src;
        if (firstDelivered[p] === null) firstDelivered[p] = tick;
      }
      probes.push({ tick, from: p, src, dst, delivered: v.ok, reason: v.ok ? null : v.reason, learned });
    }
    if (firstDelivered.A !== null && firstDelivered.B !== null) break;
  }
  const connected = firstDelivered.A !== null && firstDelivered.B !== null;
  return { reflexive, probes, connected, firstDelivered, dropped: probes.filter((x) => !x.delivered).length };
}

/** The 4 by 4 outcome: row = peer A's NAT, column = peer B's NAT, from the packet simulation. */
export function matrix(offset = 0, first: Peer = 'A'): boolean[][] {
  return NAT_TYPES.map((a) => NAT_TYPES.map((b) => punch(a, b, offset, first).connected));
}

/** The NAT table of one NAT after the STUN request alone, as the first scene draws it. */
export function stunTable(peer: Peer, type: NatType): MappingEntry[] {
  const nat = makeNat(peer, type);
  nat.outbound(SCENE.inside[peer], SCENE.stun);
  return nat.mappings;
}

/** Who a mapping lets in, in words. */
export function letsIn(type: NatType, m: MappingEntry): string {
  const f = BEHAVIOUR[type].filtering;
  if (f === 'open') return 'anyone';
  if (f === 'address-restricted') return `any port of ${[...m.permittedIps].map(ipToString).join(', ')}`;
  return [...m.permittedEps].map((k) => epText({ ip: Number(k.split(':')[0]), port: Number(k.split(':')[1]) })).join(', ');
}
