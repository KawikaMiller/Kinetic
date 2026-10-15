import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import {
  callersByDistance, CART_ITEMS, DB_READ_MS, DB_WRITE_MS, EDGES, FULL_BUILD_MIN, FUNCTION_CALL_MS, LAYOUT, NETWORK_CALL_MS, ONE_SERVICE_BUILD_MIN, requestSteps,
  requestTotals, RUNTIME, SHARED_DB_CONTENTION, sharedDbUsers, TEAMS, type Arch, type MmFrame, type Scenario, type Status,
} from './model';

const ARCHS: Arch[] = ['mono', 'micro', 'dist'];
const SCENARIOS: Scenario[] = ['request', 'deploy', 'bug', 'teams'];
const text = (f: MmFrame) => captionText(f.say, { strict: true });
const last = (xs: MmFrame[]) => xs[xs.length - 1];
const count = (arch: Arch, status: Record<string, Status>, which: Status) => RUNTIME[arch].filter((id) => status[id] === which).length;

describe('the numbers are named constants, and the totals are hand-worked', () => {
  it('the constants are the round illustrative figures the chips quote', () => {
    expect([FUNCTION_CALL_MS, NETWORK_CALL_MS, DB_READ_MS, DB_WRITE_MS, SHARED_DB_CONTENTION, CART_ITEMS]).toEqual([0.01, 1.5, 2, 3, 1.5, 3]);
    expect([FULL_BUILD_MIN, ONE_SERVICE_BUILD_MIN]).toEqual([25, 5]);
  });

  it('monolith: 4 function calls + 2 reads + 2 writes = 10.04 ms, zero hops (worked by hand)', () => {
    const t = requestTotals('mono');
    expect(t.ms).toBeCloseTo(4 * 0.01 + 2 * 2 + 2 * 3, 9);
    expect(t.ms).toBeCloseTo(10.04, 9);
    expect(t.hops).toBe(0);
  });

  it('microservices: 4 network calls + the same 2 reads and 2 writes = 16 ms, 4 hops', () => {
    const t = requestTotals('micro');
    expect(t.ms).toBeCloseTo(4 * 1.5 + 10, 9);
    expect(t.ms).toBeCloseTo(16, 9);
    expect(t.hops).toBe(4);
  });

  it('distributed monolith: 8 network calls (3 of them the per-item catalog calls) and every query 1.5x slower = 27 ms', () => {
    const t = requestTotals('dist');
    expect(t.hops).toBe(8);
    expect(t.ms).toBeCloseTo(8 * 1.5 + 10 * 1.5, 9);
    expect(t.ms).toBeCloseTo(27, 9);
    expect(requestSteps('dist').filter((s) => s.from === 'cart' && s.to === 'catalog')).toHaveLength(CART_ITEMS);
  });

  it('the comparison counts the same thing: every architecture makes the same four data accesses, from the same four owners', () => {
    for (const arch of ARCHS) {
      const db = requestSteps(arch).filter((s) => s.hop === 'db');
      expect(db.map((s) => s.from).sort(), arch).toEqual(['cart', 'orders', 'payments', 'users']);
    }
    // So the monolith-to-microservices gap is all network: 4 hops x 1.5 ms minus the 4 cheap calls it replaces.
    expect(requestTotals('micro').ms - requestTotals('mono').ms).toBeCloseTo(4 * 1.5 - 4 * 0.01, 9);
  });

  it('try-this 1: latency and hops rise from monolith to microservices to the distributed monolith', () => {
    const [m, s, d] = ARCHS.map(requestTotals);
    expect(m.ms).toBeLessThan(s.ms);
    expect(s.ms).toBeLessThan(d.ms);
    expect([m.hops, s.hops, d.hops]).toEqual([0, 4, 8]);
    for (const arch of ARCHS) {
      const f = last(buildFrames(arch, 'request'));
      expect(f.latency, arch).toBeCloseTo(requestTotals(arch).ms, 9);
      expect(f.hops).toBe(requestTotals(arch).hops);
    }
  });
});

