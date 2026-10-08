import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import {
  APP_DEFAULTS, APP_IDS, INITIAL, NET, SHARED, appGraph, buildApp, chunksOf, fetchAll, fetchMs, lazyChunkId, lazyRoots, loadPlan, moduleKb, reachable, shake, singleBundle,
  type AppOptions, type Chunk, type Graph, type ModuleDef,
} from './model';

const opts = (o: Partial<AppOptions> = {}): AppOptions => ({ ...APP_DEFAULTS, ...o });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('the app, worked by hand', () => {
  const b = buildApp(opts());

  it('step 1: the walk from main reaches every module once, depth first, and the bundle is the sum of their sizes', () => {
    expect(b.walk).toEqual(['main', 'router', 'home', 'settings', 'datelib', 'reports', 'chartlib', 'button', 'utils']);
    // 4 + 6 + 8 + 10 + 60 + 14 + 90 + 3 + 16
    expect(b.fullKb).toBe(211);
    expect(sum(APP_IDS.map((id) => moduleKb(b.graph.modules[id])))).toBe(211);
  });

  it('step 2: ui/button is dropped (imported, never used), utils keeps formatDate, datelib keeps what main, settings and reports use', () => {
    expect(b.shaken.dropped).toEqual(['button']);
    expect(b.shaken.keptExports.utils).toEqual(['formatDate']);
    expect(b.shaken.removedExports.utils).toEqual(['formatMoney', 'slugify', 'debounce', 'clamp']);
    expect(b.shaken.keptExports.datelib).toEqual(['format', 'diff']);
    expect(b.shaken.removedExports.datelib).toEqual(['parse', 'add']);
    // 4 + 6 + 8 + 10 + (8+12+14) + 14 + 90 + (1+3)
    expect(b.shakenKb).toBe(170);
    expect(b.shaken.sideEffectOnly).toEqual([]);
  });

  it('step 3: reports and chartlib become a lazy chunk, datelib (needed by both) a shared chunk, the rest the initial chunk', () => {
    expect(b.chunks.map((c) => [c.id, c.kb])).toEqual([
      [INITIAL, 4 + 6 + 8 + 10 + 4],
      [SHARED, 34],
      [lazyChunkId('reports'), 14 + 90],
    ]);
    expect(b.chunks.find((c) => c.id === INITIAL)!.modules).toEqual(['main', 'router', 'home', 'settings', 'utils']);
    expect(b.chunks.find((c) => c.id === lazyChunkId('reports'))!.modules).toEqual(['reports', 'chartlib']);
  });

  it('loading: the first screen needs the initial and shared chunks, then a click fetches the lazy chunk', () => {
    const p = b.plan;
    expect(p.fetches[0]).toEqual({ chunk: INITIAL, start: 0, done: 100 + 33 / 0.5 });
    expect(p.fetches[1]).toEqual({ chunk: SHARED, start: 0, done: 100 + 35 / 0.5 });
    expect(p.interactiveAt).toBe(170 + (32 + 34) * 0.5);
    expect(p.clickAt).toBe(203 + 400);
    expect(p.lazyChunks).toEqual([lazyChunkId('reports')]);
    expect(p.visibleAt).toBe(603 + 100 + 105 / 0.5 + 104 * 0.5);
  });

  it('without the dynamic import everything ships in one chunk, and opening reports costs nothing more', () => {
    const flat = buildApp(opts({ splitReports: false }));
    expect(flat.chunks.map((c) => [c.id, c.kb])).toEqual([[INITIAL, 170]]);
    expect(flat.plan.lazyChunks).toEqual([]);
    expect(flat.plan.visibleAt).toBe(flat.plan.clickAt);
    expect(flat.plan.interactiveAt).toBe(100 + 171 / 0.5 + 170 * 0.5);
  });

  it('the split page is usable sooner than the one-bundle page, and reports then appears later: the trade', () => {
    const flat = buildApp(opts({ splitReports: false }));
    expect(b.plan.interactiveAt).toBeLessThan(flat.plan.interactiveAt);
    expect(b.plan.visibleAt - b.plan.clickAt).toBeGreaterThan(flat.plan.visibleAt - flat.plan.clickAt);
  });

  it('too fine (a chunk per module) is slower to be usable than the sensible split, though it ships the same bytes', () => {
    const fine = buildApp(opts(), true);
    expect(fine.chunks).toHaveLength(8);
    expect(sum(fine.chunks.map((c) => c.kb))).toBe(sum(b.chunks.map((c) => c.kb)));
    // six chunks, four connections: main 110, router 114, home 118, settings 122, then datelib (starts at 110) done 280 and utils (114) done 224
    expect(fine.plan.fetches.slice(0, 6).map((f) => f.done)).toEqual([110, 114, 118, 122, 280, 224]);
    expect(fine.plan.interactiveAt).toBe(280 + (4 + 6 + 8 + 10 + 34 + 4) * 0.5);
    expect(fine.plan.interactiveAt).toBeGreaterThan(b.plan.interactiveAt);
    expect(fine.plan.fetches.length).toBeGreaterThan(b.plan.fetches.length);
  });
});

