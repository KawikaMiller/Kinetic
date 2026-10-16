import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { EXEC_PAGES, MAX_PROCS, Mmu, PAGES, execByte, initialByte } from './mmu';

const POOL = PAGES * MAX_PROCS;
const SEEDS = Array.from({ length: 200 }, (_, i) => i);

/** The oracle: a naive fork that deep-copies the whole address space, with no frames, counts or faults. */
class NaiveOs {
  readonly spaces = new Map<number, (number | null)[]>();
  private next = 1;
  spawn() {
    this.spaces.set(this.next, Array.from({ length: PAGES }, (_, p) => initialByte(p)));
    return this.next++;
  }
  fork(pid: number) {
    this.spaces.set(this.next, [...this.spaces.get(pid)!]);
    return this.next++;
  }
  write(pid: number, page: number, v: number) {
    this.spaces.get(pid)![page] = v;
  }
  exit(pid: number) {
    this.spaces.delete(pid);
  }
  exec(pid: number) {
    this.spaces.set(pid, Array.from({ length: PAGES }, (_, p) => (p < EXEC_PAGES ? execByte(p) : null)));
  }
}

type Op = { kind: 'fork' | 'write' | 'exit' | 'exec'; pid: number; page: number; value: number };

/** One random step valid in the current state: up to 3 processes, never exiting the last. */
function nextOp(alive: number[], rnd: Rnd): Op {
  const pid = alive[Math.floor(rnd() * alive.length)];
  const roll = rnd();
  const page = Math.floor(rnd() * PAGES);
  const value = Math.floor(rnd() * 256);
  if (roll < 0.16 && alive.length < MAX_PROCS) return { kind: 'fork', pid, page, value };
  if (roll < 0.26 && alive.length > 1) return { kind: 'exit', pid, page, value };
  if (roll < 0.3) return { kind: 'exec', pid, page, value };
  return { kind: 'write', pid, page, value };
}

interface Divergence {
  step: number;
  op: Op;
  reason: string;
}

/** Runs one seeded sequence on the MMU and the naive OS side by side; the first disagreement, or null. */
function run(seed: number, broken: boolean, steps = 60): { divergence: Divergence | null; invariant: string | null; mmu: Mmu } {
  const rnd = mulberry32(seed);
  const mmu = new Mmu(PAGES, POOL, broken);
  const naive = new NaiveOs();
  const pidOf = new Map<number, number>();
  pidOf.set(mmu.spawn(), naive.spawn());
  let invariant: string | null = null;
  for (let step = 0; step < steps; step++) {
    const alive = mmu.alive.map((p) => p.pid);
    const op = nextOp(alive, rnd);
    if (op.kind === 'fork') pidOf.set(mmu.fork(op.pid), naive.fork(pidOf.get(op.pid)!));
    else if (op.kind === 'write') {
      if (mmu.read(op.pid, op.page) === null) continue;
      const r = mmu.write(op.pid, op.page, op.value);
      if (!r.ok) throw new Error(`write refused: ${r.error}`);
      naive.write(pidOf.get(op.pid)!, op.page, op.value);
    } else if (op.kind === 'exit') {
      mmu.exit(op.pid);
      naive.exit(pidOf.get(op.pid)!);
    } else {
      if (!mmu.exec(op.pid)) throw new Error('exec ran out of frames');
      naive.exec(pidOf.get(op.pid)!);
    }
    invariant ??= mmu.invariantViolation();
    for (const p of mmu.alive) {
      const want = naive.spaces.get(pidOf.get(p.pid)!)!;
      for (let page = 0; page < PAGES; page++) {
        if (mmu.read(p.pid, page) !== want[page]) return { divergence: { step, op, reason: `P${p.pid} page ${page} reads ${mmu.read(p.pid, page)}, a naive fork gives ${want[page]}` }, invariant, mmu };
      }
    }
  }
  return { divergence: null, invariant, mmu };
}

describe('copy-on-write against a naive fork over 200 seeded sequences of up to 3 processes', () => {
  it('every process reads exactly the bytes the naive model gives, byte for byte, after every step', () => {
    for (const seed of SEEDS) {
      const r = run(seed, false);
      expect(r.divergence, `seed ${seed}`).toBeNull();
    }
  });

  it('after every step each frame\'s count equals the entries that map it, and a shared frame is never mapped writable', () => {
    for (const seed of SEEDS) expect(run(seed, false).invariant, `seed ${seed}`).toBeNull();
  });

  it('no frame leaks: once every process has exited the pool is full again', () => {
    for (const seed of SEEDS) {
      const { mmu } = run(seed, false);
      for (const p of [...mmu.alive]) mmu.exit(p.pid);
      expect(mmu.freeFrames, `seed ${seed}`).toBe(POOL);
      expect(mmu.framesInUse).toBe(0);
      expect(mmu.invariantViolation()).toBeNull();
    }
  });
});

