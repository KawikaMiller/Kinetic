// A toy flash translation layer (FTL): page-mapped, one write frontier, greedy garbage
// collection. Real SSD firmware is proprietary and far smarter (hot/cold separation,
// wear levelling, many frontiers in parallel); this keeps only the rules that cause
// write amplification. Pure logic only.

import { mulberry32 } from '../../core/random';

/** Toy drive: 12 erase blocks of 8 pages. Real blocks hold hundreds of pages. */
export const BLOCKS = 12;
export const PAGES = 8;
/** Over-provisioning, in whole blocks the host can't address. GC needs at least 2 to always make progress. */
export const MIN_SPARE = 2;
export const MAX_SPARE = 5;
/** The write-amplification readout turns red above this. */
export const WA_WARN = 2;

/** A physical page: never written since erase, holding a logical page's data, or stale. */
export type PageState = { kind: 'free' } | { kind: 'valid'; lpn: number; version: number } | { kind: 'stale'; lpn: number };

export interface Block {
  pages: PageState[];
  /** Next page to program: flash pages in a block are written in order, once per erase. */
  next: number;
  erases: number;
}

export interface Ftl {
  blocks: Block[];
  /** Logical page → where its latest copy lives. */
  map: Map<number, { block: number; page: number }>;
  free: number[];
  active: number | null;
  hostWrites: number;
  nandWrites: number;
  gcRuns: number;
  erases: number;
  logical: number;
}

export type FtlEvent =
  | { kind: 'write'; lpn: number; block: number; page: number }
  | { kind: 'gc'; victim: number; moved: { lpn: number; block: number; page: number }[] }
  | { kind: 'erase'; block: number }
  | { kind: 'trim'; lpn: number }
  | { kind: 'delete-unseen'; lpn: number };

/** Logical pages the host can address: everything except the spare blocks. */
export const logicalPages = (spare: number) => (BLOCKS - spare) * PAGES;

export function createFtl(spare: number): Ftl {
  if (spare < MIN_SPARE || spare > BLOCKS - 1) throw new Error(`spare must be ${MIN_SPARE}..${BLOCKS - 1}`);
  return {
    blocks: Array.from({ length: BLOCKS }, () => ({ pages: Array.from({ length: PAGES }, () => ({ kind: 'free' as const })), next: 0, erases: 0 })),
    map: new Map(),
    free: Array.from({ length: BLOCKS }, (_, i) => BLOCKS - 1 - i),
    active: null,
    hostWrites: 0,
    nandWrites: 0,
    gcRuns: 0,
    erases: 0,
    logical: logicalPages(spare),
  };
}

const validCount = (b: Block) => b.pages.filter((p) => p.kind === 'valid').length;

/** Program one page at the frontier. The caller makes sure the active block has room. */
function program(f: Ftl, lpn: number, version: number): { block: number; page: number } {
  const block = f.active!;
  const b = f.blocks[block];
  const page = b.next++;
  const old = f.map.get(lpn);
  if (old) f.blocks[old.block].pages[old.page] = { kind: 'stale', lpn };
  b.pages[page] = { kind: 'valid', lpn, version };
  f.map.set(lpn, { block, page });
  f.nandWrites++;
  return { block, page };
}

/**
 * Greedy GC: the full block with the fewest valid pages is the victim. Its valid pages are
 * copied into the last free block, then it is erased and becomes free. Ties go to the
 * lowest block number.
 */
function collect(f: Ftl, events: FtlEvent[]) {
  let victim = -1;
  for (let i = 0; i < f.blocks.length; i++) {
    if (f.free.includes(i)) continue;
    if (victim === -1 || validCount(f.blocks[i]) < validCount(f.blocks[victim])) victim = i;
  }
  f.gcRuns++;
  f.active = f.free.pop()!;
  const moved: { lpn: number; block: number; page: number }[] = [];
  for (const p of f.blocks[victim].pages) {
    if (p.kind === 'valid') moved.push({ lpn: p.lpn, ...program(f, p.lpn, p.version) });
  }
  events.push({ kind: 'gc', victim, moved });
  f.blocks[victim] = { pages: Array.from({ length: PAGES }, () => ({ kind: 'free' as const })), next: 0, erases: f.blocks[victim].erases + 1 };
  f.erases++;
  f.free.unshift(victim);
  events.push({ kind: 'erase', block: victim });
}

