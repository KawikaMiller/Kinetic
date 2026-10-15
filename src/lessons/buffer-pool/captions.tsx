import type { ReactNode } from 'react';
import { pctText } from '../../core/format';
import { POLICIES, SCAN_SEEDS, hitRatio, writeBacks, type Pool, type ScanAverage, type ScanResult } from './pool';

const hl = (cls: string, text: ReactNode): ReactNode => <span className={`hl ${cls}`}>{text}</span>;

/** What the pool has done so far, and how the last request went. */
export function poolCaption(pool: Pool): ReactNode {
  const c = pool.count;
  const ratio = hitRatio(c);
  const name = POLICIES.find((p) => p.value === pool.policy)!.label;
  const last = pool.last;
  return (
    <>
      {name}: {c.requests} {c.requests === 1 ? 'request' : 'requests'}, {c.hits} {c.hits === 1 ? 'hit' : 'hits'}, {c.misses} {c.misses === 1 ? 'miss' : 'misses'}
      {ratio === null ? '' : <> ({pctText(ratio, 1)} hit ratio)</>}, {c.diskReads} disk {c.diskReads === 1 ? 'read' : 'reads'}, {writeBacks(c)} {writeBacks(c) === 1 ? 'write-back' : 'write-backs'}.
      {last === null ? <> Click a disk page, or press Run.</> : last.result === 'failed' ? <> Last: page {last.page} is not in the pool and {hl('bad', 'every frame is pinned')}: the request waits or fails.</> : (
        <> Last: page {last.page} was a {last.result === 'hit' ? hl('ok', 'hit') : hl('bad', 'miss')}
          {last.evicted ? <>, evicting page {last.evicted.page}{last.evicted.dirty ? <> ({hl('orange', 'dirty: written back first')})</> : ''}</> : ''}.</>
      )}
    </>
  );
}

/** A change of hit ratio in percentage points, signed, to one decimal: "-7.7 points". */
export const points = (change: number): string => `${change < 0 ? '-' : '+'}${Math.abs(change * 100).toFixed(1)} points`;

export interface ScanRow { label: string; sample: ScanResult; average: ScanAverage }

/** Scene 2's sentence: a paired control (the same requests with and without the scan), one seed as a sample and the average over many. */
export function scanCaption(rows: readonly ScanRow[], measured: number, seed: number): ReactNode {
  const tone = (change: number, text: string) => (change < 0 ? hl('bad', text) : text);
  return (
    <>
      The same next {measured} requests, served with and without a full scan of the disk before them. Seed {seed} is one sample: {rows.map((r, i) => (
        <span key={r.label}>{i > 0 ? '; ' : ''}{r.label} {pctText(r.sample.without, 0)} to {tone(r.sample.change, pctText(r.sample.withScan, 0))}</span>
      ))}. Averaged over {SCAN_SEEDS} seeds the scan changes the hit ratio by {rows.map((r, i) => (
        <span key={r.label}>{i > 0 ? ', ' : ''}{r.label} {tone(r.average.change, points(r.average.change))}</span>
      ))}: the effect is on average, and it hurt {rows.map((r, i) => <span key={r.label}>{i > 0 ? ', ' : ''}{r.label} on {r.average.hurt} of {SCAN_SEEDS}</span>)} seeds.
    </>
  );
}
