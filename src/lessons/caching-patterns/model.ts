// One product price in a cache and a database. Pure model of the three patterns and of what two
// concurrent clients can do to the cache. A client's operation is a short list of steps, and a
// race is one particular interleaving of two such lists; model.test.ts enumerates all of them.
import type { Tone } from '../../core/tone';

export type Client = 'A' | 'B';
export type Lane = Client | 'cache' | 'db' | 'replica';

/** How a cache-aside writer invalidates the key after writing the database. */
export type Invalidation = 'delete' | 'set';
export type ReadSource = 'db' | 'replica';

export type StepOp =
  | 'get'            // look in the cache
  | 'load'           // on a miss, read the source of truth (database or replica)
  | 'fill'           // on a miss, put what was loaded in the cache
  | 'db-write'       // update the database
  | 'delete'         // remove the key from the cache
  | 'set'            // put the new value in the cache
  | 'write-through'  // the cache layer writes cache and database as one locked step
  | 'read-through';  // the cache layer looks up, loads and fills as one locked step

export interface Step {
  client: Client;
  op: StepOp;
  /** The value written (db-write, set, write-through). */
  value?: string;
  /** What `load` reads from. */
  source?: ReadSource;
}

/** A cache-aside read: the app does the lookup, the load and the fill itself, in three steps. */
export const readAside = (client: Client, source: ReadSource = 'db'): Step[] => [
  { client, op: 'get' }, { client, op: 'load', source }, { client, op: 'fill' },
];
/** A cache-aside write: update the database, then delete (or overwrite) the cache key. */
export const writeAside = (client: Client, value: string, how: Invalidation): Step[] => [
  { client, op: 'db-write', value }, { client, op: how, value },
];
export const writeThrough = (client: Client, value: string): Step[] => [{ client, op: 'write-through', value }];
export const readThrough = (client: Client): Step[] => [{ client, op: 'read-through' }];

/**
 * Every value carries the version of the database write that produced it, so "stale" has a meaning
 * that holds even when two writers cross: a cache entry is stale when its version is older than the
 * database's. (A cache that is briefly ahead of the database, as in write-through, is not stale.)
 */
export interface Store {
  db: string;
  dbVersion: number;
  /** Every write to the database, for the replica to catch up on. */
  history: { at: number; value: string; version: number }[];
  cache: string | null;
  cacheVersion: number;
  /** When the current cache entry was stored (seconds). */
  cacheSetAt: number;
}

export const initialStore = (db: string, cache: string | null = null): Store => ({
  db, dbVersion: 0, history: [{ at: Number.NEGATIVE_INFINITY, value: db, version: 0 }], cache, cacheVersion: 0, cacheSetAt: 0,
});

export interface Options {
  /** Cache entries expire this many seconds after they are stored; null means never. */
  ttl: number | null;
  /** The replica shows a write this many seconds after the database. */
  lag: number;
}

/** What the replica holds at `now`: the latest write that is at least `lag` old. */
export function replicaEntry(store: Store, now: number, lag: number): { value: string; version: number } {
  let entry = store.history[0];
  for (const h of store.history) if (h.at + lag <= now) entry = h;
  return { value: entry.value, version: entry.version };
}
export const replicaValue = (store: Store, now: number, lag: number): string => replicaEntry(store, now, lag).value;

/** A live cache entry at `now`: stored, and not past its TTL. */
export function cached(store: Store, now: number, ttl: number | null): string | null {
  if (store.cache === null) return null;
  if (ttl !== null && now >= store.cacheSetAt + ttl) return null;
  return store.cache;
}

/** What a client has in hand between its own steps. */
interface Registers {
  hit: string | null;
  loaded: string | null;
  loadedVersion: number;
  /** The version this client's own database write got. */
  written: number | null;
}

export interface Served {
  client: Client;
  value: string;
  /** It came from the cache. */
  fromCache: boolean;
  /** It differs from the database's value at that moment. */
  stale: boolean;
}

export interface Timed extends Step {
  /** When the step happens, in seconds. */
  t: number;
}

export interface StepResult {
  store: Store;
  served: Served | null;
  /** What the step found or did, for captions and notes. */
  detail: { hit?: boolean; loaded?: string; skipped?: boolean };
}

