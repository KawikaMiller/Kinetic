// A toy ext-like file system: a superblock, a block bitmap, an inode table and data
// blocks. Directories are files whose data is a list of name → inode number entries.
// Real ext4 uses 4 KiB blocks, 256-byte inodes, extents and hashed directories. Pure logic.

export const BLOCK_COUNT = 24;
export const SUPERBLOCK = 0;
export const BITMAP_BLOCK = 1;
export const INODE_TABLE = [2, 3] as const;
export const INODES_PER_BLOCK = 8;
export const FIRST_DATA_BLOCK = 4;
/** ext2/3/4 reserve inode 1; the root directory is always inode 2. */
export const ROOT_INO = 2;
/** The kernel gives up after this many symlinks in one lookup (Linux: 40), with ELOOP. */
export const MAX_SYMLINKS = 40;

export type InodeKind = 'dir' | 'file' | 'symlink';

export interface Inode {
  ino: number;
  kind: InodeKind;
  mode: string;
  /** Hard links: how many directory entries name this inode. */
  links: number;
  size: number;
  mtime: string;
  blocks: number[];
  /** Symlinks only: the path they hold. */
  target?: string;
}

export interface Fs {
  inodes: Map<number, Inode>;
  /** Directory inode → its entries, in the order they were added. */
  dirs: Map<number, { name: string; ino: number }[]>;
  /** File contents, per inode (what `cat` prints). */
  content: Map<number, string>;
  /** Open file descriptions per inode (processes holding it open). */
  open: Map<number, number>;
  used: Set<number>;
}

/** Which inode-table block holds an inode. */
export const inodeBlock = (ino: number) => INODE_TABLE[0] + Math.floor((ino - 1) / INODES_PER_BLOCK);

export function initialFs(): Fs {
  const inodes = new Map<number, Inode>();
  const add = (i: Inode) => inodes.set(i.ino, i);
  add({ ino: 2, kind: 'dir', mode: 'drwxr-xr-x', links: 4, size: 4096, mtime: '09:12', blocks: [4] });
  add({ ino: 12, kind: 'dir', mode: 'drwxr-xr-x', links: 2, size: 4096, mtime: '09:40', blocks: [5] });
  add({ ino: 13, kind: 'dir', mode: 'drwxr-xr-x', links: 2, size: 4096, mtime: '08:02', blocks: [6] });
  add({ ino: 14, kind: 'file', mode: '-rw-r--r--', links: 1, size: 6100, mtime: '09:40', blocks: [9, 10] });
  add({ ino: 15, kind: 'file', mode: '-rw-r--r--', links: 1, size: 310, mtime: '09:31', blocks: [11] });
  add({ ino: 16, kind: 'file', mode: '-rw-r--r--', links: 1, size: 220, mtime: '08:02', blocks: [7] });
  const dirs = new Map([
    [2, [{ name: 'docs', ino: 12 }, { name: 'etc', ino: 13 }]],
    [12, [{ name: 'notes.txt', ino: 14 }, { name: 'todo.txt', ino: 15 }]],
    [13, [{ name: 'hosts', ino: 16 }]],
  ]);
  const content = new Map([
    [14, 'Meeting notes: ship the release on Friday.'],
    [15, '- renew the TLS certificate'],
    [16, '127.0.0.1 localhost'],
  ]);
  const used = new Set([SUPERBLOCK, BITMAP_BLOCK, ...INODE_TABLE, 4, 5, 6, 7, 9, 10, 11]);
  return { inodes, dirs, content, open: new Map(), used };
}

export function cloneFs(f: Fs): Fs {
  return {
    inodes: new Map([...f.inodes].map(([k, v]) => [k, { ...v, blocks: [...v.blocks] }])),
    dirs: new Map([...f.dirs].map(([k, v]) => [k, v.map((e) => ({ ...e }))])),
    content: new Map(f.content),
    open: new Map(f.open),
    used: new Set(f.used),
  };
}

// ---- Path resolution --------------------------------------------------------------

