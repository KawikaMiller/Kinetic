/**
 * Pure model of what a bundler does with a module graph: walk it from the entry, shake out unused
 * exports, and split it into chunks. The graph is a fictional app; the rules (reachability, ES
 * module tree shaking, side effects, CommonJS, chunk partition by who needs a module) are the
 * general ones. Real tools differ in heuristics and detail.
 */

export interface ExportDef {
  name: string;
  kb: number;
}

export interface ModuleDef {
  id: string;
  /** Code outside the named exports (setup, glue) that is always kept with the module. */
  baseKb: number;
  exports: ExportDef[];
  /** A CommonJS module: its exports are only known at run time, so none can be removed. */
  cjs: boolean;
  /** Running the module does something besides defining exports (registers an element, patches a prototype). */
  sideEffects: boolean;
}

export interface Import {
  from: string;
  to: string;
  /** The named exports used. Undefined: the whole module is used. An empty list: imported for its side effects only. */
  names?: string[];
  /** `import('./x')`: loaded on demand instead of with its importer. */
  dynamic?: boolean;
}

export interface Graph {
  entry: string;
  modules: Record<string, ModuleDef>;
  imports: Import[];
}

/** Sizes in this lesson are whole kilobytes (1 KB = 1000 bytes). */
export const kbText = (kb: number) => `${Number(kb.toFixed(1))} KB`;

export const moduleKb = (m: ModuleDef) => m.baseKb + m.exports.reduce((s, e) => s + e.kb, 0);

/** The imports that leave `id`. */
const importsOf = (g: Graph, id: string) => g.imports.filter((i) => i.from === id);

/** Modules reachable from `start` (itself included) in depth-first order, following dynamic imports only when asked. */
export function reachable(g: Graph, start: string, followDynamic: boolean, within?: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (seen.has(id) || (within && !within.has(id))) return;
    seen.add(id);
    order.push(id);
    for (const i of importsOf(g, id)) if (followDynamic || !i.dynamic) visit(i.to);
  };
  visit(start);
  return order;
}

// ── Tree shaking ─────────────────────────────────────────────────────────

export interface Shaken {
  /** The modules that survive, in walk order. */
  included: string[];
  /** The modules reachable from the entry that were removed. */
  dropped: string[];
  /** For each surviving module, the exports that stay. */
  keptExports: Record<string, string[]>;
  /** For each surviving module, the exports removed. */
  removedExports: Record<string, string[]>;
  /** Modules that survive only because they have side effects: nothing they export is used. */
  sideEffectOnly: string[];
  /** Modules that are CommonJS and kept whole although some exports are unused. */
  unshakable: string[];
  kb: Record<string, number>;
}

type Used = Map<string, Set<string> | 'all'>;

/** What the imports of `from` use of each module they bring in. */
function usageBy(g: Graph, from: ReadonlySet<string>): { used: Used; next: Set<string> } {
  const used: Used = new Map();
  const next = new Set<string>([g.entry]);
  for (const id of from) {
    for (const imp of importsOf(g, id)) {
      if (imp.names !== undefined && imp.names.length === 0 && !g.modules[imp.to].sideEffects) continue;
      next.add(imp.to);
      const have = used.get(imp.to);
      if (have === 'all') continue;
      used.set(imp.to, imp.names === undefined ? 'all' : new Set([...(have ?? []), ...imp.names]));
    }
  }
  return { used, next };
}

/**
 * Keep what the entry really uses. An import brings in the named exports it uses; one that uses
 * none brings in its module only when that module has side effects. A module that nothing keeps
 * is dropped, and what a dropped module imported is not used on its account. CommonJS modules are
 * kept whole.
 */
export function shake(g: Graph): Shaken {
  let included: ReadonlySet<string> = new Set([g.entry]);
  let { used, next } = usageBy(g, included);
  while (next.size > included.size) {
    included = next;
    ({ used, next } = usageBy(g, included));
  }
  const walk = reachable(g, g.entry, true);
  const survivors = walk.filter((id) => included.has(id));
  const keptExports: Shaken['keptExports'] = {};
  const removedExports: Shaken['removedExports'] = {};
  const kb: Shaken['kb'] = {};
  const unshakable: string[] = [];
  const sideEffectOnly: string[] = [];
  for (const id of survivors) {
    const m = g.modules[id];
    const u = used.get(id);
    const allNames = m.exports.map((e) => e.name);
    const usedNames = id === g.entry || u === 'all' ? allNames : allNames.filter((n) => u?.has(n));
    const names = m.cjs ? allNames : usedNames;
    keptExports[id] = names;
    removedExports[id] = allNames.filter((n) => !names.includes(n));
    kb[id] = m.baseKb + m.exports.filter((e) => names.includes(e.name)).reduce((s, e) => s + e.kb, 0);
    if (m.cjs && usedNames.length < allNames.length) unshakable.push(id);
    if (id !== g.entry && m.sideEffects && u instanceof Set && u.size === 0) sideEffectOnly.push(id);
  }
  return { included: survivors, dropped: walk.filter((id) => !included.has(id)), keptExports, removedExports, sideEffectOnly, unshakable, kb };
}

