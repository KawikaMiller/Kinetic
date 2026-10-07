/**
 * A simplified Unix file-descriptor model, three layers deep:
 *   per-process FD table  →  kernel open-file table (offset, flags, refcount)  →  objects (file, pipe, socket, tty).
 * Every operation returns a new world (or an errno and the old world), so the stage can
 * replay a list of operations frame by frame. Limits are a demo value (ulimit -n = 16).
 */

/** The demo's per-process limit (Linux's usual soft default is 1024). */
export const FD_LIMIT = 16;
export const MAX_PROCS = 2;

export type ObjKind = 'tty' | 'file' | 'pipe' | 'listen' | 'conn';
export interface Obj {
  id: number;
  kind: ObjKind;
  name: string;
  /** Bytes written to a file (files only). */
  content: string;
}

export type Access = 'r' | 'w' | 'rw';
export interface OpenFile {
  id: number;
  obj: number;
  offset: number;
  access: Access;
  refs: number;
}

export interface Proc {
  pid: number;
  name: string;
  /** Slot → open-file id, or null when free. Length FD_LIMIT. */
  fds: (number | null)[];
  cloexec: boolean[];
  /** FDs whose request has finished but which were never closed. */
  leaked: boolean[];
}

export interface World {
  procs: Proc[];
  files: OpenFile[];
  objs: Obj[];
  /** Next object id. */
  nextId: number;
  /** Next open-file entry id (numbered separately, so entries read #1, #2, #3…). */
  nextFile: number;
}

export type Errno = 'EMFILE' | 'EBADF' | 'ENOENT' | 'EAGAIN';
export const ERRNO_TEXT: Record<Errno, string> = {
  EMFILE: 'Too many open files',
  EBADF: 'Bad file descriptor',
  ENOENT: 'No such process',
  EAGAIN: 'Resource temporarily unavailable',
};

export type Result = { ok: true; world: World; fd?: number; fds?: number[]; pid?: number } | { ok: false; world: World; errno: Errno };

const clone = (w: World): World => ({
  procs: w.procs.map((p) => ({ ...p, fds: [...p.fds], cloexec: [...p.cloexec], leaked: [...p.leaked] })),
  files: w.files.map((f) => ({ ...f })),
  objs: w.objs.map((o) => ({ ...o })),
  nextId: w.nextId,
  nextFile: w.nextFile,
});

const proc = (w: World, pid: number) => w.procs.find((p) => p.pid === pid) ?? null;
const file = (w: World, id: number) => w.files.find((f) => f.id === id)!;

/** The lowest free slot: the rule every FD-allocating call follows. */
export function lowestFree(p: Proc): number | null {
  const i = p.fds.indexOf(null);
  return i < 0 ? null : i;
}

/** One process (a shell's child about to run a command) with 0, 1 and 2 on the terminal. */
export function startWorld(name = 'sh'): World {
  const tty: Obj = { id: 1, kind: 'tty', name: '/dev/tty', content: '' };
  const term: OpenFile = { id: 1, obj: 1, offset: 0, access: 'rw', refs: 3 };
  const fds: (number | null)[] = Array(FD_LIMIT).fill(null);
  fds[0] = fds[1] = fds[2] = term.id;
  return { procs: [{ pid: 100, name, fds, cloexec: Array(FD_LIMIT).fill(false), leaked: Array(FD_LIMIT).fill(false) }], files: [term], objs: [tty], nextId: 2, nextFile: 2 };
}

/** Point the lowest free slot at a new open file on a new object. */
function install(w: World, p: Proc, kind: ObjKind, name: string, access: Access, cloexec: boolean, existingObj?: number): number {
  const fd = lowestFree(p)!;
  const objId = existingObj ?? w.nextId++;
  if (existingObj === undefined) w.objs.push({ id: objId, kind, name, content: '' });
  const f: OpenFile = { id: w.nextFile++, obj: objId, offset: 0, access, refs: 1 };
  w.files.push(f);
  p.fds[fd] = f.id;
  p.cloexec[fd] = cloexec;
  p.leaked[fd] = false;
  return fd;
}

