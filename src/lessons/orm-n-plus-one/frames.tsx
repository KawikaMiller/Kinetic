import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { runStrategy, stopsFor, timeline, type Query, type Run, type Scene, type Strategy, type Timeline } from './model';

export interface OrmFrame extends Frame {
  /** How many queries have been sent by this frame (0 = none yet). */
  shown: number;
  /** The snippet line behind the latest query. */
  line: number | null;
}

/** A time in ms for captions and stats: two decimals under 10, one under 100, whole above. */
export function fmtMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(2)} ms` : ms < 100 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
}
export const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`);

const code = (s: string) => <code>{s}</code>;

const IN_LIST = /IN \(([^)]*)\)/;
const SHOWN_IDS = 4;

/** The statement as logged, with a long IN (…) list shortened (the real statement keeps every id). */
export function shortSql(sql: string): string {
  const m = IN_LIST.exec(sql);
  if (!m) return sql;
  const ids = m[1].split(', ');
  return ids.length <= SHOWN_IDS + 2 ? sql : sql.replace(IN_LIST, `IN (${ids.slice(0, SHOWN_IDS).join(', ')}, … ${ids.length} ids)`);
}

const FROM = /FROM \(?(?:SELECT \* FROM )?(\w+)/;
const whatIsAsked = (q: Query): string => {
  if (q.kind === 'join') return 'joins the tables';
  const table = FROM.exec(q.sql)?.[1];
  return ({ posts: 'the posts', authors: 'an author', commenters: 'a commenter', comments: "a post's comments" } as Record<string, string>)[table ?? ''] ?? 'rows';
};

/** What happened between the previous stop and this one, from the queries themselves. */
function stopCaption(strategy: Strategy, run: Run, tl: Timeline, from: number, to: number, latencyMs: number): ReactNode {
  const qs = run.queries.slice(from, to);
  const last = tl.items[to - 1];
  const sofar = <> {plural(to, 'query', 'queries')} so far, {fmtMs(last.end)}, of which {fmtMs(to * latencyMs)} was only waiting on the round trips.</>;
  const first = qs[0];
  if (qs.every((q) => q.kind === 'each')) {
    const what = [...new Set(qs.map(whatIsAsked))].join(' and ');
    return <>
      {to - from === 1 ? 'Query' : 'Queries'} {from + 1}{to - from > 1 ? `-${to}` : ''}: the code touched something it hadn't loaded, so the ORM asks the database for {what},{' '}
      <span className="hl orange">one query for each item</span>. Each waits {fmtMs(latencyMs)} for its answer before the next can start.{sofar}
    </>;
  }
  if (from === 0 && first.kind === 'first') {
    return <>Query 1 loads the page's {plural(first.rows.length, 'post')}: {plural(first.rows.length, 'row')}, {fmtBytes(first.bytes)}.
      {strategy === 'lazy' ? ' Nothing else is loaded yet: p.author and p.comments are fetched the first time the code touches them.' : ''}{sofar}</>;
  }
  const q = first;
  if (q.kind === 'join')
    return <>One query joins everything: <span className="hl ok">{plural(q.rows.length, 'row')}</span>, {fmtBytes(q.bytes)}, in a single round trip of {fmtMs(latencyMs)}.{sofar}</>;
  const ids = IN_LIST.exec(q.sql)![1].split(', ').length;
  return <>Query {to}: <span className="hl ok">one query</span> asks for {plural(ids, 'id')} at once with {code('IN (…)')}, and gets back {plural(q.rows.length, 'row')} ({fmtBytes(q.bytes)}).
    {strategy === 'loader' ? ' Every load() call made while the loop ran was collected, de-duplicated, and sent when the loop yielded.' : ''}{sofar}</>;
}

/** Frames for a run: an intro, then a stop per few queries, ending on the summary. */
export function ormFrames(scene: Scene, strategy: Strategy, run: Run, latencyMs: number): OrmFrame[] {
  const tl = timeline(run.queries, latencyMs);
  const stops = stopsFor(run.queries.length);
  const frames: OrmFrame[] = [{
    shown: 0, line: null,
    say: <>{scene === 'authors' ? 'A blog page: posts with their authors.' : 'A blog page: posts, their comments, and who wrote each comment.'} Press play to watch the queries the ORM sends
      for this code, one round trip at a time.</>,
  }];
  let prev = 0;
  for (const stop of stops) {
    frames.push({ shown: stop, line: run.queries[stop - 1].line, say: stopCaption(strategy, run, tl, prev, stop, latencyMs) });
    prev = stop;
  }
  const waitingPct = Math.round((tl.waiting / tl.total) * 100);
  frames.push({
    shown: run.queries.length, line: run.queries.at(-1)!.line, hold: 2,
    say: <>Done: <b>{plural(run.queries.length, 'query', 'queries')}</b>, <b>{fmtMs(tl.total)}</b>, {fmtBytes(tl.bytes)} over the wire. {waitingPct}% of the time was the
      application waiting on round trips, not the database working.</>,
  });
  return frames;
}

/** One summary caption per strategy for the comparison, from the same numbers. */
export function summaryRow(scene: Scene, strategy: Strategy, n: number, latencyMs: number) {
  const run = runStrategy(scene, strategy, n);
  const tl = timeline(run.queries, latencyMs);
  return { count: run.queries.length, total: tl.total, bytes: tl.bytes, rows: run.queries.reduce((s, q) => s + q.rows.length, 0) };
}