describe('the pictures obey the architecture', () => {
  const inContainer = (arch: Arch, id: string) => arch === 'mono' && LAYOUT.mono.find((b) => b.id === id)?.kind === 'module';
  const wired = (arch: Arch, a: string, b: string) => {
    const norm = (id: string) => (inContainer(arch, id) ? 'app' : id);
    return EDGES[arch].some(([p, q]) => (p === norm(a) && q === norm(b)) || (p === norm(b) && q === norm(a)));
  };

  it('every packet travels between two boxes that exist, along a wire (modules in the monolith share its container)', () => {
    for (const arch of ARCHS) {
      const ids = new Set(LAYOUT[arch].map((b) => b.id));
      for (const s of requestSteps(arch)) {
        expect(ids.has(s.from) && ids.has(s.to), `${arch} ${s.from}→${s.to}`).toBe(true);
        if (s.hop === 'call') {
          expect(inContainer(arch, s.from) && inContainer(arch, s.to), `${arch} ${s.from}→${s.to}`).toBe(true);
        } else {
          expect(wired(arch, s.from, s.to), `${arch} ${s.from}→${s.to}`).toBe(true);
        }
      }
    }
  });

  it('function calls exist only in the monolith, database queries end at a database box, and the services of micro each use their own', () => {
    for (const arch of ARCHS) {
      for (const s of requestSteps(arch)) {
        if (s.hop === 'call') expect(arch).toBe('mono');
        if (s.hop === 'db') expect(LAYOUT[arch].find((b) => b.id === s.to)?.kind).toBe('db');
      }
    }
    const owners = requestSteps('micro').filter((s) => s.hop === 'db').map((s) => `${s.from}→${s.to}`);
    expect(owners).toEqual(['cart→cart-db', 'users→users-db', 'payments→payments-db', 'orders→orders-db']);
    expect(new Set(requestSteps('dist').filter((s) => s.hop === 'db').map((s) => s.to))).toEqual(new Set(['db']));
  });

  it('the distributed monolith shares one database that five services are wired to', () => {
    expect(sharedDbUsers()).toBe(5);
    expect(LAYOUT.dist.filter((b) => b.kind === 'service' && b.id !== 'gateway')).toHaveLength(5);
  });

  it('every team owns something in every architecture, and no team colour is a status colour or a hop colour', () => {
    for (const arch of ARCHS) {
      const owned = new Set(LAYOUT[arch].map((b) => b.team).filter(Boolean));
      expect(owned, arch).toEqual(new Set(Object.keys(TEAMS)));
    }
    const colours = Object.values(TEAMS).map((t) => t.color);
    expect(new Set(colours).size).toBe(4);
    for (const c of colours) expect(['var(--ok)', 'var(--bad)', 'var(--hi)', 'var(--info)', 'var(--violet)', 'var(--orange)', 'var(--text)']).not.toContain(c);
  });
});

