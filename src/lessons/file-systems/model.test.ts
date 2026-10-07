import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  afterPowerCut, classify, crashPoints, diskAfter, DIR_SYNC_MS, durableAt, FILE_SYNC_MS, FLUSH_MS, recover, writeSequence, type Mode, type NoJournalOrder,
} from './crash';
import {
  cat, closeAll, dfBlocks, duBlocks, entryCounts, initialFs, inodeBlock, link, openFile, resolve, ROOT_INO, symlink, unlink, type Fs, type WalkStep,
} from './fs';

const DOCS = 12;
const summary = (steps: WalkStep[]) =>
  steps.map((s) => (s.kind === 'inode' ? `i${s.ino}` : s.kind === 'dir' ? `d${s.block}:${s.name}` : s.kind === 'data' ? `b${s.block}` : `->${s.target}`));

describe('path resolution', () => {
  it('cat /docs/notes.txt walks root inode → / data → docs inode → docs data → notes.txt inode → its blocks', () => {
    const r = resolve(initialFs(), '/docs/notes.txt', ROOT_INO, { readData: true });
    expect(r.error).toBeNull();
    expect(r.ino).toBe(14);
    expect(summary(r.steps)).toEqual(['i2', 'd4:docs', 'i12', 'd5:notes.txt', 'i14', 'b9', 'b10']);
  });

  it('reads each inode from the inode-table block that holds it (8 per block)', () => {
    expect(inodeBlock(2)).toBe(2);
    expect(inodeBlock(8)).toBe(2);
    expect(inodeBlock(9)).toBe(3);
    expect(inodeBlock(14)).toBe(3);
  });

  it('a missing name fails with ENOENT after reading the directory that lacks it', () => {
    const r = resolve(initialFs(), '/docs/nope.txt');
    expect(r.error).toBe('ENOENT');
    expect(summary(r.steps)).toEqual(['i2', 'd4:docs', 'i12', 'd5:nope.txt']);
  });

  it('a file in the middle of a path is ENOTDIR', () => {
    expect(resolve(initialFs(), '/docs/notes.txt/x').error).toBe('ENOTDIR');
  });

  it('follows a relative symlink from the directory that contains it', () => {
    const { fs } = symlink(initialFs(), DOCS, 'notes.txt', 's2');
    const r = resolve(fs, '/docs/s2');
    expect(r.ino).toBe(14);
    expect(summary(r.steps)).toEqual(['i2', 'd4:docs', 'i12', 'd5:s2', 'i17', '->notes.txt', 'i12', 'd5:notes.txt', 'i14']);
    expect(resolve(fs, '/docs/s2', ROOT_INO, { follow: false }).ino).toBe(17);
  });

  it('gives up with ELOOP on a symlink loop', () => {
    let { fs } = symlink(initialFs(), DOCS, 'b', 'a');
    fs = symlink(fs, DOCS, 'a', 'b').fs;
    expect(resolve(fs, '/docs/a').error).toBe('ELOOP');
  });
});

/** An independent statement of the rule: data stays while any name or any open FD refers to it. */
function checkInvariants(fs: Fs) {
  const counts = entryCounts(fs);
  for (const node of fs.inodes.values()) {
    if (node.kind === 'dir') continue;
    expect(node.links).toBe(counts.get(node.ino) ?? 0);
    expect(node.links > 0 || (fs.open.get(node.ino) ?? 0) > 0).toBe(true);
    node.blocks.forEach((b) => expect(fs.used.has(b)).toBe(true));
  }
  for (const [ino] of counts) expect(fs.inodes.has(ino)).toBe(true);
}

