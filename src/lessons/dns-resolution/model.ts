/**
 * A fictional DNS for the lesson: three zones (the root, `com`, `example.com`) served by
 * simulated name servers, and an iterative resolver with a TTL cache. Nothing here touches
 * real DNS. The resolver follows referrals, caches answers, referrals and negative answers
 * (RFC 2308), follows CNAMEs (detecting loops) and gives up with SERVFAIL when a server
 * doesn't answer. Latencies are illustrative constants; addresses are documentation ranges.
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
  /** The SOA MINIMUM field: how long others may cache "this name doesn't exist". */
  minimum: number;
}

export type ServerId = 'root' | 'tld' | 'auth';

export interface Zone {
  apex: string;
  server: ServerId;
  records: Rr[];
  /** Child zones handed to another server. */
  delegations: { apex: string; server: ServerId; ns: string; ttl: number }[];
  soa: Soa;
}

export const SERVER_NAMES: Record<ServerId, string> = { root: 'a.root-servers.net', tld: 'a.gtld-servers.net', auth: 'ns1.example.com' };

/** RFC 2308 §5: a negative answer is cached for the lesser of the SOA's TTL and its MINIMUM field. */
export const negativeTtl = (soa: Soa) => Math.min(soa.minimum, soa.ttl);

export const OLD_IP = '203.0.113.10';
export const NEW_IP = '198.51.100.7';
export const NEW_NAME = 'new.example.com';
export const NEW_NAME_IP = '198.51.100.20';