describe('side effects and CommonJS', () => {
  it('a module with side effects stays although nothing it exports is used, and is reported as kept for that reason alone', () => {
    const s = buildApp(opts({ buttonSideEffects: true })).shaken;
    expect(s.dropped).toEqual([]);
    expect(s.included).toContain('button');
    expect(s.sideEffectOnly).toEqual(['button']);
    expect(buildApp(opts({ buttonSideEffects: true })).shakenKb).toBe(173);
  });

  it('a CommonJS date library is kept whole and flagged unshakable', () => {
    const b = buildApp(opts({ datelibCjs: true }));
    expect(b.shaken.keptExports.datelib).toEqual(['format', 'parse', 'diff', 'add']);
    expect(b.shaken.unshakable).toEqual(['datelib']);
    expect(b.shakenKb).toBe(170 - 34 + 60);
  });

  it('the ES-module version is not flagged, and the other modules shake the same either way', () => {
    expect(buildApp(opts()).shaken.unshakable).toEqual([]);
    expect(buildApp(opts({ datelibCjs: true })).shaken.keptExports.utils).toEqual(['formatDate']);
  });

  it('the default app has the same tree under every combination of the three toggles: shaken is never bigger than the walk', () => {
    for (const buttonSideEffects of [false, true]) for (const datelibCjs of [false, true]) for (const splitReports of [false, true]) {
      const b = buildApp({ buttonSideEffects, datelibCjs, splitReports });
      expect(b.shakenKb).toBeLessThanOrEqual(b.fullKb);
      expect(sum(b.chunks.map((c) => c.kb))).toBe(b.shakenKb);
    }
  });
});

describe('fetching', () => {
  const chunk = (id: string, kb: number): Chunk => ({ id, kind: 'module', modules: [id], kb });

  it('a request takes a round trip plus its bytes, one extra KB of overhead included, over the bandwidth', () => {
    expect(fetchMs(0)).toBe(100 + 1 / 0.5);
    expect(fetchMs(49)).toBe(100 + 50 / 0.5);
  });

  it('never has more requests in flight than there are connections, and a request waits for a free one', () => {
    const six = fetchAll(Array.from({ length: 6 }, (_, i) => chunk(`c${i}`, 10)), 0);
    const each = fetchMs(10);
    expect(six.map((f) => f.start)).toEqual([0, 0, 0, 0, each, each]);
    for (const f of six) expect(six.filter((g) => g.start <= f.start && f.start < g.done).length).toBeLessThanOrEqual(NET.connections);
  });
});

// ── Random graphs ────────────────────────────────────────────────────────

