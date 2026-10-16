/** Captions, every number taken from the model on screen. Plain strings, so tests can read them. */
import { bytes as sizeText } from '../../core/format';
import type { CoherenceResult } from './coherence';
import { DEVICE_BASE, deviceStatus, hex32, type Machine, type Outcome, type Space } from './mmio';
import { packetsPerInterrupt, type RingConfig, type RingState } from './ring';
import { STEAL_PERIOD, type BusMode, type Plan } from './transfer';

export const n = (v: number) => v.toLocaleString('en-US');
export const sizeLabel = (b: number) => sizeText(b, { dp: 0 });

/** What the CPU's ticks on the transfer were made of, as the stat's sub-line (only the parts that exist). */
export function cpuBreakdown(p: Plan): string {
  const parts = [
    p.copyTicks > 0 && `${n(p.copyTicks)} copying`,
    p.spinTicks > 0 && `${n(p.spinTicks)} polling`,
    p.setupTicks > 0 && `${n(p.setupTicks)} setup`,
    p.irqTicks > 0 && `${n(p.irqTicks)} interrupt`,
  ].filter(Boolean);
  return parts.join(' + ');
}

export function transferCaption(p: Plan, bus: BusMode): string {
  const size = `${sizeLabel(p.bytes)} (${n(p.words)} words)`;
  const finish = `The job finishes at tick ${n(p.finish)}.`;
  if (p.mode === 'pio') {
    return `Programmed I/O: the CPU moves ${size} itself, ${n(p.copyTicks)} ticks copying and ${n(p.spinTicks)} polling a device that is not ready yet, so the job gets ${n(p.jobTicksDuringTransfer)} ticks while the transfer runs. ${finish}`;
  }
  if (p.mode === 'irq-pio') {
    return `Interrupt-driven PIO: the job runs for ${n(p.jobTicksDuringTransfer)} ticks while the device gets ready, then one interrupt (${n(p.irqTicks)} ticks) and the CPU still copies all ${n(p.words)} words itself, ${n(p.copyTicks)} ticks. ${finish}`;
  }
  const sharing = bus === 'burst'
    ? `the device holds the bus for ${n(p.busHeldTicks)} ticks and the job stalls for ${n(p.contentionTicks)} of them`
    : `the device takes 1 bus cycle in ${STEAL_PERIOD} for ${n(p.busHeldTicks * STEAL_PERIOD)} ticks and the job loses ${n(p.contentionTicks)} cycles, one at a time`;
  return `DMA moves ${size}: the CPU spends ${n(p.setupTicks)} ticks programming the device and ${n(p.irqTicks)} on the completion interrupt, ${n(p.cpuTransferTicks)} in all; ${sharing}. ${finish}`;
}

const outcomeLine = (o: Outcome): string => {
  switch (o.kind) {
    case 'unmapped': return `Nothing answers: ${o.note}.`;
    case 'cache': return `${o.register} returned ${hex32(o.value)} from the cache: ${o.note}.`;
    case 'device': return `${o.register ?? 'The window'} ${o.register ? `returned ${hex32(o.value)}` : 'answered nothing'}: ${o.note}.`;
    case 'port': return `${o.register ?? 'That port'} ${o.register ? `answered ${hex32(o.value)}` : 'answered nothing'}: ${o.note}.`;
    default: return `${o.kind.toUpperCase()}: ${o.note}.`;
  }
};

export function mmioCaption(o: { space: Space; cached: boolean; machine: Machine; last: Outcome | null }): string {
  const { machine, last, space, cached } = o;
  const where = space === 'mem'
    ? `Memory-mapped: the device is the window at ${hex32(DEVICE_BASE)}, reached by ordinary loads and stores${cached ? ', and here mapped cached, which is the mistake' : ', mapped uncached'}.`
    : `Port-mapped: the device is three ports in a separate address space, reached by in and out.`;
  const device = `The device itself says READY = ${deviceStatus(machine)}${machine.lastStatus === null ? '' : `, the last STATUS read returned ${machine.lastStatus}`}.`;
  return `${where} ${last ? outcomeLine(last) : 'Read STATUS twice and compare the answers.'} ${device}`;
}

export function ringCaption(s: RingState, c: RingConfig): string {
  const per = packetsPerInterrupt(s);
  const base = `Tick ${n(s.tick)}: ${n(s.produced)} ${s.produced === 1 ? 'packet' : 'packets'} DMAed, ${n(s.consumed)} consumed, ${n(s.dropped)} dropped, ${n(s.irqs)} ${s.irqs === 1 ? 'interrupt' : 'interrupts'}${per === null ? '' : ` (${per.toFixed(1)} packets each)`}, worst wait ${n(s.worstLatency)} ticks.`;
  if (s.overwritten > 0) return `${base} Broken driver: packet ${s.lastOverwritten} was overwritten before it was consumed (seed ${c.seed}).`;
  const waiting = s.pending > 0 ? ` ${n(s.pending)} ${s.pending === 1 ? 'packet is' : 'packets are'} in the ring that no interrupt has announced.` : '';
  return `${base}${waiting}`;
}

export function coherenceCaption(r: CoherenceResult): string {
  const cache = r.stale ? `the CPU read a stale word (0x${r.cpuSaw.toString(16).toUpperCase()}, not what the device wrote)` : 'the CPU read the word the device wrote';
  const iommu = r.blocked ? 'the IOMMU blocked the wrong-address write' : 'the wrong-address write overwrote an unrelated buffer';
  return `Cache: ${cache}. IOMMU: ${iommu}.`;
}
