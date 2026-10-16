/** warehouse-lake-lakehouse: every caption, built from the model on screen. No number here is typed. */
import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { KINDS, type Kind } from './capabilities';
import type { ContentionResult } from './contention';
import { equalToTruth, type Mode, type Rule, type Run } from './pipeline';
import { questionOf, type QuestionId } from './star';
import type { Lake, Race, ReaderVsWriter } from './tableformat';
import { directoryRows, orphanFiles, readTable, readAfterCrash } from './tableformat';
import { SEEK_VALUES, samePlacement, type MixCost, type Placement, type Store } from './workload';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const num = (n: number) => n.toLocaleString('en-US');
export const STORE_NAMES: Record<Store, string> = { row: 'row store', column: 'column store' };

export function workloadCaption(p: Placement, mix: MixCost, best: Placement, bestCost: number, queue: ContentionResult): ReactNode {
  const isBest = samePlacement(p, best);
  const where = p.points === p.scans ? `Everything on the ${STORE_NAMES[p.points]}` : `Point operations on the ${STORE_NAMES[p.points]}, scans on the ${STORE_NAMES[p.scans]}`;
  return (
    <>
      {where}: the mix costs {hl(isBest ? 'ok' : 'bad', num(mix.cost))} value-equivalents ({num(mix.values)} values read plus {num(mix.places)} places visited at {SEEK_VALUES} each)
      {isBest ? ', the lowest of the four placements.' : <>, against {hl('ok', num(bestCost))} for the best placement.</>}{' '}
      {queue.shared
        ? <>Sharing one store, a point operation waited up to {hl('bad', plural(queue.maxPointWait, 'tick'))} behind a scan (seed {queue.seed}).</>
        : <>With separate stores no point operation waited behind a scan (seed {queue.seed}).</>}
    </>
  );
}

export function pipelineCaption(mode: Mode, rule: Rule, r: Run): ReactNode {
  if (rule === 'v1') {
    return mode === 'etl' ? (
      <>ETL: the rows are cleaned on the way in and only the result is loaded, so the raw extract is {hl('bad', 'not kept')} ({r.rawKept} raw rows). {hl('', plural(r.extracts, 'read'))} of the source so far.</>
    ) : (
      <>ELT: the raw extract is loaded first and kept ({hl('ok', `${r.rawKept} raw rows`)}), and the cleaning runs inside the store. {hl('', plural(r.extracts, 'read'))} of the source so far.</>
    );
  }
  const right = equalToTruth(r);
  return mode === 'elt' ? (
    <>The rule changed. ELT replays the kept raw rows, so the new totals {hl('ok', 'equal what the new rule says about the data as it arrived')} and the source is read {r.extracts} time.</>
  ) : (
    <>
      The rule changed and the raw rows are gone, so ETL reads the source {hl('', 'again')} ({plural(r.extracts, 'read')}); the source has since overwritten and purged rows, so{' '}
      {right ? hl('ok', 'it happens to agree') : hl('bad wrap', `${plural(r.wrong.length, 'country total')} differ from the truth: ${r.wrong.join(', ')}`)}.
    </>
  );
}

export function starCaption(q: QuestionId, snowflake: boolean, joins: string[], rows: number, equal: boolean): ReactNode {
  const question = questionOf(q);
  return (
    <>
      {question.label}: the fact table joins {hl('info', joins.join(', '))} ({plural(joins.length, 'join')}{snowflake && joins.includes('region') ? ', one more because the snowflake keeps region in a table of its own' : ''}) and gives {plural(rows, 'row')}.
      The same answer from a flat pre-joined table: {equal ? hl('ok', 'equal') : hl('bad', 'different')}.
    </>
  );
}

export function lakeCaption(lake: Lake, layer: boolean, viewing: number | null, rvw: ReaderVsWriter, rc: Race): ReactNode {
  const orphans = orphanFiles(lake).length;
  const seen = layer ? readTable(lake).length : directoryRows(lake).length;
  const crash = orphans > 0 ? readAfterCrash(lake, layer) : null;
  return (
    <>
      {layer ? `Through the pointer, a reader sees snapshot ${lake.current}` : 'With no table format, a reader lists the directory'}: {hl(crash && crash.kind !== 'committed' ? 'bad' : 'ok', plural(seen, 'row'))}
      {orphans > 0 && <>; {plural(orphans, 'orphan file')} from a crashed writer {layer ? (orphans === 1 ? 'sits unseen' : 'sit unseen') : hl('bad', orphans === 1 ? 'is read as part of the table' : 'are read as part of the table')}</>}.
      {viewing !== null && viewing !== lake.current && <> Time travel shows snapshot {hl('info', viewing)}.</>}{' '}
      Of {rvw.total} interleavings of one writer and one reader, {rvw.torn === 0 ? hl('ok', 'none tears') : hl('bad', `${rvw.torn} tear`)}; of {rc.total} for two writers, {rc.lostUpdates === 0 ? hl('ok', 'none loses an update') : hl('bad', `${rc.lostUpdates} lose one`)}.
    </>
  );
}

export function nameCaption(leaders: Kind[], scoresOf: Record<Kind, number>, chosen: number): ReactNode {
  if (chosen === 0) return <>Pick at least one property to compare the three architectures.</>;
  return (
    <>
      Counting {plural(chosen, 'property', 'properties')}: {KINDS.map((k) => `${k} ${scoresOf[k]}`).join(', ')}.{' '}
      {leaders.length === 1 ? <>{hl('ok', leaders[0])} comes out ahead</> : <>{hl('', leaders.join(' and '))} tie</>} on this count: one common usage of the words, and the terms overlap in practice.
    </>
  );
}