function randomGraph(rnd: Rnd): Graph {
  const n = 3 + Math.floor(rnd() * 8);
  const ids = Array.from({ length: n }, (_, i) => `m${i}`);
  const modules: Record<string, ModuleDef> = {};
  for (const id of ids) {
    const exportCount = Math.floor(rnd() * 4);
    modules[id] = {
      id,
      baseKb: 1 + Math.floor(rnd() * 5),
      exports: Array.from({ length: exportCount }, (_, k) => ({ name: `e${k}`, kb: 1 + Math.floor(rnd() * 9) })),
      cjs: rnd() < 0.2,
      sideEffects: rnd() < 0.2,
    };
  }
  const imports: Graph['imports'] = [];
  const edges = n + Math.floor(rnd() * n * 1.5);
  for (let k = 0; k < edges; k++) {
    const from = ids[Math.floor(rnd() * n)];
    const to = ids[Math.floor(rnd() * n)];
    if (from === to) continue;
    const exps = modules[to].exports.map((e) => e.name);
    const roll = rnd();
    const names = roll < 0.3 ? undefined : roll < 0.45 ? [] : exps.filter(() => rnd() < 0.5);
    imports.push({ from, to, names, dynamic: rnd() < 0.3 });
  }
  return { entry: ids[0], modules, imports };
}

const GRAPHS = 200;

describe('shaking, on random graphs', () => {
  it('keeps exactly what the surviving importers use (ES modules), everything of a CommonJS module, and every side-effect module that is imported', () => {
    const rnd = mulberry32(21);
    for (let n = 0; n < GRAPHS; n++) {
      const g = randomGraph(rnd);
      const s = shake(g);
      const alive = new Set(s.included);
      expect(alive.has(g.entry)).toBe(true);
      const reach = new Set(reachable(g, g.entry, true));
      for (const id of s.included) expect(reach.has(id)).toBe(true);
      // what the surviving modules ask of each module, worked out from the import list alone
      const asked = (id: string) => g.imports.filter((i) => i.to === id && alive.has(i.from));
      for (const id of s.included) {
        const m = g.modules[id];
        if (id === g.entry) continue;
        const imps = asked(id);
        const usedAll = imps.some((i) => i.names === undefined);
        const usedNames = new Set(imps.flatMap((i) => i.names ?? []));
        const expected = m.exports.map((e) => e.name).filter((name) => m.cjs || usedAll || usedNames.has(name));
        expect(s.keptExports[id]).toEqual(expected);
        expect(s.kb[id]).toBe(m.baseKb + m.exports.filter((e) => expected.includes(e.name)).reduce((t, e) => t + e.kb, 0));
        // a module is only here because something asked for it, or it has side effects
        expect(imps.length).toBeGreaterThan(0);
        expect(imps.some((i) => i.names === undefined || i.names.length > 0) || m.sideEffects).toBe(true);
      }
      // nothing reachable and wanted was dropped
      for (const id of reach) {
        if (alive.has(id)) continue;
        for (const i of asked(id)) {
          expect(i.names).toEqual([]);
          expect(g.modules[id].sideEffects).toBe(false);
        }
      }
      expect(s.dropped.every((id) => reach.has(id) && !alive.has(id))).toBe(true);
    }
  });

  it('never keeps more than the full walk', () => {
    const rnd = mulberry32(22);
    for (let n = 0; n < GRAPHS; n++) {
      const g = randomGraph(rnd);
      const s = shake(g);
      const full = sum(reachable(g, g.entry, true).map((id) => moduleKb(g.modules[id])));
      expect(sum(s.included.map((id) => s.kb[id]))).toBeLessThanOrEqual(full);
    }
  });
});

