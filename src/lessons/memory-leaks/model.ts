/**
 * A simulated single-page app and its JavaScript heap, minute by minute. Every number on the
 * plot comes from an object graph: what a GC keeps is what's reachable from the roots, computed
 * by a breadth-first search, with WeakMap entries kept only while their key is reachable some
 * other way (an ephemeron). Sizes and rates are illustrative.
 */

export const MB = 1024 * 1024;
export const KB = 1024;

/** Illustrative rates of the simulated app. */
export const APP = {
  /** The user moves to a new page this often: the old view unmounts, a new one mounts. */
  routeEveryMin: 2,
  requestsPerMin: 6,
  errorsPerMin: 3,
  /** Short-lived garbage the app allocates per minute (parsing, rendering, temporary arrays). */
  garbagePerMin: 12 * MB,
  /** A GC runs this often (real collectors run when allocation reaches a budget). */
  gcEveryMin: 10,
} as const;

/** Illustrative sizes. */
export const SIZE: Record<Ctor, number> = {
  Window: 64 * KB,
  HTMLDocument: 32 * KB,
  HTMLDivElement: 2 * KB,
  HTMLLIElement: 1 * KB,
  HTMLCanvasElement: 2 * MB,
  Router: 8 * KB,
  ChartView: 48 * KB,
  Array: 4 * MB,
  'EventListener list': 4 * KB,
  '(closure)': 1 * KB,
  Map: 4 * KB,
  WeakMap: 4 * KB,
  Request: 2 * KB,
  Response: 200 * KB,
  'Timer list': 4 * KB,
  ErrorReport: 100 * KB,
  ImageBitmap: 5 * MB,
};

export type Ctor =
  | 'Window' | 'HTMLDocument' | 'HTMLDivElement' | 'HTMLLIElement' | 'HTMLCanvasElement' | 'Router' | 'ChartView' | 'Array'
  | 'EventListener list' | '(closure)' | 'Map' | 'WeakMap' | 'Request' | 'Response' | 'Timer list' | 'ErrorReport' | 'ImageBitmap';

/** How many list items a view's DOM has. */
export const LIST_ITEMS = 20;
/** Fix caps. */
export const LRU_CAP = 100;
export const ERROR_RING = 50;
export const IMAGE_CAP = 60;

export interface Node {
  id: string;
  ctor: Ctor;
  size: number;
  /** A readable name for the retaining-path drawing: 'onResize', 'rows'. */
  name: string;
  edges: { to: string; label: string }[];
}

export interface Graph {
  nodes: Map<string, Node>;
  roots: string[];
  /** WeakMap entries: kept while the key is reachable without going through the map. */
  weak: { map: string; key: string; value: string }[];
}

export type LeakId = 'listener' | 'cache' | 'interval' | 'errors' | 'bigCache';
export type CacheFix = 'none' | 'lru' | 'weakmap';
export interface Config {
  leak: LeakId;
  /** Is the fix applied? For the cache, which fix. */
  fix: boolean;
  cacheFix: CacheFix;
}

class Builder {
  nodes = new Map<string, Node>();
  add(id: string, ctor: Ctor, name: string): string {
    this.nodes.set(id, { id, ctor, name, size: SIZE[ctor], edges: [] });
    return id;
  }
  edge(from: string, to: string, label: string) {
    this.nodes.get(from)!.edges.push({ to, label });
  }
}

/** One mounted (or once-mounted) chart view: the component, its 4 MB rows array and its DOM (a list and a 2 MB canvas). */
function addView(b: Builder, k: number): { view: string; el: string } {
  const view = b.add(`view${k}`, 'ChartView', `ChartView #${k}`);
  const rows = b.add(`rows${k}`, 'Array', 'rows (4 MB)');
  b.edge(view, rows, 'rows');
  const el = b.add(`el${k}`, 'HTMLDivElement', `div.chart #${k}`);
  b.edge(view, el, 'el');
  b.edge(el, b.add(`canvas${k}`, 'HTMLCanvasElement', 'canvas (2 MB backing store)'), 'child');
  for (let i = 0; i < LIST_ITEMS; i++) b.edge(el, b.add(`li${k}-${i}`, 'HTMLLIElement', 'li'), 'child');
  return { view, el };
}

/**
 * The heap at minute m: everything the app has allocated that some reference could still
 * hold. Whether it's live is decided by reachability, not by this builder.
 */
