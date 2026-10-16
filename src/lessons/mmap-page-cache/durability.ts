/**
 * Scene 3: dirty pages, writeback and the power cut. A 16-page file, a page cache that holds dirty pages until a
 * background timer or fsync flushes them, an application that acknowledges a save before or after fsync, and a
 * seeded schedule of saves, timer ticks, a process kill and a power cut. Pure; every tick is a toy tick.
 */
import { mulberry32 } from '../../core/random';

export const DURABILITY_PAGES = 16;
/**
 * The writeback timer wakes every 5 ticks and flushes pages that have been dirty for 30 ticks or more. Linux's own
 * defaults are 5 s and 30 s (`dirty_writeback_centisecs` 500, `dirty_expire_centisecs` 3000: read on one WSL2 kernel, check yours).
 */
export const WRITEBACK_WAKE = 5;
export const DIRTY_EXPIRE = 30;

export type Via = 'write' | 'mmap';
export type AckMode = 'before' | 'after';
/** The scene opens acknowledging a save as soon as write returns, the risky policy. */
export const DEFAULT_ACK_MODE: AckMode = 'before';

export interface CachedPage {
  version: number;
  dirty: boolean;
  dirtiedAt: number;
}

export interface Ack {
  page: number;
  version: number;
}

export interface Machine {
  tick: number;
  nextVersion: number;
  cache: (CachedPage | null)[];
  /** The version of each page on disk; 0 is the file as it was. */
  disk: number[];
  /** Saves the user was told about. */
  acked: Ack[];
  /** Written but not yet acknowledged (the ack-after-fsync policy waits for fsync). */
  pending: Ack[];
  processAlive: boolean;
  poweredOn: boolean;
  log: string[];
}

export const freshMachine = (): Machine => ({
  tick: 0, nextVersion: 1, cache: Array(DURABILITY_PAGES).fill(null), disk: Array(DURABILITY_PAGES).fill(0), acked: [], pending: [], processAlive: true, poweredOn: true, log: [],
});

const copy = (m: Machine, patch: Partial<Machine>): Machine => ({ ...m, cache: [...m.cache], disk: [...m.disk], acked: [...m.acked], pending: [...m.pending], log: [...m.log], ...patch });

/** The page is written through the syscall or the mapping: either way it turns dirty in the cache, with a new version. */
export function writePage(m: Machine, page: number, via: Via): { m: Machine; ack: Ack } | null {
  if (!m.poweredOn || !m.processAlive) return null;
  const version = m.nextVersion;
  const next = copy(m, { nextVersion: version + 1 });
  const old = next.cache[page];
  next.cache[page] = { version, dirty: true, dirtiedAt: old?.dirty ? old.dirtiedAt : m.tick };
  next.log.push(`${via === 'write' ? 'write()' : 'store through the mapping'} puts version ${version} on page ${page}: dirty in the cache, not on disk`);
  const ack = { page, version };
  next.pending.push(ack);
  return { m: next, ack };
}

/** The application tells the user the save is done. */
export function ack(m: Machine, a: Ack): Machine {
  const next = copy(m, { pending: m.pending.filter((p) => p.version !== a.version) });
  next.acked.push(a);
  next.log.push(`the application tells the user page ${a.page} (version ${a.version}) is saved`);
  return next;
}

function flush(next: Machine, pages: readonly number[], why: string) {
  for (const p of pages) {
    const c = next.cache[p];
    if (!c?.dirty) continue;
    next.disk[p] = c.version;
    next.cache[p] = { ...c, dirty: false };
  }
  if (pages.length > 0) next.log.push(`${why}: page${pages.length === 1 ? '' : 's'} ${pages.join(', ')} written to disk`);
}

const dirtyPages = (m: Machine) => m.cache.flatMap((c, p) => (c?.dirty ? [p] : []));

/** fsync or msync: every dirty page goes to disk now. With `ackPending` (the ack-after policy) the waiting saves are acknowledged once it returns. */
export function fsync(m: Machine, ackPending: boolean): Machine {
  if (!m.poweredOn) return m;
  const next = copy(m, {});
  flush(next, dirtyPages(m), 'fsync');
  if (ackPending) {
    for (const a of m.pending) next.acked.push(a);
    next.pending = [];
    if (m.pending.length > 0) next.log.push(`fsync returned: ${m.pending.length} waiting ${m.pending.length === 1 ? 'save is' : 'saves are'} now acknowledged`);
  }
  return next;
}

/** Time passes: at each timer wake, pages dirty for DIRTY_EXPIRE ticks or more are written back. */
export function advance(m: Machine, ticks: number): Machine {
  if (!m.poweredOn) return m;
  const next = copy(m, {});
  const end = m.tick + ticks;
  for (let wake = (Math.floor(m.tick / WRITEBACK_WAKE) + 1) * WRITEBACK_WAKE; wake <= end; wake += WRITEBACK_WAKE) {
    const due = next.cache.flatMap((c, p) => (c?.dirty && wake - c.dirtiedAt >= DIRTY_EXPIRE ? [p] : []));
    flush(next, due, `writeback timer at tick ${wake}`);
  }
  next.tick = end;
  return next;
}

/** kill -9 the writer: the process is gone, the dirty pages stay in the cache and the kernel still writes them back. */
export function kill(m: Machine): Machine {
  const next = copy(m, { processAlive: false });
  next.log.push('the process is killed: its dirty pages stay in the page cache, which belongs to the kernel');
  return next;
}

