/**
 * Scene 4: a second AS announces the same prefix, or a more specific one inside it. Each prefix is
 * propagated on its own (bgp.ts); an AS then forwards a packet by the longest prefix it holds a route for
 * (core/ipv4 longestPrefixMatch). Route origin validation (RPKI: a ROA lists which AS may originate a prefix
 * and how long a prefix it may announce) is shown, not run: no ROA is fetched from anywhere.
 */
import { contains, ipToString, ipv4, longestPrefixMatch, networkOf, parseCidr } from '../../core/ipv4';
import type { FieldParse } from '../../core/parse';
import { ASES, DEFAULT_HIJACKER, GRAPH, ORIGIN, ROV_ORDER, type Asn } from './asgraph';
import { propagate, finalRound, type BgpRun, type Route } from './bgp';

/** The prefix the origin owns (a documentation range). */
export const BASE_NET = ipv4('203.0.113.0');
export const BASE_LEN = 24;
export const PREFIX_LEN_RANGE = { min: 24, max: 28 } as const;
export const VALIDATOR_MAX = ROV_ORDER.length;

export interface Roa {
  net: number;
  prefix: number;
  maxLength: number;
  origin: Asn;
}
export type Validity = 'valid' | 'invalid' | 'not-found';

/**
 * Origin validation of one announcement against a ROA list (the idea of RFC 6811, from memory): no ROA covers the
 * prefix, not found (still accepted); a covering ROA names this origin and allows this length, valid; otherwise invalid.
 */
export function validate(roas: readonly Roa[], net: number, len: number, origin: Asn): Validity {
  const covering = roas.filter((r) => r.prefix <= len && contains(r.net, r.prefix, net));
  if (covering.length === 0) return 'not-found';
  return covering.some((r) => r.origin === origin && len <= r.maxLength) ? 'valid' : 'invalid';
}

export type Kind = 'hijack' | 'anycast';
export interface HijackSetup {
  announcer: Asn;
  kind: Kind;
  /** The prefix the second AS announces, as typed. */
  prefixText: string;
  /** The second AS puts the true origin at the end of its path (only a hijacker does). */
  forged: boolean;
  /** How many ASes of ROV_ORDER validate. */
  validators: number;
}

export const DEFAULT_HIJACK: HijackSetup = { announcer: DEFAULT_HIJACKER, kind: 'hijack', prefixText: '203.0.113.0/25', forged: false, validators: 0 };

export interface Announced {
  net: number;
  len: number;
}

/** The typed prefix, or why it is refused: it must sit inside the origin's /24, be 24 to 28 bits long and have no host bits set. */
export function parseAnnounced(text: string): FieldParse<Announced> {
  const r = parseCidr(text);
  if (!r.ok) return r;
  const { addr, prefix } = r.value;
  if (prefix < PREFIX_LEN_RANGE.min || prefix > PREFIX_LEN_RANGE.max) {
    return { ok: false, error: `A /${prefix} is outside what this lesson announces: use a prefix from /${PREFIX_LEN_RANGE.min} to /${PREFIX_LEN_RANGE.max}.` };
  }
  if (!contains(BASE_NET, BASE_LEN, addr)) {
    return { ok: false, error: `${ipToString(addr)}/${prefix} is outside 203.0.113.0/24, the documentation range this lesson announces from.` };
  }
  if (networkOf(addr, prefix) !== addr) {
    return { ok: false, error: `${ipToString(addr)}/${prefix} has host bits set: did you mean ${ipToString(networkOf(addr, prefix))}/${prefix}?` };
  }
  return { ok: true, value: { net: addr, len: prefix } };
}

export const prefixLabel = (a: Announced) => `${ipToString(a.net)}/${a.len}`;