export function buildGraph(c: Config, m: number): Graph {
  const b = new Builder();
  const weak: Graph['weak'] = [];
  const win = b.add('window', 'Window', 'window');
  const doc = b.add('document', 'HTMLDocument', 'document');
  b.edge(win, doc, 'document');
  const timers = b.add('timers', 'Timer list', 'active timers');
  const router = b.add('router', 'Router', 'router');
  b.edge(win, router, 'app');

  const views = Math.floor(m / APP.routeEveryMin) + 1;
  const current = views - 1;
  const listeners = c.leak === 'listener' ? b.add('listeners', 'EventListener list', "window's resize listeners") : null;
  if (listeners) b.edge(win, listeners, 'resize listeners');
  // Old views are built only while something could still hold them; otherwise they were garbage
  // long ago. Whether a built view is live is still decided by reachability below.
  const oldViewsHeld = (c.leak === 'listener' || c.leak === 'interval') && !c.fix;
  for (let k = oldViewsHeld ? 0 : current; k < views; k++) {
    const { view, el } = addView(b, k);
    const mounted = k === current;
    if (mounted) {
      b.edge(router, view, 'current view');
      b.edge(doc, el, 'body child');
    }
    if (c.leak === 'listener' && (mounted || !c.fix)) {
      // addEventListener('resize', onResize): the closure captures the view. Unmounting without
      // removeEventListener / abort() leaves it in window's listener list.
      const fn = b.add(`onResize${k}`, '(closure)', 'onResize');
      b.edge(listeners!, fn, 'listener');
      b.edge(fn, view, 'captured this');
    }
    if (c.leak === 'interval' && (mounted || !c.fix)) {
      // setInterval(poll): the closure captures the view's element; the timer list keeps it alive
      // after the element is removed from the document (a detached DOM tree).
      const fn = b.add(`poll${k}`, '(closure)', 'poll');
      b.edge(timers, fn, 'interval');
      b.edge(fn, el, 'captured el');
    }
  }

  if (c.leak === 'cache') {
    const requests = Math.floor(m * APP.requestsPerMin);
    const inFlight = requests - 1;
    if (c.fix && c.cacheFix === 'weakmap') {
      const map = b.add('cache', 'WeakMap', 'responseCache');
      b.edge(win, map, 'responseCache');
      for (let r = 0; r < requests; r++) {
        const req = b.add(`req${r}`, 'Request', `Request #${r}`);
        const res = b.add(`res${r}`, 'Response', `Response #${r}`);
        weak.push({ map, key: req, value: res });
        // Only the request still in flight is held by the app; finished ones are dropped.
        if (r === inFlight) b.edge(router, req, 'pending request');
      }
    } else {
      const map = b.add('cache', 'Map', 'responseCache');
      b.edge(win, map, 'responseCache');
      const keep = c.fix ? Math.min(requests, LRU_CAP) : requests;
      for (let r = 0; r < requests; r++) {
        const res = b.add(`res${r}`, 'Response', `Response #${r}`);
        // Keyed by request id (a string): the Map holds every value until it's deleted.
        if (r >= requests - keep) b.edge(map, res, `"req-${r}"`);
      }
    }
  }

  if (c.leak === 'errors') {
    const arr = b.add('recentErrors', 'Array', 'recentErrors');
    b.nodes.get(arr)!.size = 8 * KB;
    b.edge(win, arr, 'recentErrors');
    const errors = Math.floor(m * APP.errorsPerMin);
    const keep = c.fix ? Math.min(errors, ERROR_RING) : errors;
    for (let e = 0; e < errors; e++) {
      const err = b.add(`err${e}`, 'ErrorReport', `ErrorReport #${e}`);
      if (e >= errors - keep) b.edge(arr, err, `[${e}]`);
    }
  }

  if (c.leak === 'bigCache') {
    // Not a leak: a deliberately large image cache with a fixed cap.
    const map = b.add('images', 'Map', 'imageCache');
    b.edge(win, map, 'imageCache');
    const loaded = Math.floor(m * APP.requestsPerMin);
    for (let i = 0; i < loaded; i++) {
      const img = b.add(`img${i}`, 'ImageBitmap', `ImageBitmap #${i}`);
      if (i >= loaded - Math.min(loaded, IMAGE_CAP)) b.edge(map, img, `"thumb-${i}"`);
    }
  }
  return { nodes: b.nodes, roots: [win, timers], weak };
}

/** Reachable set, with WeakMap entries as ephemerons: a value is reached only once its key is. */
export function reachable(g: Graph): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  const reach = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    queue.push(id);
  };
  g.roots.forEach(reach);
  for (;;) {
    while (queue.length) for (const e of g.nodes.get(queue.shift()!)!.edges) reach(e.to);
    const fresh = g.weak.filter((w) => seen.has(w.map) && seen.has(w.key) && !seen.has(w.value));
    if (!fresh.length) return seen;
    fresh.forEach((w) => reach(w.value));
  }
}

export const liveBytes = (g: Graph, live = reachable(g)) => [...live].reduce((a, id) => a + g.nodes.get(id)!.size, 0);

/* ---------- the sawtooth ---------- */

export interface Sample {
  minute: number;
  heap: number;
}

export interface HeapRun {
  samples: Sample[];
  /** Heap right after each GC: what stayed reachable. */
  troughs: Sample[];
}

