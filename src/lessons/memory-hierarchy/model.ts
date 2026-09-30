// Latency and capacity of each level of the memory hierarchy, as typical orders
// of magnitude. `range` is the commonly quoted span for each figure (e.g. the
// "latency numbers every programmer should know" tables and vendor datasheets);
// the tests hold every figure to it. Real hardware varies.

export interface Level {
  id: string;
  name: string;
  /** Typical access time, in nanoseconds. */
  ns: number;
  /** The documented span the figure must sit in, in nanoseconds. */
  range: readonly [number, number];
  /** Typical size, in bytes; null for network hops (not storage). */
  capacity: number | null;
  note: string;
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

/** Fastest first. */
export const LEVELS: Level[] = [
  { id: 'reg', name: 'CPU register', ns: 0.3, range: [0.2, 0.5], capacity: KB, note: 'about one clock cycle' },
  { id: 'l1', name: 'L1 cache', ns: 1, range: [0.5, 2], capacity: 64 * KB, note: 'per core' },
  { id: 'l2', name: 'L2 cache', ns: 4, range: [3, 5], capacity: MB, note: 'per core' },
  { id: 'l3', name: 'L3 cache', ns: 20, range: [10, 40], capacity: 32 * MB, note: 'shared by cores' },
  { id: 'ram', name: 'Main memory (RAM)', ns: 100, range: [80, 120], capacity: 32 * GB, note: 'DRAM' },
  { id: 'nvme', name: 'NVMe SSD read', ns: 50_000, range: [20_000, 100_000], capacity: 2 * TB, note: 'random 4 KB read' },
  { id: 'dc', name: 'Round trip in a datacenter', ns: 500_000, range: [250_000, 1_000_000], capacity: null, note: 'to another server' },
  { id: 'hdd', name: 'HDD seek', ns: 5_000_000, range: [2_000_000, 10_000_000], capacity: 10 * TB, note: 'spinning disk' },
  { id: 'wan', name: 'Cross-continent round trip', ns: 150_000_000, range: [100_000_000, 150_000_000], capacity: null, note: 'e.g. California ⇄ Europe' },
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id)!;

/** Average access time with a cache: hits cost `fastNs`, misses fall through to `slowNs`. */
export const effectiveNs = (hitRate: number, fastNs: number, slowNs: number) => hitRate * fastNs + (1 - hitRate) * slowNs;

/** How many times slower `a` is than `b`. */
export const ratio = (a: number, b: number) => a / b;

// ── Formatting ───────────────────────────────────────────────────────

/** Whole numbers from 10 up, one decimal below (dropping a trailing .0). */
const trim = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''));

/** Real time: '0.3 ns', '4 ns', '50 µs', '5 ms', '150 ms'. */
export function formatLatency(ns: number): string {
  if (ns < 1_000) return `${trim(ns)} ns`;
  if (ns < 1_000_000) return `${trim(ns / 1_000)} µs`;
  if (ns < 1_000_000_000) return `${trim(ns / 1_000_000)} ms`;
  return `${trim(ns / 1_000_000_000)} s`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

/** Human time, where 1 ns becomes 1 s: '1 s', '1.7 min', '14 hours', '58 days', '4.8 years'. */
export function formatHuman(seconds: number): string {
  if (seconds < MINUTE) return `${trim(seconds)} s`;
  if (seconds < HOUR) return `${trim(seconds / MINUTE)} min`;
  if (seconds < DAY) return `${trim(seconds / HOUR)} hours`;
  if (seconds < YEAR) return `${trim(seconds / DAY)} days`;
  return `${trim(seconds / YEAR)} years`;
}

/** 1 ns of real time becomes 1 s of human time. */
export const HUMAN_SECONDS_PER_NS = 1;
