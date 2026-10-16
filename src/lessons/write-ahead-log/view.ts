/** What the scenes draw, as pure functions of the model, plus each scene's opening state. */
import type { LogRow } from '../../components/logRows';
import type { Tone } from '../../core/tone';
import { FSYNC_SSD_MS, GROUP_SEED } from './cost';
import {
  DEFAULT_POLICY, PAGES, applyOp, committedIn, fresh, losersIn, txName, withPolicy, type Image, type Machine, type Op, type Policy, type Rec,
} from './wal';

/** Scene 1 opens on an empty database with the textbook policy: steal, no-force, the WAL rule on, acknowledge after fsync. */
export const MACHINE_OPEN = { tx: 1, page: 3, value: 7, policy: DEFAULT_POLICY } as const;
export const MACHINE_TXS = [1, 2, 3] as const;

/** Scene 2 opens on the lowest seed of 0..199 whose run breaks when the WAL rule is off, with both protections on. */
export const WAL_OFF_SEED = 1;
/** The lowest seed of 0..199 whose run breaks when commits are acknowledged before the fsync. */
export const ACK_EARLY_SEED = 3;
export const CRASH_OPEN = { seed: WAL_OFF_SEED, enforceWal: true, ackBeforeFsync: false, secondCrash: false, secondCrashStep: 3 } as const;

/** Scene 3 opens on an SSD-speed fsync, 8 committers and no checkpoints. */
export const COST_OPEN = { latencyMs: FSYNC_SSD_MS, committers: 8, seed: GROUP_SEED } as const;

export interface Preset {
  id: string;
  label: string;
  policy: Partial<Policy>;
  ops: Op[];
}

export const PRESETS: Preset[] = [
  { id: 'winner', label: 'Committed, never flushed', policy: {}, ops: [{ kind: 'write', tx: 1, page: 3, value: 7 }, { kind: 'commit', tx: 1 }] },
  { id: 'loser', label: 'A loser\'s page flushed', policy: {}, ops: [{ kind: 'write', tx: 1, page: 3, value: 7 }, { kind: 'flush', page: 3 }] },
  { id: 'walOff', label: 'WAL rule off', policy: { enforceWal: false }, ops: [{ kind: 'write', tx: 1, page: 3, value: 7 }, { kind: 'flush', page: 3 }] },
  { id: 'ackEarly', label: 'Acknowledge before fsync', policy: { ackBeforeFsync: true }, ops: [{ kind: 'write', tx: 1, page: 3, value: 7 }, { kind: 'commit', tx: 1 }] },
];

export function presetMachine(id: string): Machine {
  const p = PRESETS.find((x) => x.id === id)!;
  return p.ops.reduce(applyOp, fresh({ ...DEFAULT_POLICY, ...p.policy }));
}

export const setPolicy = withPolicy;

/** The log as rows: durable ones coloured by what their transaction became, the volatile tail dim, a violet rule between. */
export function logRows(m: Machine, torn: Rec | null = null): LogRow[] {
  const committed = new Set(m.log.slice(0, m.durable).filter((r) => r.kind === 'commit').map((r) => r.tx));
  const rows: LogRow[] = [];
  const durableRows = m.log.slice(0, m.durable);
  const tail = m.log.slice(m.durable);
  for (const r of durableRows) rows.push({ id: `r${r.lsn}`, source: `LSN ${r.lsn}`, tone: recTone(m, r, committed), text: recText(r) });
  rows.push({ id: 'boundary', tone: 'violet', text: m.durable === 0 ? 'durable boundary: nothing is on disk yet' : `durable boundary: LSN 1 to ${m.durable} survive a crash` });
  for (const r of tail) rows.push({ id: `r${r.lsn}`, source: `LSN ${r.lsn}`, tone: torn?.lsn === r.lsn ? 'orange' : 'dim', text: `${recText(r)}${torn?.lsn === r.lsn ? ' (torn: ignored)' : ' (in memory)'}` });
  return rows;
}

/** A transaction's records: green once it committed, red while it is a loser, grey once undone. */
function recTone(m: Machine, r: Rec, committed: Set<number>): Tone | undefined {
  if (r.kind === 'checkpoint') return 'info';
  if (committed.has(r.tx)) return 'ok';
  if (m.status[r.tx] === 'aborted') return 'dim';
  return r.tx === 0 ? undefined : 'bad';
}

export function recText(r: Rec): string {
  switch (r.kind) {
    case 'update': return `${txName(r.tx)} update page ${r.page}: ${r.before} to ${r.after}`;
    case 'undo': return `${txName(r.tx)} undo page ${r.page}: back to ${r.after} (undoes LSN ${r.undoOf})`;
    case 'commit': return `${txName(r.tx)} commit`;
    case 'abort': return `${txName(r.tx)} abort`;
    default: return `checkpoint: redo starts at LSN ${r.redoStart}, running ${r.active!.length === 0 ? 'none' : r.active!.map(txName).join(', ')}`;
  }
}

/** Log rows of a durable log alone, as recovery reads it: losers red, winners green. */
export function imageRows(image: Image): LogRow[] {
  const committed = new Set(committedIn(image.log));
  const losers = new Set(losersIn(image.log));
  const rows: LogRow[] = image.log.map((r) => ({
    id: `r${r.lsn}`,
    source: `LSN ${r.lsn}`,
    tone: r.kind === 'checkpoint' ? ('info' as const) : committed.has(r.tx) ? ('ok' as const) : losers.has(r.tx) ? ('bad' as const) : ('dim' as const),
    text: recText(r),
  }));
  if (image.torn) rows.push({ id: `torn${image.torn.lsn}`, source: `LSN ${image.torn.lsn}`, tone: 'orange', text: 'a record cut off mid-write: its checksum fails, so it is ignored' });
  return rows;
}

export interface PageLook {
  text: string;
  tone: Tone;
  fill: 'tint' | 'outline';
}

/** Columns of the page grid: the buffer pool's copy, the disk's copy, the page LSN each carries. */
export const PAGE_COLS = ['pool', 'disk', 'LSN'] as const;

export function pageCell(m: Machine, page: number, col: number): PageLook {
  const f = m.pool[page];
  if (col === 0) return { text: String(f.value), tone: f.dirty ? 'hi' : 'ok', fill: 'tint' };
  if (col === 1) return { text: String(m.disk[page]), tone: m.disk[page] === f.value ? 'ok' : 'dim', fill: m.disk[page] === f.value ? 'tint' : 'outline' };
  return { text: String(f.lsn), tone: f.lsn > m.durable ? 'orange' : 'muted', fill: 'outline' };
}

/** A rail beside a page whose newest change is not on disk yet: needs a flush. */
export const pageRail = (m: Machine, page: number): { tone: Tone; label: string } | null =>
  m.pool[page].dirty ? { tone: 'hi', label: 'dirty' } : null;

export const dirtyCount = (m: Machine) => m.pool.filter((f) => f.dirty).length;
export const PAGE_NUMBERS = Array.from({ length: PAGES }, (_, p) => p);
