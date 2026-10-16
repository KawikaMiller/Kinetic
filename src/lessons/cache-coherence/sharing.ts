/** False sharing: two threads, two cores, and the MESI machine run on the line each counter lives on. Counts are model cycles. */
import { freshMachine, step, type Machine } from './mesi';

export type Layout = 'adjacent' | 'padded' | 'atomic' | 'merged';
export type LineBytes = 64 | 128;

export const LAYOUTS: readonly Layout[] = ['adjacent', 'padded', 'atomic', 'merged'];
export const LAYOUT_LABELS: Record<Layout, string> = {
  adjacent: 'Two counters, one 64-byte line',
  padded: 'Padded to separate lines',
  atomic: 'One shared atomic counter',
  merged: 'Per-thread counters, merged at the end',
};
/** Names the layout; the adjacent one says "one line" or "separate lines" from where the offsets really put the counters. */
export function layoutLabel(layout: Layout, lineBytes: LineBytes, offsets?: { offsetA: number; offsetB: number }): string {
  if (layout !== 'adjacent') return LAYOUT_LABELS[layout];
  const apart = offsets && Math.floor(offsets.offsetA / lineBytes) !== Math.floor(offsets.offsetB / lineBytes);
  return apart ? `Two counters on separate ${lineBytes}-byte lines` : `Two counters in one ${lineBytes}-byte line`;
}

export const THREADS = 2;
export const COUNTER_BYTES = 8;
/** Offsets are 8-byte aligned slots inside the first 128 bytes, so a counter never straddles a line. */
export const OFFSET_STEP = COUNTER_BYTES;
export const OFFSET_MAX = 128 - COUNTER_BYTES;
export const BURST_RANGE = { min: 1, max: 16, default: 1 } as const;
export const WRITES_RANGE = { min: 32, max: 256, step: 32, default: 64 } as const;
/** The cost of moving a line between caches, in cycles: a made-up round number, not a measurement. */
export const TRANSFER_CYCLES = 100;
export const HIT_CYCLES = 1;
export const SHOWN_WRITES = 64;
export const ONE_COUNTER_MESSAGE = 'those two offsets are one counter, not two';

export interface SharingConfig {
  layout: Layout;
  lineBytes: LineBytes;
  /** Byte offset of each thread's counter, used by the adjacent layout only. */
  offsetA: number;
  offsetB: number;
  /** Writes in a row before the other thread takes a turn. */
  burst: number;
  writes: number;
}

export const sharingOpening = (): SharingConfig => ({ layout: 'adjacent', lineBytes: 64, offsetA: 0, offsetB: 8, burst: BURST_RANGE.default, writes: WRITES_RANGE.default });

export interface Placement {
  /** The cache line each thread's counter sits on. */
  lines: [number, number];
  /** Set when the offsets name one counter: the layout then behaves as the shared-counter case. */
  refused: string | null;
}

export function placement(cfg: SharingConfig): Placement {
  switch (cfg.layout) {
    case 'padded':
    case 'merged': return { lines: [0, 1], refused: null };
    case 'atomic': return { lines: [0, 0], refused: null };
    case 'adjacent': {
      if (cfg.offsetA === cfg.offsetB) return { lines: [0, 0], refused: ONE_COUNTER_MESSAGE };
      return { lines: [Math.floor(cfg.offsetA / cfg.lineBytes), Math.floor(cfg.offsetB / cfg.lineBytes)], refused: null };
    }
  }
}

/** Where each thread's counter sits: a line and an 8-byte slot in it (a shared variable gives both threads the same slot). */
export function counterSlots(cfg: SharingConfig): { thread: number; line: number; slot: number }[] {
  const { lines } = placement(cfg);
  if (cfg.layout === 'adjacent') {
    const offsets = [cfg.offsetA, cfg.offsetB];
    return offsets.map((offset, thread) => ({ thread, line: lines[thread], slot: (offset % cfg.lineBytes) / COUNTER_BYTES }));
  }
  if (cfg.layout === 'atomic') return [0, 1].map((thread) => ({ thread, line: 0, slot: 0 }));
  return [0, 1].map((thread) => ({ thread, line: lines[thread], slot: 0 }));
}

/** Which thread performs write i: bursts of `burst`, thread 0 first. */
export const threadOf = (i: number, burst: number) => Math.floor(i / burst) % THREADS;

export interface WriteRecord {
  thread: number;
  /** The write moved the line (read-for-ownership or upgrade), or hit in the writer's own cache. */
  transfer: boolean;
}

export interface SharingRun {
  records: WriteRecord[];
  /** Ownership transfers: bus read-for-ownership plus bus upgrade, the first write of each thread included. */
  transfers: number;
  hits: number;
  /** Bus reads that moved a line (the merge at the end of the merged layout). */
  readTransfers: number;
  busTransactions: number;
  cost: number;
  refused: string | null;
}

export const costOf = (transfers: number, readTransfers: number, hits: number) => (transfers + readTransfers) * TRANSFER_CYCLES + hits * HIT_CYCLES;

export function runSharing(cfg: SharingConfig): SharingRun {
  const place = placement(cfg);
  const machines = new Map<number, Machine>();
  const records: WriteRecord[] = [];
  let busTransactions = 0;
  let transfers = 0;
  let hits = 0;
  for (let i = 0; i < cfg.writes; i++) {
    const thread = threadOf(i, cfg.burst);
    const line = place.lines[thread];
    const result = step(machines.get(line) ?? freshMachine(THREADS), { core: thread, access: 'write' });
    machines.set(line, result.machine);
    const transfer = result.bus !== null;
    if (transfer) {
      transfers++;
      busTransactions++;
    } else {
      hits++;
    }
    records.push({ thread, transfer });
  }
  let readTransfers = 0;
  if (cfg.layout === 'merged') {
    const line = place.lines[1];
    const result = step(machines.get(line) ?? freshMachine(THREADS), { core: 0, access: 'read' });
    machines.set(line, result.machine);
    if (result.bus) {
      readTransfers++;
      busTransactions++;
    }
  }
  return { records, transfers, hits, readTransfers, busTransactions, cost: costOf(transfers, readTransfers, hits), refused: place.refused };
}

export interface CostPoint {
  burst: number;
  cost: number;
}

/** Cost against burst length for one layout, everything else as configured. */
export function costCurve(cfg: SharingConfig, layout: Layout = cfg.layout): CostPoint[] {
  return Array.from({ length: BURST_RANGE.max - BURST_RANGE.min + 1 }, (_, k) => {
    const burst = BURST_RANGE.min + k;
    return { burst, cost: runSharing({ ...cfg, layout, burst }).cost };
  });
}
