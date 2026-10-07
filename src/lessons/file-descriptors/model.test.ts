import { describe, expect, it } from 'vitest';
import {
  accept, apply, close, dup, dup2, FD_LIMIT, fork, listen, lowestFree, open, pipe, PRESETS, resolve, run, startWorld, write,
  type Op, type Result, type World,
} from './model';

const PID = 100;
const ok = (r: Result) => {
  if (!r.ok) throw new Error(`unexpected ${r.errno}`);
  return r;
};

/** Refcounts equal the number of FD slots (across every process) pointing at each open file, and nothing dangles. */
function consistent(w: World) {
  for (const f of w.files) {
    const refs = w.procs.reduce((a, p) => a + p.fds.filter((id) => id === f.id).length, 0);
    expect(f.refs).toBe(refs);
    expect(f.refs).toBeGreaterThan(0);
    expect(w.objs.some((o) => o.id === f.obj)).toBe(true);
  }
  for (const p of w.procs) for (const id of p.fds) if (id !== null) expect(w.files.some((f) => f.id === id)).toBe(true);
}

const slotOf = (w: World, pid: number, fd: number) => w.procs.find((p) => p.pid === pid)!.fds[fd];

describe('allocation', () => {
  it('open takes the lowest free FD, including a gap left by close', () => {
    let w = startWorld();
    const a = ok(open(w, PID, 'a', 'r'));
    expect(a.fd).toBe(3);
    w = ok(open(a.world, PID, 'b', 'r')).world;
    w = ok(close(w, PID, 0)).world;
    expect(ok(open(w, PID, 'c', 'r')).fd).toBe(0);
  });
  it('EMFILE happens exactly at the limit, and the world is unchanged', () => {
    let w = startWorld();
    for (let i = 3; i < FD_LIMIT; i++) {
      const r = ok(open(w, PID, `f${i}`, 'r'));
      expect(r.fd).toBe(i);
      w = r.world;
    }
    const r = open(w, PID, 'one-too-many', 'r');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errno).toBe('EMFILE');
    expect(r.world).toBe(w);
    expect(dup(w, PID, 0).ok).toBe(false);
    // one close frees exactly one slot
    w = ok(close(w, PID, 7)).world;
    expect(ok(open(w, PID, 'again', 'r')).fd).toBe(7);
  });
  it('pipe gives two FDs, a read end and a write end on one pipe', () => {
    const r = ok(pipe(startWorld(), PID));
    expect(r.fds).toEqual([3, 4]);
    const rd = resolve(r.world, PID, 3)!;
    const wr = resolve(r.world, PID, 4)!;
    expect([rd.file.access, wr.file.access]).toEqual(['r', 'w']);
    expect(rd.obj.id).toBe(wr.obj.id);
    expect(write(r.world, PID, 3, 'x').ok).toBe(false);
  });
  it('accept gives a new FD per connection', () => {
    let w = ok(listen(startWorld(), PID, 8080)).world;
    const a = ok(accept(w, PID, 3));
    const b = ok(accept(a.world, PID, 3));
    expect([a.fd, b.fd]).toEqual([4, 5]);
    expect(resolve(b.world, PID, 4)!.obj.id).not.toBe(resolve(b.world, PID, 5)!.obj.id);
    w = b.world;
    expect(accept(w, PID, 0).ok).toBe(false);
  });
});

describe('dup and dup2', () => {
  it('dup2(a, a) is a no-op that returns a', () => {
    const w = ok(open(startWorld(), PID, 'f', 'w')).world;
    const r = ok(dup2(w, PID, 3, 3));
    expect(r.fd).toBe(3);
    expect(r.world).toEqual(w);
  });
  it('dup2 onto an open FD closes it first', () => {
    const w = ok(open(startWorld(), PID, 'f', 'w')).world;
    const tty = slotOf(w, PID, 1);
    const r = ok(dup2(w, PID, 3, 1));
    expect(slotOf(r.world, PID, 1)).toBe(slotOf(r.world, PID, 3));
    expect(r.world.files.find((f) => f.id === tty)!.refs).toBe(2);
    consistent(r.world);
  });
  it('dup2 between two FDs that already share an open file keeps the count right', () => {
    const r = ok(dup2(startWorld(), PID, 1, 2));
    expect(r.world.files[0].refs).toBe(3);
    consistent(r.world);
  });
  it('refcount reaches 0 only when every FD referring to the entry is closed', () => {
    let w = ok(open(startWorld(), PID, 'f', 'w')).world;
    w = ok(dup(w, PID, 3)).world;
    w = ok(dup2(w, PID, 3, 9)).world;
    const id = slotOf(w, PID, 3)!;
    for (const fd of [3, 4]) {
      w = ok(close(w, PID, fd)).world;
      expect(w.files.find((f) => f.id === id)?.refs).toBeGreaterThan(0);
    }
    w = ok(close(w, PID, 9)).world;
    expect(w.files.find((f) => f.id === id)).toBeUndefined();
  });
  it('closing a free slot is EBADF', () => {
    const r = close(startWorld(), PID, 5);
    expect(!r.ok && r.errno).toBe('EBADF');
  });
});