/** Drop one reference; the open file (and an object nothing else uses) goes when the count reaches 0. */
function release(w: World, fileId: number) {
  const f = file(w, fileId);
  f.refs--;
  if (f.refs > 0) return;
  w.files = w.files.filter((x) => x.id !== fileId);
  const stillUsed = w.files.some((x) => x.obj === f.obj);
  const o = w.objs.find((x) => x.id === f.obj)!;
  // Files persist on disk; pipes, sockets and the like vanish with their last open file.
  if (!stillUsed && o.kind !== 'file' && o.kind !== 'tty') w.objs = w.objs.filter((x) => x.id !== f.obj);
}

export function open(w0: World, pid: number, path: string, access: Access, cloexec = false): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  if (lowestFree(p) === null) return { ok: false, world: w0, errno: 'EMFILE' };
  const existing = w.objs.find((o) => o.kind === 'file' && o.name === path);
  const fd = install(w, p, 'file', path, access, cloexec, existing?.id);
  return { ok: true, world: w, fd };
}

export function close(w0: World, pid: number, fd: number): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  const id = p.fds[fd];
  if (id === null || id === undefined) return { ok: false, world: w0, errno: 'EBADF' };
  p.fds[fd] = null;
  p.cloexec[fd] = false;
  p.leaked[fd] = false;
  release(w, id);
  return { ok: true, world: w };
}

export function dup(w0: World, pid: number, fd: number): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  const id = p.fds[fd];
  if (id === null || id === undefined) return { ok: false, world: w0, errno: 'EBADF' };
  const to = lowestFree(p);
  if (to === null) return { ok: false, world: w0, errno: 'EMFILE' };
  p.fds[to] = id;
  file(w, id).refs++;
  return { ok: true, world: w, fd: to };
}

/** dup2(old, new): make `new` refer to old's open file, closing `new` first if it was open. dup2(a, a) does nothing. */
export function dup2(w0: World, pid: number, oldFd: number, newFd: number): Result {
  const p0 = proc(w0, pid);
  if (!p0) return { ok: false, world: w0, errno: 'ENOENT' };
  const id = p0.fds[oldFd];
  if (id === null || id === undefined || newFd < 0 || newFd >= FD_LIMIT) return { ok: false, world: w0, errno: 'EBADF' };
  if (oldFd === newFd) return { ok: true, world: w0, fd: newFd };
  const w = clone(w0);
  const p = proc(w, pid)!;
  const was = p.fds[newFd];
  // Take the new reference before dropping the old one, so dup2 onto a slot that already
  // shares this open file never lets the count touch 0.
  file(w, id).refs++;
  p.fds[newFd] = id;
  p.cloexec[newFd] = false;
  p.leaked[newFd] = false;
  if (was !== null) release(w, was);
  return { ok: true, world: w, fd: newFd };
}

/** pipe(): two FDs, a read end and a write end, on one pipe object. */
export function pipe(w0: World, pid: number): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  if (p.fds.filter((x) => x === null).length < 2) return { ok: false, world: w0, errno: 'EMFILE' };
  const r = install(w, p, 'pipe', `pipe ${w.objs.filter((o) => o.kind === 'pipe').length + 1}`, 'r', false);
  const pipeObj = file(w, p.fds[r]!).obj;
  const wr = install(w, p, 'pipe', '', 'w', false, pipeObj);
  return { ok: true, world: w, fds: [r, wr] };
}

/** socket() + bind() + listen(): one FD for the listening socket. */
export function listen(w0: World, pid: number, port: number): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  if (lowestFree(p) === null) return { ok: false, world: w0, errno: 'EMFILE' };
  const fd = install(w, p, 'listen', `listening :${port}`, 'rw', false);
  return { ok: true, world: w, fd };
}

/** accept(): a new FD for each connection. Example client addresses come from 203.0.113.0/24 (documentation range). */
export function accept(w0: World, pid: number, lfd: number): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  const id = p.fds[lfd];
  if (id === null || id === undefined || w.objs.find((o) => o.id === file(w, id).obj)?.kind !== 'listen') return { ok: false, world: w0, errno: 'EBADF' };
  if (lowestFree(p) === null) return { ok: false, world: w0, errno: 'EMFILE' };
  const n = w.objs.filter((o) => o.kind === 'conn').length;
  const fd = install(w, p, 'conn', `TCP 203.0.113.${10 + (n % 200)}:${50000 + n}`, 'rw', false);
  return { ok: true, world: w, fd };
}