describe('the broken handler: it writes through a shared page without copying', () => {
  const lowestDivergent = () => {
    for (const seed of SEEDS) if (run(seed, true).divergence) return seed;
    return -1;
  };

  it('diverges from the naive oracle on a pinned lowest seed, with a write visible in another process', () => {
    expect(lowestDivergent()).toBe(0);
    const r = run(0, true);
    expect(r.divergence).not.toBeNull();
    expect(r.divergence!.reason).toMatch(/reads \d+, a naive fork gives/);
    expect(r.mmu.log.some((e) => e.kind === 'fault-through')).toBe(true);
    expect(run(0, false).mmu.log.some((e) => e.kind === 'fault-through')).toBe(false);
  });

  it('and the same seed with the real handler does not, so the copy is what prevents it', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      if (run(seed, true).divergence) expect(run(seed, false).divergence, `seed ${seed}`).toBeNull();
    }
  });

  it('the invariant check names the cause: a shared frame mapped writable', () => {
    const m = new Mmu(PAGES, POOL, true);
    const p1 = m.spawn();
    const p2 = m.fork(p1);
    m.write(p2, 3, 0x99);
    expect(m.invariantViolation()).toContain('shared by 2 entries but');
    expect(m.read(p1, 3)).toBe(0x99);
  });
});

describe('hand-worked cases', () => {
  it('fork copies 8 table entries and 0 pages: counts rise to 2 and every entry is read-only COW', () => {
    const m = new Mmu(PAGES, POOL);
    const parent = m.spawn();
    const child = m.fork(parent);
    expect([m.forkedEntries, m.copiedPages, m.framesInUse]).toEqual([PAGES, 0, PAGES]);
    expect(m.frames.slice(0, PAGES).every((f) => f.refs === 2)).toBe(true);
    for (const pid of [parent, child]) expect(m.proc(pid).table.every((e) => !e.writable && e.cow)).toBe(true);
    expect([m.proc(parent).forkReturn, m.proc(child).forkReturn]).toEqual([child, 0]);
    expect([m.proc(parent).threads, m.proc(child).threads]).toEqual([3, 1]);
  });

  it('a write copies one frame, leaves the other process\'s byte alone and lowers the old count; the last one standing copies nothing', () => {
    const m = new Mmu(PAGES, POOL);
    const parent = m.spawn();
    const child = m.fork(parent);
    const before = m.read(parent, 2);
    const r = m.write(child, 2, 0x5a);
    expect(r).toMatchObject({ ok: true, fault: true, copied: true });
    expect([m.read(child, 2), m.read(parent, 2)]).toEqual([0x5a, before]);
    expect(m.copiedPages).toBe(1);
    expect(m.frames[m.proc(parent).table[2].frame!].refs).toBe(1);
    // the child exits, so the parent's page 5 is no longer shared: writing it is a fault with no copy
    m.exit(child);
    const last = m.write(parent, 5, 0x77);
    expect(last).toMatchObject({ ok: true, fault: true, copied: false });
    expect(m.copiedPages).toBe(1);
    expect(m.write(parent, 5, 0x78)).toMatchObject({ fault: false });
  });

  it('matches a real Linux kernel: 64 pages forked, the child writes 8, and 8 pages (32 KB) become private while 56 stay shared', () => {
    // Observed once with MAP_PRIVATE and /proc/self/smaps on Linux 6.18 (WSL2): child Shared_Dirty 256 kB then 224 kB, Private_Dirty 0 then 32 kB.
    const m = new Mmu(64);
    const parent = m.spawn();
    const child = m.fork(parent);
    for (let p = 0; p < 8; p++) m.write(child, p, 2);
    expect(m.copiedPages).toBe(8);
    expect(m.frames.filter((f) => f.refs > 1).length).toBe(56);
    expect(m.framesInUse).toBe(72);
    expect(m.read(parent, 0)).toBe(initialByte(0));
    m.exit(child);
    expect(m.framesInUse).toBe(64);
    expect(m.copiedPages).toBe(8);
  });

  it('exec drops the inherited mappings so almost nothing was copied: counts return to 1 and EXEC_PAGES new frames appear', () => {
    const m = new Mmu(PAGES, POOL);
    const parent = m.spawn();
    const child = m.fork(parent);
    expect(m.exec(child)).toBe(true);
    expect(m.copiedPages).toBe(0);
    expect(m.framesInUse).toBe(PAGES + EXEC_PAGES);
    expect(m.frames.slice(0, PAGES).every((f) => f.refs === 1)).toBe(true);
    expect(m.proc(parent).table.every((e) => e.writable === false && e.cow)).toBe(true);
    expect(m.read(child, 0)).toBe(execByte(0));
    expect(m.read(child, EXEC_PAGES)).toBeNull();
    expect(m.invariantViolation()).toBeNull();
  });

  it('a write to an unmapped page or by an exited process is refused with a reason', () => {
    const m = new Mmu(PAGES, POOL);
    const parent = m.spawn();
    const child = m.fork(parent);
    m.exec(child);
    expect(m.write(child, 5, 1)).toEqual({ ok: false, error: 'page 5 is not mapped in P2' });
    m.exit(child);
    expect(m.write(child, 0, 1)).toEqual({ ok: false, error: 'P2 has exited' });
  });
});
