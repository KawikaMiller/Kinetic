import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { sequenceLayout } from '../../core/sequenceLayout';
import { ACTORS } from './frames';
import {
  ANY_TYPE, LOWERED_TTL, NEW_NAME, NEW_NAME_IP, NS_TTL, OLD_IP, RESOLVERS, TIMEOUT_MS, TTL_STEPS, ask, cacheKey, cached, createInternet, exampleZone,
  flipOf, negativeTtl, remaining, resolve, setRecord, type Cache, type Resolver, type ServerId, type TtlPlan,
} from './model';

const kinds = (l: { steps: { kind: string }[] }) => l.steps.map((s) => s.kind);
const withDown = (down: ServerId[]) => ({ ...createInternet(), down });

describe('a cold lookup', () => {
  const net = createInternet();
  const l = resolve(net, {}, 'example.com', 'A', 0);

  it('walks root → .com → authoritative, each referral naming the next servers', () => {
    expect(kinds(l)).toEqual(['query', 'ask', 'referral', 'ask', 'referral', 'ask', 'answer', 'reply']);
    expect(l.steps.filter((s) => s.kind === 'ask').map((s) => s.to)).toEqual(['root', 'tld', 'ns1']);
    expect(l.steps[2].label).toContain('NS for com');
    expect(l.steps[4].label).toBe('NS for example.com: ns1.example.com, ns2.example.com');
    expect(l).toMatchObject({ rcode: 'NOERROR', answers: [OLD_IP] });
  });

  it('caches the answer and both referrals with their own TTLs; the example.com NS TTL matches the zone', () => {
    expect(l.cache[cacheKey('example.com', 'A')]).toMatchObject({ data: OLD_IP, ttl: 3600, cachedAt: 0 });
    expect(l.cache[cacheKey('com', 'NS')]).toMatchObject({ servers: ['tld'], ttl: 172800 });
    expect(l.cache[cacheKey('example.com', 'NS')]).toMatchObject({ servers: ['ns1', 'ns2'], ttl: NS_TTL });
    const zoneNs = exampleZone().records.filter((r) => r.type === 'NS');
    expect(zoneNs).toHaveLength(2);
    expect(zoneNs.every((r) => r.ttl === NS_TTL)).toBe(true);
  });
});

describe('the cache', () => {
  const net = createInternet();
  const warm = resolve(net, {}, 'example.com', 'A', 0).cache;

  it('answers from cache before the TTL runs out and asks again after', () => {
    for (let t = 1; t < 3600; t += 37) {
      const l = resolve(net, warm, 'example.com', 'A', t);
      expect(kinds(l)).toEqual(['query', 'cache-hit', 'reply']);
      expect(l.steps[1].ttl).toBe(3600 - t);
    }
    const after = resolve(net, warm, 'example.com', 'A', 3600);
    // the referral for example.com is still cached, so it goes straight to the zone's servers
    expect(kinds(after)).toEqual(['query', 'ask', 'answer', 'reply']);
    expect(after.steps[1].to).toBe('ns1');
  });

  it('counts each entry down from when it was cached', () => {
    const e = warm[cacheKey('example.com', 'A')];
    expect(remaining(e, 100)).toBe(3500);
    expect(cached(warm, e.key, 3599)).not.toBeNull();
    expect(cached(warm, e.key, 3600)).toBeNull();
  });

  it('another record type in the same zone skips root and .com, using the cached referral', () => {
    const l = resolve(net, warm, 'example.com', 'MX', 10);
    expect(kinds(l)).toEqual(['query', 'ask', 'answer', 'reply']);
    expect(l.answers).toEqual(['10 mail.example.com']);
  });
});

describe('CNAMEs (RFC 1034 §4.3.2)', () => {
  const net = createInternet();

  it('an in-zone target comes back in the same reply: CNAME + A, one round trip to the zone', () => {
    const reply = ask(exampleZone(), 'www.example.com', 'A');
    expect(reply.kind).toBe('answer');
    if (reply.kind !== 'answer') return;
    expect(reply.chain.map((c) => `${c.name}→${c.data}`)).toEqual(['www.example.com→example.com']);
    expect(reply.rrs[0].data).toBe(OLD_IP);

    const l = resolve(net, {}, 'www.example.com', 'A', 0);
    expect(l.steps.filter((s) => s.kind === 'ask' && (s.to === 'ns1' || s.to === 'ns2'))).toHaveLength(1);
    expect(kinds(l)).not.toContain('cname');
    expect(l.answers).toEqual(['www.example.com → example.com', OLD_IP]);
    // both the alias and the target's answer are cached, so later both come from cache
    const again = resolve(net, l.cache, 'www.example.com', 'A', 5);
    expect(kinds(again)).toEqual(['query', 'cache-cname', 'cache-hit', 'reply']);
  });

  it('a target in another zone ends the reply at the CNAME, and the resolver does a second lookup', () => {
    const reply = ask(exampleZone(), 'shop.example.com', 'A');
    expect(reply.kind).toBe('cname');
    const l = resolve(net, {}, 'shop.example.com', 'A', 0);
    expect(kinds(l)).toContain('cname');
    const asks = l.steps.filter((s) => s.kind === 'ask');
    expect(asks.map((s) => s.name)).toEqual(['shop.example.com', 'shop.example.com', 'shop.example.com', 'shop.exmaple.com']);
    expect(asks.at(-1)!.to).toBe('tld');
  });

  it('the typo\'d target is NXDOMAIN from .com, cached for .com\'s negative TTL', () => {
    const l = resolve(net, {}, 'shop.example.com', 'A', 0);
    expect(l.rcode).toBe('NXDOMAIN');
    const nx = l.steps.find((s) => s.kind === 'nxdomain')!;
    expect(nx.from).toBe('tld');
    expect(nx.name).toBe('shop.exmaple.com');
    expect(nx.ttl).toBe(negativeTtl(net.zones.tld.soa));
  });

  it('detects a CNAME loop, whether the server or the resolver meets it', () => {
    const l = resolve(net, {}, 'loop1.example.com', 'A', 0);
    expect(l.rcode).toBe('SERVFAIL');
    expect(kinds(l)).toContain('loop');
  });
});

