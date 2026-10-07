// Appending one block to a file, and pulling the plug part-way. Pure logic.
//
// Three on-disk changes make the append: the data block itself (D), the file's inode
// (I: new size and a pointer to the block) and the block bitmap (B: the block is now in
// use). The disk only promises that each block write is atomic, not that a group of them
// is. Journal modes follow the documented ext4 behaviour (kernel docs, ext4 "Journal" and
// the data=journal / ordered / writeback mount options), simplified to one transaction.

export type Mode = 'none' | 'journal' | 'ordered' | 'writeback';
/** Without a journal the kernel may write the three blocks in any order; three examples. */
export type NoJournalOrder = 'DIB' | 'BID' | 'IDB';

export type Home = 'D' | 'I' | 'B';
export type Write = { kind: 'home'; what: Home } | { kind: 'log'; what: Home } | { kind: 'commit' };

export function writeSequence(mode: Mode, order: NoJournalOrder = 'DIB'): Write[] {
  const home = (what: Home): Write => ({ kind: 'home', what });
  const log = (what: Home): Write => ({ kind: 'log', what });
  const commit: Write = { kind: 'commit' };
  switch (mode) {
    case 'none':
      return [...order].map((c) => home(c as Home));
    case 'journal':
      // data=journal: data and metadata both go to the log, then the commit, then checkpoint.
      return [log('D'), log('I'), log('B'), commit, home('D'), home('I'), home('B')];
    case 'ordered':
      // data=ordered (ext4's default): data goes home before the metadata transaction commits.
      return [home('D'), log('I'), log('B'), commit, home('I'), home('B')];
    case 'writeback':
      // data=writeback: only metadata is journaled; data may reach the disk before or after
      // the commit. Shown here landing after it, the case that bites.
      return [log('I'), log('B'), commit, home('I'), home('B'), home('D')];
  }
}

/** What the disk holds: each home location is old or new, plus the journal's contents. */
export interface DiskImage {
  /** The data block: 'new' = the appended bytes; 'old' = whatever a deleted file left there. */
  data: 'old' | 'new';
  /** The inode points at the block (size grown). */
  inode: boolean;
  /** The bitmap marks the block used. */
  bitmap: boolean;
  log: Home[];
  committed: boolean;
}

const EMPTY: DiskImage = { data: 'old', inode: false, bitmap: false, log: [], committed: false };

function apply(img: DiskImage, what: Home): DiskImage {
  if (what === 'D') return { ...img, data: 'new' };
  if (what === 'I') return { ...img, inode: true };
  return { ...img, bitmap: true };
}

/** The disk after the first `k` writes reached it. */
export function diskAfter(seq: readonly Write[], k: number): DiskImage {
  let img = EMPTY;
  for (const w of seq.slice(0, k)) {
    if (w.kind === 'home') img = apply(img, w.what);
    else if (w.kind === 'log') img = { ...img, log: [...img.log, w.what] };
    else img = { ...img, committed: true };
  }
  return img;
}

/**
 * Recovery at the next mount: a committed transaction is replayed (its logged blocks are
 * written home again, which is harmless if they already were); an uncommitted one is
 * thrown away. Without a journal there is nothing to replay (fsck could find a leak or a
 * double-used block afterwards, but can't bring back lost data).
 */
export function recover(img: DiskImage): DiskImage {
  const replayed = img.committed ? img.log.reduce(apply, img) : img;
  return { ...replayed, log: [], committed: false };
}

export type Problem = 'stale-data' | 'leak' | 'double-use';
export type Outcome = { complete: boolean; lost: boolean; problems: Problem[] };

/** Judge a recovered disk by what is on it, nothing else. */
export function classify(img: DiskImage): Outcome {
  const problems: Problem[] = [];
  if (img.inode && img.data !== 'new') problems.push('stale-data');
  if (img.bitmap && !img.inode) problems.push('leak');
  if (img.inode && !img.bitmap) problems.push('double-use');
  const complete = img.inode && img.bitmap && img.data === 'new';
  return { complete, lost: !img.inode, problems };
}

export interface CrashPoint {
  k: number;
  before: DiskImage;
  after: DiskImage;
  outcome: Outcome;
}

/** Every place the power can go: after 0, 1, … all of the writes. */
export function crashPoints(mode: Mode, order: NoJournalOrder = 'DIB'): CrashPoint[] {
  const seq = writeSequence(mode, order);
  return Array.from({ length: seq.length + 1 }, (_, k) => {
    const before = diskAfter(seq, k);
    const after = recover(before);
    return { k, before, after, outcome: classify(after) };
  });
}

// ---- fsync -----------------------------------------------------------------------

/** Illustrative timings, ms after write() returned. */
export const FILE_SYNC_MS = 8;
export const DIR_SYNC_MS = 8;
/** ext4 commits its journal (and, in ordered mode, the data with it) every 5 s by default. */
export const FLUSH_MS = 5000;

export interface SyncConfig {
  fsyncFile: boolean;
  fsyncDir: boolean;
  /** A brand-new file: its directory entry is new too, not just its data. */
  newFile: boolean;
}

/** When each piece becomes durable (on the disk, not just in the page cache). */
export function durableAt(c: SyncConfig): { data: number; entry: number } {
  const fileDone = c.fsyncFile ? FILE_SYNC_MS : null;
  const dirDone = c.fsyncDir ? (fileDone ?? 0) + DIR_SYNC_MS : null;
  return {
    data: fileDone ?? FLUSH_MS,
    entry: c.newFile ? (dirDone ?? FLUSH_MS) : 0,
  };
}

export type SyncOutcome = 'safe' | 'data-lost' | 'file-missing';

/** What the app finds after a power cut at `t` ms and a reboot. */
export function afterPowerCut(c: SyncConfig, t: number): SyncOutcome {
  const at = durableAt(c);
  if (t < at.entry) return 'file-missing';
  return t < at.data ? 'data-lost' : 'safe';
}