// ── Code splitting ───────────────────────────────────────────────────────

export const INITIAL = 'initial';
export const SHARED = 'shared';
export const lazyChunkId = (root: string) => `lazy:${root}`;

export type ChunkKind = 'initial' | 'lazy' | 'shared' | 'module';

export interface Chunk {
  id: string;
  kind: ChunkKind;
  modules: string[];
  kb: number;
}

/** The modules a dynamic import starts a chunk at: those no static path from the entry already brings in. */
export function lazyRoots(g: Graph, shaken: Shaken): string[] {
  const inSet = new Set(shaken.included);
  const eager = new Set(reachable(g, g.entry, false, inSet));
  const roots: string[] = [];
  for (const id of shaken.included) {
    const loadedLazily = g.imports.some((i) => i.dynamic && i.to === id && inSet.has(i.from));
    if (loadedLazily && !eager.has(id) && !roots.includes(id)) roots.push(id);
  }
  return roots;
}

/**
 * Partition the surviving modules into chunks. Each module belongs to the entry point(s) that need
 * it: the entry, and each lazy root. Needed by one: that entry's chunk. Needed by two or more: the
 * shared chunk. With `fine`, every module is its own chunk instead.
 */
export function chunksOf(g: Graph, shaken: Shaken, o: { fine?: boolean } = {}): Chunk[] {
  const inSet = new Set(shaken.included);
  const sum = (ids: string[]) => ids.reduce((s, id) => s + shaken.kb[id], 0);
  if (o.fine) return shaken.included.map((id) => ({ id: `module:${id}`, kind: 'module' as const, modules: [id], kb: shaken.kb[id] }));
  const roots = [g.entry, ...lazyRoots(g, shaken)];
  const needs = new Map(roots.map((r) => [r, new Set(reachable(g, r, false, inSet))]));
  const groups = new Map<string, string[]>();
  for (const id of shaken.included) {
    const by = roots.filter((r) => needs.get(r)!.has(id));
    const chunkId = by.length > 1 ? SHARED : by[0] === g.entry ? INITIAL : lazyChunkId(by[0]);
    groups.set(chunkId, [...(groups.get(chunkId) ?? []), id]);
  }
  const kindOf = (id: string): ChunkKind => (id === INITIAL ? 'initial' : id === SHARED ? 'shared' : 'lazy');
  return [...groups].map(([id, modules]) => ({ id, kind: kindOf(id), modules, kb: sum(modules) }));
}

// ── Loading the chunks ───────────────────────────────────────────────────

/** An illustrative network: round trip, bandwidth, per-request overhead, a connection cap, and parse and run cost. */
export const NET = { rtt: 100, kbPerMs: 0.5, requestKb: 1, connections: 4, execMsPerKb: 0.5, clickDelay: 400 } as const;

export interface Fetch {
  chunk: string;
  start: number;
  done: number;
}

export const fetchMs = (kb: number) => NET.rtt + (kb + NET.requestKb) / NET.kbPerMs;

/** Request `chunks` from `from`: each takes the earliest free connection, in list order. */
export function fetchAll(chunks: readonly Chunk[], from: number): Fetch[] {
  const free = Array.from({ length: NET.connections }, () => from);
  return chunks.map((c) => {
    const slot = free.indexOf(Math.min(...free));
    const start = free[slot];
    free[slot] = start + fetchMs(c.kb);
    return { chunk: c.id, start, done: free[slot] };
  });
}

/** The chunks a page needs once `root` runs: those holding a module reachable from it by static imports. */
export function chunksNeededBy(g: Graph, shaken: Shaken, chunks: readonly Chunk[], root: string): Chunk[] {
  const need = new Set(reachable(g, root, false, new Set(shaken.included)));
  return chunks.filter((c) => c.modules.some((m) => need.has(m)));
}

export interface LoadPlan {
  fetches: Fetch[];
  /** Each chunk's run on the main thread, after everything it came with has arrived. */
  runs: { chunk: string; start: number; end: number }[];
  /** The first screen can be used. */
  interactiveAt: number;
  /** The learner clicks to open the lazy section. */
  clickAt: number;
  /** That section is on screen: at the click when its code was already shipped. */
  visibleAt: number;
  /** The chunks fetched after the click. */
  lazyChunks: string[];
}