describe('negative caching (RFC 2308)', () => {
  it('caches a negative answer for min(SOA MINIMUM, SOA TTL): hand-computed cases', () => {
    expect(negativeTtl({ ttl: 3600, minimum: 300 })).toBe(300);
    expect(negativeTtl({ ttl: 900, minimum: 3600 })).toBe(900);
    expect(negativeTtl({ ttl: 86400, minimum: 86400 })).toBe(86400);
    expect(negativeTtl({ ttl: 0, minimum: 3600 })).toBe(0);
    expect(negativeTtl(exampleZone().soa)).toBe(300);
  });

  it('a name created after an NXDOMAIN stays "not found" until the negative entry expires', () => {
    let net = createInternet();
    const miss = resolve(net, {}, NEW_NAME, 'A', 0);
    expect(miss.rcode).toBe('NXDOMAIN');
    const neg = negativeTtl(exampleZone().soa);
    expect(miss.cache[cacheKey(NEW_NAME, ANY_TYPE)]).toMatchObject({ kind: 'negative', ttl: neg });
    net = setRecord(net, NEW_NAME, 'A', NEW_NAME_IP, 3600);
    // the provider's sync: both of the zone's servers have the new record
    expect(net.zones.ns2.records.some((r) => r.name === NEW_NAME)).toBe(true);
    const stale = resolve(net, miss.cache, NEW_NAME, 'A', neg - 1);
    expect(stale.rcode).toBe('NXDOMAIN');
    expect(kinds(stale)).toEqual(['query', 'cache-negative', 'reply']);
    const fresh = resolve(net, miss.cache, NEW_NAME, 'A', neg);
    expect(fresh).toMatchObject({ rcode: 'NOERROR', answers: [NEW_NAME_IP] });
  });

  it('NXDOMAIN covers the whole name: AAAA after an A NXDOMAIN is answered from cache', () => {
    const net = createInternet();
    const a = resolve(net, {}, NEW_NAME, 'A', 0);
    const aaaa = resolve(net, a.cache, NEW_NAME, 'AAAA', 10);
    expect(kinds(aaaa)).toEqual(['query', 'cache-negative', 'reply']);
    expect(aaaa.rcode).toBe('NXDOMAIN');
    expect(aaaa.steps[1].negative).toBe('NXDOMAIN');
  });

  it('NODATA stays per type: the name exists, so another type is still asked', () => {
    expect(ask(exampleZone(), 'mail.example.com', 'AAAA').kind).toBe('nodata');
    expect(ask(exampleZone(), 'nope.example.com', 'AAAA').kind).toBe('nxdomain');
    const net = createInternet();
    const nodata = resolve(net, {}, 'mail.example.com', 'AAAA', 0);
    expect(nodata.rcode).toBe('NOERROR');
    expect(nodata.cache[cacheKey('mail.example.com', 'AAAA')]).toMatchObject({ kind: 'negative', data: 'NODATA' });
    const again = resolve(net, nodata.cache, 'mail.example.com', 'AAAA', 5);
    expect(again.steps[1]).toMatchObject({ kind: 'cache-negative', negative: 'NODATA' });
    const other = resolve(net, nodata.cache, 'mail.example.com', 'A', 5);
    expect(other.answers).toEqual(['203.0.113.25']);
  });
});

