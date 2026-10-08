// The scripted scenes: the three patterns, and the four ways a cache goes stale. Every arrow is
// produced by running the model, never typed by hand.
import { behindBeats, traceBeats, ttlBeat, viewOf, type BehindBeat } from './beats';
import {
  behindStart, cached, execute, initialStore, isStale, readAside, readThrough, timed, writeAside, writeThrough, type Beat, type BehindOp,
  type Invalidation, type Options, type Served, type Step, type Store, type Timed, type View,
} from './model';

export type PatternId = 'aside' | 'through' | 'behind';
export type RaceId = 'update-set' | 'read-fill' | 'replica-lag' | 'ttl-only';

export const PRICE = { old: '$10', new: '$12', other: '$15' } as const;
/** Illustrative TTL for the pattern scripts (nothing in them lives long enough to expire). */
export const PATTERN_TTL = 60;
/** The TTL the "TTL backstop" switch turns on, in seconds. */
export const BACKSTOP_TTL = 30;
export const DEFAULT_TTL_ONLY = 30;
export const DEFAULT_LAG = 5;

const at = (steps: readonly Step[], start: number): Timed[] => steps.map((s, i) => ({ ...s, t: start + i }));

// ── The patterns ──────────────────────────────────────────────────────────

export interface PatternScript {
  beats: Beat[];
  final: Store;
  /** What the stores hold before the first arrow. */
  start: View;
}

const patternOptions: Options = { ttl: PATTERN_TTL, lag: 0 };

/** Cache-aside: read (miss, then hit), write (database, then delete the key), read again. */
export function asideScript(invalidate: Invalidation = 'delete'): PatternScript {
  const steps = timed([
    ...readAside('A'), ...readAside('A'), ...writeAside('A', PRICE.new, invalidate), ...readAside('A'),
  ]);
  const init = initialStore(PRICE.old);
  return { beats: traceBeats(init, steps, patternOptions), final: execute(init, steps, patternOptions).store, start: viewOf(init, 0, patternOptions) };
}

/** Write-through: the cache layer loads on a miss and writes cache and database together on a write. */
export function throughScript(): PatternScript {
  const steps = timed([...readThrough('A'), ...readThrough('A'), ...writeThrough('A', PRICE.new), ...readThrough('A')]);
  const init = initialStore(PRICE.old);
  return { beats: traceBeats(init, steps, patternOptions), final: execute(init, steps, patternOptions).store, start: viewOf(init, 0, patternOptions) };
}

/** The write-behind script: four writes, a flush after the second, and then a flush or a crash. */
export function behindOps(crash: boolean): BehindOp[] {
  return [
    { op: 'write', value: '$11' }, { op: 'write', value: PRICE.new }, { op: 'flush' },
    { op: 'write', value: '$13' }, { op: 'write', value: '$14' }, crash ? { op: 'crash' } : { op: 'flush' },
  ];
}
export const behindScript = (crash: boolean): BehindBeat[] => behindBeats(PRICE.old, behindOps(crash));
export const behindStartView = (): View => {
  const s = behindStart(PRICE.old);
  return { db: s.db, replica: s.db, cache: s.cache, queued: 0 };
};

// ── The races ─────────────────────────────────────────────────────────────

export interface RaceConfig {
  /** How writers invalidate the key (update-set and read-fill). */
  invalidate: Invalidation;
  /** Entries expire after this long; null for never. */
  ttl: number | null;
  /** Replica lag, seconds (replica-lag). */
  lag: number;
}

export interface Race {
  id: RaceId;
  beats: Beat[];
  /** What the stores hold before the first arrow. */
  start: View;
  options: Options;
  /** Index of the beat that finishes the race itself; what follows is the reader coming back. */
  raceEnd: number;
  /** After the race, before any TTL: the cache and database values, and whether they disagree. */
  afterRace: { db: string; cache: string | null; stale: boolean };
  /** The first read after the race, if there is one. */
  firstRead: Served | null;
  /** The read after the TTL ran out, if there is a TTL and an entry to expire. */
  afterTtl: Served | null;
  /** When the stale entry (if any) stops being served, seconds. */
  staleUntil: number | null;
}

interface Plan {
  init: Store;
  raceSteps: Timed[];
  /** Read once more right after the race. */
  readAfter: boolean;
}

