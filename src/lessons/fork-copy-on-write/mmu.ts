/**
 * A toy MMU for fork and copy-on-write: processes with a page table of N pages, a pool of frames with reference
 * counts, fork that shares frames read-only, and a write-fault handler that copies. Each page holds one byte (the
 * lesson draws it as hex). `broken` makes the handler write through a shared page without copying, the bug the
 * lesson's oracle (a naive fork that deep-copies everything) catches.
 */

/** Pages in the lesson's toy address space, and the bytes a page stands for. */
export const PAGES = 8;
export const PAGE_BYTES = 4096;
export const HUGE_PAGE_BYTES = 2 * 1024 * 1024;
/** The scenes allow this many processes at once. */
export const MAX_PROCS = 3;
/** Pages an exec maps for the new program. */
export const EXEC_PAGES = 2;
/** Threads a freshly started process has, and what fork leaves in the child. */
export const START_THREADS = 3;

export interface Pte {
  frame: number | null;
  writable: boolean;
  cow: boolean;
}

export interface Proc {
  pid: number;
  table: Pte[];
  alive: boolean;
  threads: number;
  /** What this process's fork() call returned, or null if it never called it (the child sees 0). */
  forkReturn: number | null;
}

export interface Frame {
  refs: number;
  byte: number;
  origin: 'original' | 'copy';
}

export type LogKind = 'fork' | 'fault-copy' | 'fault-reuse' | 'fault-through' | 'write' | 'exit' | 'exec';
export interface LogEntry {
  kind: LogKind;
  text: string;
}

export type WriteResult =
  | { ok: true; fault: boolean; copied: boolean; frame: number }
  | { ok: false; error: string };

/** The byte a page starts with: distinct for every page so a mix-up shows. */
export const initialByte = (page: number) => (0x10 + page * 0x11) & 0xff;
/** The byte an exec'd program's page starts with. */
export const execByte = (page: number) => 0xe0 + page;

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

export class Mmu {
  readonly procs: Proc[] = [];
  readonly frames: Frame[] = [];
  /** Frames not in use, smallest id on top. */
  private free: number[] = [];
  copiedPages = 0;
  forkedEntries = 0;
  readonly log: LogEntry[] = [];
  nextPid = 1;

  readonly pages: number;
  readonly poolFrames: number;
  broken: boolean;

  constructor(pages: number = PAGES, poolFrames: number = Infinity, broken = false) {
    this.pages = pages;
    this.poolFrames = poolFrames;
    this.broken = broken;
    if (Number.isFinite(poolFrames)) {
      for (let f = 0; f < poolFrames; f++) this.frames.push({ refs: 0, byte: 0, origin: 'original' });
      this.free = Array.from({ length: poolFrames }, (_, i) => poolFrames - 1 - i);
    }
  }

  private alloc(byte: number, origin: Frame['origin']): number | null {
    let f = this.free.pop();
    if (f === undefined) {
      if (Number.isFinite(this.poolFrames)) return null;
      f = this.frames.length;
      this.frames.push({ refs: 0, byte: 0, origin });
    }
    this.frames[f] = { refs: 1, byte, origin };
    return f;
  }

  private release(f: number) {
    const fr = this.frames[f];
    fr.refs--;
    if (fr.refs === 0) this.free.push(f);
  }

  proc(pid: number): Proc {
    const p = this.procs.find((x) => x.pid === pid);
    if (!p) throw new Error(`no process ${pid}`);
    return p;
  }

  get alive(): Proc[] {
    return this.procs.filter((p) => p.alive);
  }

  /** A first process with every page mapped to a private frame holding its starting byte. */
  spawn(): number {
    const table: Pte[] = [];
    for (let page = 0; page < this.pages; page++) {
      const f = this.alloc(initialByte(page), 'original');
      table.push({ frame: f, writable: true, cow: false });
    }
    const pid = this.nextPid++;
    this.procs.push({ pid, table, alive: true, threads: START_THREADS, forkReturn: null });
    return pid;
  }

  /** fork: the child's entries point at the same frames, every mapped entry in both becomes read-only and COW, counts rise. Nothing is copied. */
  fork(pid: number): number {
    const parent = this.proc(pid);
    const child: Proc = { pid: this.nextPid++, table: parent.table.map((e) => ({ ...e })), alive: true, threads: 1, forkReturn: 0 };
    let entries = 0;
    parent.table.forEach((e, i) => {
      if (e.frame === null) return;
      e.writable = false;
      e.cow = true;
      child.table[i] = { frame: e.frame, writable: false, cow: true };
      this.frames[e.frame].refs++;
      entries++;
    });
    parent.forkReturn = child.pid;
    this.procs.push(child);
    this.forkedEntries += entries;
    this.log.push({ kind: 'fork', text: `P${pid} forks P${child.pid}: ${entries} page table entries copied, 0 pages of data copied; fork returns ${child.pid} in P${pid} and 0 in P${child.pid}` });
    return child.pid;
  }