/** Page load, then a click on the section behind the lazy import (or the first lazy root when there is none named). */
export function loadPlan(g: Graph, shaken: Shaken, chunks: readonly Chunk[], target: string): LoadPlan {
  const initial = chunksNeededBy(g, shaken, chunks, g.entry);
  const first = fetchAll(initial, 0);
  const arrived = Math.max(...first.map((f) => f.done));
  const runs: LoadPlan['runs'] = [];
  let t = arrived;
  for (const c of initial) {
    runs.push({ chunk: c.id, start: t, end: t + c.kb * NET.execMsPerKb });
    t += c.kb * NET.execMsPerKb;
  }
  const have = new Set(initial.map((c) => c.id));
  const later = chunksNeededBy(g, shaken, chunks, target).filter((c) => !have.has(c.id));
  const interactiveAt = t;
  const clickAt = t + NET.clickDelay;
  const second = fetchAll(later, clickAt);
  let visibleAt = clickAt;
  if (later.length) {
    t = Math.max(...second.map((f) => f.done));
    for (const c of later) {
      runs.push({ chunk: c.id, start: t, end: t + c.kb * NET.execMsPerKb });
      t += c.kb * NET.execMsPerKb;
    }
    visibleAt = t;
  }
  return { fetches: [...first, ...second], runs, interactiveAt, clickAt, visibleAt, lazyChunks: later.map((c) => c.id) };
}

// ── The fictional app ────────────────────────────────────────────────────

export interface AppOptions {
  /** `ui/button` registers itself when imported (a side effect), although main never calls it. */
  buttonSideEffects: boolean;
  /** The date library is CommonJS (`require`), so its exports cannot be told apart. */
  datelibCjs: boolean;
  /** `reports` is loaded with `import('./reports')`. */
  splitReports: boolean;
}

export const APP_IDS = ['main', 'router', 'button', 'utils', 'datelib', 'home', 'settings', 'reports', 'chartlib'] as const;
export type AppId = (typeof APP_IDS)[number];
export const APP_LABEL: Record<AppId, string> = {
  main: 'main.js', router: 'router', button: 'ui/button', utils: 'utils', datelib: 'datelib', home: 'home', settings: 'settings', reports: 'reports', chartlib: 'chartlib',
};

const ex = (name: string, kb: number): ExportDef => ({ name, kb });

export function appGraph(o: AppOptions): Graph {
  const mod = (id: AppId, baseKb: number, exports: ExportDef[] = [], extra: Partial<ModuleDef> = {}): [AppId, ModuleDef] => [id, { id, baseKb, exports, cjs: false, sideEffects: false, ...extra }];
  return {
    entry: 'main',
    modules: Object.fromEntries([
      mod('main', 4),
      mod('router', 6),
      mod('button', 3, [], { sideEffects: o.buttonSideEffects }),
      mod('utils', 1, [ex('formatDate', 3), ex('formatMoney', 4), ex('slugify', 3), ex('debounce', 4), ex('clamp', 1)]),
      mod('datelib', 8, [ex('format', 12), ex('parse', 18), ex('diff', 14), ex('add', 8)], { cjs: o.datelibCjs }),
      mod('home', 8),
      mod('settings', 10),
      mod('reports', 14),
      mod('chartlib', 90),
    ]),
    imports: [
      { from: 'main', to: 'router' },
      { from: 'main', to: 'button', names: [] },
      { from: 'main', to: 'utils', names: ['formatDate'] },
      { from: 'main', to: 'datelib', names: ['format'] },
      { from: 'router', to: 'home' },
      { from: 'router', to: 'settings' },
      { from: 'router', to: 'reports', dynamic: o.splitReports },
      { from: 'settings', to: 'datelib', names: ['format'] },
      { from: 'reports', to: 'datelib', names: ['diff'] },
      { from: 'reports', to: 'chartlib' },
    ],
  };
}

export const APP_DEFAULTS: AppOptions = { buttonSideEffects: false, datelibCjs: false, splitReports: true };
/** The lazy section the navigate demo opens. */
export const LAZY_TARGET: AppId = 'reports';

/** Everything the bundler has to say about one configuration. */
export interface Build {
  graph: Graph;
  walk: string[];
  fullKb: number;
  shaken: Shaken;
  shakenKb: number;
  chunks: Chunk[];
  plan: LoadPlan;
}

export function buildApp(o: AppOptions, fine = false): Build {
  const graph = appGraph(o);
  const walk = reachable(graph, graph.entry, true);
  const shaken = shake(graph);
  const chunks = chunksOf(graph, shaken, { fine });
  return {
    graph,
    walk,
    fullKb: walk.reduce((s, id) => s + moduleKb(graph.modules[id]), 0),
    shaken,
    shakenKb: shaken.included.reduce((s, id) => s + shaken.kb[id], 0),
    chunks,
    plan: loadPlan(graph, shaken, chunks, LAZY_TARGET),
  };
}

/** One chunk with everything: the bundle before shaking or splitting. */
export function singleBundle(b: Build, shaken: boolean): Chunk[] {
  return [{ id: INITIAL, kind: 'initial', modules: shaken ? b.shaken.included : b.walk, kb: shaken ? b.shakenKb : b.fullKb }];
}
