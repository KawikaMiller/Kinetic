/**
 * A fictional DNS for the lesson: three zones (the root, `com`, `example.com`) served by
 * simulated name servers, and an iterative resolver with a TTL cache. Nothing here touches
 * real DNS. example.com has two name servers (RFC 2182 asks for at least two); the resolver
 * tries each before giving up. It follows referrals, caches answers, referrals and negative
 * answers (RFC 2308), follows CNAMEs (detecting loops) and returns SERVFAIL when no server
 * for a zone answers. Latencies are illustrative constants; addresses are documentation ranges.
 */

export type RType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA';

export interface Rr {
  name: string;
  type: RType;
  ttl: number;
  data: string;
}

export interface Soa {
  /** The SOA record's own TTL. */
  ttl: number;
  /** The SOA MINIMUM field: caps how long others may cache a negative answer (RFC 2308). */
  minimum: number;
}

export type ServerId = 'root' | 'tld' | 'ns1' | 'ns2';
export const ZONE_SERVERS: readonly ServerId[] = ['ns1', 'ns2'];

export interface Delegation {
  apex: string;
  /** The child zone's servers, in the order the resolver tries them. */
  servers: ServerId[];
  ns: string[];
  ttl: number;
}

export interface Zone {
  apex: string;
  records: Rr[];
  /** Child zones handed to other servers. */
  delegations: Delegation[];
  soa: Soa;
}

export const SERVER_NAMES: Record<ServerId, string> = {
  root: 'a.root-servers.net', tld: 'a.gtld-servers.net', ns1: 'ns1.example.com', ns2: 'ns2.example.com',
};

/** RFC 2308 §5: a negative answer is cached for the lesser of the SOA's TTL and its MINIMUM field. */
export const negativeTtl = (soa: Soa) => Math.min(soa.minimum, soa.ttl);

export const OLD_IP = '203.0.113.10';
export const NEW_IP = '198.51.100.7';
export const NEW_NAME = 'new.example.com';
export const NEW_NAME_IP = '198.51.100.20';
/** The zone's NS TTL. The .com delegation uses the same value, so the cache and the zone agree. */
export const NS_TTL = 86400;

export function exampleZone(): Zone {
  const r = (name: string, type: RType, data: string, ttl = 3600): Rr => ({ name, type, ttl, data });
  return {
    apex: 'example.com',
    // SOA fields: primary, contact, serial, then refresh / retry / expire (how secondaries sync), then MINIMUM (caps the negative TTL)
    soa: { ttl: 3600, minimum: 300 },
    delegations: [],
    records: [
      r('example.com', 'A', OLD_IP),
      r('example.com', 'AAAA', '2001:db8::10'),
      r('www.example.com', 'CNAME', 'example.com'),
      r('example.com', 'MX', '10 mail.example.com'),
      r('mail.example.com', 'A', '203.0.113.25'),
      r('example.com', 'TXT', '"v=spf1 ip4:203.0.113.0/24 -all"'),
      r('example.com', 'NS', 'ns1.example.com', NS_TTL),
      r('example.com', 'NS', 'ns2.example.com', NS_TTL),
      r('example.com', 'SOA', 'ns1.example.com. hostmaster.example.com. 2026100701 7200 900 1209600 300'),
      r('shop.example.com', 'CNAME', 'shop.exmaple.com'),
      r('loop1.example.com', 'CNAME', 'loop2.example.com'),
      r('loop2.example.com', 'CNAME', 'loop1.example.com'),
    ],
  };
}

export interface Internet {
  zones: Record<ServerId, Zone>;
  /** Servers that don't answer (a timeout). */
  down: ServerId[];
}

export function createInternet(): Internet {
  const example = exampleZone();
  return {
    down: [],
    zones: {
      root: { apex: '', records: [], soa: { ttl: 86400, minimum: 86400 }, delegations: [{ apex: 'com', servers: ['tld'], ns: [SERVER_NAMES.tld], ttl: 172800 }] },
      tld: {
        apex: 'com', records: [], soa: { ttl: 900, minimum: 3600 },
        delegations: [{ apex: 'example.com', servers: [...ZONE_SERVERS], ns: ZONE_SERVERS.map((s) => SERVER_NAMES[s]), ttl: NS_TTL }],
      },
      // both name servers hold the same copy: a provider keeps its own servers in sync
      ns1: example,
      ns2: example,
    },
  };
}

