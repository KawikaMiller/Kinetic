/**
 * ICE candidate priorities, candidate pairs and the connectivity-check order. Pure.
 *
 * The formulas are recalled from RFC 8445 (verify against its sections on candidate priority and pair priority):
 *   priority      = 2^24 * typePreference + 2^8 * localPreference + (256 - componentId)
 *   type prefs    host 126, peer-reflexive 110, server-reflexive 100, relayed 0 (the recommended values)
 *   pair priority = 2^32 * min(G, D) + 2 * max(G, D) + (G > D ? 1 : 0), G the controlling agent's candidate priority
 *                   and D the controlled agent's. It does not fit a double (up to 2^63), so it is a bigint.
 * Peer A is the controlling agent. A pair works when a connectivity check on it would get through, from the NAT
 * simulation: a host address is private, a server-reflexive address is reachable through the NATs only if punching
 * works, and a relayed address is public.
 */
import { punch, type NatType, SCENE, epText, type Endpoint } from './nat';

export type CandKind = 'host' | 'srflx' | 'relay';
export const KINDS: readonly CandKind[] = ['host', 'srflx', 'relay'];
export const TYPE_PREFERENCE: Record<CandKind, number> = { host: 126, srflx: 100, relay: 0 };
/** The one local interface of each peer gets the highest local preference. */
export const LOCAL_PREFERENCE = 65535;
export const COMPONENT_ID = 1;
export const KIND_NAME: Record<CandKind, string> = { host: 'host', srflx: 'server-reflexive', relay: 'relayed' };

export const candidatePriority = (kind: CandKind, localPref = LOCAL_PREFERENCE, component = COMPONENT_ID): number =>
  2 ** 24 * TYPE_PREFERENCE[kind] + 2 ** 8 * localPref + (256 - component);

export function pairPriority(g: number, d: number): bigint {
  const min = BigInt(Math.min(g, d));
  const max = BigInt(Math.max(g, d));
  return (min << 32n) + 2n * max + (g > d ? 1n : 0n);
}

export interface Scenario {
  a: NatType;
  b: NatType;
  /** Both peers sit behind one router on one LAN. */
  sameLan: boolean;
}

export interface Candidate {
  kind: CandKind;
  addr: Endpoint;
  priority: number;
}

const RELAY_PORT = { A: 49152, B: 49153 } as const;

/** One peer's three candidates, in the order the agent gathers them. */
export function candidatesOf(peer: 'A' | 'B', sc: Scenario): Candidate[] {
  const host = sc.sameLan ? { ip: SCENE.inside.A.ip + (peer === 'A' ? 0 : 1), port: SCENE.inside[peer].port } : SCENE.inside[peer];
  const reflexive = punch(sc.a, sc.b).reflexive[peer];
  const relay = { ip: SCENE.turn.ip, port: RELAY_PORT[peer] };
  const addr: Record<CandKind, Endpoint> = { host, srflx: sc.sameLan ? { ip: SCENE.natIp.A, port: reflexive.port } : reflexive, relay };
  return KINDS.map((kind) => ({ kind, addr: addr[kind], priority: candidatePriority(kind) }));
}

/** Would a check from a candidate of this kind to a remote candidate of that kind get through? */
export function pairWorks(local: CandKind, remote: CandKind, sc: Scenario): boolean {
  if (remote === 'relay') return true;
  if (local === 'relay') return remote === 'srflx';
  if (remote === 'host') return local === 'host' && sc.sameLan;
  return !sc.sameLan && punch(sc.a, sc.b).connected;
}

export interface Pair {
  id: string;
  local: Candidate;
  remote: Candidate;
  priority: bigint;
  works: boolean;
}

/** All nine pairs, highest priority first (ties keep the gathering order). */
export function pairsOf(sc: Scenario): Pair[] {
  const mine = candidatesOf('A', sc);
  const theirs = candidatesOf('B', sc);
  const pairs = mine.flatMap((local) =>
    theirs.map((remote) => ({
      id: `${local.kind}-${remote.kind}`,
      local,
      remote,
      priority: pairPriority(local.priority, remote.priority),
      works: pairWorks(local.kind, remote.kind, sc),
    })),
  );
  return [...pairs].sort((x, y) => (x.priority === y.priority ? 0 : x.priority > y.priority ? -1 : 1));
}

/** The pair nominated: the first that works going down the list. */
export const nominatedOf = (pairs: readonly Pair[]): Pair | null => pairs.find((p) => p.works) ?? null;

export const pairLabel = (p: Pair) => `${KIND_NAME[p.local.kind]} ${epText(p.local.addr)} to ${KIND_NAME[p.remote.kind]} ${epText(p.remote.addr)}`;

/** Why a check on this kind of pair works or does not, in words that follow `pairWorks` rule for rule. */
export function pairNote(local: CandKind, remote: CandKind, sc: Scenario): string {
  if (remote === 'relay') return 'the relayed address is public, so it answers';
  if (local === 'relay') return remote === 'srflx' ? 'the relay can reach the peer\'s mapped address' : 'a private address cannot be reached from the relay';
  if (remote === 'host') return local === 'host' && sc.sameLan ? 'both are on one LAN, so the private address answers' : 'a private address on another network cannot be reached';
  if (sc.sameLan) return 'both sit behind one router and this model does not do hairpinning';
  return punch(sc.a, sc.b).connected ? 'the probes cross both NATs: the hole is punched' : 'a NAT drops the probes, so no hole opens';
}

/** Checks made going down the list: every pair up to and including the nominated one (all of them when none works). */
export const checksMade = (pairs: readonly Pair[]): Pair[] => {
  const i = pairs.findIndex((p) => p.works);
  return i < 0 ? [...pairs] : pairs.slice(0, i + 1);
};
