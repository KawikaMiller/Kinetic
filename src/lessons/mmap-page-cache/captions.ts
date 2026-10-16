/** Captions and frame builders, every number from the model on screen. Plain strings, so tests can read them. */
import type { Frame } from '../../core/types';
import { bytes } from '../../core/format';
import { PAGE_BYTES, hitRatio, wastedPrefetch, type CacheConfig, type Method, type Outcome, type Snapshot } from './cache';
import { lostWrites, untilWake, type Machine } from './durability';

export const size = (b: number) => (b === 0 ? '0 B' : bytes(b, { dp: 1 }));
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
export const percent = (r: number) => `${Math.round(r * 100)}%`;
export const procName = (proc: number) => (proc === 0 ? 'A' : 'B');
export const METHOD_NAME: Record<Method, string> = { read: 'read()', mmap: 'mmap' };

const OUTCOME_TEXT: Record<Outcome, string> = {
  hit: `the page is in the cache: a hit, and the kernel copies it (${PAGE_BYTES.toLocaleString('en-US')} bytes) into the process's buffer`,
  miss: 'the page is not in the cache: a disk read, then the kernel copies it into the buffer',
  mapped: 'the page is already mapped: an ordinary load, no fault and no copy',
  minor: 'a minor fault: the page is in the cache, so the kernel only maps it, with no disk read and no copy',
  major: 'a major fault: the page is not in the cache, so it is read from disk and then mapped, with no copy',
};

export interface CacheFrame extends Frame {
  index: number;
}

export function accessCaption(config: CacheConfig, step: Snapshot, index: number, total: number): string {
  if (step.access === null || step.outcome === null) return `${METHOD_NAME[config.method]} on a ${config.filePages}-page file with room for ${config.capacity} pages in the cache. Press play and watch ${total} accesses.`;
  const c = step.counters;
  return `Access ${index} of ${total}: process ${procName(step.access.proc)} touches page ${step.access.page} through ${METHOD_NAME[config.method]}: ${OUTCOME_TEXT[step.outcome]}. So far ${plural(c.hits, 'hit')} in ${plural(c.accesses, 'access', 'accesses')}, ${percent(hitRatio(c))}.`;
}

export function cacheFrames(config: CacheConfig, steps: readonly Snapshot[]): CacheFrame[] {
  return steps.map((s, index) => ({ index, say: accessCaption(config, s, index, steps.length - 1) }));
}

export function readaheadCaption(pattern: string, windowCap: number, last: Snapshot): string {
  const c = last.counters;
  const waste = wastedPrefetch(last);
  return `${pattern} reads with a readahead window of up to ${plural(windowCap, 'page')}: ${percent(hitRatio(c))} hits, ${plural(c.ios, 'disk request')} bringing in ${plural(c.diskPages, 'page')}, ${plural(waste, 'page')} read ahead and never used.`;
}

export function durabilityCaption(m: Machine, ackMode: 'before' | 'after'): string {
  const dirty = m.cache.filter((c) => c?.dirty).length;
  if (!m.poweredOn) {
    const lost = lostWrites(m);
    return lost.length > 0
      ? `Power is off. ${plural(lost.length, 'acknowledged write')} lost: the application said saved, and the disk never got it. Reset to try again.`
      : `Power is off. ${m.acked.length === 0 ? 'Nothing had been acknowledged.' : `All ${plural(m.acked.length, 'acknowledged write')} survived.`} Reset to try again.`;
  }
  const policy = ackMode === 'before' ? 'acknowledging each save when write returns' : 'acknowledging each save after fsync';
  const proc = m.processAlive ? '' : ' The writer process was killed; the kernel still owns the dirty pages.';
  return `Tick ${m.tick}, ${policy}: ${plural(dirty, 'dirty page')} in the cache, ${plural(m.acked.length, 'save')} acknowledged, next writeback wake in ${untilWake(m)} ${untilWake(m) === 1 ? 'tick' : 'ticks'}.${proc}`;
}

export const stepText = (s: { kind: string; page?: number; via?: string; ticks?: number }) =>
  s.kind === 'write' ? `${s.via === 'mmap' ? 'store' : 'write()'} to page ${s.page}`
    : s.kind === 'tick' ? `${s.ticks} ticks pass`
      : s.kind === 'ack' ? 'tell the user it is saved'
        : s.kind === 'fsync' ? 'fsync' : 'kill the process';
