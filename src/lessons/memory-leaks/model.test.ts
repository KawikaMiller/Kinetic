import { describe, expect, it } from 'vitest';
import {
  APP, ERROR_RING, FLAT_TOLERANCE, LIST_ITEMS, LRU_CAP, SIZE, buildGraph, diff, heapRun, reachable, retainingPath, snapshot, survivorOf, verdict,
  type Config, type Ctor, type Graph, type LeakId,
} from './model';

const cfg = (leak: LeakId, fix = false, cacheFix: Config['cacheFix'] = 'lru'): Config => ({ leak, fix, cacheFix });
const VIEWS_PER_CYCLE = APP.gcEveryMin / APP.routeEveryMin;

/** Bytes each GC cycle adds when the leak is on, worked out from the sizes by hand. */
const DOM = SIZE.HTMLDivElement + SIZE.HTMLCanvasElement + LIST_ITEMS * SIZE.HTMLLIElement;
const PER_CYCLE: Record<Exclude<LeakId, 'bigCache'>, number> = {
  listener: VIEWS_PER_CYCLE * (SIZE['(closure)'] + SIZE.ChartView + SIZE.Array + DOM),
  interval: VIEWS_PER_CYCLE * (SIZE['(closure)'] + DOM),
  cache: APP.gcEveryMin * APP.requestsPerMin * SIZE.Response,
  errors: APP.gcEveryMin * APP.errorsPerMin * SIZE.ErrorReport,
};

const LEAKS = Object.keys(PER_CYCLE) as (keyof typeof PER_CYCLE)[];
const HOURS_4 = 240;

/** Independent reference: recursive DFS with the ephemeron rule applied to a fixed point. */
function dfsLive(g: Graph): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const e of g.nodes.get(id)!.edges) visit(e.to);
  };
  g.roots.forEach(visit);
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of g.weak) if (seen.has(w.map) && seen.has(w.key) && !seen.has(w.value)) {
      visit(w.value);
      grew = true;
    }
  }
  return seen;
}

describe('the sawtooth', () => {
  for (const leak of LEAKS) {
    it(`${leak}: every trough is at least one cycle's leak above the last`, () => {
      const { troughs } = heapRun(cfg(leak), HOURS_4);
      expect(troughs.length).toBe(HOURS_4 / APP.gcEveryMin);
      for (let k = 1; k < troughs.length; k++) expect(troughs[k].heap).toBeGreaterThanOrEqual(troughs[k - 1].heap + PER_CYCLE[leak] - 1);
      expect(verdict(heapRun(cfg(leak), HOURS_4)).verdict).toBe('leak');
    });
  }

  const fixes: [string, Config][] = [
    ['listener fixed', cfg('listener', true)],
    ['interval fixed', cfg('interval', true)],
    ['cache LRU', cfg('cache', true, 'lru')],
    ['cache WeakMap', cfg('cache', true, 'weakmap')],
    ['errors ring', cfg('errors', true)],
    ['big but bounded cache', cfg('bigCache')],
  ];
  for (const [name, c] of fixes) {
    it(`${name}: troughs stay flat once any cap is reached`, () => {
      const run = heapRun(c, HOURS_4);
      const settled = run.troughs.filter((t) => t.minute >= 60);
      const hs = settled.map((t) => t.heap);
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(FLAT_TOLERANCE);
      expect(verdict(run).verdict).toBe('flat');
    });
  }

  it('high usage is not a leak: the big cache sits far above a leak\'s early troughs, yet flat', () => {
    const big = heapRun(cfg('bigCache'), HOURS_4).troughs;
    const leak = heapRun(cfg('errors'), HOURS_4).troughs;
    expect(big[2].heap).toBeGreaterThan(leak[2].heap * 5);
    expect(verdict(heapRun(cfg('bigCache'), HOURS_4)).verdict).toBe('flat');
  });

  it('the heap between GCs is live data plus the minute-by-minute garbage', () => {
    const run = heapRun(cfg('cache', true, 'lru'), 30);
    const at = (m: number) => run.samples.filter((s) => s.minute === m);
    // Minute 15: five minutes after the GC at 10.
    expect(at(15)[0].heap - run.troughs[0].heap).toBeGreaterThanOrEqual(5 * APP.garbagePerMin);
    // Each GC minute has the peak then the trough.
    expect(at(10)).toHaveLength(2);
    expect(at(10)[0].heap).toBeGreaterThan(at(10)[1].heap);
  });

  it('the fixes hold their caps', () => {
    const g = buildGraph(cfg('cache', true, 'lru'), 120);
    expect([...reachable(g)].filter((id) => g.nodes.get(id)!.ctor === 'Response')).toHaveLength(LRU_CAP);
    const e = buildGraph(cfg('errors', true), 120);
    expect([...reachable(e)].filter((id) => e.nodes.get(id)!.ctor === 'ErrorReport')).toHaveLength(ERROR_RING);
  });
});

