/**
 * Scene 1: three ways to move one block from a device to RAM, as a timeline of ticks.
 * Every constant is illustrative (nothing here is measured). The planner works in whole
 * segments; transfer.test.ts checks it against a tick-by-tick reference.
 */

/** Bytes in one bus word. */
export const WORD_BYTES = 8;
/** CPU ticks to copy one word out of the device's data register into RAM (illustrative). */
export const PIO_WORD_TICKS = 4;
/** Bus ticks the device holds the bus for per word it writes to RAM (illustrative). */
export const BUS_WORD_TICKS = 1;
/** CPU ticks to write the DMA source, destination and length into the device's registers (illustrative). */
export const DMA_SETUP_TICKS = 40;
/** CPU ticks to enter, run and leave an interrupt handler (illustrative). */
export const IRQ_TICKS = 60;
/** Ticks the device needs before its block is ready to move (a disk seek, a packet being received) (illustrative). */
export const DEVICE_READY_TICKS = 200;
/** The fixed useful job the CPU would like to be getting on with, in ticks of CPU time. */
export const JOB_TICKS = 1000;
/** In cycle-stealing mode the device takes one bus cycle in this many while the job also wants the bus. */
export const STEAL_PERIOD = 2;

/** Transfer sizes: 64 B doubling to 64 KiB, the slider's eleven steps. */
export const SIZES: readonly number[] = Array.from({ length: 11 }, (_, k) => 64 * 2 ** k);

export type Mode = 'pio' | 'irq-pio' | 'dma';
export type BusMode = 'burst' | 'steal';

export const MODES: readonly Mode[] = ['pio', 'irq-pio', 'dma'];
export const BUS_MODES: readonly BusMode[] = ['burst', 'steal'];

/** The scene opens on a 64 KiB block moved by programmed I/O, the DMA bus in burst mode. */
export const DEFAULT_SIZE_INDEX = SIZES.length - 1;
export const DEFAULT_MODE: Mode = 'pio';
export const DEFAULT_BUS: BusMode = 'burst';

export type SegmentKind = 'spin' | 'copy' | 'setup' | 'irq' | 'job' | 'stalled' | 'bus' | 'ready' | 'cpu-bus';
export type Lane = 'cpu' | 'bus' | 'device';

export interface Segment {
  lane: Lane;
  kind: SegmentKind;
  start: number;
  end: number;
  /** For a `job` segment: ticks of job progress made in it (less than its length at half speed). */
  jobTicks?: number;
}

export interface Instant {
  lane: Lane;
  kind: 'program' | 'irq';
  at: number;
}

export interface Plan {
  mode: Mode;
  bytes: number;
  words: number;
  segments: Segment[];
  instants: Instant[];
  /** When the last transfer-related thing (copy, bus window, completion handler) is over. */
  transferEnd: number;
  /** When the transfer is handled and the job is done. */
  finish: number;
  copyTicks: number;
  spinTicks: number;
  setupTicks: number;
  irqTicks: number;
  /** Everything the CPU did for the transfer. */
  cpuTransferTicks: number;
  jobTicksDuringTransfer: number;
  /** Job ticks lost to the device holding the bus. */
  contentionTicks: number;
  /** Ticks the device holds the bus (DMA only). */
  busHeldTicks: number;
  bytesDelivered: number;
}

/** Words in a block of `bytes`. */
export const wordsOf = (bytes: number) => bytes / WORD_BYTES;

const seg = (lane: Lane, kind: SegmentKind, start: number, end: number, jobTicks?: number): Segment =>
  ({ lane, kind, start, end, ...(jobTicks === undefined ? {} : { jobTicks }) });

