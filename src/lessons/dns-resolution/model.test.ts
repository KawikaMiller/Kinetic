import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { sequenceLayout } from '../../core/sequenceLayout';
import {
  LOWERED_TTL, MAX_TRIES, NEW_IP, NEW_NAME, NEW_NAME_IP, OLD_IP, RESOLVERS, TTL_STEPS, ask, cacheKey, cached, createInternet, exampleZone,
  flipOf, negativeTtl, remaining, resolve, setRecord, type Cache, type Resolver,
} from './model';

const kinds = (l: { steps: { kind: string }[] }) => l.steps.map((s) => s.kind);

describe('a cold lookup', () => {
  const net = createInternet();
  const l = resolve(net, {}, 'example.com', 'A', 0);

  it('walks root → .com → authoritative, each referral naming the next server', () => {
    expect(kinds(l)).toEqual(['query', 'ask', 'referral', 'ask', 'referral', 'ask', 'answer', 'reply']);
    expect(l.steps.filter((s) => s.kind === 'ask').map((s) => s.to)).toEqual(['root', 'tld', 'auth']);
    expect(l.steps[2].label).toContain('NS for com');
    expect(l.steps[4].label).toContain('NS for example.com');
    expect(l).toMatchObject({ rcode: 'NOERROR', answers: [OLD_IP] });
  });

  it('caches the answer and both referrals with their own TTLs', () => {
    expect(l.cache[cacheKey('example.com', 'A')]).toMatchObject({ data: OLD_IP, ttl: 3600, cachedAt: 0 });
    expect(l.cache[cacheKey('com', 'NS')]).toMatchObject({ server: 'tld', ttl: 172800 });
    expect(l.cache[cacheKey('example.com', 'NS')]).toMatchObject({ server: 'auth', ttl: 172800 });
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
    // the referral for example.com is still cached, so it goes straight to the authoritative server
    expect(kinds(after)).toEqual(['query', 'ask', 'answer', 'reply']);
    expect(after.steps[1].to).toBe('auth');
  });

  it('counts each entry down from when it was cached', () => {
    const e = warm[cacheKey('example.com', 'A')];
    expect(remaining(e, 100)).toBe(3500);
    expect(cached(warm, e.key, 3599)).not.toBeNull();
    expect(cached(warm, e.key, 3600)).toBeNull();
  });

  it('a different name in the same zone skips root and .com (seeded order of lookups)', () => {
    const l = resolve(net, warm, 'example.com', 'MX', 10);
    expect(kinds(l)).toEqual(['query', 'ask', 'answer', 'reply']);
    expect(l.answers).toEqual(['10 mail.example.com']);
  });
});

describe('CNAMEs', () => {
  const net = createInternet();

  it('follows www → example.com with a second lookup', () => {
    const l = resolve(net, {}, 'www.example.com', 'A', 0);
    expect(kinds(l)).toContain('cname');
    expect(l.answers).toEqual(['www.example.com → example.com', OLD_IP]);
    const asks = l.steps.filter((s) => s.kind === 'ask').map((s) => s.name);
    expect(asks.at(-1)).toBe('example.com');
    expect(l.rcode).toBe('NOERROR');
    // later, both links come from cache
    const again = resolve(net, l.cache, 'www.example.com', 'A', 5);
    expect(kinds(again)).toEqual(['query', 'cache-cname', 'cache-hit', 'reply']);
  });

  it('a typo in the CNAME target ends in NXDOMAIN from .com', () => {
    const l = resolve(net, {}, 'shop.example.com', 'A', 0);
    expect(l.rcode).toBe('NXDOMAIN');
    const nx = l.steps.find((s) => s.kind === 'nxdomain')!;
    expect(nx.from).toBe('tld');
    expect(nx.name).toBe('shop.exmaple.com');
    expect(nx.ttl).toBe(negativeTtl(net.zones.tld.soa));
  });

  it('detects a CNAME loop', () => {
    const l = resolve(net, {}, 'loop1.example.com', 'A', 0);
    expect(l.rcode).toBe('SERVFAIL');
    expect(kinds(l)).toContain('loop');
  });
});

