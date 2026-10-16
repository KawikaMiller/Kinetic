/**
 * Scenes 1 and 2: the operating system's page cache for one file, reached by read() or by mmap. An LRU toy with
 * readahead, a page table per process (for mmap) and counters that are counted, not estimated. Pure.
 */
import { mulberry32 } from '../../core/random';

export const PAGE_BYTES = 4096;
export const MAX_FILE_PAGES = 64;
export const MIN_FILE_PAGES = 16;
export const MIN_CAPACITY = 8;
export const MAX_CAPACITY = 64;
/** Accesses in a trace. */
export const TRACE_LEN = 64;
/** The repeat pattern cycles over this many pages. */
export const REPEAT_PAGES = 8;
/** The mixed pattern reads this many pages in a row, then jumps. */
export const RUN_LEN = 8;
/**
 * Readahead window caps, in pages, from 1 (off) to 32. 32 pages of 4 KB is 128 KB, the usual default of `read_ahead_kb`
 * (from memory, and seen on the virtual and RAM disks of one WSL2 kernel; that kernel's sd disks said 8192).
 */
export const WINDOW_CAPS: readonly number[] = [1, 2, 4, 8, 16, 32];
export const DEFAULT_CAP_OFF = 1;

export type Method = 'read' | 'mmap';
export type Pattern = 'sequential' | 'random' | 'repeat' | 'two' | 'mixed';

export interface Access {
  proc: number;
  page: number;
}

export interface TraceConfig {
  pattern: Pattern;
  filePages: number;
  seed: number;
}

export function makeTrace({ pattern, filePages, seed }: TraceConfig): Access[] {
  const rnd = mulberry32(seed);
  const out: Access[] = [];
  let runStart = 0;
  for (let i = 0; i < TRACE_LEN; i++) {
    if (pattern === 'sequential') out.push({ proc: 0, page: i % filePages });
    else if (pattern === 'random') out.push({ proc: 0, page: Math.floor(rnd() * filePages) });
    else if (pattern === 'repeat') out.push({ proc: 0, page: i % REPEAT_PAGES });
    else if (pattern === 'two') out.push({ proc: i % 2, page: Math.floor(i / 2) % filePages });
    else {
      if (i % RUN_LEN === 0) runStart = Math.floor(rnd() * Math.max(1, filePages - RUN_LEN + 1));
      out.push({ proc: 0, page: runStart + (i % RUN_LEN) });
    }
  }
  return out;
}

export type Outcome = 'hit' | 'miss' | 'mapped' | 'minor' | 'major';

export interface Counters {
  accesses: number;
  hits: number;
  /** Pages read from disk (readahead included). */
  diskPages: number;
  /** Separate disk requests: one per miss, however many pages it brought in. */
  ios: number;
  minor: number;
  major: number;
  bytesCopied: number;
  /** Pages brought in by readahead beyond the one asked for. */
  prefetched: number;
  /** Prefetched pages evicted before any access touched them. */
  prefetchEvictedUnused: number;
}

export interface Snapshot {
  access: Access | null;
  outcome: Outcome | null;
  /** Per page: 0 not cached, 1 cached. */
  cached: number[];
  /** Per page: bit 0 mapped by process 0, bit 1 by process 1. */
  mapped: number[];
  /** Per page: brought in by readahead and not touched since. */
  unusedPrefetch: boolean[];
  counters: Counters;
}

export interface CacheConfig {
  filePages: number;
  capacity: number;
  method: Method;
  /** Readahead window cap in pages; 1 means no readahead. */
  windowCap: number;
}

const ZERO: Counters = { accesses: 0, hits: 0, diskPages: 0, ios: 0, minor: 0, major: 0, bytesCopied: 0, prefetched: 0, prefetchEvictedUnused: 0 };

