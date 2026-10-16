/**
 * Scene 3: three uses of fork, run on the same copy-on-write model as the first scenes but with more pages.
 * A snapshot child, a pre-fork server and fork then exec. Page counts are scaled down and labelled so.
 */
import { mulberry32 } from '../../core/random';
import { EXEC_PAGES, HUGE_PAGE_BYTES, Mmu, PAGE_BYTES } from './mmu';

/** The snapshot scene's data set: 8 MiB, 2,048 pages of 4 KiB or 4 huge pages of 2 MiB. */
export const DATASET_BYTES = 8 * 1024 * 1024;
export const SNAPSHOT_SEED = 21;
export const MAX_SNAPSHOT_WRITES = 1024;
export const DEFAULT_SNAPSHOT_WRITES = 256;

/** The pre-fork server's address space: 64 pages, the first 48 code and read-only data, the last 16 data a worker may write. */
export const SERVER_PAGES = 64;
export const SERVER_DATA_START = 48;
export const MAX_WORKERS = 4;
export const DEFAULT_WORKERS = 3;
export const DEFAULT_WORKER_WRITES = 4;

export const copyRatio = (hugeBytes: number = HUGE_PAGE_BYTES, smallBytes: number = PAGE_BYTES) => hugeBytes / smallBytes;

/** Expected distinct pages dirtied by `w` uniform writes over `n` pages: n x (1 - (1 - 1/n)^w). */
export const expectedDirty = (n: number, w: number) => n * (1 - (1 - 1 / n) ** w);

export interface SnapshotRun {
  pages: number;
  pageBytes: number;
  writes: number;
  /** Pages the parent's writes forced the kernel to copy: the distinct pages it dirtied while the child lived. */
  copiedPages: number;
  baselineBytes: number;
  growthBytes: number;
  expectedPages: number;
  /** What a naive fork would have copied at the moment of fork. */
  naiveForkBytes: number;
}

/** A parent that keeps taking `writes` random writes while a snapshot child (which only reads) is alive. */
export function snapshotRun(pageBytes: number, writes: number, seed: number): SnapshotRun {
  const pages = DATASET_BYTES / pageBytes;
  const mmu = new Mmu(pages);
  const parent = mmu.spawn();
  const child = mmu.fork(parent);
  const rnd = mulberry32(seed);
  for (let i = 0; i < writes; i++) mmu.write(parent, Math.floor(rnd() * pages), i & 0xff);
  mmu.exit(child);
  return {
    pages, pageBytes, writes, copiedPages: mmu.copiedPages, baselineBytes: DATASET_BYTES, growthBytes: mmu.copiedPages * pageBytes,
    expectedPages: expectedDirty(pages, writes), naiveForkBytes: DATASET_BYTES,
  };
}

export interface PreforkRun {
  frames: number;
  /** Frames a naive fork would hold for the same workers: the whole space once per process. */
  naiveFrames: number;
  copiedPages: number;
  sharedFrames: number;
}

/** A loaded server forks `workers` workers; each writes `privatePages` of its own data pages. */
export function preforkRun(workers: number, privatePages: number): PreforkRun {
  const mmu = new Mmu(SERVER_PAGES);
  const parent = mmu.spawn();
  for (let w = 0; w < workers; w++) {
    const worker = mmu.fork(parent);
    for (let p = 0; p < privatePages; p++) mmu.write(worker, SERVER_DATA_START + p, 0xaa);
  }
  return {
    frames: mmu.framesInUse, naiveFrames: (1 + workers) * SERVER_PAGES, copiedPages: mmu.copiedPages,
    sharedFrames: mmu.frames.filter((f) => f.refs > 1).length,
  };
}

export interface ForkExecRun {
  forkedEntries: number;
  copiedPages: number;
  frames: number;
  naiveFrames: number;
  newPages: number;
}

/** The shell's fork then exec: the child maps a new program before it ever writes. */
export function forkExecRun(): ForkExecRun {
  const mmu = new Mmu(SERVER_PAGES);
  const parent = mmu.spawn();
  const child = mmu.fork(parent);
  mmu.exec(child);
  return { forkedEntries: mmu.forkedEntries, copiedPages: mmu.copiedPages, frames: mmu.framesInUse, naiveFrames: 2 * SERVER_PAGES, newPages: EXEC_PAGES };
}
