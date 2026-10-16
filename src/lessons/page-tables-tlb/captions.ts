/** Captions and stat text, every number taken from the model on screen. Plain strings, so tests can read them. */
import { bytes, pct } from '../../core/format';
import { FLAT_TABLE_BYTES, PAGE_NAMES, hex, type WalkResult, type WalkStep } from './paging';
import {
  IPI_CYCLES, REFERENCE_CYCLES, hitRate, reachBytes, translationCost, type ShootdownConfig, type SwitchRun, type TlbConfig, type TlbRun, type TlbStep,
} from './tlb';

export const n = (v: number) => v.toLocaleString('en-US');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
const iec = (b: number) => bytes(b, { iec: true });

export const FLAT_TEXT = iec(Number(FLAT_TABLE_BYTES));

export const WALK_INTRO = 'A 48-bit virtual address is cut into four 9-bit indexes and a 12-bit offset. Each index picks an entry in one table; each entry points to the next table, until one points at the frame.';

export function stepCaption(step: WalkStep, k: number): string {
  const read = `Reference ${k + 1}: the ${step.name} table at ${hex(step.table)}, entry ${n(step.index)} (at ${hex(step.entryAddress)})`;
  if (step.state === 'absent') return `${read} is not present: the walk stops here with a page fault at the ${step.name} level.`;
  if (step.state === 'page') return `${read} points straight at a frame at ${hex(step.target!)}: this level ends the walk, so the rest of the address is the offset.`;
  return `${read} is present and points at the next table at ${hex(step.target!)}.`;
}

export function walkSummary(r: WalkResult, tables: number): string {
  const cost = `${plural(r.memoryRefs, 'memory reference')}`;
  if (r.ok) return `Translated in ${cost}: physical address ${hex(r.physical)}, a ${PAGE_NAMES[r.size]} page, so ${n(r.offsetBits)} offset bits pass through untranslated. This space holds ${plural(tables, 'table')} of 4 KiB; a flat table for the whole space would be ${FLAT_TEXT}.`;
  if (r.reason === 'not-canonical') return 'Not canonical: bits 63-48 must copy bit 47, so the walker refuses this address before reading any table (0 memory references).';
  return `Page fault after ${cost}: the ${r.steps[r.steps.length - 1].name} entry is not present, so the OS would have to map the page or report an error.`;
}

export const allocatedText = (tables: number) => `${n(tables)} tables = ${iec(tables * 4096)}`;

export function accessCaption(step: TlbStep, cfg: TlbConfig, run: TlbRun): string {
  const page = `page ${hex(BigInt(step.vpn))}`;
  if (step.hit) return `Access ${n(step.index + 1)}: ${page} is in entry ${n(step.slot)}: a TLB hit, no walk.`;
  const refs = cfg.size === 'p4k' ? 4 : 3;
  const out = step.evicted === null ? 'it fills an empty entry' : `it replaces the least recently used entry, page ${hex(BigInt(step.evicted))}`;
  return `Access ${n(step.index + 1)}: ${page} is not in the TLB: a miss, a walk of ${plural(refs, 'reference')} (${n(refs * REFERENCE_CYCLES)} cycles), and ${out}. ${n(run.steps.slice(0, step.index + 1).filter((s) => s.hit).length)} hits so far.`;
}

export function tlbSummary(cfg: TlbConfig, run: TlbRun): string {
  const rate = pct(hitRate(run), 1);
  const reach = iec(reachBytes(cfg));
  const base = `${plural(cfg.entries, 'entry', 'entries')} of ${PAGE_NAMES[cfg.size]} pages reach ${reach}; the run hit ${rate} of the time (${n(run.hits)} of ${n(run.hits + run.misses)}), at an average ${translationCost(run, cfg.size).toFixed(1)} cycles per translation.`;
  const distinct = new Set(run.steps.map((s) => s.vpn)).size;
  if (run.hits === 0 && cfg.pattern === 'sequential' && distinct > cfg.entries) {
    return `${base} The scan touches ${n(distinct)} pages for ${n(cfg.entries)} entries, so under LRU each page is evicted just before it is needed again: every access misses.`;
  }
  if (distinct <= cfg.entries) return `${base} The ${n(distinct)} pages touched all fit, so only the first touch of each misses.`;
  return base;
}

export function switchCaption(flush: SwitchRun, asid: SwitchRun): string {
  const total = flush.hits + flush.misses;
  return `Two processes alternate over ${n(total)} accesses. Flushing on every switch: ${n(flush.misses)} misses (${pct(flush.misses / total, 1)}). With address-space tags: ${n(asid.misses)} misses (${pct(asid.misses / total, 1)}): the entries survive the switch.`;
}

export function shootdownCaption(cfg: ShootdownConfig, r: { rounds: number; ipis: number; cost: number }): string {
  const rounds = cfg.batched ? `one round for all ${n(cfg.unmaps)} unmaps` : `${plural(r.rounds, 'round')}, one per unmap`;
  return `${plural(cfg.cores, 'core')} run the process, so a round interrupts ${plural(cfg.cores - 1, 'other core')}: ${rounds}, ${plural(r.ipis, 'IPI')} in all (illustrative ${n(IPI_CYCLES)} cycles each), ${n(r.cost)} cycles.`;
}
