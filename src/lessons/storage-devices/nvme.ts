// Queue depth vs parallel flash: a closed-loop simulation of 4 KiB random reads. Pure logic.
//
// Each read pays a fixed protocol overhead, then a flash read on one of the drive's parallel
// channels, then a transfer over the host link (one at a time). The moment a read finishes
// the app issues another, so `qd` reads are always outstanding. All numbers are illustrative.

export type Interface = 'sata' | 'nvme';

/** Toy drive: 16 flash channels that can each read one page at a time. */
export const CHANNELS = 16;
export const FLASH_READ_US = 60;
export const PAGE_BYTES = 4096;
/** SATA III moves about 550 MB/s of data; PCIe 3.0 ×4 about 3.5 GB/s. */
export const LINK_BYTES_PER_S: Record<Interface, number> = { sata: 550e6, nvme: 3.5e9 };
/** Driver and protocol cost per command (AHCI's register handshake vs NVMe's doorbell), illustrative. */
export const OVERHEAD_US: Record<Interface, number> = { sata: 20, nvme: 5 };
/**
 * AHCI (SATA): one command queue of 32. NVMe: up to 65,535 I/O queues, each up to 65,536
 * entries; one entry always stays empty (a full ring looks like an empty one), so at most
 * 65,535 commands are outstanding per queue.
 */
export const AHCI_QUEUE_DEPTH = 32;
export const NVME_MAX_QUEUES = 65_535;
export const NVME_MAX_QUEUE_DEPTH = 65_536;
export const MAX_QD = 64;

export const linkUs = (iface: Interface) => (PAGE_BYTES / LINK_BYTES_PER_S[iface]) * 1e6;
/** Commands the drive itself holds at once: AHCI stops at 32, and the rest wait in the OS. */
export const deviceDepth = (qd: number, iface: Interface) => (iface === 'sata' ? Math.min(qd, AHCI_QUEUE_DEPTH) : qd);

export interface QueueBar {
  lane: string;
  start: number;
  end: number;
}

export interface QueueRun {
  qd: number;
  iface: Interface;
  /** Steady-state reads per second. */
  iops: number;
  /** Average time from issue to done, µs, including any wait in the OS queue (Little's law: qd ÷ IOPS). */
  latencyUs: number;
  /** Average time inside the drive, measured per command in the simulation. */
  deviceLatencyUs: number;
  /** Average number of flash channels busy. */
  busyChannels: number;
  bars: QueueBar[];
}

const WARMUP_US = 600;
const WINDOW_US = 6000;

/** Smallest-first array insert: the closed loop never holds more than MAX_QD tokens. */
function pushSorted(xs: number[], v: number) {
  let i = xs.length;
  while (i > 0 && xs[i - 1] > v) i--;
  xs.splice(i, 0, v);
}

export function queueRun(qd: number, iface: Interface, showUs = 600): QueueRun {
  if (!Number.isInteger(qd) || qd < 1) throw new Error('qd must be a positive integer');
  const depth = deviceDepth(qd, iface);
  const transfer = linkUs(iface);
  const overhead = OVERHEAD_US[iface];
  const chanFree = new Array<number>(CHANNELS).fill(0);
  let linkFree = 0;
  const issue: number[] = new Array<number>(depth).fill(0);
  const bars: QueueBar[] = [];
  let done = 0;
  let deviceTime = 0;
  let readTime = 0;
  while (issue[0] <= WINDOW_US) {
    const a = issue.shift()!;
    const ready = a + overhead;
    let k = 0;
    for (let c = 1; c < CHANNELS; c++) if (chanFree[c] < chanFree[k]) k = c;
    const start = Math.max(ready, chanFree[k]);
    const readEnd = start + FLASH_READ_US;
    chanFree[k] = readEnd;
    const linkStart = Math.max(readEnd, linkFree);
    const end = linkStart + transfer;
    linkFree = end;
    if (start < showUs) bars.push({ lane: `ch${k}`, start, end: readEnd }, { lane: 'link', start: linkStart, end });
    if (end > WARMUP_US && end <= WINDOW_US) {
      done++;
      deviceTime += end - a;
    }
    if (readEnd > WARMUP_US && start < WINDOW_US) readTime += Math.min(readEnd, WINDOW_US) - Math.max(start, WARMUP_US);
    pushSorted(issue, end);
  }
  const span = WINDOW_US - WARMUP_US;
  const iops = (done / span) * 1e6;
  return {
    qd,
    iface,
    iops,
    latencyUs: (qd / iops) * 1e6,
    deviceLatencyUs: deviceTime / done,
    busyChannels: readTime / span,
    bars,
  };
}

/** The ceilings the simulation runs into: all channels busy, or the link full. */
export const channelCeiling = () => (CHANNELS / FLASH_READ_US) * 1e6;
export const linkCeiling = (iface: Interface) => 1e6 / linkUs(iface);