/** Make sure the frontier has a free page, taking a free block or running GC for one. */
function ensureRoom(f: Ftl, events: FtlEvent[]) {
  while (f.active === null || f.blocks[f.active].next >= PAGES) {
    if (f.free.length > 1) f.active = f.free.pop()!;
    else collect(f, events);
  }
}

/** The host writes a logical page (a new version of its data). */
export function hostWrite(f: Ftl, lpn: number, version: number, events: FtlEvent[] = []): FtlEvent[] {
  if (lpn < 0 || lpn >= f.logical) throw new Error(`logical page ${lpn} out of range`);
  ensureRoom(f, events);
  f.hostWrites++;
  const at = program(f, lpn, version);
  events.push({ kind: 'write', lpn, ...at });
  return events;
}

/** TRIM: the host says this logical page no longer holds anything, so the drive can drop it. */
export function trim(f: Ftl, lpn: number, events: FtlEvent[] = []): FtlEvent[] {
  const at = f.map.get(lpn);
  if (at) {
    f.blocks[at.block].pages[at.page] = { kind: 'stale', lpn };
    f.map.delete(lpn);
  }
  events.push({ kind: 'trim', lpn });
  return events;
}

/** What the drive returns for a logical page: the version last written, or null if it holds nothing. */
export function readPage(f: Ftl, lpn: number): number | null {
  const at = f.map.get(lpn);
  if (!at) return null;
  const p = f.blocks[at.block].pages[at.page];
  return p.kind === 'valid' && p.lpn === lpn ? p.version : null;
}

export const writeAmplification = (f: Ftl) => (f.hostWrites === 0 ? 1 : f.nandWrites / f.hostWrites);

// ---- Workloads ------------------------------------------------------------------

export type Workload = 'sequential' | 'random';

export type HostOp = { kind: 'write'; lpn: number } | { kind: 'delete'; lpn: number };

/** Share of random-workload operations that delete a file's page instead of writing one. */
export const DELETE_SHARE = 0.2;
export const TRACE_SEED = 7;

/**
 * The host's operations, generated up front so TRIM on and off see exactly the same trace.
 * sequential: write logical pages 0, 1, 2… and wrap. random: overwrite random logical
 * pages, and sometimes delete one that holds data (the file system frees it).
 */
export function hostTrace(workload: Workload, logical: number, n: number, seed = TRACE_SEED): HostOp[] {
  if (workload === 'sequential') return Array.from({ length: n }, (_, i) => ({ kind: 'write', lpn: i % logical }));
  const rnd = mulberry32(seed);
  const live = new Set<number>();
  const ops: HostOp[] = [];
  for (let i = 0; i < n; i++) {
    if (live.size > 0 && rnd() < DELETE_SHARE) {
      const sorted = [...live].sort((a, b) => a - b);
      const lpn = sorted[Math.floor(rnd() * sorted.length)];
      live.delete(lpn);
      ops.push({ kind: 'delete', lpn });
    } else {
      const lpn = Math.floor(rnd() * logical);
      live.add(lpn);
      ops.push({ kind: 'write', lpn });
    }
  }
  return ops;
}

export interface RunResult {
  ftl: Ftl;
  /** Events from the last `tail` operations, for the "what just happened" highlight. */
  recent: FtlEvent[];
  /** Logical pages the host deleted but the drive still treats as valid (it was never told). */
  unseenDeletes: number;
}

/**
 * Replay the first `n` operations of a workload. With TRIM the drive hears each delete;
 * without it a delete changes nothing on the drive.
 */
export function runTrace(config: { workload: Workload; spare: number; trim: boolean }, n: number, tail = 1): RunResult {
  const ftl = createFtl(config.spare);
  const ops = hostTrace(config.workload, ftl.logical, n);
  const deleted = new Set<number>();
  let recent: FtlEvent[] = [];
  ops.forEach((op, i) => {
    const events: FtlEvent[] = [];
    if (op.kind === 'write') {
      deleted.delete(op.lpn);
      hostWrite(ftl, op.lpn, i + 1, events);
    } else {
      deleted.add(op.lpn);
      if (config.trim) trim(ftl, op.lpn, events);
      else events.push({ kind: 'delete-unseen', lpn: op.lpn });
    }
    if (i >= n - tail) recent = recent.concat(events);
  });
  const unseenDeletes = config.trim ? 0 : [...deleted].filter((l) => ftl.map.has(l)).length;
  return { ftl, recent, unseenDeletes };
}