describe('scenario frames', () => {
  it('every frame of every scenario in every architecture carries its own caption', () => {
    for (const arch of ARCHS) {
      for (const scenario of SCENARIOS) {
        const frames = buildFrames(arch, scenario);
        expect(frames.length, `${arch} ${scenario}`).toBeGreaterThanOrEqual(2);
        for (const f of frames) expect(text(f).length, `${arch} ${scenario}`).toBeGreaterThan(5);
      }
    }
  });

  it('try-this 2: the monolith bug takes every module down, microservices lose one (counted from the final frame)', () => {
    const final = (arch: Arch) => last(buildFrames(arch, 'bug'));
    expect(count('mono', final('mono').status, 'down')).toBe(6);
    expect(final('mono').blast).toBe('6 / 6 down');
    expect(count('micro', final('micro').status, 'down')).toBe(1);
    expect(final('micro').blast).toBe('1 / 6 down');
    // The distributed monolith's blast radius is the call chain above catalog, not everything: see the reachability test below.
    expect(count('dist', final('dist').status, 'down')).toBe(4);
    expect(final('dist').blast).toBe('4 / 6 down');
    // The cascade is gradual in the distributed monolith: it passes through degraded states first.
    const dist = buildFrames('dist', 'bug');
    expect(dist.some((f) => count('dist', f.status, 'slow') > 0)).toBe(true);
  });

  it('distributed monolith bug: exactly the services that can reach catalog by following calls go down, checked against a brute-force reachability search', () => {
    const services = RUNTIME.dist;
    const calls = EDGES.dist.filter(([from, to]) => services.includes(from) && services.includes(to));
    // Forward search from each service: does any chain of calls starting there end at catalog?
    const reaches = (start: string, goal: string, seen = new Set<string>()): boolean => {
      if (start === goal) return true;
      seen.add(start);
      return calls.some(([from, to]) => from === start && !seen.has(to) && reaches(to, goal, seen));
    };
    const expectedDown = services.filter((id) => reaches(id, 'catalog')).sort();
    expect(expectedDown).toEqual(['cart', 'catalog', 'gateway', 'orders']);
    const final = last(buildFrames('dist', 'bug'));
    expect(services.filter((id) => final.status[id] === 'down').sort()).toEqual(expectedDown);
    expect(final.blast).toBe(`${expectedDown.length} / ${services.length} down`);
    // users and payments are not on the chain, so they are never drawn down or slow, and the caption says why they are spared.
    for (const f of buildFrames('dist', 'bug')) for (const id of ['users', 'payments']) expect(f.status[id], id).toBe('ok');
    expect(text(final)).toContain('4 of 6 services are down');
    expect(text(final)).toContain('users and payments stay up');
  });

  it('callersByDistance walks callers upstream, nearest first, and ignores units that never call the failing one', () => {
    const edges: [string, string][] = [['a', 'b'], ['b', 'c'], ['d', 'c'], ['c', 'e'], ['f', 'g'], ['client', 'a'], ['c', 'db']];
    const runtime = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(callersByDistance(edges, runtime, 'c')).toEqual([['b', 'd'], ['a']]);
    expect(callersByDistance(edges, runtime, 'e')).toEqual([['c'], ['b', 'd'], ['a']]);
    expect(callersByDistance(edges, runtime, 'a')).toEqual([]);
    // a cycle terminates
    expect(callersByDistance([['a', 'b'], ['b', 'a']], ['a', 'b'], 'a')).toEqual([['b']]);
  });

  it('the bug storyline names who is down: checkout in the monolith, only catalog in microservices', () => {
    const mono = last(buildFrames('mono', 'bug'));
    expect(mono.status.orders).toBe('down');
    const micro = last(buildFrames('micro', 'bug'));
    expect(micro.status.catalog).toBe('down');
    expect(micro.status.orders).toBe('ok');
    expect(text(micro)).toContain('Blast radius: 1');
  });

  it('try-this 3: deploying the distributed monolith ships every service at once, with the shared database migrating', () => {
    const frames = buildFrames('dist', 'deploy');
    const peak = Math.max(...frames.map((f) => count('dist', f.status, 'deploy')));
    expect(peak).toBe(RUNTIME.dist.length);
    expect(last(frames).blast).toBe(`${peak} / ${RUNTIME.dist.length} services shipped`);
    expect(frames.some((f) => f.status.db === 'deploy')).toBe(true);
    expect(frames.map((f) => f.note).filter(Boolean)).toContain('lockstep deploy of 6 services');
    expect(text(frames[1])).toContain('5 services read those tables');
  });

  it('deploy blast counts come from the frames: the monolith ships all 6 modules, microservices ship 1 of 6', () => {
    const mono = buildFrames('mono', 'deploy');
    expect(last(mono).blast).toBe(`${Math.max(...mono.map((f) => count('mono', f.status, 'deploy')))} / 6 modules shipped`);
    expect(last(mono).blast).toBe('6 / 6 modules shipped');
    const micro = buildFrames('micro', 'deploy');
    expect(last(micro).blast).toBe('1 / 6 services shipped');
    expect(micro.map((f) => f.note).filter(Boolean)).toContain(`payments only · ~${ONE_SERVICE_BUILD_MIN} min`);
    expect(mono.map((f) => f.note).filter(Boolean)).toContain(`building & testing the whole app · ~${FULL_BUILD_MIN} min`);
  });

  it('try-this 4: the Teams scenario shows the team colours on every frame, in every architecture', () => {
    for (const arch of ARCHS) for (const f of buildFrames(arch, 'teams')) expect(f.teams, arch).toBe(true);
    for (const f of buildFrames('mono', 'request')) expect(f.teams).toBe(false);
  });

  it('the request outros quote the totals: 10.0 ms, then 6.0 ms more with 4 hops, then 2.7 times with 8 hops', () => {
    const mono = text(last(buildFrames('mono', 'request')));
    const micro = text(last(buildFrames('micro', 'request')));
    const dist = text(last(buildFrames('dist', 'request')));
    expect(mono).toContain('~10.0 ms');
    expect(mono).toContain('zero');
    expect(micro).toContain('~16.0 ms');
    expect(micro).toContain('4 network hops');
    expect(micro).toContain('6.0 ms more than the monolith\'s 10.0 ms');
    expect(dist).toContain('~27.0 ms');
    expect(dist).toContain('8 hops');
    expect(dist).toContain('2.7×');
  });

  it('step captions quote the constants: network call time and the cart item count', () => {
    const micro = buildFrames('micro', 'request').map(text).join('\n');
    expect(micro).toContain(`${NETWORK_CALL_MS} ms each`);
    expect(buildFrames('dist', 'request').map(text).join('\n')).toContain(`${CART_ITEMS} items here`);
    expect(buildFrames('mono', 'request').map(text).join('\n')).toContain(`about ${FUNCTION_CALL_MS} ms`);
  });
});

describe('the lesson text', () => {
  it('has four try-this entries and quiz 4 says the database work is equal, which the steps confirm', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz[3].why).toContain('same four accesses');
    // try-this 1 no longer claims the database work is equal everywhere: the shared database costs more in the distributed monolith.
    const dbMs = (arch: Arch) => requestSteps(arch).filter((s) => s.hop === 'db').reduce((sum, s) => sum + s.ms, 0);
    expect(dbMs('mono')).toBe(dbMs('micro'));
    expect(dbMs('dist')).toBeCloseTo(dbMs('mono') * SHARED_DB_CONTENTION, 9);
    expect(lesson.tryThis[0]).toContain(`${SHARED_DB_CONTENTION}×`);
    expect(lesson.tryThis[0]).not.toContain('the same in each');
    expect(ARCHS.map((a) => requestSteps(a).filter((s) => s.hop === 'db').length)).toEqual([4, 4, 4]);
  });
});
