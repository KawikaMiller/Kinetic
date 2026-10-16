import { describe, expect, it } from 'vitest';
import { ipv4, longestPrefixMatch } from '../../core/ipv4';
import { mulberry32 } from '../../core/random';
import { ASES, EDGES, GRAPH, LEAKER, ORIGIN, ROV_ORDER, THIN_CAPACITY, capacityOf, edgeId, neighboursOf, relOf } from './asgraph';
import { DEFAULT_PREF, PREF_RANGE, better, decidedBy, exportsTo, finalRound, isValleyFree, linkLoads, pathLinks, prefKey, propagate, type Config, type Route } from './bgp';
import { BASE_NET, DEFAULT_HIJACK, hijackResult, parseAnnounced, roasFor, validate, validatorsOf, type HijackSetup, type Roa } from './hijack';
import { announcedOf, baseConfig } from './init';
import { bestClassByEnumeration, randomValleyFreeGraph, threePhase } from './testkit';

const HIJACKER = DEFAULT_HIJACK.announcer;
const cfgOn = (graph = GRAPH, origin = ORIGIN, over: Partial<Config> = {}): Config => ({ graph, origins: [{ asn: origin }], policy: 'valley-free', leaker: null, prefs: {}, ...over });
const pathsOf = (cfg: Config) => {
  const run = propagate(cfg);
  expect(run.settled).toBe(true);
  return finalRound(run).best;
};

describe('the lesson\'s network, hand-worked', () => {
  const best = pathsOf(baseConfig());
  const p = (a: number) => best[a]?.path ?? null;

  it('valley-free routes to AS64500\'s prefix: customers up, one peer hop, then down', () => {
    // 64498 hears it from its customer 64500; 64496 from its customer 64498; 64497 from its peer 64496 (a peer route goes down to customers only);
    // 64499 from its peer 64498; 64502 and 64501 and 64503 get provider routes, the shortest available.
    expect(p(64500)).toEqual([]);
    expect(p(64498)).toEqual([64500]);
    expect(p(64496)).toEqual([64498, 64500]);
    expect(p(64497)).toEqual([64496, 64498, 64500]);
    expect(p(64499)).toEqual([64498, 64500]);
    expect(p(64502)).toEqual([64498, 64500]);
    expect(p(64501)).toEqual([64499, 64498, 64500]);
    expect(p(64503)).toEqual([64496, 64498, 64500]);
  });

  it('AS64498 is sent its own route back by its provider and discards it as a loop', () => {
    const list = finalRound(propagate(baseConfig())).candidates[64498];
    expect(list.map((c) => [c.from, c.status])).toEqual([[64496, 'loop'], [64500, 'chosen']]);
    expect(list[0].path).toEqual([64496, 64498, 64500]);
  });

  it('settles in 3 rounds: the origin\'s neighbour, then up and across, then down', () => {
    const run = propagate(baseConfig());
    expect(run.roundsToConverge).toBe(3);
    expect(run.rounds[1].changed).toEqual([64498]);
    expect(run.rounds[1].updates.map((u) => [u.from, u.to])).toEqual([[64500, 64498]]);
  });

  it('with AS64502 leaking, AS64499 takes the customer route through it and AS64497 follows (a customer route beats a peer route)', () => {
    const leaked = pathsOf(baseConfig({ policy: 'leak' }));
    expect(leaked[64499]?.path).toEqual([64502, 64498, 64500]);
    expect(leaked[64497]?.path).toEqual([64499, 64502, 64498, 64500]);
    expect(leaked[64496]?.path).toEqual([64498, 64500]);
    const loads = linkLoads({ graph: GRAPH }, leaked);
    expect(loads.get(edgeId(64498, 64502))).toBe(4);
    expect(loads.get(edgeId(64499, 64502))).toBe(3);
    expect(linkLoads({ graph: GRAPH }, best).get(edgeId(64498, 64502))).toBe(1);
    expect(4).toBeGreaterThan(THIN_CAPACITY);
    expect(capacityOf(64498, 64502)).toBe(THIN_CAPACITY);
  });

  it('the decision process compares local preference first: a provider route with preference 350 beats a shorter peer route', () => {
    const edited = pathsOf(baseConfig({ prefs: { [prefKey(64499, 64497)]: 350 } }));
    expect(edited[64499]?.path).toEqual([64497, 64496, 64498, 64500]);
    const a: Route = { path: [1], via: 1, rel: 'provider', pref: 350 };
    const b: Route = { path: [2, 3], via: 2, rel: 'peer', pref: 200 };
    expect(better(a, b)).toBe(true);
    expect(decidedBy(a, b)).toBe('local-pref');
    expect(decidedBy({ ...a, pref: 200 }, b)).toBe('path-length');
    expect(decidedBy({ ...a, pref: 200, path: [1, 9] }, b)).toBe('neighbour');
    expect(better({ ...a, pref: 200, path: [1, 9] }, b)).toBe(true);
  });

  it('every single-AS preference edit settles, and the origin never changes its own route', () => {
    let runs = 0;
    for (const as of ASES) {
      if (as === ORIGIN) continue;
      const nbrs = neighboursOf(EDGES, as);
      const values: number[] = [];
      for (let v = PREF_RANGE.min; v <= PREF_RANGE.max; v += PREF_RANGE.step) values.push(v);
      const combos = (i: number): Record<string, number>[] => (i === nbrs.length ? [{}] : combos(i + 1).flatMap((rest) => values.map((v) => ({ ...rest, [prefKey(as, nbrs[i].asn)]: v }))));
      for (const prefs of combos(0)) {
        const run = propagate(baseConfig({ prefs }));
        runs++;
        expect(run.settled, JSON.stringify(prefs)).toBe(true);
        expect(finalRound(run).best[ORIGIN]).toMatchObject({ path: [], rel: 'origin' });
      }
    }
    expect(runs).toBeGreaterThan(1000);
  });
});