describe('links, unlink and open files', () => {
  it('a hard link adds a directory entry and the link count follows it', () => {
    const { fs } = link(initialFs(), DOCS, 'notes.txt', 'n2');
    expect(fs.inodes.get(14)!.links).toBe(2);
    expect(entryCounts(fs).get(14)).toBe(2);
    checkInvariants(fs);
  });

  it('deleting the original leaves the hard link working and the symlink dangling', () => {
    let fs = link(initialFs(), DOCS, 'notes.txt', 'n2').fs;
    fs = symlink(fs, DOCS, 'notes.txt', 's2').fs;
    fs = unlink(fs, DOCS, 'notes.txt').fs;
    expect(cat(fs, DOCS, 'n2').out[0]).toContain('Meeting notes');
    expect(cat(fs, DOCS, 's2').error).toBe('cat: s2: No such file or directory');
    expect(fs.inodes.get(14)!.links).toBe(1);
    checkInvariants(fs);
  });

  it('rm while a process holds the file open: df still counts the blocks, du does not, until close', () => {
    const start = initialFs();
    let fs = openFile(start, DOCS, 'notes.txt').fs;
    fs = unlink(fs, DOCS, 'notes.txt').fs;
    expect(fs.inodes.has(14)).toBe(true);
    expect(dfBlocks(fs)).toBe(dfBlocks(start));
    expect(duBlocks(fs)).toBe(duBlocks(start) - 2);
    fs = closeAll(fs).fs;
    expect(fs.inodes.has(14)).toBe(false);
    expect(dfBlocks(fs)).toBe(dfBlocks(start) - 2);
    expect(dfBlocks(fs)).toBe(duBlocks(fs));
  });

  it('data is freed iff links = 0 and open FDs = 0, over 400 random operation sequences', () => {
    const rnd = mulberry32(21);
    const names = ['notes.txt', 'n2', 'n3', 's2', 'todo.txt'];
    for (let run = 0; run < 400; run++) {
      let fs = initialFs();
      for (let step = 0; step < 12; step++) {
        const a = names[Math.floor(rnd() * names.length)];
        const b = names[Math.floor(rnd() * names.length)];
        const op = Math.floor(rnd() * 5);
        const before = fs;
        const res = op === 0 ? link(fs, DOCS, a, b) : op === 1 ? symlink(fs, DOCS, a, b) : op === 2 ? unlink(fs, DOCS, a) : op === 3 ? openFile(fs, DOCS, a) : closeAll(fs);
        fs = res.fs;
        if (res.error) expect(fs).toBe(before);
        checkInvariants(fs);
        // Brute force: an inode exists exactly when a directory entry or an open FD still refers to it.
        for (const ino of [14, 15]) {
          const referenced = (entryCounts(fs).get(ino) ?? 0) > 0 || (fs.open.get(ino) ?? 0) > 0;
          expect(fs.inodes.has(ino)).toBe(referenced);
        }
      }
    }
  });

  it('refuses what real tools refuse', () => {
    expect(link(initialFs(), DOCS, 'notes.txt', 'todo.txt').error).toContain('File exists');
    expect(unlink(initialFs(), DOCS, 'missing').error).toContain('No such file or directory');
    expect(link(initialFs(), ROOT_INO, 'docs', 'd2').error).toContain('hard link not allowed for directory');
  });
});

const ORDERS: NoJournalOrder[] = ['DIB', 'BID', 'IDB'];
const MODES: Mode[] = ['journal', 'ordered', 'writeback'];