describe('WeakMap semantics', () => {
  it('an entry whose key is unreachable is collectable; a reachable key keeps its value', () => {
    const g = buildGraph(cfg('cache', true, 'weakmap'), 60);
    const live = reachable(g);
    const responses = [...live].filter((id) => g.nodes.get(id)!.ctor === 'Response');
    expect(responses).toHaveLength(1); // only the in-flight request's response
    expect(g.weak.length).toBe(60 * APP.requestsPerMin);
  });

  it('on a hand-built graph: values follow keys, never the map alone', () => {
    const node = (id: string, edges: string[] = []) => [id, { id, ctor: 'Map' as Ctor, size: 1, name: id, edges: edges.map((to) => ({ to, label: '' })) }] as const;
    const g: Graph = {
      nodes: new Map([node('root', ['map', 'k1']), node('map'), node('k1'), node('k2'), node('v1', ['k2']), node('v2'), node('v3')]),
      roots: ['root'],
      weak: [
        { map: 'map', key: 'k1', value: 'v1' },
        { map: 'map', key: 'k2', value: 'v2' }, // k2 only reachable through v1: still kept
        { map: 'map', key: 'k3', value: 'v3' },
      ],
    };
    expect([...reachable(g)].sort()).toEqual(['k1', 'k2', 'map', 'root', 'v1', 'v2']);
    expect(reachable(g)).toEqual(dfsLive(g));
  });
});

describe('snapshots and retaining paths', () => {
  const configs: Config[] = [...LEAKS.map((l) => cfg(l)), cfg('bigCache'), cfg('cache', true, 'weakmap')];

  it('a snapshot counts exactly the live objects by constructor (vs an independent DFS)', () => {
    for (const c of configs) {
      const g = buildGraph(c, 90);
      const want = new Map<Ctor, number>();
      for (const id of dfsLive(g)) want.set(g.nodes.get(id)!.ctor, (want.get(g.nodes.get(id)!.ctor) ?? 0) + 1);
      expect(new Map([...snapshot(g)].map(([k, v]) => [k, v.count]))).toEqual(want);
    }
  });

  it('the diff is B minus A, per constructor', () => {
    for (const c of configs) {
      const a = snapshot(buildGraph(c, 60));
      const b = snapshot(buildGraph(c, 90));
      for (const row of diff(a, b)) {
        expect(row.a).toBe(a.get(row.ctor)?.count ?? 0);
        expect(row.b).toBe(b.get(row.ctor)?.count ?? 0);
        expect(row.delta).toBe(row.b - row.a);
      }
    }
  });

  it('the retaining path starts at a root, follows real edges and ends at the leaked object', () => {
    for (const c of configs) {
      const g = buildGraph(c, 90);
      const top = diff(snapshot(buildGraph(c, 60)), snapshot(g))[0];
      const target = survivorOf(buildGraph(c, 60), g, top.ctor)!.id;
      const path = retainingPath(g, target)!;
      expect(g.roots).toContain(path[0].id);
      expect(path.at(-1)!.id).toBe(target);
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1].id;
        const isEdge = g.nodes.get(from)!.edges.some((e) => e.to === path[i].id) || g.weak.some((w) => w.map === from && w.value === path[i].id);
        expect(isEdge).toBe(true);
      }
    }
  });

  it('for a leak, the object explained is a leaked one, not what the app is using now', () => {
    for (const leak of LEAKS) {
      const a = buildGraph(cfg(leak), 60);
      const b = buildGraph(cfg(leak), 90);
      const top = diff(snapshot(a), snapshot(b))[0];
      const pick = survivorOf(a, b, top.ctor)!;
      expect(pick.survived).toBe(true);
      const ids = retainingPath(b, pick.id)!.map((p) => p.id);
      // Not through the mounted view: neither the document nor the router's current view.
      expect(ids).not.toContain('document');
      expect(ids).not.toContain('router');
    }
  });

  it('the biggest growth names the leak', () => {
    const top = (c: Config) => diff(snapshot(buildGraph(c, 60)), snapshot(buildGraph(c, 90)))[0].ctor;
    expect(top(cfg('listener'))).toBe('Array');
    expect(top(cfg('interval'))).toBe('HTMLCanvasElement');
    expect(top(cfg('cache'))).toBe('Response');
    expect(top(cfg('errors'))).toBe('ErrorReport');
  });

  it('a collected object has no retaining path, while the part that leaked does', () => {
    // The interval leak keeps the old view's DOM (through the timer's closure) but not the view itself.
    const g = buildGraph(cfg('interval'), 30);
    expect(g.nodes.has('view0')).toBe(true);
    expect(retainingPath(g, 'view0')).toBeNull();
    expect(retainingPath(g, 'canvas0')!.map((p) => p.id)).toEqual(['timers', 'poll0', 'el0', 'canvas0']);
  });
});