/** Run one step against the store. Pure: returns the new store. */
export function applyStep(store: Store, regs: Record<Client, Registers>, s: Timed, o: Options): StepResult {
  const r = regs[s.client];
  const next: Store = { ...store, history: store.history };
  switch (s.op) {
    case 'get': {
      const hit = cached(store, s.t, o.ttl);
      r.hit = hit;
      r.loaded = null;
      const served = hit === null ? null : { client: s.client, value: hit, fromCache: true, stale: store.cacheVersion < store.dbVersion };
      return { store, served, detail: { hit: hit !== null } };
    }
    case 'load': {
      if (r.hit !== null) return { store, served: null, detail: { skipped: true } };
      const from = s.source === 'replica' ? replicaEntry(store, s.t, o.lag) : { value: store.db, version: store.dbVersion };
      r.loaded = from.value;
      r.loadedVersion = from.version;
      return { store, served: null, detail: { loaded: r.loaded } };
    }
    case 'fill': {
      if (r.hit !== null || r.loaded === null) return { store, served: null, detail: { skipped: true } };
      next.cache = r.loaded;
      next.cacheVersion = r.loadedVersion;
      next.cacheSetAt = s.t;
      const served = { client: s.client, value: r.loaded, fromCache: false, stale: r.loadedVersion < store.dbVersion };
      return { store: next, served, detail: { loaded: r.loaded } };
    }
    case 'db-write':
      next.db = s.value!;
      next.dbVersion = store.dbVersion + 1;
      next.history = [...store.history, { at: s.t, value: s.value!, version: next.dbVersion }];
      r.written = next.dbVersion;
      return { store: next, served: null, detail: {} };
    case 'delete':
      next.cache = null;
      return { store: next, served: null, detail: {} };
    case 'set':
      next.cache = s.value!;
      next.cacheVersion = r.written ?? store.dbVersion;
      next.cacheSetAt = s.t;
      return { store: next, served: null, detail: {} };
    case 'write-through':
      next.db = s.value!;
      next.dbVersion = store.dbVersion + 1;
      next.history = [...store.history, { at: s.t, value: s.value!, version: next.dbVersion }];
      next.cache = s.value!;
      next.cacheVersion = next.dbVersion;
      next.cacheSetAt = s.t;
      return { store: next, served: null, detail: {} };
    case 'read-through': {
      const hit = cached(store, s.t, o.ttl);
      if (hit !== null) return { store, served: { client: s.client, value: hit, fromCache: true, stale: store.cacheVersion < store.dbVersion }, detail: { hit: true } };
      next.cache = store.db;
      next.cacheVersion = store.dbVersion;
      next.cacheSetAt = s.t;
      return { store: next, served: { client: s.client, value: store.db, fromCache: false, stale: false }, detail: { hit: false, loaded: store.db } };
    }
  }
}

export interface Outcome {
  store: Store;
  served: Served[];
}

export const freshRegisters = (): Record<Client, Registers> => ({
  A: { hit: null, loaded: null, loadedVersion: 0, written: null },
  B: { hit: null, loaded: null, loadedVersion: 0, written: null },
});

/** Run steps in the order given, one second apart unless `t` says otherwise. */
export function execute(init: Store, steps: readonly Timed[], o: Options): Outcome {
  const regs = freshRegisters();
  let store = init;
  const served: Served[] = [];
  for (const s of steps) {
    const res = applyStep(store, regs, s, o);
    store = res.store;
    if (res.served) served.push(res.served);
  }
  return { store, served };
}

/** Give each step in a list the time it is at: 0, 1, 2, ... */
export const timed = (steps: readonly Step[]): Timed[] => steps.map((s, t) => ({ ...s, t }));

/** Every way two lists of steps can interleave while each keeps its own order. */
export function interleavings<T>(a: readonly T[], b: readonly T[]): T[][] {
  if (!a.length) return [[...b]];
  if (!b.length) return [[...a]];
  return [
    ...interleavings(a.slice(1), b).map((rest) => [a[0], ...rest]),
    ...interleavings(a, b.slice(1)).map((rest) => [b[0], ...rest]),
  ];
}

/** The cache serves a value from before the database's latest write. */
export const isStale = (store: Store, now: number, ttl: number | null) =>
  cached(store, now, ttl) !== null && store.cacheVersion < store.dbVersion;

// ── Write-behind ──────────────────────────────────────────────────────────

export interface BehindState {
  db: string;
  cache: string | null;
  /** Writes in the cache that the database has not seen yet, oldest first. */
  queue: string[];
  /** Writes lost to crashes so far. */
  lost: number;
}

export type BehindOp = { op: 'write'; value: string } | { op: 'flush' } | { op: 'crash' };

export const behindStart = (db: string): BehindState => ({ db, cache: db, queue: [], lost: 0 });

/** Writes go to the cache and a queue; a flush writes the latest value to the database; a crash loses the queue. */
export function behindStep(state: BehindState, op: BehindOp): BehindState {
  switch (op.op) {
    case 'write':
      return { ...state, cache: op.value, queue: [...state.queue, op.value] };
    case 'flush':
      return { ...state, db: state.queue.at(-1) ?? state.db, queue: [] };
    case 'crash':
      return { ...state, cache: null, lost: state.lost + state.queue.length, queue: [] };
  }
}

export function runBehind(start: BehindState, ops: readonly BehindOp[]): BehindState {
  return ops.reduce(behindStep, start);
}

// ── Beats: what the diagram shows ─────────────────────────────────────────

export type BeatKind =
  | 'hit' | 'miss' | 'db-read' | 'replica-read' | 'fill' | 'db-write' | 'delete' | 'set' | 'cache-write' | 'cache-db-write'
  | 'queue' | 'flush' | 'crash' | 'ttl';

export const BEAT_TONE: Record<BeatKind, Tone> = {
  hit: 'ok', miss: 'hi', 'db-read': 'info', 'replica-read': 'info', fill: 'hi', 'db-write': 'info', delete: 'violet', set: 'sky',
  'cache-write': 'sky', 'cache-db-write': 'info', queue: 'sky', flush: 'info', crash: 'bad', ttl: 'dim',
};

export interface View {
  db: string;
  replica: string;
  cache: string | null;
  /** Writes queued for the database (write-behind). */
  queued: number;
}

export interface Beat {
  id: string;
  from: Lane;
  to: Lane;
  kind: BeatKind;
  label: string;
  note?: string;
  /** The step's time, in seconds. */
  t: number;
  /** The client the beat belongs to, if any. */
  client?: Client;
  /** A read that handed a value to its client. */
  served?: Served;
  /** What the three stores hold once this beat has happened. */
  view: View;
  /** The cache disagrees with the database after this beat. */
  stale: boolean;
}
