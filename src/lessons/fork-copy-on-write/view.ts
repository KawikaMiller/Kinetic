/** What the scenes draw, as pure functions of the MMU, so the tones and numbers are testable. */
import type { RowDecor } from '../../components/cellGridLayout';
import type { Tone } from '../../core/tone';
import { Mmu, PAGES, PAGE_BYTES, MAX_PROCS, type LogKind } from './mmu';

/** Frames in the scenes' pool: enough for MAX_PROCS full private copies. */
export const POOL_FRAMES = PAGES * MAX_PROCS;
export const DEFAULT_WRITE_BYTE = 0x41;
export const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

export interface CellLook {
  text: string;
  tone?: Tone;
  fill: 'tint' | 'outline' | 'none';
}

/** Scene 1 opens before the fork; scene 2 opens after it, with P1 and its child sharing every frame. */
export function openingWorld(scene: 'fork' | 'write'): Mmu {
  const m = new Mmu(PAGES, POOL_FRAMES);
  const p1 = m.spawn();
  if (scene === 'write') m.fork(p1);
  return m;
}

/** A page table entry: a frame number, outlined `--info` while read-only COW, tinted once writable, dim when unmapped. */
export function pteLook(m: Mmu, pid: number, page: number): CellLook {
  const e = m.proc(pid).table[page];
  if (e.frame === null) return { text: '', tone: 'dim', fill: 'outline' };
  if (!e.writable) return { text: `f${e.frame}`, tone: 'info', fill: 'outline' };
  return { text: `f${e.frame}`, tone: m.frames[e.frame].origin === 'copy' ? 'ok' : 'muted', fill: 'tint' };
}

/** A frame in the pool: its reference count, violet while shared, green if it is a fresh copy, dim when free. */
export function frameLook(m: Mmu, frame: number): CellLook {
  const f = m.frames[frame];
  if (f.refs === 0) return { text: '', tone: 'dim', fill: 'outline' };
  if (f.refs > 1) return { text: String(f.refs), tone: 'violet', fill: 'tint' };
  return { text: '1', tone: f.origin === 'copy' ? 'ok' : 'muted', fill: 'tint' };
}

/** How many of a process's pages sit on a frame some other process also maps. */
export function sharedPages(m: Mmu, pid: number): number {
  return m.proc(pid).table.filter((e) => e.frame !== null && m.frames[e.frame].refs > 1).length;
}

export const processRowDecor = (m: Mmu, pids: readonly number[]) => (r: number): RowDecor | null => {
  const n = sharedPages(m, pids[r]);
  return n > 0 ? { tone: 'violet', label: `${n} shared` } : null;
};

export const sharedFrameCount = (m: Mmu) => m.frames.filter((f) => f.refs > 1).length;
export const copiedBytes = (m: Mmu) => m.copiedPages * PAGE_BYTES;
/** What a naive fork would copy at the moment of fork: the whole address space. */
export const naiveForkBytes = (m: Mmu) => m.pages * PAGE_BYTES;

export const LOG_TONE: Record<LogKind, Tone | undefined> = {
  fork: 'violet', 'fault-copy': 'ok', 'fault-reuse': 'info', 'fault-through': 'bad', write: undefined, exit: 'dim', exec: 'dim',
};

/** The selected page across processes: what each reads and which frame it sits on. */
export function pageReadout(m: Mmu, page: number) {
  return m.alive.map((p) => {
    const e = p.table[page];
    const frame = e.frame;
    return { pid: p.pid, frame, byte: frame === null ? null : m.frames[frame].byte, refs: frame === null ? 0 : m.frames[frame].refs, writable: e.writable };
  });
}