/** The request on `fd` is finished. A correct server closes it; a buggy error path forgets, and the FD leaks. */
export function finishRequest(w0: World, pid: number, fd: number, closes: boolean): Result {
  if (closes) return close(w0, pid, fd);
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p || p.fds[fd] === null) return { ok: false, world: w0, errno: 'EBADF' };
  p.leaked[fd] = true;
  return { ok: true, world: w };
}

/** fork(): the child gets a copy of the FD table pointing at the SAME open files, so each refcount goes up. */
export function fork(w0: World, pid: number): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  if (w.procs.length >= MAX_PROCS) return { ok: false, world: w0, errno: 'EAGAIN' };
  const child: Proc = { pid: Math.max(...w.procs.map((x) => x.pid)) + 1, name: `${p.name} (child)`, fds: [...p.fds], cloexec: [...p.cloexec], leaked: [...p.leaked] };
  for (const id of child.fds) if (id !== null) file(w, id).refs++;
  w.procs.push(child);
  return { ok: true, world: w, pid: child.pid };
}

/** exec(): a new program in the same process. FDs stay open, except those marked close-on-exec. */
export function exec(w0: World, pid: number, program: string): Result {
  let w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  p.name = program;
  for (let fd = 0; fd < FD_LIMIT; fd++) {
    if (p.fds[fd] !== null && p.cloexec[fd]) {
      const r = close(w, pid, fd);
      if (r.ok) w = r.world;
    }
  }
  return { ok: true, world: w };
}

/** write(): bytes go in at the open file's offset, which then moves on. Shared offset, shared position. */
export function write(w0: World, pid: number, fd: number, text: string): Result {
  const w = clone(w0);
  const p = proc(w, pid);
  if (!p) return { ok: false, world: w0, errno: 'ENOENT' };
  const id = p.fds[fd];
  if (id === null || id === undefined) return { ok: false, world: w0, errno: 'EBADF' };
  const f = file(w, id);
  if (f.access === 'r') return { ok: false, world: w0, errno: 'EBADF' };
  const o = w.objs.find((x) => x.id === f.obj)!;
  if (o.kind === 'file') {
    o.content = o.content.slice(0, f.offset) + text + o.content.slice(f.offset + text.length);
    f.offset += text.length;
  } else if (o.kind === 'tty') {
    o.content += text;
  }
  return { ok: true, world: w };
}

// ---------- operations as data, for scripts and replay ----------

export type Op =
  | { kind: 'open'; pid: number; path: string; access: Access; cloexec?: boolean }
  | { kind: 'close'; pid: number; fd: number }
  | { kind: 'dup'; pid: number; fd: number }
  | { kind: 'dup2'; pid: number; old: number; new: number }
  | { kind: 'pipe'; pid: number }
  | { kind: 'listen'; pid: number; port: number }
  | { kind: 'accept'; pid: number; lfd: number }
  | { kind: 'finish'; pid: number; fd: number; closes: boolean }
  | { kind: 'fork'; pid: number }
  | { kind: 'exec'; pid: number; program: string }
  | { kind: 'write'; pid: number; fd: number; text: string };

export function apply(w: World, op: Op): Result {
  switch (op.kind) {
    case 'open': return open(w, op.pid, op.path, op.access, op.cloexec);
    case 'close': return close(w, op.pid, op.fd);
    case 'dup': return dup(w, op.pid, op.fd);
    case 'dup2': return dup2(w, op.pid, op.old, op.new);
    case 'pipe': return pipe(w, op.pid);
    case 'listen': return listen(w, op.pid, op.port);
    case 'accept': return accept(w, op.pid, op.lfd);
    case 'finish': return finishRequest(w, op.pid, op.fd, op.closes);
    case 'fork': return fork(w, op.pid);
    case 'exec': return exec(w, op.pid, op.program);
    case 'write': return write(w, op.pid, op.fd, op.text);
  }
}

export interface Played {
  op: Op;
  result: Result;
  before: World;
}

/** Apply a script from a start world, keeping each result (failed ops leave the world unchanged). */
export function run(start: World, ops: readonly Op[]): Played[] {
  const out: Played[] = [];
  let w = start;
  for (const op of ops) {
    const result = apply(w, op);
    out.push({ op, result, before: w });
    w = result.world;
  }
  return out;
}

/** The open file (and object) a process's FD refers to, or null. */
export function resolve(w: World, pid: number, fd: number): { file: OpenFile; obj: Obj } | null {
  const id = proc(w, pid)?.fds[fd];
  if (id === null || id === undefined) return null;
  const f = file(w, id);
  return { file: f, obj: w.objs.find((o) => o.id === f.obj)! };
}

