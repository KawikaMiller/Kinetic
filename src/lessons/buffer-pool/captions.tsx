import type { ReactNode } from 'react';
import { pctText } from '../../core/format';
import { POLICIES, hitRatio, writeBacks, type Pool } from './pool';

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

/** Scene 2's sentence about the measured before and after of one policy. */
export function scanCaption(rows: readonly { label: string; before: number; after: number }[], measured: number): ReactNode {
  return (
    <>
      Hit ratio of the next {measured} requests, before and after one full scan of the disk, measured by running it: {rows.map((r, i) => (
        <span key={r.label}>{i > 0 ? '; ' : ''}{r.label} {pctText(r.before, 0)} to {r.after < r.before ? hl('bad', pctText(r.after, 0)) : hl('ok', pctText(r.after, 0))}</span>
      ))}.
    </>
  );
}