describe('chunking, on random graphs', () => {
  it('partitions the surviving modules: each in exactly one chunk, sizes summing to the shaken total', () => {
    const rnd = mulberry32(23);
    for (let n = 0; n < GRAPHS; n++) {
      const g = randomGraph(rnd);
      const s = shake(g);
      for (const fine of [false, true]) {
        const chunks = chunksOf(g, s, { fine });
        const all = chunks.flatMap((c) => c.modules);
        expect([...all].sort()).toEqual([...s.included].sort());
        expect(new Set(all).size).toBe(all.length);
        for (const c of chunks) expect(c.kb).toBe(sum(c.modules.map((m) => s.kb[m])));
        expect(sum(chunks.map((c) => c.kb))).toBe(sum(s.included.map((m) => s.kb[m])));
      }
    }
  });

  it('puts a module in the initial chunk only if the entry needs it; the shared chunk holds exactly the modules two or more entry points need', () => {
    const rnd = mulberry32(24);
    for (let n = 0; n < GRAPHS; n++) {
      const g = randomGraph(rnd);
      const s = shake(g);
      const alive = new Set(s.included);
      const roots = [g.entry, ...lazyRoots(g, s)];
      // brute force: a root needs a module if a chain of static imports between surviving modules leads to it
      const needs = (root: string, target: string): boolean => {
        const seen = new Set<string>();
        const stack = [root];
        while (stack.length) {
          const cur = stack.pop()!;
          if (cur === target) return true;
          if (seen.has(cur)) continue;
          seen.add(cur);
          for (const i of g.imports) if (i.from === cur && !i.dynamic && alive.has(i.to)) stack.push(i.to);
        }
        return false;
      };
      const chunks = chunksOf(g, s);
      const where = new Map(chunks.flatMap((c) => c.modules.map((m) => [m, c.id] as const)));
      for (const id of s.included) {
        const by = roots.filter((r) => needs(r, id));
        expect(by.length).toBeGreaterThan(0);
        expect(where.get(id)).toBe(by.length > 1 ? SHARED : by[0] === g.entry ? INITIAL : lazyChunkId(by[0]));
      }
      const initial = chunks.find((c) => c.id === INITIAL) ?? { modules: [] }; // absent when a lazy chunk imports the entry back and so shares it
      for (const id of initial.modules) expect(needs(g.entry, id)).toBe(true);
    }
  });

  it('a graph with no dynamic imports is one initial chunk', () => {
    const rnd = mulberry32(25);
    for (let n = 0; n < GRAPHS; n++) {
      const g = randomGraph(rnd);
      g.imports.forEach((i) => (i.dynamic = false));
      const chunks = chunksOf(g, shake(g));
      expect(chunks.map((c) => c.id)).toEqual([INITIAL]);
    }
  });
});

describe('loading, on random graphs', () => {
  it('has the first screen ready only after everything it needs has arrived and run, and the click after that', () => {
    const rnd = mulberry32(26);
    for (let n = 0; n < GRAPHS; n++) {
      const g = randomGraph(rnd);
      const s = shake(g);
      const roots = lazyRoots(g, s);
      for (const fine of [false, true]) {
        const chunks = chunksOf(g, s, { fine });
        const p = loadPlan(g, s, chunks, roots[0] ?? g.entry);
        const first = p.fetches.filter((f) => f.start === 0);
        expect(first.length).toBeGreaterThan(0);
        expect(p.interactiveAt).toBeGreaterThanOrEqual(Math.max(...first.map((f) => f.done)));
        expect(p.clickAt).toBe(p.interactiveAt + NET.clickDelay);
        expect(p.visibleAt).toBeGreaterThanOrEqual(p.clickAt);
        for (const f of p.fetches) {
          const c = chunks.find((x) => x.id === f.chunk)!;
          expect(f.done - f.start).toBe(fetchMs(c.kb));
          expect(p.fetches.filter((o) => o.start <= f.start && f.start < o.done).length).toBeLessThanOrEqual(NET.connections);
        }
        expect(new Set(p.fetches.map((f) => f.chunk)).size).toBe(p.fetches.length);
        if (!p.lazyChunks.length) expect(p.visibleAt).toBe(p.clickAt);
      }
    }
  });
});

describe('the one-bundle views', () => {
  it('the unshaken bundle is the whole walk and the shaken one the survivors', () => {
    const b = buildApp(opts());
    expect(singleBundle(b, false)[0].kb).toBe(211);
    expect(singleBundle(b, true)[0].kb).toBe(170);
    expect(singleBundle(b, true)[0].modules).toEqual(b.shaken.included);
  });

  it('appGraph marks only reports as a dynamic import', () => {
    expect(appGraph(opts()).imports.filter((i) => i.dynamic).map((i) => i.to)).toEqual(['reports']);
    expect(appGraph(opts({ splitReports: false })).imports.some((i) => i.dynamic)).toBe(false);
  });
});