/** Replays a trace; `steps[0]` is the empty cache before any access, `steps[i]` the state after access i. */
export function simulate(config: CacheConfig, trace: readonly Access[]): Snapshot[] {
  const { filePages, capacity, method, windowCap } = config;
  /** Most recently used last. */
  const lru = new Map<number, true>();
  const mapped: [Set<number>, Set<number>] = [new Set(), new Set()];
  const unused = new Set<number>();
  const last = [-2, -2];
  const window = [1, 1];
  const c: Counters = { ...ZERO };

  const touch = (page: number) => {
    lru.delete(page);
    lru.set(page, true);
  };
  const evict = (keep: ReadonlySet<number>) => {
    while (lru.size > capacity) {
      const victim = [...lru.keys()].find((p) => !keep.has(p));
      if (victim === undefined) return;
      lru.delete(victim);
      mapped[0].delete(victim);
      mapped[1].delete(victim);
      if (unused.delete(victim)) c.prefetchEvictedUnused++;
    }
  };
  /** A miss: read the window starting at `page` from disk. */
  const fetch = (proc: number, page: number, sequential: boolean) => {
    window[proc] = sequential ? Math.min(window[proc] * 2, windowCap) : 1;
    const span = Math.min(window[proc], capacity, filePages - page);
    const batch = new Set<number>();
    for (let p = page; p < page + span; p++) {
      if (lru.has(p)) continue;
      lru.set(p, true);
      batch.add(p);
      c.diskPages++;
      if (p !== page) {
        c.prefetched++;
        unused.add(p);
      }
    }
    c.ios++;
    touch(page);
    evict(batch);
  };

  const snapshot = (access: Access | null, outcome: Outcome | null): Snapshot => ({
    access, outcome,
    cached: Array.from({ length: filePages }, (_, p) => (lru.has(p) ? 1 : 0)),
    mapped: Array.from({ length: filePages }, (_, p) => (mapped[0].has(p) ? 1 : 0) | (mapped[1].has(p) ? 2 : 0)),
    unusedPrefetch: Array.from({ length: filePages }, (_, p) => unused.has(p)),
    counters: { ...c },
  });

  const steps: Snapshot[] = [snapshot(null, null)];
  for (const a of trace) {
    c.accesses++;
    const sequential = a.page === last[a.proc] + 1;
    if (!sequential && a.page !== last[a.proc]) window[a.proc] = 1;
    last[a.proc] = a.page;
    const cached = lru.has(a.page);
    let outcome: Outcome;
    if (method === 'read') {
      c.bytesCopied += PAGE_BYTES;
      if (cached) {
        c.hits++;
        touch(a.page);
        outcome = 'hit';
      } else {
        fetch(a.proc, a.page, sequential);
        outcome = 'miss';
      }
    } else if (mapped[a.proc].has(a.page)) {
      c.hits++;
      touch(a.page);
      outcome = 'mapped';
    } else if (cached) {
      c.hits++;
      c.minor++;
      touch(a.page);
      mapped[a.proc].add(a.page);
      outcome = 'minor';
    } else {
      c.major++;
      fetch(a.proc, a.page, sequential);
      mapped[a.proc].add(a.page);
      outcome = 'major';
    }
    unused.delete(a.page);
    steps.push(snapshot(a, outcome));
  }
  return steps;
}

export const finalOf = (steps: readonly Snapshot[]) => steps[steps.length - 1];
export const hitRatio = (c: Counters) => (c.accesses === 0 ? 0 : c.hits / c.accesses);

/** Hit ratio at each window cap, by running the same trace through the model once per cap. */
export const hitRatioByWindow = (base: Omit<CacheConfig, 'windowCap'>, trace: readonly Access[], caps: readonly number[] = WINDOW_CAPS) =>
  caps.map((windowCap) => ({ windowCap, ratio: hitRatio(finalOf(simulate({ ...base, windowCap }, trace)).counters) }));

/** Pages fetched by readahead that no access touched before the snapshot: evicted unused, or still sitting in the cache unused. */
export const wastedPrefetch = (s: Snapshot) => s.counters.prefetchEvictedUnused + s.unusedPrefetch.filter(Boolean).length;