describe('200 seeded valley-free AS graphs', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);

  it('the converged routes equal an independent class-by-class reference (customer, then peer, then provider), and every selected path is valley-free and loop-free', () => {
    for (const seed of seeds) {
      const g = randomValleyFreeGraph(seed);
      const origin = g.ases[Math.floor(mulberry32(seed + 1000)() * g.ases.length)];
      const best = pathsOf(cfgOn(g, origin));
      const ref = threePhase(g, origin);
      for (const a of g.ases) {
        expect(best[a]?.path ?? null, `seed ${seed} AS ${a}`).toEqual(ref[a]?.path ?? null);
        if (best[a] && a !== origin) {
          const full = [a, ...best[a]!.path];
          expect(isValleyFree(g, full), `seed ${seed} AS ${a} valley-free`).toBe(true);
          expect(new Set(full).size).toBe(full.length);
          expect(full[full.length - 1]).toBe(origin);
        }
      }
    }
  });

  it('each AS holds a route of the best relationship class that any valley-free simple path offers (an enumeration, not the protocol)', () => {
    for (const seed of seeds.slice(0, 80)) {
      const g = randomValleyFreeGraph(seed);
      if (g.ases.length > 8) continue;
      const origin = g.ases[0];
      const best = pathsOf(cfgOn(g, origin));
      for (const a of g.ases) {
        if (a === origin) continue;
        const cls = bestClassByEnumeration(g, a, origin);
        expect(best[a]?.rel ?? null, `seed ${seed} AS ${a}`).toBe(cls);
      }
    }
  });

  it('settles in a bounded number of rounds on every graph', () => {
    for (const seed of seeds) {
      const g = randomValleyFreeGraph(seed);
      const run = propagate(cfgOn(g, g.ases[0]));
      expect(run.settled).toBe(true);
      expect(run.roundsToConverge).toBeLessThanOrEqual(g.ases.length + 1);
    }
  });

  it('the paths stored at each AS are the paths its neighbours hold (following next hops equals following the stored path)', () => {
    for (const seed of seeds.slice(0, 60)) {
      const g = randomValleyFreeGraph(seed);
      const best = pathsOf(cfgOn(g, g.ases[0]));
      for (const a of g.ases) {
        let at = a;
        const walked = [];
        while (best[at] && best[at]!.via !== null) {
          at = best[at]!.via as number;
          walked.push(at);
        }
        if (best[a]) expect(walked).toEqual(best[a]!.path);
      }
    }
  });
});