/** The timeline of moving `bytes` in `mode` (the bus mode only matters for DMA), with the job running whenever the CPU is free. */
export function plan(mode: Mode, bytes: number, bus: BusMode): Plan {
  const words = wordsOf(bytes);
  const segments: Segment[] = [seg('device', 'ready', 0, DEVICE_READY_TICKS)];
  const instants: Instant[] = [];
  let transferEnd: number;
  let finish: number;
  let contention = 0;
  let busHeld = 0;

  if (mode === 'pio') {
    const copyEnd = DEVICE_READY_TICKS + PIO_WORD_TICKS * words;
    segments.push(seg('cpu', 'spin', 0, DEVICE_READY_TICKS), seg('cpu', 'copy', DEVICE_READY_TICKS, copyEnd), seg('bus', 'cpu-bus', DEVICE_READY_TICKS, copyEnd));
    segments.push(seg('cpu', 'job', copyEnd, copyEnd + JOB_TICKS, JOB_TICKS));
    transferEnd = copyEnd;
    finish = copyEnd + JOB_TICKS;
  } else if (mode === 'irq-pio') {
    const jobBefore = Math.min(JOB_TICKS, DEVICE_READY_TICKS);
    const copyStart = DEVICE_READY_TICKS + IRQ_TICKS;
    const copyEnd = copyStart + PIO_WORD_TICKS * words;
    segments.push(seg('cpu', 'job', 0, jobBefore, jobBefore), seg('cpu', 'irq', DEVICE_READY_TICKS, copyStart), seg('cpu', 'copy', copyStart, copyEnd), seg('bus', 'cpu-bus', copyStart, copyEnd));
    instants.push({ lane: 'cpu', kind: 'irq', at: DEVICE_READY_TICKS });
    const remaining = JOB_TICKS - jobBefore;
    segments.push(seg('cpu', 'job', copyEnd, copyEnd + remaining, remaining));
    transferEnd = copyEnd;
    finish = copyEnd + remaining;
  } else {
    const busStart = Math.max(DMA_SETUP_TICKS, DEVICE_READY_TICKS);
    const jobBefore = Math.min(JOB_TICKS, busStart - DMA_SETUP_TICKS);
    let jobLeft = JOB_TICKS - jobBefore;
    busHeld = BUS_WORD_TICKS * words;
    segments.push(seg('cpu', 'setup', 0, DMA_SETUP_TICKS));
    instants.push({ lane: 'device', kind: 'program', at: 0 });
    if (jobBefore > 0) segments.push(seg('cpu', 'job', DMA_SETUP_TICKS, DMA_SETUP_TICKS + jobBefore, jobBefore));
    let windowEnd: number;
    let jobEnd = DMA_SETUP_TICKS + jobBefore;
    if (bus === 'burst') {
      windowEnd = busStart + busHeld;
      segments.push(seg('bus', 'bus', busStart, windowEnd));
      if (jobLeft > 0) {
        segments.push(seg('cpu', 'stalled', busStart, windowEnd));
        contention = busHeld;
      }
    } else {
      windowEnd = busStart + busHeld * STEAL_PERIOD;
      segments.push(seg('bus', 'bus', busStart, windowEnd));
      const progress = Math.min(jobLeft, busHeld);
      if (progress > 0) {
        segments.push(seg('cpu', 'job', busStart, busStart + progress * STEAL_PERIOD, progress));
        contention = progress;
        jobLeft -= progress;
        jobEnd = busStart + progress * STEAL_PERIOD;
      }
    }
    const irqEnd = windowEnd + IRQ_TICKS;
    segments.push(seg('cpu', 'irq', windowEnd, irqEnd));
    instants.push({ lane: 'cpu', kind: 'irq', at: windowEnd });
    if (jobLeft > 0) {
      segments.push(seg('cpu', 'job', irqEnd, irqEnd + jobLeft, jobLeft));
      jobEnd = irqEnd + jobLeft;
    }
    transferEnd = irqEnd;
    finish = Math.max(jobEnd, irqEnd);
  }

  const total = (kind: SegmentKind) => segments.filter((s) => s.lane === 'cpu' && s.kind === kind).reduce((sum, s) => sum + (s.end - s.start), 0);
  const copyTicks = total('copy');
  const spinTicks = total('spin');
  const setupTicks = total('setup');
  const irqTicks = total('irq');
  const jobDuring = segments.filter((s) => s.kind === 'job' && s.end <= transferEnd).reduce((sum, s) => sum + (s.jobTicks ?? 0), 0);
  return {
    mode, bytes, words, segments, instants, transferEnd, finish,
    copyTicks, spinTicks, setupTicks, irqTicks,
    cpuTransferTicks: copyTicks + spinTicks + setupTicks + irqTicks,
    jobTicksDuringTransfer: jobDuring,
    contentionTicks: contention,
    busHeldTicks: busHeld,
    bytesDelivered: bytes,
  };
}

/** The right edge of the chart at this size: the latest finish over every mode, so switching modes never rescales. */
export const chartEnd = (bytes: number): number =>
  Math.max(...MODES.flatMap((m) => BUS_MODES.map((b) => plan(m, bytes, b).finish)));