/** Add or replace name/type in example.com (a learner's edit). Both of the zone's servers get it, as a provider's sync would do. */
export function setRecord(net: Internet, name: string, type: RType, data: string, ttl: number): Internet {
  const zone = net.zones.ns1;
  const updated = { ...zone, records: [...zone.records.filter((x) => !(x.name === name && x.type === type)), { name, type, data, ttl }] };
  return { ...net, zones: { ...net.zones, ns1: updated, ns2: updated } };
}

const inZone = (name: string, apex: string) => apex === '' || name === apex || name.endsWith(`.${apex}`);

export type ServerReply =
  | { kind: 'referral'; apex: string; servers: ServerId[]; ns: string[]; ttl: number }
  /** `chain`: the CNAMEs the server followed inside its own zone before reaching the answer. */
  | { kind: 'answer'; chain: Rr[]; rrs: Rr[] }
  /** The chain leaves this server's zone (or loops): the resolver must look the last target up itself. */
  | { kind: 'cname'; chain: Rr[] }
  | { kind: 'nxdomain' | 'nodata'; chain: Rr[]; name: string; soa: Soa };

/**
 * What one server says about name/type. An authoritative server that finds a CNAME whose target
 * is in its own zone keeps going and returns the whole chain plus the answer in one reply
 * (RFC 1034 §4.3.2, step 3a); a target in another zone ends the reply at the CNAME.
 */
export function ask(zone: Zone, name: string, type: RType): ServerReply {
  const chain: Rr[] = [];
  const seen = new Set([name]);
  let cur = name;
  for (;;) {
    const child = zone.delegations.find((d) => inZone(cur, d.apex));
    if (child) return chain.length ? { kind: 'cname', chain } : { kind: 'referral', apex: child.apex, servers: child.servers, ns: child.ns, ttl: child.ttl };
    if (!inZone(cur, zone.apex)) return { kind: 'cname', chain };
    const here = zone.records.filter((x) => x.name === cur);
    const exact = here.filter((x) => x.type === type);
    if (exact.length) return { kind: 'answer', chain, rrs: exact };
    const cname = here.find((x) => x.type === 'CNAME');
    if (!cname) return { kind: here.length ? 'nodata' : 'nxdomain', chain, name: cur, soa: zone.soa };
    chain.push(cname);
    if (seen.has(cname.data)) return { kind: 'cname', chain };
    seen.add(cname.data);
    cur = cname.data;
  }
}

// ── The resolver's cache ────────────────────────────────────────────────

export type CacheKind = 'answer' | 'cname' | 'referral' | 'negative';

/** NXDOMAIN covers the whole name, whatever the type (RFC 2308 §5), so it's cached under this pseudo-type. */
export const ANY_TYPE = '*';

export interface CacheEntry {
  key: string;
  kind: CacheKind;
  name: string;
  type: RType | typeof ANY_TYPE;
  data: string;
  /** For referrals: the zone's servers, in try order. */
  servers?: ServerId[];
  ttl: number;
  cachedAt: number;
}

export type Cache = Readonly<Record<string, CacheEntry>>;

export const cacheKey = (name: string, type: string) => `${name}|${type}`;
export const remaining = (e: CacheEntry, now: number) => e.cachedAt + e.ttl - now;
/** A live entry, or null once its TTL has run out. */
export function cached(cache: Cache, key: string, now: number): CacheEntry | null {
  const e = cache[key];
  return e && remaining(e, now) > 0 ? e : null;
}
export const purge = (cache: Cache, now: number): Cache => Object.fromEntries(Object.entries(cache).filter(([, e]) => remaining(e, now) > 0));

// ── Resolution ──────────────────────────────────────────────────────────

/** Illustrative one-way latencies (ms), not measurements. */
export const LATENCY_MS: Record<'stub' | ServerId, number> = { stub: 2, root: 20, tld: 25, ns1: 30, ns2: 35 };
export const TIMEOUT_MS = 2000;
export const MAX_CNAME_CHAIN = 8;

export type Rcode = 'NOERROR' | 'NXDOMAIN' | 'SERVFAIL';

export type StepKind =
  | 'query' | 'cache-hit' | 'cache-negative' | 'cache-cname' | 'ask' | 'referral' | 'answer' | 'cname' | 'nxdomain' | 'nodata' | 'timeout'
  | 'loop' | 'reply';

export interface Step {
  kind: StepKind;
  from: 'stub' | 'resolver' | ServerId;
  to: 'stub' | 'resolver' | ServerId;
  label: string;
  name: string;
  /** Seconds of TTL left (cache hits) or the TTL just cached. */
  ttl?: number;
  server?: ServerId;
  rcode?: Rcode;
  /** The CNAMEs carried in this reply (answer, cname, nxdomain, nodata). */
  chain?: Rr[];
  /** For cache-negative: which kind of negative answer was cached. */
  negative?: 'NXDOMAIN' | 'NODATA';
}

