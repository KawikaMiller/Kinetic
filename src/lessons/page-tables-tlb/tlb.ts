/**
 * A small TLB with LRU replacement, the access patterns that exercise it, context switches with and without address-space
 * tags, and the cost of a shootdown. Every cost is a count of model references or an illustrative constant, never a time.
 */
import { mulberry32 } from '../../core/random';
import { PAGE_BITS, PAGE_BYTES, WALK_REFERENCES } from './paging';

export type TlbPageSize = 'p4k' | 'p2m';
export type Pattern = 'sequential' | 'stride' | 'random';
export const PATTERNS: readonly Pattern[] = ['sequential', 'stride', 'random'];
export const PATTERN_LABELS: Record<Pattern, string> = { sequential: 'Sequential walk', stride: 'Stride', random: 'Random' };

export const ENTRY_OPTIONS = [4, 8, 16, 32, 64] as const;
export const WORKING_SET = { min: 1, max: 128, default: 10 } as const;
export const STRIDE = { min: 1, max: 16, default: 4 } as const;
export const ACCESSES = 128;
export const CURVE_ACCESSES = 512;
export const TLB_SEED = 9;
/** Cycles for a TLB hit, and per memory reference of a walk: round numbers for the lesson, not measurements. */
export const HIT_CYCLES = 1;
export const REFERENCE_CYCLES = 30;
const SMALL_PAGE = 4096;

export interface TlbConfig {
  entries: number;
  size: TlbPageSize;
  pattern: Pattern;
  /** The region touched, in 4 KiB pages. */
  workingSet: number;
  /** Pages skipped between touches (stride pattern only). */
  stride: number;
}

export const tlbOpening = (): TlbConfig => ({ entries: 8, size: 'p4k', pattern: 'sequential', workingSet: WORKING_SET.default, stride: STRIDE.default });

/** Byte addresses touched, in order. */
export function addresses(cfg: TlbConfig, count = ACCESSES): number[] {
  const rnd = mulberry32(TLB_SEED);
  const distinct = Math.ceil(cfg.workingSet / cfg.stride);
  return Array.from({ length: count }, (_, i) => {
    switch (cfg.pattern) {
      case 'sequential': return (i % cfg.workingSet) * SMALL_PAGE;
      case 'stride': return (i % distinct) * cfg.stride * SMALL_PAGE;
      case 'random': return Math.floor(rnd() * cfg.workingSet) * SMALL_PAGE;
    }
  });
}

export interface TlbStep {
  index: number;
  address: number;
  vpn: number;
  hit: boolean;
  /** The entry slot read or filled. */
  slot: number;
  /** The page number thrown out to make room, if any. */
  evicted: number | null;
  /** Every slot's page number just after this access. */
  after: (number | null)[];
}

export interface TlbRun {
  steps: TlbStep[];
  hits: number;
  misses: number;
  /** Entries after the last access: the page number in each slot, or null. */
  slots: (number | null)[];
}

/** An LRU TLB: a miss fills an empty slot if there is one, else the least recently used. */
export class Lru<K> {
  private readonly keys: (K | null)[];
  private readonly used: number[];
  private clock = 0;
  constructor(capacity: number) {
    this.keys = Array.from({ length: capacity }, () => null);
    this.used = Array.from({ length: capacity }, () => -1);
  }
  get contents(): readonly (K | null)[] { return this.keys; }
  clear() {
    this.keys.fill(null);
    this.used.fill(-1);
  }
  /** Touch a key: the slot, whether it hit, and the key evicted (if any). */
  access(key: K, same: (a: K, b: K) => boolean = (a, b) => a === b): { slot: number; hit: boolean; evicted: K | null } {
    this.clock++;
    const found = this.keys.findIndex((k) => k !== null && same(k, key));
    if (found >= 0) {
      this.used[found] = this.clock;
      return { slot: found, hit: true, evicted: null };
    }
    const empty = this.keys.indexOf(null);
    const slot = empty >= 0 ? empty : this.used.indexOf(Math.min(...this.used));
    const evicted = this.keys[slot];
    this.keys[slot] = key;
    this.used[slot] = this.clock;
    return { slot, hit: false, evicted };
  }
}