/** Heap size each minute: live objects plus garbage since the last GC; each GC drops it to what's live. */
export function heapRun(c: Config, minutes: number): HeapRun {
  const samples: Sample[] = [];
  const troughs: Sample[] = [];
  let sinceGc = 0;
  for (let m = 0; m <= minutes; m++) {
    const live = liveBytes(buildGraph(c, m));
    if (m > 0 && m % APP.gcEveryMin === 0) {
      // Just before the GC, then just after: both at minute m, so the drop is vertical.
      samples.push({ minute: m, heap: live + sinceGc + APP.garbagePerMin });
      samples.push({ minute: m, heap: live });
      troughs.push({ minute: m, heap: live });
      sinceGc = 0;
    } else {
      if (m > 0) sinceGc += APP.garbagePerMin;
      samples.push({ minute: m, heap: live + sinceGc });
    }
  }
  return { samples, troughs };
}

/** Troughs this close are "flat". */
export const FLAT_TOLERANCE = 2 * MB;

export type Verdict = 'leak' | 'flat';

/**
 * Leaking if the trough keeps rising: compare the last GC's trough with the one nearest the
 * middle of the window, so a cache that fills up early and then stays full reads as flat.
 */
export function verdict(run: HeapRun): { verdict: Verdict; growthPerHour: number } {
  const t = run.troughs;
  if (t.length < 2) return { verdict: 'flat', growthPerHour: 0 };
  const last = t.at(-1)!;
  const mid = t[Math.floor((t.length - 1) / 2)];
  const span = last.minute - mid.minute;
  const growth = last.heap - mid.heap;
  const perHour = span > 0 ? (growth * 60) / span : 0;
  return { verdict: growth > FLAT_TOLERANCE ? 'leak' : 'flat', growthPerHour: perHour };
}

/* ---------- snapshots ---------- */

export type Snapshot = Map<Ctor, { count: number; bytes: number }>;

/** A heap snapshot: like DevTools, it collects garbage first, so it counts only live objects. */
export function snapshot(g: Graph): Snapshot {
  const out: Snapshot = new Map();
  for (const id of reachable(g)) {
    const n = g.nodes.get(id)!;
    const s = out.get(n.ctor) ?? { count: 0, bytes: 0 };
    out.set(n.ctor, { count: s.count + 1, bytes: s.bytes + n.size });
  }
  return out;
}

export interface DiffRow {
  ctor: Ctor;
  a: number;
  b: number;
  delta: number;
  deltaBytes: number;
  /** Bytes this constructor holds in B: the tie-break when nothing grew. */
  bBytes: number;
}

export function diff(a: Snapshot, b: Snapshot): DiffRow[] {
  const ctors = new Set<Ctor>([...a.keys(), ...b.keys()]);
  return [...ctors]
    .map((ctor) => {
      const x = a.get(ctor) ?? { count: 0, bytes: 0 };
      const y = b.get(ctor) ?? { count: 0, bytes: 0 };
      return { ctor, a: x.count, b: y.count, delta: y.count - x.count, deltaBytes: y.bytes - x.bytes, bBytes: y.bytes };
    })
    .sort((p, q) => q.deltaBytes - p.deltaBytes || q.delta - p.delta || q.bBytes - p.bBytes || p.ctor.localeCompare(q.ctor));
}

/** The shortest chain of references from a GC root to `target` (BFS), or null if it's unreachable. */
export function retainingPath(g: Graph, target: string): { id: string; via: string | null }[] | null {
  const prev = new Map<string, { from: string | null; label: string | null }>();
  const queue: string[] = [];
  for (const r of g.roots) {
    prev.set(r, { from: null, label: null });
    queue.push(r);
  }
  const live = reachable(g);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === target) break;
    const out = [...g.nodes.get(id)!.edges, ...g.weak.filter((w) => w.map === id && live.has(w.key)).map((w) => ({ to: w.value, label: 'weak entry' }))];
    for (const e of out) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, { from: id, label: e.label });
      queue.push(e.to);
    }
  }
  if (!prev.has(target)) return null;
  const path: { id: string; via: string | null }[] = [];
  for (let at: string | null = target; at !== null; ) {
    const p: { from: string | null; label: string | null } = prev.get(at)!;
    path.unshift({ id: at, via: p.label });
    at = p.from;
  }
  return path;
}

/**
 * The object of this constructor to explain: the newest one that was already alive at snapshot
 * A and is still alive at B. Surviving the whole interval is what a leaked object does; the
 * newest live object is usually the one the app is using right now. Falls back to the newest
 * live object when nothing survived (a cache that evicted everything, a fixed leak).
 */
export function survivorOf(a: Graph, b: Graph, ctor: Ctor): { id: string; survived: boolean } | null {
  const liveA = reachable(a);
  const liveB = reachable(b);
  const ids = [...b.nodes.values()].filter((n) => n.ctor === ctor && liveB.has(n.id)).map((n) => n.id);
  const survivor = ids.filter((id) => liveA.has(id)).at(-1);
  if (survivor) return { id: survivor, survived: true };
  const newest = ids.at(-1);
  return newest ? { id: newest, survived: false } : null;
}