// ---------- presets ----------

export type PresetId = 'redirect' | 'wrong-order' | 'shared-offset' | 'separate' | 'leak' | 'cloexec';

export interface Preset {
  id: PresetId;
  label: string;
  start: () => World;
  ops: Op[];
}

const PID = 100;
const CHILD = 101;
/** The leak demo: how many requests forget to close before accept() hits the limit. */
export const LEAK_PORT = 8080;

function leakOps(): Op[] {
  // 0-2 are the terminal and 3 is the listening socket, so one good request reuses 4, then every
  // forgotten close eats a slot until all FD_LIMIT are gone and accept() fails with EMFILE.
  const ops: Op[] = [{ kind: 'listen', pid: PID, port: LEAK_PORT }, { kind: 'accept', pid: PID, lfd: 3 }, { kind: 'finish', pid: PID, fd: 4, closes: true }];
  for (let fd = 4; fd < FD_LIMIT; fd++) {
    ops.push({ kind: 'accept', pid: PID, lfd: 3 }, { kind: 'finish', pid: PID, fd, closes: false });
  }
  ops.push({ kind: 'accept', pid: PID, lfd: 3 });
  return ops;
}

export const PRESETS: Preset[] = [
  {
    id: 'redirect', label: 'cmd > out.txt 2>&1', start: () => startWorld('sh'),
    ops: [
      { kind: 'open', pid: PID, path: 'out.txt', access: 'w' },
      { kind: 'dup2', pid: PID, old: 3, new: 1 },
      { kind: 'dup2', pid: PID, old: 1, new: 2 },
      { kind: 'close', pid: PID, fd: 3 },
      { kind: 'exec', pid: PID, program: 'cmd' },
      { kind: 'write', pid: PID, fd: 1, text: 'result\n' },
      { kind: 'write', pid: PID, fd: 2, text: 'warning\n' },
    ],
  },
  {
    id: 'wrong-order', label: 'cmd 2>&1 > out.txt', start: () => startWorld('sh'),
    ops: [
      { kind: 'dup2', pid: PID, old: 1, new: 2 },
      { kind: 'open', pid: PID, path: 'out.txt', access: 'w' },
      { kind: 'dup2', pid: PID, old: 3, new: 1 },
      { kind: 'close', pid: PID, fd: 3 },
      { kind: 'exec', pid: PID, program: 'cmd' },
      { kind: 'write', pid: PID, fd: 1, text: 'result\n' },
      { kind: 'write', pid: PID, fd: 2, text: 'warning\n' },
    ],
  },
  {
    id: 'shared-offset', label: 'Fork shares the offset', start: () => startWorld('app'),
    ops: [
      { kind: 'open', pid: PID, path: 'log.txt', access: 'w' },
      { kind: 'fork', pid: PID },
      { kind: 'write', pid: PID, fd: 3, text: 'parent 1\n' },
      { kind: 'write', pid: CHILD, fd: 3, text: 'child 1\n' },
      { kind: 'write', pid: PID, fd: 3, text: 'parent 2\n' },
      { kind: 'write', pid: CHILD, fd: 3, text: 'child 2\n' },
    ],
  },
  {
    id: 'separate', label: 'Two separate opens', start: () => startWorld('app'),
    ops: [
      { kind: 'fork', pid: PID },
      { kind: 'open', pid: PID, path: 'log.txt', access: 'w' },
      { kind: 'open', pid: CHILD, path: 'log.txt', access: 'w' },
      { kind: 'write', pid: PID, fd: 3, text: 'parent 1\n' },
      { kind: 'write', pid: CHILD, fd: 3, text: 'child 1\n' },
      { kind: 'write', pid: PID, fd: 3, text: 'parent 2\n' },
    ],
  },
  { id: 'leak', label: 'Leak to EMFILE', start: () => startWorld('server'), ops: leakOps() },
  {
    id: 'cloexec', label: 'exec and close-on-exec', start: () => startWorld('app'),
    ops: [
      { kind: 'open', pid: PID, path: 'log.txt', access: 'w' },
      { kind: 'open', pid: PID, path: 'secret.key', access: 'r', cloexec: true },
      { kind: 'exec', pid: PID, program: 'helper' },
    ],
  },
];