export const roasFor = (s: HijackSetup): Roa[] => {
  const roas: Roa[] = [{ net: BASE_NET, prefix: BASE_LEN, maxLength: BASE_LEN, origin: ORIGIN }];
  if (s.kind === 'anycast') roas.push({ net: BASE_NET, prefix: BASE_LEN, maxLength: BASE_LEN, origin: s.announcer });
  return roas;
};

export type Outcome = 'origin' | 'other' | 'lost';
export interface Reach {
  outcome: Outcome;
  /** The AS the packet ends at, or null when it is lost. */
  at: Asn | null;
  hops: Asn[];
}

interface Held {
  net: number;
  prefix: number;
  route: Route;
}

export interface HijackResult {
  announced: Announced;
  destination: number;
  roas: Roa[];
  validity: Validity;
  /** The propagation of the origin's /24, and of the second announcement when it is a different prefix. */
  base: BgpRun;
  extra: BgpRun | null;
  reach: Record<Asn, Reach>;
  /** ASes (not the announcer) whose packets end at the second announcer. */
  captured: Asn[];
  validating: Asn[];
}

/** An address inside every prefix of length 24-28 the lesson announces from: its network plus 5. */
export const destinationOf = (a: Announced) => a.net + 5;

export function validatorsOf(k: number): Asn[] {
  return ROV_ORDER.slice(0, Math.max(0, Math.min(ROV_ORDER.length, k)));
}

/** Forwarding at `asn`: the route of the longest prefix it holds that contains `dest` (core/ipv4). */
export function forwardingRoute(held: readonly Held[], dest: number): Held | null {
  return longestPrefixMatch(held, dest);
}

export function hijackResult(s: HijackSetup, announced: Announced): HijackResult {
  const roas = roasFor(s);
  const validating = validatorsOf(s.validators);
  const equal = announced.len === BASE_LEN && announced.net === BASE_NET;
  const second = { asn: s.announcer, tail: s.kind === 'hijack' && s.forged ? [ORIGIN] : [] };
  const rejectsFor = (net: number, len: number) => (me: Asn, path: readonly Asn[]) =>
    validating.includes(me) && validate(roas, net, len, path[path.length - 1]) === 'invalid';
  const base = propagate({
    graph: GRAPH, origins: equal ? [{ asn: ORIGIN }, second] : [{ asn: ORIGIN }], policy: 'valley-free', leaker: null, prefs: {}, rejects: rejectsFor(BASE_NET, BASE_LEN),
  });
  const extra = equal ? null : propagate({ graph: GRAPH, origins: [second], policy: 'valley-free', leaker: null, prefs: {}, rejects: rejectsFor(announced.net, announced.len) });
  const dest = destinationOf(announced);
  const bestOf = (run: BgpRun, a: Asn) => finalRound(run).best[a];
  const heldAt = (a: Asn): Held[] => {
    const out: Held[] = [];
    const b = bestOf(base, a);
    if (b) out.push({ net: BASE_NET, prefix: BASE_LEN, route: b });
    const e = extra ? bestOf(extra, a) : null;
    if (e && extra) out.push({ net: announced.net, prefix: announced.len, route: e });
    return out;
  };
  const reach: Record<Asn, Reach> = {};
  for (const start of ASES) {
    const hops = [start];
    let at = start;
    let out: Reach | null = null;
    while (out === null) {
      const hit = forwardingRoute(heldAt(at), dest);
      if (!hit) out = { outcome: 'lost', at: null, hops };
      else if (hit.route.rel === 'origin') out = { outcome: at === ORIGIN ? 'origin' : 'other', at, hops };
      else if (hops.length > ASES.length) out = { outcome: 'lost', at: null, hops };
      else {
        at = hit.route.via as Asn;
        hops.push(at);
      }
    }
    reach[start] = out;
  }
  const captured = ASES.filter((a) => a !== s.announcer && reach[a].outcome === 'other');
  return { announced, destination: dest, roas, validity: validate(roas, announced.net, announced.len, second.tail.length > 0 ? ORIGIN : s.announcer), base, extra, reach, captured, validating };
}