export type WalkStep =
  | { kind: 'inode'; ino: number; block: number }
  | { kind: 'dir'; ino: number; block: number; name: string; found: number | null }
  | { kind: 'symlink'; ino: number; target: string }
  | { kind: 'data'; ino: number; block: number };

export type ResolveError = 'ENOENT' | 'ENOTDIR' | 'ELOOP';

export interface Resolution {
  steps: WalkStep[];
  ino: number | null;
  error: ResolveError | null;
}

const parts = (path: string) => path.split('/').filter((p) => p.length > 0);

/**
 * Resolve a path the way the kernel's lookup does: start at the root (or `cwd` for a
 * relative path), read each directory's inode, then its data block, and look the next
 * name up there. A symlink restarts the lookup from its target. `follow: false` stops at
 * a final symlink instead of following it (like lstat).
 */
export function resolve(f: Fs, path: string, cwd = ROOT_INO, { follow = true, readData = false } = {}): Resolution {
  const steps: WalkStep[] = [];
  let hops = 0;
  const walk = (start: number, names: string[]): number | ResolveError => {
    let at = start;
    steps.push({ kind: 'inode', ino: at, block: inodeBlock(at) });
    for (let i = 0; i < names.length; i++) {
      const dir = f.inodes.get(at)!;
      if (dir.kind !== 'dir') return 'ENOTDIR';
      const entry = f.dirs.get(at)!.find((e) => e.name === names[i]);
      steps.push({ kind: 'dir', ino: at, block: dir.blocks[0], name: names[i], found: entry ? entry.ino : null });
      if (!entry) return 'ENOENT';
      const node = f.inodes.get(entry.ino)!;
      steps.push({ kind: 'inode', ino: node.ino, block: inodeBlock(node.ino) });
      const last = i === names.length - 1;
      if (node.kind === 'symlink' && (!last || follow)) {
        if (++hops > MAX_SYMLINKS) return 'ELOOP';
        steps.push({ kind: 'symlink', ino: node.ino, target: node.target! });
        const target = node.target!;
        const r = walk(target.startsWith('/') ? ROOT_INO : at, [...parts(target), ...names.slice(i + 1)]);
        return r;
      }
      at = node.ino;
    }
    return at;
  };
  const r = walk(path.startsWith('/') ? ROOT_INO : cwd, parts(path));
  if (typeof r === 'string') return { steps, ino: null, error: r };
  if (readData) {
    const node = f.inodes.get(r)!;
    if (node.kind === 'file') node.blocks.forEach((block) => steps.push({ kind: 'data', ino: r, block }));
  }
  return { steps, ino: r, error: null };
}

// ---- Operations on one directory (the Links sandbox works in /docs) --------------

export interface OpResult {
  fs: Fs;
  out: string[];
  error: string | null;
}

const entryIn = (f: Fs, dir: number, name: string) => f.dirs.get(dir)!.find((e) => e.name === name);

function freeInode(f: Fs, ino: number) {
  const node = f.inodes.get(ino)!;
  node.blocks.forEach((b) => f.used.delete(b));
  f.inodes.delete(ino);
  f.content.delete(ino);
  f.open.delete(ino);
}

/** Free an inode once nothing refers to it: no directory entry and no open file. */
function maybeFree(f: Fs, ino: number) {
  const node = f.inodes.get(ino);
  if (node && node.links === 0 && (f.open.get(ino) ?? 0) === 0) freeInode(f, ino);
}

const nextIno = (f: Fs) => Math.max(...f.inodes.keys(), 16) + 1;

/** `ln src dst`: a second directory entry for the same inode. */
export function link(f0: Fs, dir: number, src: string, dst: string): OpResult {
  const f = cloneFs(f0);
  const r = resolve(f, src, dir, { follow: false });
  if (r.ino === null) return { fs: f0, out: [], error: `ln: failed to access '${src}': No such file or directory` };
  if (entryIn(f, dir, dst)) return { fs: f0, out: [], error: `ln: failed to create hard link '${dst}': File exists` };
  if (f.inodes.get(r.ino)!.kind === 'dir') return { fs: f0, out: [], error: `ln: '${src}': hard link not allowed for directory` };
  f.dirs.get(dir)!.push({ name: dst, ino: r.ino });
  f.inodes.get(r.ino)!.links++;
  return { fs: f, out: [], error: null };
}