describe('fork and exec', () => {
  it('fork duplicates the table, shares the open files and bumps every refcount', () => {
    const w = ok(open(startWorld(), PID, 'log', 'w')).world;
    const r = ok(fork(w, PID));
    const [parent, child] = r.world.procs;
    expect(child.fds).toEqual(parent.fds);
    expect(r.world.files.map((f) => f.refs)).toEqual(w.files.map((f) => f.refs * 2));
    consistent(r.world);
  });
  it('after fork, both writers share one offset: their writes interleave', () => {
    const p = PRESETS.find((x) => x.id === 'shared-offset')!;
    const end = run(p.start(), p.ops).at(-1)!.result.world;
    expect(end.objs.find((o) => o.name === 'log.txt')!.content).toBe('parent 1\nchild 1\nparent 2\nchild 2\n');
  });
  it('two separate opens have separate offsets: the child overwrites the parent', () => {
    const p = PRESETS.find((x) => x.id === 'separate')!;
    const end = run(p.start(), p.ops).at(-1)!.result.world;
    expect(end.objs.find((o) => o.name === 'log.txt')!.content).toBe('child 1\n\nparent 2\n');
  });
  it('exec keeps FDs except close-on-exec ones', () => {
    const p = PRESETS.find((x) => x.id === 'cloexec')!;
    const end = run(p.start(), p.ops).at(-1)!.result.world;
    expect(resolve(end, PID, 3)!.obj.name).toBe('log.txt');
    expect(resolve(end, PID, 4)).toBeNull();
    consistent(end);
  });
});

describe('presets', () => {
  it('cmd > out.txt 2>&1 leaves FDs 1 and 2 on out.txt, and both writes land there', () => {
    const p = PRESETS.find((x) => x.id === 'redirect')!;
    const end = run(p.start(), p.ops).at(-1)!.result.world;
    expect(resolve(end, PID, 1)!.obj.name).toBe('out.txt');
    expect(resolve(end, PID, 2)!.obj.name).toBe('out.txt');
    expect(resolve(end, PID, 1)!.file.id).toBe(resolve(end, PID, 2)!.file.id);
    expect(resolve(end, PID, 3)).toBeNull();
    expect(end.objs.find((o) => o.name === 'out.txt')!.content).toBe('result\nwarning\n');
  });
  it('the wrong order (2>&1 > out.txt) leaves 2 on the terminal', () => {
    const p = PRESETS.find((x) => x.id === 'wrong-order')!;
    const end = run(p.start(), p.ops).at(-1)!.result.world;
    expect(resolve(end, PID, 1)!.obj.name).toBe('out.txt');
    expect(resolve(end, PID, 2)!.obj.name).toBe('/dev/tty');
    expect(end.objs.find((o) => o.name === 'out.txt')!.content).toBe('result\n');
  });
  it('the leak fills the table and the next accept fails with EMFILE, exactly at the limit', () => {
    const p = PRESETS.find((x) => x.id === 'leak')!;
    const played = run(p.start(), p.ops);
    const fails = played.filter((x) => !x.result.ok);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toBe(played.at(-1));
    expect(!fails[0].result.ok && fails[0].result.errno).toBe('EMFILE');
    const before = fails[0].before.procs[0];
    expect(lowestFree(before)).toBeNull();
    expect(before.leaked.filter(Boolean)).toHaveLength(FD_LIMIT - 4);
  });
  it('every preset keeps refcounts consistent after every step', () => {
    for (const p of PRESETS) for (const s of run(p.start(), p.ops)) consistent(s.result.world);
  });
});

describe('random operation sequences', () => {
  it('never break the refcount invariant, and always allocate the lowest free slot', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
    const int = (n: number) => Math.floor(rnd() * n);
    for (let trial = 0; trial < 200; trial++) {
      let w = startWorld();
      for (let i = 0; i < 40; i++) {
        const pids = w.procs.map((p) => p.pid);
        const pid = pids[int(pids.length)];
        const choices: Op[] = [
          { kind: 'open', pid, path: `f${int(3)}`, access: 'w', cloexec: rnd() < 0.3 },
          { kind: 'close', pid, fd: int(FD_LIMIT) },
          { kind: 'dup', pid, fd: int(FD_LIMIT) },
          { kind: 'dup2', pid, old: int(FD_LIMIT), new: int(FD_LIMIT) },
          { kind: 'pipe', pid },
          { kind: 'fork', pid },
          { kind: 'exec', pid, program: 'x' },
          { kind: 'write', pid, fd: int(FD_LIMIT), text: 'ab' },
        ];
        const op = choices[int(choices.length)];
        const before = w.procs.find((p) => p.pid === pid)!;
        const free = lowestFree(before);
        const r = apply(w, op);
        if (r.ok && (op.kind === 'open' || op.kind === 'dup')) expect(r.fd).toBe(free);
        consistent(r.world);
        w = r.world;
      }
    }
  });
});