/** Power cut: RAM is gone. Only what reached the disk survives. */
export function powerCut(m: Machine): Machine {
  const next = copy(m, { poweredOn: false, cache: Array(DURABILITY_PAGES).fill(null) });
  const lost = lostWrites(next);
  next.log.push(`power cut: the page cache is gone; ${lost.length} acknowledged ${lost.length === 1 ? 'write is' : 'writes are'} not on disk`);
  return next;
}

/** Acknowledged saves whose version (or a later one of that page) is not on disk. */
export const lostWrites = (m: Machine): Ack[] => m.acked.filter((a) => m.disk[a.page] < a.version);
export const dirtyCount = (m: Machine) => dirtyPages(m).length;
export const cachedCount = (m: Machine) => m.cache.filter(Boolean).length;
/** Ticks until the next timer wake. */
export const untilWake = (m: Machine) => WRITEBACK_WAKE - (m.tick % WRITEBACK_WAKE);

// ── The seeded schedule ───────────────────────────────────────────────

export type Step =
  | { kind: 'write'; page: number; via: Via }
  | { kind: 'ack' }
  | { kind: 'fsync' }
  | { kind: 'tick'; ticks: number }
  | { kind: 'kill' };

export interface Plan {
  saves: { page: number; via: Via; gapBefore: number }[];
  /** The step after which the plug is pulled, as the save it falls in and how far through that save (0 to 1). */
  cutSave: number;
  cutFraction: number;
  /** Kill the process before this save (-1: never). */
  killBefore: number;
}

/** The pinned lowest seed on which acknowledging before fsync loses an acknowledged write (durability.test.ts proves it is the lowest of 0..199). */
export const BROKEN_ACK_SEED = 4;

/** The pages saves go to: a few, so a page is overwritten while its earlier version is still dirty. */
export const SCHEDULE_PAGES = 4;
export const MAX_SAVES = 8;
export const MIN_SAVES = 3;
export const MAX_GAP = 40;

export function planFor(seed: number): Plan {
  const rnd = mulberry32(seed);
  const n = MIN_SAVES + Math.floor(rnd() * (MAX_SAVES - MIN_SAVES + 1));
  const saves = Array.from({ length: n }, () => ({ page: Math.floor(rnd() * SCHEDULE_PAGES), via: (rnd() < 0.5 ? 'write' : 'mmap') as Via, gapBefore: Math.floor(rnd() * (MAX_GAP + 1)) }));
  return { saves, cutSave: Math.floor(rnd() * n), cutFraction: rnd(), killBefore: rnd() < 0.3 ? Math.floor(rnd() * n) : -1 };
}

/** The steps of the plan for an ack policy, up to and including the cut, and the index of the cut within them. */
export function scheduleFor(plan: Plan, mode: AckMode): { steps: Step[]; cutAfter: number } {
  const steps: Step[] = [];
  let cutAfter = -1;
  plan.saves.forEach((save, i) => {
    if (plan.killBefore === i) steps.push({ kind: 'kill' });
    if (save.gapBefore > 0) steps.push({ kind: 'tick', ticks: save.gapBefore });
    const body: Step[] = mode === 'before'
      ? [{ kind: 'write', page: save.page, via: save.via }, { kind: 'ack' }, { kind: 'fsync' }]
      : [{ kind: 'write', page: save.page, via: save.via }, { kind: 'fsync' }];
    const start = steps.length;
    steps.push(...body);
    if (i === plan.cutSave) cutAfter = start + Math.max(0, Math.min(body.length - 1, Math.floor(plan.cutFraction * body.length)));
  });
  return { steps: steps.slice(0, cutAfter + 1), cutAfter };
}

export interface RunResult {
  m: Machine;
  steps: Step[];
  /** The step index at which each save was acknowledged, for the trace. */
  lost: Ack[];
}

/** Runs the schedule, then pulls the plug. In the `after` policy fsync acknowledges the waiting save; in `before` the ack is its own step. */
export function runSchedule(seed: number, mode: AckMode): RunResult {
  const plan = planFor(seed);
  const { steps } = scheduleFor(plan, mode);
  let m = freshMachine();
  let last: Ack | null = null;
  for (const s of steps) {
    if (s.kind === 'write') {
      const r = writePage(m, s.page, s.via);
      if (r) {
        m = r.m;
        last = r.ack;
      } else last = null;
    } else if (s.kind === 'ack') {
      if (last) m = ack(m, last);
    } else if (s.kind === 'fsync') m = fsync(m, mode === 'after');
    else if (s.kind === 'tick') m = advance(m, s.ticks);
    else m = kill(m);
  }
  m = powerCut(m);
  return { m, steps, lost: lostWrites(m) };
}

// ── Truncation pitfalls ───────────────────────────────────────────────

export type TouchResult = { kind: 'ok' } | { kind: 'sigbus' } | { kind: 'eof' };

/** Touching a page past the end of a file that was truncated: a mapped access is a signal, a read() just returns 0 bytes. */
export function touchAfterTruncate(method: 'read' | 'mmap', page: number, filePages: number): TouchResult {
  if (page < filePages) return { kind: 'ok' };
  return method === 'mmap' ? { kind: 'sigbus' } : { kind: 'eof' };
}