/** `ln -s target dst`: a new inode whose content is just a path; the target need not exist. */
export function symlink(f0: Fs, dir: number, target: string, dst: string): OpResult {
  const f = cloneFs(f0);
  if (entryIn(f, dir, dst)) return { fs: f0, out: [], error: `ln: failed to create symbolic link '${dst}': File exists` };
  const ino = nextIno(f);
  f.inodes.set(ino, { ino, kind: 'symlink', mode: 'lrwxrwxrwx', links: 1, size: target.length, mtime: '10:05', blocks: [], target });
  f.dirs.get(dir)!.push({ name: dst, ino });
  return { fs: f, out: [], error: null };
}

/** `rm name`: remove one directory entry. The inode and its blocks go only when links and open FDs are both 0. */
export function unlink(f0: Fs, dir: number, name: string): OpResult {
  const f = cloneFs(f0);
  const entries = f.dirs.get(dir)!;
  const i = entries.findIndex((e) => e.name === name);
  if (i < 0) return { fs: f0, out: [], error: `rm: cannot remove '${name}': No such file or directory` };
  const { ino } = entries[i];
  if (f.inodes.get(ino)!.kind === 'dir') return { fs: f0, out: [], error: `rm: cannot remove '${name}': Is a directory` };
  entries.splice(i, 1);
  f.inodes.get(ino)!.links--;
  maybeFree(f, ino);
  return { fs: f, out: [], error: null };
}

export function cat(f: Fs, dir: number, name: string): OpResult {
  const r = resolve(f, name, dir);
  if (r.ino === null) return { fs: f, out: [], error: `cat: ${name}: No such file or directory` };
  return { fs: f, out: [f.content.get(r.ino) ?? ''], error: null };
}

/** A process opens a file and keeps the descriptor (a log writer, say). */
export function openFile(f0: Fs, dir: number, name: string): OpResult {
  const f = cloneFs(f0);
  const r = resolve(f, name, dir);
  if (r.ino === null) return { fs: f0, out: [], error: `open: ${name}: No such file or directory` };
  const fd = 3 + openCount(f);
  f.open.set(r.ino, (f.open.get(r.ino) ?? 0) + 1);
  return { fs: f, out: [`fd ${fd} → inode ${r.ino}`], error: null };
}

/** Descriptors the process holds open (they start at 3, after stdin, stdout and stderr). */
export const openCount = (f: Fs) => [...f.open.values()].reduce((a, b) => a + b, 0);

/** Close every descriptor the process holds. */
export function closeAll(f0: Fs): OpResult {
  if (f0.open.size === 0) return { fs: f0, out: [], error: 'close: no open descriptor' };
  const f = cloneFs(f0);
  const held = [...f.open.keys()];
  const last = 2 + openCount(f);
  f.open.clear();
  held.forEach((ino) => maybeFree(f, ino));
  return { fs: f, out: [last === 3 ? 'closed fd 3' : `closed fd 3 to ${last}`], error: null };
}

/** Data blocks in use according to the bitmap (what `df` counts). */
export const dfBlocks = (f: Fs) => [...f.used].filter((b) => b >= FIRST_DATA_BLOCK).length;

/** Data blocks reachable by walking the directory tree from the root (what `du /` adds up). */
export function duBlocks(f: Fs): number {
  const seen = new Set<number>();
  const blocks = new Set<number>();
  const visit = (ino: number) => {
    if (seen.has(ino)) return;
    seen.add(ino);
    const node = f.inodes.get(ino)!;
    node.blocks.forEach((b) => blocks.add(b));
    if (node.kind === 'dir') f.dirs.get(ino)!.forEach((e) => visit(e.ino));
  };
  visit(ROOT_INO);
  return blocks.size;
}

/** Every directory entry naming each inode, counted from the directories themselves. */
export function entryCounts(f: Fs): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entries of f.dirs.values()) for (const e of entries) counts.set(e.ino, (counts.get(e.ino) ?? 0) + 1);
  return counts;
}