function plan(id: RaceId, cfg: RaceConfig): Plan {
  switch (id) {
    case 'update-set': {
      // Two writers update the database in one order and the cache in the other.
      const a = writeAside('A', PRICE.new, cfg.invalidate);
      const b = writeAside('B', PRICE.other, cfg.invalidate);
      const order = [a[0], b[0], b[1], a[1]];
      return { init: { ...initialStore(PRICE.old, PRICE.old) }, raceSteps: at(order, 1), readAfter: true };
    }
    case 'read-fill': {
      // The reader loads the old value, the writer finishes, then the reader fills the cache with what it loaded.
      const r = readAside('A', 'db');
      const w = writeAside('B', PRICE.new, cfg.invalidate);
      return { init: initialStore(PRICE.old), raceSteps: at([r[0], r[1], w[0], w[1], r[2]], 1), readAfter: true };
    }
    case 'replica-lag': {
      // The writer finishes and invalidates; a reader then fills the cache from a replica that has not caught up.
      const w = writeAside('B', PRICE.new, 'delete');
      const r = readAside('A', 'replica');
      return { init: initialStore(PRICE.old, PRICE.old), raceSteps: at([...w, ...r], 1), readAfter: true };
    }
    case 'ttl-only': {
      // Nobody invalidates: the writer updates the database only, and the cache learns of it when its TTL runs out.
      const fill = readAside('A', 'db');
      return {
        init: initialStore(PRICE.old),
        raceSteps: [...at(fill, 1), { client: 'B', op: 'db-write', value: PRICE.new, t: 6 }, ...at(readAside('A', 'db'), 8)],
        readAfter: false,
      };
    }
  }
}

export function race(id: RaceId, cfg: RaceConfig): Race {
  const { ttl } = cfg;
  const options: Options = { ttl, lag: cfg.lag };
  const p = plan(id, cfg);
  const raceBeats = traceBeats(p.init, p.raceSteps, options);
  const afterRaceStore = execute(p.init, p.raceSteps, options).store;
  const lastT = p.raceSteps.at(-1)!.t;
  const afterRace = { db: afterRaceStore.db, cache: cached(afterRaceStore, lastT, ttl), stale: isStale(afterRaceStore, lastT, ttl) };

  let beats: Beat[] = raceBeats;
  let store = afterRaceStore;
  let t = lastT + 1;
  let firstRead: Served | null = null;
  if (p.readAfter) {
    const steps = at(readAside('A', 'db'), t);
    const out = execute(store, steps, options);
    firstRead = out.served.at(-1) ?? null;
    beats = [...beats, ...traceBeats(store, steps, options).map((b, i) => ({ ...b, id: `r${i}` }))];
    store = out.store;
    t = steps.at(-1)!.t + 1;
  } else {
    // The stale read is already in the race; report it.
    firstRead = execute(p.init, p.raceSteps, options).served.at(-1) ?? null;
  }

  let afterTtl: Served | null = null;
  let staleUntil: number | null = null;
  // Only a stale entry has a TTL worth waiting out; a fresh one expiring would teach nothing.
  if (ttl !== null && store.cache !== null && store.cacheVersion < store.dbVersion) {
    staleUntil = store.cacheSetAt + ttl;
    const expiry = ttlBeat(store, staleUntil, options, 0);
    const steps = at(readAside('A', 'db'), staleUntil + 1);
    const out = execute(store, steps, options);
    afterTtl = out.served.at(-1) ?? null;
    const expired: Store = { ...store };
    beats = [...beats, { ...expiry, view: { ...expiry.view, cache: null }, stale: false }, ...traceBeats(expired, steps, options).map((b, i) => ({ ...b, id: `t${i}` }))];
  }
  return { id, beats, start: viewOf(p.init, 0, options), options, raceEnd: raceBeats.length - 1, afterRace, firstRead, afterTtl, staleUntil };
}

// ── The staleness window (TTL only) ───────────────────────────────────────

export interface WindowBar {
  lane: 'db' | 'cache';
  start: number;
  end: number;
  value: string;
  /** The cache is serving a value the database no longer has. */
  stale: boolean;
}

/**
 * The TTL-only race as bars on two lanes: what the database holds, and what a reader of the cache
 * is served. The stale stretch runs from the write to the moment the entry expires.
 */
export function stalenessWindow(ttl: number): { bars: WindowBar[]; domain: [number, number]; write: number; expiry: number; window: number } {
  const r = race('ttl-only', { invalidate: 'delete', ttl, lag: 0 });
  const stored = r.beats.find((b) => b.kind === 'fill')!.t;
  const write = r.beats.find((b) => b.kind === 'db-write')!.t;
  const expiry = r.staleUntil!;
  const end = expiry + 6;
  return {
    bars: [
      { lane: 'db', start: 0, end: write, value: PRICE.old, stale: false },
      { lane: 'db', start: write, end, value: PRICE.new, stale: false },
      { lane: 'cache', start: stored, end: write, value: PRICE.old, stale: false },
      { lane: 'cache', start: write, end: expiry, value: PRICE.old, stale: true },
      { lane: 'cache', start: expiry, end, value: PRICE.new, stale: false },
    ],
    domain: [0, end],
    write,
    expiry,
    window: expiry - write,
  };
}