export function exampleZone(): Zone {
  const r = (name: string, type: RType, data: string, ttl = 3600): Rr => ({ name, type, ttl, data });
  return {
    apex: 'example.com',
    server: 'auth',
    soa: { ttl: 3600, minimum: 300 },
    delegations: [],
    records: [
      r('example.com', 'A', OLD_IP),
      r('example.com', 'AAAA', '2001:db8::10'),
      r('www.example.com', 'CNAME', 'example.com'),
      r('example.com', 'MX', '10 mail.example.com'),
      r('mail.example.com', 'A', '203.0.113.25'),
      r('example.com', 'TXT', '"v=spf1 ip4:203.0.113.0/24 -all"'),
      r('example.com', 'NS', 'ns1.example.com', 86400),
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
  return {
    down: [],
    zones: {
      root: { apex: '', server: 'root', records: [], soa: { ttl: 86400, minimum: 86400 }, delegations: [{ apex: 'com', server: 'tld', ns: SERVER_NAMES.tld, ttl: 172800 }] },
      tld: { apex: 'com', server: 'tld', records: [], soa: { ttl: 900, minimum: 3600 }, delegations: [{ apex: 'example.com', server: 'auth', ns: SERVER_NAMES.auth, ttl: 172800 }] },
      auth: exampleZone(),
    },
  };
}

/** Add or replace the records of `name`/`type` at the authoritative server (a learner's edit). */
export function setRecord(net: Internet, name: string, type: RType, data: string, ttl: number): Internet {
  const zone = net.zones.auth;
  const records = [...zone.records.filter((x) => !(x.name === name && x.type === type)), { name, type, data, ttl }];
  return { ...net, zones: { ...net.zones, auth: { ...zone, records } } };
}

const inZone = (name: string, apex: string) => apex === '' || name === apex || name.endsWith(`.${apex}`);

type ServerReply =
  | { kind: 'answer'; rrs: Rr[] }
  | { kind: 'cname'; rr: Rr }
  | { kind: 'referral'; apex: string; server: ServerId; ns: string; ttl: number }
  | { kind: 'nxdomain'; zone: string; soa: Soa }
  | { kind: 'nodata'; zone: string; soa: Soa };

/** What one server says about name/type: its records, a CNAME, a referral down the tree, or "no such name". */
export function ask(zone: Zone, name: string, type: RType): ServerReply {
  const child = zone.delegations.find((d) => inZone(name, d.apex));
  if (child) return { kind: 'referral', apex: child.apex, server: child.server, ns: child.ns, ttl: child.ttl };
  const here = zone.records.filter((x) => x.name === name);
  const exact = here.filter((x) => x.type === type);
  if (exact.length) return { kind: 'answer', rrs: exact };
  const cname = here.find((x) => x.type === 'CNAME');
  if (cname) return { kind: 'cname', rr: cname };
  return here.length ? { kind: 'nodata', zone: zone.apex, soa: zone.soa } : { kind: 'nxdomain', zone: zone.apex, soa: zone.soa };
}

// ── The resolver's cache ────────────────────────────────────────────────

export type CacheKind = 'answer' | 'cname' | 'referral' | 'negative';

export interface CacheEntry {
  key: string;
  kind: CacheKind;
  name: string;
  type: RType | 'NS';
  data: string;
  /** For referrals: which server serves the zone. */
  server?: ServerId;
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
export const LATENCY_MS: Record<'stub' | ServerId, number> = { stub: 2, root: 20, tld: 25, auth: 30 };
export const TIMEOUT_MS = 2000;
export const MAX_TRIES = 2;
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

/** Closest enclosing zone the cache already knows a server for; the root when none. */
function startServer(cache: Cache, name: string, now: number): ServerId {
  const labels = name.split('.');
  for (let i = 0; i < labels.length; i++) {
    const e = cached(cache, cacheKey(labels.slice(i).join('.'), 'NS'), now);
    if (e?.server) return e.server;
  }
  return 'root';
}

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

  steps.push({ kind: 'query', from: 'stub', to: 'resolver', label: `${name} ${type}?`, name });
  const seen = new Set<string>();
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
    if (hit?.kind === 'negative') {
      steps.push({ kind: 'cache-negative', from: 'resolver', to: 'resolver', label: `cache: ${hit.data} (${remaining(hit, now)} s left)`, name: current, ttl: remaining(hit, now) });
      return finish(hit.data === 'NXDOMAIN' ? 'NXDOMAIN' : 'NOERROR');
    }
    const alias = cached(cache, cacheKey(current, 'CNAME'), now);
    if (alias && type !== 'CNAME') {
      steps.push({ kind: 'cache-cname', from: 'resolver', to: 'resolver', label: `cache: ${current} → ${alias.data}`, name: current, ttl: remaining(alias, now) });
      answers.push(`${current} → ${alias.data}`);
      current = alias.data;
      continue;
    }

    // walk down from the closest known server
    let server = startServer(cache, current, now);
    for (;;) {
      let tries = 0;
      while (net.down.includes(server) && tries < MAX_TRIES) {
        tries++;
        ms += TIMEOUT_MS;
        steps.push({ kind: 'timeout', from: 'resolver', to: server, label: `${current} ${type}? (try ${tries})`, name: current, server });
      }
      if (net.down.includes(server)) return finish('SERVFAIL');
      ms += LATENCY_MS[server] * 2;
      steps.push({ kind: 'ask', from: 'resolver', to: server, label: `${current} ${type}?`, name: current, server });
      const reply = ask(net.zones[server], current, type);
      if (reply.kind === 'referral') {
        put({ kind: 'referral', name: reply.apex, type: 'NS', data: reply.ns, server: reply.server, ttl: reply.ttl });
        steps.push({ kind: 'referral', from: server, to: 'resolver', label: `ask ${reply.ns} (NS for ${reply.apex})`, name: current, server, ttl: reply.ttl });
        server = reply.server;
        continue;
      }
      if (reply.kind === 'answer') {
        const rr = reply.rrs[0];
        put({ kind: 'answer', name: current, type, data: rr.data, ttl: rr.ttl });
        steps.push({ kind: 'answer', from: server, to: 'resolver', label: `${type} ${rr.data}`, name: current, server, ttl: rr.ttl });
        answers.push(rr.data);
        return finish('NOERROR');
      }
      if (reply.kind === 'cname') {
        put({ kind: 'cname', name: current, type: 'CNAME', data: reply.rr.data, ttl: reply.rr.ttl });
        steps.push({ kind: 'cname', from: server, to: 'resolver', label: `CNAME ${reply.rr.data}`, name: current, server, ttl: reply.rr.ttl });
        answers.push(`${current} → ${reply.rr.data}`);
        current = reply.rr.data;
        break;
      }
      const ttl = negativeTtl(reply.soa);
      const what = reply.kind === 'nxdomain' ? 'NXDOMAIN' : 'NODATA';
      put({ kind: 'negative', name: current, type, data: what, ttl });
      steps.push({ kind: reply.kind, from: server, to: 'resolver', label: `${what} (cache ${ttl} s)`, name: current, server, ttl });
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
 * new address at its first fetch at or after the change (t = 0): there is no push, so nothing
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