describe('export rules', () => {
  const cfg = baseConfig();
  const route = (rel: Route['rel'], via: number | null = 1): Route => ({ path: [1], via, rel, pref: 1 });

  it('valley-free: own and customer routes go to everyone, peer and provider routes only to customers', () => {
    // From AS64498: customers 64500 and 64502, peer 64499, provider 64496.
    for (const to of [64500, 64502, 64499, 64496]) {
      expect(exportsTo(cfg, 64498, route('origin', null), to)).toBe(true);
      expect(exportsTo(cfg, 64498, route('customer'), to)).toBe(true);
    }
    for (const rel of ['peer', 'provider'] as const) {
      expect(exportsTo(cfg, 64498, route(rel), 64500)).toBe(true);
      expect(exportsTo(cfg, 64498, route(rel), 64499)).toBe(false);
      expect(exportsTo(cfg, 64498, route(rel), 64496)).toBe(false);
    }
  });

  it('leak: the leaker passes a provider route to its other provider and not back to where it came from; others keep the rules', () => {
    const leak = baseConfig({ policy: 'leak' });
    expect(exportsTo(leak, LEAKER, route('provider', 64498), 64499)).toBe(true);
    expect(exportsTo(leak, LEAKER, route('provider', 64498), 64498)).toBe(false);
    expect(exportsTo(leak, 64499, route('peer'), 64497)).toBe(false);
  });

  it('relationships are read from both ends: a customer is a provider\'s customer and the provider is the customer\'s provider', () => {
    expect(relOf(EDGES, 64498, 64500)).toBe('customer');
    expect(relOf(EDGES, 64500, 64498)).toBe('provider');
    expect(relOf(EDGES, 64496, 64497)).toBe('peer');
    expect(relOf(EDGES, 64500, 64501)).toBeNull();
    expect(DEFAULT_PREF.customer).toBeGreaterThan(DEFAULT_PREF.peer);
    expect(DEFAULT_PREF.peer).toBeGreaterThan(DEFAULT_PREF.provider);
  });

  it('pathLinks lists the links a route crosses from the AS that holds it', () => {
    expect(pathLinks(64499, { path: [64498, 64500], via: 64498, rel: 'peer', pref: 200 })).toEqual([[64499, 64498], [64498, 64500]]);
    expect(pathLinks(64499, null)).toEqual([]);
  });
});

describe('route origin validation', () => {
  const roa: Roa = { net: BASE_NET, prefix: 24, maxLength: 24, origin: ORIGIN };
  const sub = (cidr: string) => {
    const [a, l] = cidr.split('/');
    return { net: ipv4(a), len: Number(l) };
  };

  it('vectors: exact length from the right origin is valid, a /25 beyond maxLength is invalid, the wrong origin is invalid, an uncovered prefix is not found', () => {
    expect(validate([roa], sub('203.0.113.0/24').net, 24, ORIGIN)).toBe('valid');
    expect(validate([roa], sub('203.0.113.0/25').net, 25, ORIGIN)).toBe('invalid');
    expect(validate([roa], sub('203.0.113.0/24').net, 24, 64503)).toBe('invalid');
    expect(validate([roa], sub('198.51.100.0/24').net, 24, 64503)).toBe('not-found');
    expect(validate([{ ...roa, maxLength: 25 }], sub('203.0.113.128/25').net, 25, ORIGIN)).toBe('valid');
    expect(validate([], BASE_NET, 24, ORIGIN)).toBe('not-found');
  });

  it('a prefix outside every ROA is not found and is still accepted: validators drop only invalid routes', () => {
    const s: HijackSetup = { ...DEFAULT_HIJACK, validators: 8, prefixText: '203.0.113.0/25' };
    const r = hijackResult(s, announcedOf(s));
    expect(r.validity).toBe('invalid');
    expect(validate(r.roas, ipv4('192.0.2.0'), 24, 64503)).toBe('not-found');
  });

  it('typed prefixes: refused with a reason unless they sit inside 203.0.113.0/24, are /24 to /28 and have no host bits', () => {
    const refused = ['', '   ', 'abc', '203.0.113.0', '203.0.113.0/23', '203.0.113.0/29', '203.0.113.0/33', '198.51.100.0/24', '192.0.2.0/25', '10.0.0.0/24', '203.0.113.5/25', '203.0.113.0/25/1', '<b>1</b>', '9'.repeat(5000), '203.0.113.256/24'];
    for (const t of refused) {
      const r = parseAnnounced(t);
      expect(r.ok, JSON.stringify(t.slice(0, 20))).toBe(false);
      if (!r.ok) {
        expect(r.error.length).toBeGreaterThan(5);
        expect(r.error.length).toBeLessThan(400);
      }
    }
    for (const t of ['203.0.113.0/24', ' 203.0.113.0/25 ', '203.0.113.128/25', '203.0.113.240/28']) expect(parseAnnounced(t).ok, t).toBe(true);
  });
});