  read(pid: number, page: number): number | null {
    const e = this.proc(pid).table[page];
    return e?.frame == null ? null : this.frames[e.frame].byte;
  }

  write(pid: number, page: number, value: number): WriteResult {
    const p = this.proc(pid);
    const e = p.table[page];
    if (!p.alive) return { ok: false, error: `P${pid} has exited` };
    if (!e || e.frame === null) return { ok: false, error: `page ${page} is not mapped in P${pid}` };
    const old = e.frame;
    if (e.writable) {
      this.frames[old].byte = value;
      this.log.push({ kind: 'write', text: `P${pid} writes ${hex(value)} to page ${page}: the entry is writable, no fault` });
      return { ok: true, fault: false, copied: false, frame: old };
    }
    const shared = this.frames[old].refs;
    if (this.broken) {
      e.writable = true;
      e.cow = false;
      this.frames[old].byte = value;
      this.log.push({ kind: 'fault-through', text: `write fault on P${pid} page ${page}: BROKEN handler makes it writable and writes ${hex(value)} into frame ${old} that ${shared} entries still share` });
      return { ok: true, fault: true, copied: false, frame: old };
    }
    if (shared > 1) {
      const fresh = this.alloc(this.frames[old].byte, 'copy');
      if (fresh === null) return { ok: false, error: 'no free frame in the toy pool' };
      this.frames[fresh].byte = value;
      this.release(old);
      e.frame = fresh;
      e.writable = true;
      e.cow = false;
      this.copiedPages++;
      this.log.push({ kind: 'fault-copy', text: `write fault on P${pid} page ${page}: frame ${old} is shared by ${shared}, so the kernel copies it to frame ${fresh}, maps that writable and drops frame ${old}'s count to ${shared - 1}` });
      return { ok: true, fault: true, copied: true, frame: fresh };
    }
    e.writable = true;
    e.cow = false;
    this.frames[old].byte = value;
    this.log.push({ kind: 'fault-reuse', text: `write fault on P${pid} page ${page}: frame ${old} is no longer shared (count 1), so the entry is simply made writable: no copy` });
    return { ok: true, fault: true, copied: false, frame: old };
  }

  exit(pid: number) {
    const p = this.proc(pid);
    if (!p.alive) return;
    for (const e of p.table) if (e.frame !== null) this.release(e.frame);
    p.table = p.table.map(() => ({ frame: null, writable: false, cow: false }));
    p.alive = false;
    this.log.push({ kind: 'exit', text: `P${pid} exits: its frames' counts drop, and a frame at 0 returns to the pool` });
  }

  /** exec: the old mappings go away and the new program is mapped into fresh frames (loaded, not copied from the parent). */
  exec(pid: number, program = EXEC_PAGES): boolean {
    const p = this.proc(pid);
    for (const e of p.table) if (e.frame !== null) this.release(e.frame);
    const table: Pte[] = Array.from({ length: this.pages }, () => ({ frame: null, writable: false, cow: false }));
    for (let page = 0; page < Math.min(program, this.pages); page++) {
      const f = this.alloc(execByte(page), 'original');
      if (f === null) return false;
      table[page] = { frame: f, writable: true, cow: false };
    }
    p.table = table;
    p.threads = 1;
    this.log.push({ kind: 'exec', text: `P${pid} execs a new program: the ${this.pages} inherited mappings are dropped, ${Math.min(program, this.pages)} new pages are loaded` });
    return true;
  }

  clone(): Mmu {
    const m = new Mmu(this.pages, this.poolFrames, this.broken);
    m.procs.length = 0;
    for (const p of this.procs) m.procs.push({ ...p, table: p.table.map((e) => ({ ...e })) });
    m.frames.length = 0;
    for (const f of this.frames) m.frames.push({ ...f });
    m.free = [...this.free];
    m.copiedPages = this.copiedPages;
    m.forkedEntries = this.forkedEntries;
    m.log.push(...this.log);
    m.nextPid = this.nextPid;
    return m;
  }

  get framesInUse(): number {
    return this.frames.filter((f) => f.refs > 0).length;
  }

  /** Frames waiting in the pool. */
  get freeFrames(): number {
    return this.free.length;
  }

  /** How many alive processes have an entry that maps this frame. */
  mappers(frame: number): number {
    return this.alive.reduce((n, p) => n + p.table.filter((e) => e.frame === frame).length, 0);
  }

  /** The safety properties; null while they hold. */
  invariantViolation(): string | null {
    for (let id = 0; id < this.frames.length; id++) {
      const f = this.frames[id];
      const m = this.mappers(id);
      if (f.refs !== m) return `frame ${id} has count ${f.refs} but ${m} entries map it`;
      if (f.refs > 1) {
        for (const p of this.alive) {
          const idx = p.table.findIndex((e) => e.frame === id && e.writable);
          if (idx >= 0) return `frame ${id} is shared by ${f.refs} entries but P${p.pid} maps it writable (page ${idx})`;
        }
      }
    }
    return null;
  }
}