export interface Lookup {
  name: string;
  type: RType;
  rcode: Rcode;
  answers: string[];
  steps: Step[];
  cache: Cache;
  /** Illustrative total, from LATENCY_MS. */
  ms: number;
}

/** The closest enclosing zone whose servers the cache already knows; the root when none. */
function startServers(cache: Cache, name: string, now: number): ServerId[] {
  const labels = name.split('.');
  for (let i = 0; i < labels.length; i++) {
    const e = cached(cache, cacheKey(labels.slice(i).join('.'), 'NS'), now);
    if (e?.servers) return e.servers;
  }
  return ['root'];
}

const chainText = (chain: readonly Rr[]) => chain.map((c) => `CNAME ${c.data}`).join(', ');

/**
 * Resolve name/type at time `now` (seconds) through `cache`. Returns the steps for the ladder,
 * the final answer and the updated cache. Pure: the same inputs give the same steps.
 */
export function resolve(net: Internet, start: Cache, name: string, type: RType, now: number): Lookup {
  let cache = purge(start, now);
  const steps: Step[] = [];
  const answers: string[] = [];
  let ms = 0;
  const put = (e: Omit<CacheEntry, 'key' | 'cachedAt'>) => {
    const key = cacheKey(e.name, e.type);
    cache = { ...cache, [key]: { ...e, key, cachedAt: now } };
  };
  const finish = (rcode: Rcode): Lookup => {
    ms += LATENCY_MS.stub * 2;
    steps.push({ kind: 'reply', from: 'resolver', to: 'stub', label: rcode === 'NOERROR' ? `${answers.at(-1) ?? 'no records'}` : rcode, name, rcode });
    return { name, type, rcode, answers, steps, cache, ms };
  };
  const seen = new Set<string>();
  /** Cache the CNAMEs a reply carried and note them in the answer; returns the last target, if any. */
  const takeChain = (chain: readonly Rr[]) => {
    for (const c of chain) {
      put({ kind: 'cname', name: c.name, type: 'CNAME', data: c.data, ttl: c.ttl });
      answers.push(`${c.name} → ${c.data}`);
      seen.add(c.name);
    }
    return chain.at(-1)?.data;
  };

  steps.push({ kind: 'query', from: 'stub', to: 'resolver', label: `${name} ${type}?`, name });
  let current = name;
  for (let hop = 0; hop <= MAX_CNAME_CHAIN; hop++) {
    if (seen.has(current)) {
      steps.push({ kind: 'loop', from: 'resolver', to: 'resolver', label: `CNAME loop at ${current}`, name: current });
      return finish('SERVFAIL');
    }
    seen.add(current);

    const hit = cached(cache, cacheKey(current, type), now);
    if (hit?.kind === 'answer') {
      steps.push({ kind: 'cache-hit', from: 'resolver', to: 'resolver', label: `cache: ${hit.data} (${remaining(hit, now)} s left)`, name: current, ttl: remaining(hit, now) });
      answers.push(hit.data);
      return finish('NOERROR');
    }
    const negative = cached(cache, cacheKey(current, ANY_TYPE), now) ?? (hit?.kind === 'negative' ? hit : null);
    if (negative) {
      const what = negative.data === 'NXDOMAIN' ? 'NXDOMAIN' : 'NODATA';
      steps.push({ kind: 'cache-negative', from: 'resolver', to: 'resolver', label: `cache: ${what} (${remaining(negative, now)} s left)`, name: current, ttl: remaining(negative, now), negative: what });
      return finish(what === 'NXDOMAIN' ? 'NXDOMAIN' : 'NOERROR');
    }
    const alias = cached(cache, cacheKey(current, 'CNAME'), now);
    if (alias && type !== 'CNAME') {
      steps.push({ kind: 'cache-cname', from: 'resolver', to: 'resolver', label: `cache: ${current} → ${alias.data}`, name: current, ttl: remaining(alias, now) });
      answers.push(`${current} → ${alias.data}`);
      current = alias.data;
      continue;
    }

    // walk down from the closest zone whose servers are cached, trying each of a zone's servers in turn
    let servers = startServers(cache, current, now);
    for (;;) {
      const server = servers.find((s) => !net.down.includes(s));
      for (const s of server ? servers.slice(0, servers.indexOf(server)) : servers) {
        ms += TIMEOUT_MS;
        steps.push({ kind: 'timeout', from: 'resolver', to: s, label: `${current} ${type}? (no answer)`, name: current, server: s });
      }
      if (!server) return finish('SERVFAIL');
      ms += LATENCY_MS[server] * 2;
      steps.push({ kind: 'ask', from: 'resolver', to: server, label: `${current} ${type}?`, name: current, server });
      const reply = ask(net.zones[server], current, type);
      if (reply.kind === 'referral') {
        put({ kind: 'referral', name: reply.apex, type: 'NS', data: reply.ns.join(', '), servers: reply.servers, ttl: reply.ttl });
        steps.push({ kind: 'referral', from: server, to: 'resolver', label: `NS for ${reply.apex}: ${reply.ns.join(', ')}`, name: current, server, ttl: reply.ttl });
        servers = reply.servers;
        continue;
      }
      const chain = reply.chain;
      const target = takeChain(chain) ?? current;
      if (reply.kind === 'answer') {
        const rr = reply.rrs[0];
        put({ kind: 'answer', name: target, type, data: rr.data, ttl: rr.ttl });
        const label = chain.length ? `${chainText(chain)} + ${type} ${rr.data}` : `${type} ${rr.data}`;
        steps.push({ kind: 'answer', from: server, to: 'resolver', label, name: target, server, ttl: rr.ttl, chain });
        answers.push(rr.data);
        return finish('NOERROR');
      }
      if (reply.kind === 'cname') {
        steps.push({ kind: 'cname', from: server, to: 'resolver', label: chainText(chain), name: current, server, ttl: chain.at(-1)!.ttl, chain });
        current = target;
        break;
      }
      const ttl = negativeTtl(reply.soa);
      const what = reply.kind === 'nxdomain' ? 'NXDOMAIN' : 'NODATA';
      put({ kind: 'negative', name: reply.name, type: reply.kind === 'nxdomain' ? ANY_TYPE : type, data: what, ttl });
      const label = `${chain.length ? `${chainText(chain)}, ` : ''}${what} (cache ${ttl} s)`;
      steps.push({ kind: reply.kind, from: server, to: 'resolver', label, name: reply.name, server, ttl, chain });
      return finish(reply.kind === 'nxdomain' ? 'NXDOMAIN' : 'NOERROR');
    }
  }
  steps.push({ kind: 'loop', from: 'resolver', to: 'resolver', label: `CNAME chain longer than ${MAX_CNAME_CHAIN}`, name: current });
  return finish('SERVFAIL');
}