describe('crash consistency, every crash point', () => {
  it('finishing every write always ends complete, and crashing before any write leaves the file untouched', () => {
    for (const mode of [...MODES, 'none'] as Mode[]) {
      const pts = crashPoints(mode);
      expect(pts[0].outcome).toEqual({ complete: false, lost: true, problems: [] });
      expect(pts.at(-1)!.outcome.complete).toBe(true);
    }
  });

  it('data=journal: never an inode pointing at unwritten data, never a leak or a double-used block', () => {
    for (const p of crashPoints('journal')) {
      expect(p.outcome.problems).toEqual([]);
      expect(p.outcome.complete || p.outcome.lost).toBe(true);
    }
  });

  it('data=ordered: metadata never points at unwritten data', () => {
    for (const p of crashPoints('ordered')) expect(p.outcome.problems).not.toContain('stale-data');
    for (const p of crashPoints('ordered')) expect(p.outcome.problems).toEqual([]);
  });

  it('data=writeback: metadata stays consistent, but the stale-data case is reachable', () => {
    const pts = crashPoints('writeback');
    expect(pts.some((p) => p.outcome.problems.includes('stale-data'))).toBe(true);
    for (const p of pts) {
      expect(p.outcome.problems).not.toContain('leak');
      expect(p.outcome.problems).not.toContain('double-use');
    }
  });

  it('no journal: a leaked block, a double-used block and stale data are all reachable across the orders', () => {
    const all = ORDERS.flatMap((o) => crashPoints('none', o).flatMap((p) => p.outcome.problems));
    expect(new Set(all)).toEqual(new Set(['stale-data', 'leak', 'double-use']));
  });

  it('a commit record makes the whole transaction count; without it, the logged writes are discarded', () => {
    const seq = writeSequence('journal');
    const beforeCommit = diskAfter(seq, 3);
    expect(recover(beforeCommit)).toEqual({ data: 'old', inode: false, bitmap: false, log: [], committed: false });
    const atCommit = diskAfter(seq, 4);
    expect(classify(recover(atCommit)).complete).toBe(true);
  });

  it('classify judges the disk alone (hand-worked images)', () => {
    expect(classify({ data: 'new', inode: false, bitmap: false, log: [], committed: false })).toEqual({ complete: false, lost: true, problems: [] });
    expect(classify({ data: 'old', inode: true, bitmap: true, log: [], committed: false }).problems).toEqual(['stale-data']);
    expect(classify({ data: 'old', inode: false, bitmap: true, log: [], committed: false }).problems).toEqual(['leak']);
    expect(classify({ data: 'new', inode: true, bitmap: false, log: [], committed: false }).problems).toEqual(['double-use']);
  });
});

describe('fsync', () => {
  const times = [0, 1, FILE_SYNC_MS - 1, FILE_SYNC_MS, FILE_SYNC_MS + DIR_SYNC_MS, 100, FLUSH_MS - 1, FLUSH_MS, FLUSH_MS + 1];
  it('without fsync, the write is lost iff the crash comes before the background flush', () => {
    for (const t of times) {
      const o = afterPowerCut({ fsyncFile: false, fsyncDir: false, newFile: false }, t);
      expect(o !== 'safe').toBe(t < FLUSH_MS);
    }
  });

  it('with fsync on the file, the data survives any crash after fsync returns', () => {
    for (const t of times) expect(afterPowerCut({ fsyncFile: true, fsyncDir: false, newFile: false }, t) === 'safe').toBe(t >= FILE_SYNC_MS);
  });

  it("a new file also needs fsync on its directory, or the name can vanish even though the data was synced", () => {
    const fileOnly = { fsyncFile: true, fsyncDir: false, newFile: true };
    expect(afterPowerCut(fileOnly, FILE_SYNC_MS + 1)).toBe('file-missing');
    const both = { fsyncFile: true, fsyncDir: true, newFile: true };
    expect(durableAt(both)).toEqual({ data: FILE_SYNC_MS, entry: FILE_SYNC_MS + DIR_SYNC_MS });
    expect(afterPowerCut(both, FILE_SYNC_MS + DIR_SYNC_MS)).toBe('safe');
  });

  it('every combination: the outcome follows from when data and entry became durable', () => {
    for (const fsyncFile of [false, true]) {
      for (const fsyncDir of [false, true]) {
        for (const newFile of [false, true]) {
          const c = { fsyncFile, fsyncDir, newFile };
          for (const t of times) {
            const dataOk = (fsyncFile && t >= FILE_SYNC_MS) || t >= FLUSH_MS;
            const entryOk = !newFile || (fsyncDir && t >= (fsyncFile ? FILE_SYNC_MS : 0) + DIR_SYNC_MS) || t >= FLUSH_MS;
            expect(afterPowerCut(c, t)).toBe(!entryOk ? 'file-missing' : dataOk ? 'safe' : 'data-lost');
          }
        }
      }
    }
  });
});