describe('negative caching (RFC 2308)', () => {
  it('caches NXDOMAIN for min(SOA MINIMUM, SOA TTL)', () => {
    expect(negativeTtl({ ttl: 3600, minimum: 300 })).toBe(300);
    expect(negativeTtl({ ttl: 900, minimum: 3600 })).toBe(900);
    const rnd = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const ttl = Math.floor(rnd() * 90000);
      const minimum = Math.floor(rnd() * 90000);
      expect(negativeTtl({ ttl, minimum })).toBe(Math.min(ttl, minimum));
    }
  });

  it('a name created after an NXDOMAIN stays "not found" until the negative entry expires', () => {
    let net = createInternet();
    const miss = resolve(net, {}, NEW_NAME, 'A', 0);
    expect(miss.rcode).toBe('NXDOMAIN');
    const neg = negativeTtl(exampleZone().soa);
    expect(miss.cache[cacheKey(NEW_NAME, 'A')]).toMatchObject({ kind: 'negative', ttl: neg });
    net = setRecord(net, NEW_NAME, 'A', NEW_NAME_IP, 3600);
    const stale = resolve(net, miss.cache, NEW_NAME, 'A', neg - 1);
    expect(stale.rcode).toBe('NXDOMAIN');
    expect(kinds(stale)).toEqual(['query', 'cache-negative', 'reply']);
    const fresh = resolve(net, miss.cache, NEW_NAME, 'A', neg);
    expect(fresh).toMatchObject({ rcode: 'NOERROR', answers: [NEW_NAME_IP] });
  });

  it('a name that exists without the asked type is NODATA, not NXDOMAIN', () => {
    expect(ask(exampleZone(), 'mail.example.com', 'AAAA').kind).toBe('nodata');
    expect(ask(exampleZone(), 'nope.example.com', 'AAAA').kind).toBe('nxdomain');
  });
});

describe('a server that does not answer', () => {
  it('retries, then gives SERVFAIL, and caches nothing for the name', () => {
    const net = { ...createInternet(), down: ['auth' as const] };
    const l = resolve(net, {}, 'example.com', 'A', 0);
    expect(l.rcode).toBe('SERVFAIL');
    expect(l.steps.filter((s) => s.kind === 'timeout')).toHaveLength(MAX_TRIES);
    expect(l.cache[cacheKey('example.com', 'A')]).toBeUndefined();
  });

  it('a cached answer still works while the server is down', () => {
    const up = resolve(createInternet(), {}, 'example.com', 'A', 0);
    const l = resolve({ ...createInternet(), down: ['auth'] }, up.cache, 'example.com', 'A', 60);
    expect(l.rcode).toBe('NOERROR');
  });
});

describe('changing a record', () => {
  const plain = (ttl: number) => ({ ttl, lowered: null });

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

  it('agrees with a second-by-second simulation of a resolver that re-fetches on expiry (seeded)', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 300; i++) {
      const r: Resolver = { id: 'x', label: 'x', firstFetch: -1 - Math.floor(rnd() * 5000) };
      const ttl = 1 + Math.floor(rnd() * 900);
      let expires = r.firstFetch + ttl;
      let flip = -1;
      for (let t = r.firstFetch + 1; flip < 0; t++) {
        if (t >= expires) {
          if (t >= 0) flip = t;
          expires = t + ttl;
        }
      }
      expect(flipOf(r, plain(ttl)).flip).toBe(flip);
    }
  });

  it('lowering the TTL at the change helps nobody; lowering it a full old TTL ahead helps everyone', () => {
    const ttl = 86400;
    for (const r of RESOLVERS) {
      const never = flipOf(r, plain(ttl)).flip;
      expect(flipOf(r, { ttl, lowered: { ttl: LOWERED_TTL, at: 0 } }).flip).toBe(never);
      const ahead = flipOf(r, { ttl, lowered: { ttl: LOWERED_TTL, at: -ttl - 3600 } }).flip;
      expect(ahead).toBeLessThanOrEqual(LOWERED_TTL);
      expect(ahead).toBeLessThan(never);
    }
  });

  it('only resolvers that re-fetch after the lowering benefit', () => {
    // lowered 1,000 s before the change: the mobile resolver (fetched at -90) and the ISP one (-1,200) had cached before it
    const plan = { ttl: 86400, lowered: { ttl: LOWERED_TTL, at: -1000 } };
    for (const r of RESOLVERS) {
      const f = flipOf(r, plan);
      if (r.firstFetch >= -1000) expect(f.ttlHeld).toBe(LOWERED_TTL);
      else expect(f.flip).toBe(flipOf(r, plain(86400)).flip);
    }
  });
});

describe('the ladder', () => {
  it('lays out every lookup on five lifelines', () => {
    const actors = ['stub', 'resolver', 'root', 'tld', 'auth'].map((id) => ({ id, label: id }));
    const net = createInternet();
    let cache: Cache = {};
    for (const name of ['example.com', 'www.example.com', 'shop.example.com', NEW_NAME]) {
      const l = resolve(net, cache, name, 'A', 0);
      cache = l.cache;
      const layout = sequenceLayout(actors, l.steps.map((s, i) => ({ id: String(i), from: s.from, to: s.to, label: s.label })));
      expect(layout.rows).toHaveLength(l.steps.length);
    }
    expect(NEW_IP).not.toBe(OLD_IP);
  });
});