describe('hijack and anycast', () => {
  const run = (over: Partial<HijackSetup>, text = DEFAULT_HIJACK.prefixText) => {
    const s = { ...DEFAULT_HIJACK, ...over, prefixText: text };
    return hijackResult(s, announcedOf(s));
  };
  const ends = (r: ReturnType<typeof run>, o: 'origin' | 'other' | 'lost') => ASES.filter((a) => r.reach[a].outcome === o);

  it('with no validators a /25 inside the /24 pulls every AS that hears it, whatever the path length: all 8 end at the hijacker', () => {
    const r = run({});
    expect(ends(r, 'other')).toHaveLength(8);
    expect(r.captured).toHaveLength(7);
    // The real origin is shorter for AS64500 itself and for AS64498, yet the /25 still wins the lookup.
    expect(r.base.settled && r.extra?.settled).toBe(true);
  });

  it('with every AS validating, no AS selects the /25: nobody ends at the hijacker', () => {
    const r = run({ validators: 8 });
    expect(r.captured).toEqual([]);
    expect(ends(r, 'other')).toEqual([HIJACKER]);
    expect(ends(r, 'origin')).toHaveLength(7);
    for (const a of ASES) if (a !== HIJACKER) expect(finalRound(r.extra!).best[a]).toBeNull();
  });

  it('capture only ever shrinks as more ASes validate, from 8 to 1 (the hijacker itself)', () => {
    const counts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => ends(run({ validators: k }), 'other').length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    expect(counts[0]).toBe(8);
    expect(counts[8]).toBe(1);
  });

  it('a /25 from an AS whose provider validates is dropped at the first hop, because ROV_ORDER puts that provider (AS64499) late', () => {
    expect(ROV_ORDER.indexOf(64499)).toBe(6);
    expect(ends(run({ validators: 6 }), 'other').length).toBeGreaterThan(1);
    expect(ends(run({ validators: 7 }), 'other')).toEqual([HIJACKER]);
  });

  it('equal-length /24: the map splits by shorter path between the two origins; the same split is what anycast gives', () => {
    const hijack = run({}, '203.0.113.0/24');
    expect(ends(hijack, 'origin').length).toBeGreaterThan(0);
    expect(ends(hijack, 'other').length).toBeGreaterThan(0);
    const anycast = run({ kind: 'anycast' }, '203.0.113.0/24');
    expect(anycast.reach).toEqual(hijack.reach);
    expect(anycast.validity).toBe('valid');
    // Each AS goes to the origin with the shorter path (ties: the lower neighbour), checked against the two single-origin runs.
    const toOrigin = finalRound(propagate(cfgOn(GRAPH, ORIGIN))).best;
    const toSecond = finalRound(propagate(cfgOn(GRAPH, HIJACKER))).best;
    for (const a of ASES) {
      if (a === ORIGIN || a === HIJACKER) continue;
      const dOrigin = toOrigin[a]!.path.length;
      const dSecond = toSecond[a]!.path.length;
      if (toOrigin[a]!.pref !== toSecond[a]!.pref) continue;
      if (dOrigin < dSecond) expect(hijack.reach[a].at, `AS ${a}`).toBe(ORIGIN);
      if (dSecond < dOrigin) expect(hijack.reach[a].at, `AS ${a}`).toBe(HIJACKER);
    }
  });

  it('a second site listed in the ROA is valid, so validators change nothing; and "forge the origin" does nothing to an anycast site', () => {
    const base = run({ kind: 'anycast' }, '203.0.113.0/24');
    for (const validators of [0, 4, 8]) expect(run({ kind: 'anycast', validators }, '203.0.113.0/24').reach).toEqual(base.reach);
    expect(run({ kind: 'anycast', forged: true }, '203.0.113.0/24').reach).toEqual(base.reach);
  });

  it('a forged origin passes validation on the /24 (still captured) but not the length limit on a /25 (dropped)', () => {
    const forged24 = run({ forged: true, validators: 8 }, '203.0.113.0/24');
    expect(forged24.validity).toBe('valid');
    expect(forged24.captured.length).toBeGreaterThan(0);
    const plain24 = run({ validators: 8 }, '203.0.113.0/24');
    expect(plain24.captured).toEqual([]);
    expect(run({ forged: true, validators: 8 }).captured).toEqual([]);
  });

  it('forwarding picks the longest matching announcement: longestPrefixMatch equals a naive bit scan on 300 seeded prefix sets', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const routes = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => {
        const len = 24 + Math.floor(rnd() * 5);
        const host = Math.floor(rnd() * 256);
        const net = (BASE_NET + host) >>> 0;
        return { net: (net - (net % 2 ** (32 - len))) >>> 0, prefix: len, k };
      });
      const dest = BASE_NET + Math.floor(rnd() * 256);
      const naive = routes.filter((r) => Math.floor(dest / 2 ** (32 - r.prefix)) === Math.floor(r.net / 2 ** (32 - r.prefix))).sort((a, b) => b.prefix - a.prefix || a.k - b.k)[0] ?? null;
      expect(longestPrefixMatch(routes, dest)).toBe(naive);
    }
  });

  it('roasFor lists the second origin only for anycast, and validatorsOf takes the first k of the fixed order', () => {
    expect(roasFor({ ...DEFAULT_HIJACK, kind: 'hijack' })).toHaveLength(1);
    expect(roasFor({ ...DEFAULT_HIJACK, kind: 'anycast' }).map((r) => r.origin)).toEqual([ORIGIN, HIJACKER]);
    expect(validatorsOf(3)).toEqual(ROV_ORDER.slice(0, 3));
    expect(validatorsOf(99)).toHaveLength(8);
    expect(validatorsOf(-2)).toEqual([]);
  });
});