export function runTlb(cfg: TlbConfig, count = ACCESSES): TlbRun {
  const tlb = new Lru<number>(cfg.entries);
  const shift = PAGE_BITS[cfg.size];
  const steps = addresses(cfg, count).map((address, index): TlbStep => {
    const vpn = Math.floor(address / 2 ** shift);
    const r = tlb.access(vpn);
    return { index, address, vpn, hit: r.hit, slot: r.slot, evicted: r.evicted, after: [...tlb.contents] };
  });
  const hits = steps.filter((s) => s.hit).length;
  return { steps, hits, misses: steps.length - hits, slots: [...tlb.contents] };
}

export const hitRate = (run: { hits: number; misses: number }) => (run.hits + run.misses === 0 ? 0 : run.hits / (run.hits + run.misses));

/** TLB reach: how much memory the entries cover at once. */
export const reachBytes = (cfg: Pick<TlbConfig, 'entries' | 'size'>) => cfg.entries * Number(PAGE_BYTES[cfg.size]);

/** Average translation cost in cycles: hits cost HIT_CYCLES, a miss costs one walk of REFERENCE_CYCLES per reference. */
export function translationCost(run: { hits: number; misses: number }, size: TlbPageSize): number {
  const total = run.hits + run.misses;
  return total === 0 ? 0 : (run.hits * HIT_CYCLES + run.misses * WALK_REFERENCES[size] * REFERENCE_CYCLES) / total;
}

/** Hit rate against working-set size for the other settings (a longer run, so the curve is smooth). */
export function hitRateCurve(cfg: TlbConfig): [number, number][] {
  return Array.from({ length: WORKING_SET.max - WORKING_SET.min + 1 }, (_, k) => {
    const workingSet = WORKING_SET.min + k;
    return [workingSet, hitRate(runTlb({ ...cfg, workingSet }, CURVE_ACCESSES))];
  });
}

// ---- Context switches ---------------------------------------------------------------------------------------

export type SwitchMode = 'flush' | 'asid';
export const SWITCH = {
  entries: 16,
  workingSet: { min: 2, max: 16, default: 6 },
  slice: { min: 4, max: 64, default: 24 },
  switches: 8,
  seed: 31,
} as const;

export interface SwitchConfig {
  workingSet: number;
  slice: number;
}

export const switchOpening = (): SwitchConfig => ({ workingSet: SWITCH.workingSet.default, slice: SWITCH.slice.default });

export interface SwitchRun {
  hits: number;
  misses: number;
}

/** Two processes with the same virtual page numbers alternate; a flush clears every entry on a switch, address-space tags keep them. */
export function runSwitching(cfg: SwitchConfig, mode: SwitchMode, seed: number = SWITCH.seed): SwitchRun {
  const rnd = mulberry32(seed);
  const tlb = new Lru<{ asid: number; vpn: number }>(SWITCH.entries);
  let hits = 0;
  let misses = 0;
  for (let s = 0; s < SWITCH.switches; s++) {
    const asid = s % 2;
    if (mode === 'flush') tlb.clear();
    for (let i = 0; i < cfg.slice; i++) {
      const vpn = Math.floor(rnd() * cfg.workingSet);
      if (tlb.access({ asid, vpn }, (a, b) => a.asid === b.asid && a.vpn === b.vpn).hit) hits++;
      else misses++;
    }
  }
  return { hits, misses };
}

// ---- Shootdowns ---------------------------------------------------------------------------------------------

export const CORES = { min: 1, max: 16, default: 4 } as const;
export const UNMAPS = { min: 1, max: 8, default: 4 } as const;
/** Illustrative cycles to interrupt another core and to invalidate one entry locally. */
export const IPI_CYCLES = 500;
export const LOCAL_INVALIDATE_CYCLES = 50;

export interface ShootdownConfig {
  cores: number;
  unmaps: number;
  batched: boolean;
}

export const shootdownOpening = (): ShootdownConfig => ({ cores: CORES.default, unmaps: UNMAPS.default, batched: false });

/** One round interrupts every other core running the process: cores - 1 IPIs. Batching m unmaps into one round pays that once. */
export function shootdown(cfg: ShootdownConfig): { rounds: number; ipis: number; cost: number } {
  const rounds = cfg.batched ? 1 : cfg.unmaps;
  const ipis = rounds * (cfg.cores - 1);
  return { rounds, ipis, cost: ipis * IPI_CYCLES + cfg.unmaps * LOCAL_INVALIDATE_CYCLES };
}