// ── Changing a record: who sees what, when ──────────────────────────────

export interface Resolver {
  id: string;
  label: string;
  /** When this resolver first fetched the record, in seconds relative to the change (negative = before). */
  firstFetch: number;
}

/** Three resolvers that happened to cache the old answer at different times (illustrative). */
export const RESOLVERS: readonly Resolver[] = [
  { id: 'office', label: 'Office', firstFetch: -3000 },
  { id: 'isp', label: 'Home ISP', firstFetch: -1200 },
  { id: 'mobile', label: 'Mobile carrier', firstFetch: -90 },
];

export interface TtlPlan {
  /** The record's TTL before any lowering. */
  ttl: number;
  /** Lowered TTL and when it was lowered (relative to the change), or null for never. */
  lowered: { ttl: number; at: number } | null;
}

/** The TTL a fetch at time t gets. */
const ttlAt = (plan: TtlPlan, t: number) => (plan.lowered && t >= plan.lowered.at ? plan.lowered.ttl : plan.ttl);

/**
 * A resolver that keeps being asked re-fetches each time its cached copy expires. It sees the
 * new address at its first fetch at or after the change (t = 0): nothing pushes into resolver caches, so nothing
 * tells a resolver early.
 */
export interface Flip {
  resolver: Resolver;
  /** The last fetch before the change: it holds the old answer from here. */
  cachedAt: number;
  ttlHeld: number;
  /** When it first serves the new address. */
  flip: number;
}

export function flipOf(r: Resolver, plan: TtlPlan): Flip {
  let t = r.firstFetch;
  for (;;) {
    const ttl = ttlAt(plan, t);
    if (t + ttl >= 0) return { resolver: r, cachedAt: t, ttlHeld: ttl, flip: t + ttl };
    t += ttl;
  }
}

export const TTL_STEPS = [60, 300, 900, 3600, 14400, 86400] as const;
export const LOWERED_TTL = 60;