describe('name servers that do not answer', () => {
  it('one of two down costs a timeout, not the answer: the resolver falls back to ns2', () => {
    const l = resolve(withDown(['ns1']), {}, 'example.com', 'A', 0);
    expect(l.rcode).toBe('NOERROR');
    const i = l.steps.findIndex((s) => s.kind === 'timeout');
    expect(l.steps[i].to).toBe('ns1');
    expect(l.steps[i + 1]).toMatchObject({ kind: 'ask', to: 'ns2' });
    expect(l.ms).toBeGreaterThan(TIMEOUT_MS);
  });

  it('with every server for the zone down, it times out on each and reports SERVFAIL', () => {
    const l = resolve(withDown(['ns1', 'ns2']), {}, 'example.com', 'A', 0);
    expect(l.rcode).toBe('SERVFAIL');
    expect(l.steps.filter((s) => s.kind === 'timeout').map((s) => s.to)).toEqual(['ns1', 'ns2']);
    expect(l.cache[cacheKey('example.com', 'A')]).toBeUndefined();
  });

  it('a cached answer still works while the servers are down', () => {
    const up = resolve(createInternet(), {}, 'example.com', 'A', 0);
    const l = resolve(withDown(['ns1', 'ns2']), up.cache, 'example.com', 'A', 60);
    expect(l.rcode).toBe('NOERROR');
  });
});

describe('changing a record', () => {
  const plain = (ttl: number): TtlPlan => ({ ttl, lowered: null });

  it('each resolver sees the new address exactly at its last fetch before the change + the TTL', () => {
    for (const ttl of TTL_STEPS) {
      for (const r of RESOLVERS) {
        const f = flipOf(r, plain(ttl));
        expect(f.cachedAt).toBeLessThan(0);
        expect(f.flip).toBe(f.cachedAt + ttl);
        expect(f.flip).toBeGreaterThanOrEqual(0);
        expect(f.flip).toBeLessThanOrEqual(ttl);
        // the last fetch before the change is a whole number of TTLs after the first
        expect((f.cachedAt - r.firstFetch) % ttl).toBe(0);
      }
    }
  });

  /**
   * Independent oracle: step one second at a time; whenever the cached copy has expired the
   * resolver re-fetches, reading the TTL in force at that moment. The flip is the first
   * re-fetch at or after the change (t = 0).
   */
  function simulate(r: Resolver, plan: TtlPlan): number {
    const ttlNow = (t: number) => (plan.lowered && t >= plan.lowered.at ? plan.lowered.ttl : plan.ttl);
    let expires = r.firstFetch + ttlNow(r.firstFetch);
    for (let t = r.firstFetch + 1; ; t++) {
      if (t >= expires) {
        if (t >= 0) return t;
        expires = t + ttlNow(t);
      }
    }
  }

  it('agrees exactly with a second-by-second simulation, with and without a lowered TTL (seeded)', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 400; i++) {
      const r: Resolver = { id: 'x', label: 'x', firstFetch: -1 - Math.floor(rnd() * 5000) };
      const ttl = 1 + Math.floor(rnd() * 900);
      const plans: TtlPlan[] = [
        plain(ttl),
        { ttl, lowered: { ttl: 1 + Math.floor(rnd() * 120), at: -Math.floor(rnd() * 6000) } },
        { ttl, lowered: { ttl: LOWERED_TTL, at: 0 } },
        { ttl, lowered: { ttl: LOWERED_TTL, at: -ttl } },
      ];
      for (const plan of plans) expect(flipOf(r, plan).flip).toBe(simulate(r, plan));
    }
  });

  it('lowering the TTL at the change helps nobody; lowering it a full old TTL ahead helps everyone', () => {
    const ttl = 86400;
    for (const r of RESOLVERS) {
      const never = flipOf(r, plain(ttl)).flip;
      expect(flipOf(r, { ttl, lowered: { ttl: LOWERED_TTL, at: 0 } }).flip).toBe(never);
      const ahead = flipOf(r, { ttl, lowered: { ttl: LOWERED_TTL, at: -ttl } }).flip;
      expect(ahead).toBeLessThanOrEqual(LOWERED_TTL);
      expect(ahead).toBeLessThan(never);
    }
  });

  it('only resolvers that re-fetch after the lowering benefit', () => {
    // lowered at -1,000 s: the office (first fetch -3,000) and home ISP (-1,200) cached before it, the mobile carrier (-90) after it
    const plan = { ttl: 86400, lowered: { ttl: LOWERED_TTL, at: -1000 } };
    for (const r of RESOLVERS) {
      const f = flipOf(r, plan);
      if (r.firstFetch >= -1000) expect(f.ttlHeld).toBe(LOWERED_TTL);
      else expect(f.flip).toBe(flipOf(r, plain(86400)).flip);
    }
  });
});

describe('the ladder', () => {
  it('lays out every lookup on the six lifelines, whatever servers are down', () => {
    for (const down of [[], ['ns1'], ['ns1', 'ns2']] as ServerId[][]) {
      const net = withDown(down);
      let cache: Cache = {};
      for (const [name, type] of [['example.com', 'A'], ['www.example.com', 'A'], ['shop.example.com', 'A'], [NEW_NAME, 'A'], [NEW_NAME, 'AAAA']] as const) {
        const l = resolve(net, cache, name, type, 0);
        cache = l.cache;
        const layout = sequenceLayout(ACTORS, l.steps.map((s, i) => ({ id: String(i), from: s.from, to: s.to, label: s.label })));
        expect(layout.rows).toHaveLength(l.steps.length);
      }
    }
  });
});
