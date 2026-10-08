import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { BLOCKS, PAGES, WA_WARN, writeAmplification, type RunResult, type Workload } from './ftl';

export interface BatchSummary {
  writes: number;
  deletes: number;
  gcRuns: number;
  moved: number;
  erased: number[];
  freeBlocks: number;
  wa: number;
}

/** What the last batch of host operations did inside the drive, counted from its events. */
export function batchSummary(r: RunResult): BatchSummary {
  const ev = r.recent;
  return {
    writes: ev.filter((e) => e.kind === 'write').length,
    deletes: ev.filter((e) => e.kind === 'trim' || e.kind === 'delete-unseen').length,
    gcRuns: ev.filter((e) => e.kind === 'gc').length,
    moved: ev.reduce((s, e) => s + (e.kind === 'gc' ? e.moved.length : 0), 0),
    erased: ev.flatMap((e) => (e.kind === 'erase' ? [e.block] : [])),
    freeBlocks: r.ftl.free.length,
    wa: writeAmplification(r.ftl),
  };
}

export const waText = (wa: number) => wa.toFixed(2);

/** Red above the threshold, judged on the value as shown (2.0029 reads 2.00, which is not above 2). */
export const waTooHigh = (wa: number) => Number(waText(wa)) > WA_WARN;

/** "block 5", "blocks 5 and 6": each block once, in order. */
const blockList = (blocks: readonly number[]) => {
  const u = [...new Set(blocks)].sort((a, b) => a - b);
  return `${u.length === 1 ? 'block' : 'blocks'} ${listText(u)}`;
};

/** "5", "5 and 6", "3, 5 and 6". */
export const listText = (xs: readonly number[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function ssdIntro(workload: Workload, trim: boolean, spare: number): ReactNode {
  return (
    <>
      An empty toy SSD: {BLOCKS} erase blocks (rows) of {PAGES} pages, {spare} blocks of them spare (over-provisioning). The workload is{' '}
      {workload === 'sequential' ? <>sequential writes</> : <>random overwrites with some deletes</>}, TRIM is {trim ? 'on' : 'off'}. Press a Write button.
    </>
  );
}

/** The caption after a batch: every count comes from the batch's events. */
export function ssdCaption(s: BatchSummary, workload: Workload, trim: boolean): ReactNode {
  const ops = s.writes + s.deletes;
  const head = (
    <>
      {plural(ops, 'host operation')}
      {s.deletes > 0 && <> ({plural(s.writes, 'write')}, {plural(s.deletes, 'delete')})</>}.{' '}
    </>
  );
  const gc =
    s.gcRuns === 0 ? (
      <>No garbage collection: {s.freeBlocks === 1 ? 'only the reserve block is' : `${s.freeBlocks} blocks are still`} free.</>
    ) : (
      <>
        Garbage collection ran {s.gcRuns === 1 ? 'once' : `${s.gcRuns} times`}: it copied {plural(s.moved, 'still-valid page')} <span className="hl violet">(violet)</span>, then{' '}
        {s.erased.length === 1 ? <>erased block {s.erased[0]}</> : <>made {s.erased.length} erases ({blockList(s.erased)})</>}{' '}
        <span className="hl orange">(orange)</span>.
      </>
    );
  const del =
    s.deletes === 0 ? null : trim ? (
      <> TRIM told the drive about {s.deletes === 1 ? 'the delete, so that page' : 'each delete, so those pages'} went stale at once and GC skips {s.deletes === 1 ? 'it' : 'them'}.</>
    ) : (
      <> Without TRIM the drive never heard about {s.deletes === 1 ? 'the delete: it still treats that page as valid, so GC will copy it' : 'the deletes: it still treats those pages as valid, so GC will copy them'} whenever it moves their block.</>
    );
  const wa = (
    <>
      {' '}
      Write amplification so far: <span className={`hl ${waTooHigh(s.wa) ? 'bad' : 'ok'}`}>{waText(s.wa)}</span>
      {workload === 'sequential' && s.wa === 1 ? <> (sequential writes empty whole blocks, so GC never has anything to copy).</> : <>.</>}
    </>
  );
  return (
    <>
      {head}
      {gc}
      {del}
      {wa}
    </>
  );
}
