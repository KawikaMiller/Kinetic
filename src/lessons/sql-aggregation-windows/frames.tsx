import type { ReactNode } from 'react';
import { decimal, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  FILTERS, FRAMES, SALES, WINDOW_ORDER, aggSql, runGroup, runRanking, runWindow, type Cell, type FrameId, type GroupQuery, type GroupRun, type RankRow, type WindowRow,
} from './model';

const code = (s: string) => <code>{s}</code>;
const n = (k: number) => plural(k, 'row');

/** An aggregate's value as the result table shows it: AVG to one decimal place, NULL spelled out. */
export function showValue(v: Cell): string {
  if (v === null) return 'NULL';
  return typeof v === 'number' && !Number.isInteger(v) ? decimal(v, 1) : String(v);
}

// ── GROUP BY ────────────────────────────────────────────────────────────

/** rows: the raw table. where: WHERE judged each row. group: rows sorted into buckets. collapse: one summary row per bucket. having: whole groups judged. */
export type GroupPhase = 'rows' | 'where' | 'group' | 'collapse' | 'having';

export interface GroupFrame extends Frame {
  phase: GroupPhase;
}

const nullAmounts = (rows: readonly number[]) => rows.filter((i) => SALES[i].amount === null).length;

export function groupFrames(q: GroupQuery, run: GroupRun = runGroup(q)): GroupFrame[] {
  const f = FILTERS.find((x) => x.id === q.filter)!;
  const total = SALES.length;
  const nulls = nullAmounts(SALES.map((_, i) => i));
  if (run.error) {
    return [{ phase: 'rows', say: <><span className="hl bad">Error</span>: {run.error.message}.{run.error.sqliteAccepts
      ? <> SQLite (and MySQL with ONLY_FULL_GROUP_BY off) run it anyway and take the value from some row of each group; Postgres and MySQL's default mode refuse.</>
      : ' SQLite refuses it too.'}</> }];
  }
  const frames: GroupFrame[] = [{
    phase: 'rows',
    say: <>{total} sales, {nulls} with no amount booked yet (NULL). Press play to run the query clause by clause, in the order the database does.</>,
  }];
  const kept = run.whereKept.filter(Boolean).length;
  if (q.place === 'where' && f.id !== 'none') {
    const droppedNull = SALES.filter((s, i) => !run.whereKept[i] && s.amount === null).length;
    frames.push({
      phase: 'where',
      say: <>{code(`WHERE ${f.sql}`)} runs first, on single rows: {kept} kept, {total - kept} dropped
        {droppedNull ? <>, including the {droppedNull} NULL amounts (NULL {'>='} 100 is UNKNOWN, not TRUE)</> : ''}. Groups don't exist yet.</>,
    });
  }
  const groups = run.groups;
  frames.push({
    phase: 'group',
    say: q.by === 'none'
      ? <>No {code('GROUP BY')}: all {n(kept)} form <b>one</b> group, so the aggregate makes exactly one row.</>
      : <>{code(`GROUP BY ${q.by}`)} sorts the {n(kept)} into {plural(groups.length, 'bucket')}, one per {q.by}.</>,
  });
  const skipped = groups.reduce((s, g) => s + nullAmounts(g.rows), 0);
  frames.push({
    phase: 'collapse',
    say: <>Each bucket collapses to one row holding {code(aggSql(q.agg))}.{' '}
      {skipped === 0 ? 'No NULL amounts are left in these groups.'
        : q.agg === 'count-star' ? <>{code('COUNT(*)')} counts rows, so the {skipped} NULL {skipped === 1 ? 'amount counts' : 'amounts count'} too.</>
        : <>It skips the {skipped} NULL {skipped === 1 ? 'amount' : 'amounts'}{q.agg === 'count-amount' ? <>, so it's {skipped} less than {code('COUNT(*)')}</> : ''}.</>}</>,
  });
  if (q.place === 'having' && f.id !== 'none') {
    const out = groups.filter((g) => !g.kept);
    frames.push({
      phase: 'having',
      say: <>{code(`HAVING ${f.sql}`)} runs after grouping, on whole groups:{' '}
        {out.length === 0 ? 'every group passes.' : <>{out.map((g) => g.key || 'the one group').join(', ')} {out.length === 1 ? 'fails and is' : 'fail and are'} struck out.</>}</>,
    });
  }
  frames.push({ phase: frames.at(-1)!.phase, hold: 2, say: <>Result: {n(run.result.length)}{q.by === 'none' ? '' : <>, one per {q.by} that survived</>}.</> });
  return frames;
}

// ── Windows ─────────────────────────────────────────────────────────────

export interface WindowFrame extends Frame {
  /** Position in the window rows being computed, -1 before the first. */
  at: number;
}

export function windowFrames(frame: FrameId, rows: readonly WindowRow[] = runWindow(frame)): WindowFrame[] {
  const label = FRAMES.find((f) => f.id === frame)!;
  const out: WindowFrame[] = [{
    at: -1,
    say: <>{code(`SUM(amount) OVER (${label.over})`)}. Every row stays in place; each gets its own total from the rows in its <span className="hl violet">frame</span>. Press play.</>,
  }];
  rows.forEach((w, k) => {
    const me = SALES[w.sale];
    const total = <b>{showValue(w.value)}</b>;
    const span = <>{plural(w.frame.length, 'row')} of {me.region}</>;
    let say: ReactNode;
    if (frame === 'partition') say = <>No ORDER BY, so the frame is <b>all</b> of {me.region} ({span}): {total}, the same on every {me.region} row.</>;
    else if (frame === 'default') {
      const later = w.frame.filter((j) => j !== w.sale && SALES[j].month === me.month && WINDOW_ORDER.indexOf(j) > WINDOW_ORDER.indexOf(w.sale)).length;
      say = later
        ? <>{me.rep} in {me.month}: the default frame is RANGE, so it runs to the <b>last</b> {me.month} row and includes {plural(later, 'later row')} with the same month: {total}.</>
        : <>{me.rep} in {me.month}: everything in {me.region} up to this month ({span}): {total}.</>;
    } else if (frame === 'rows-unbounded') say = <>{me.rep} in {me.month}: ROWS counts physical rows, from the first in {me.region} to this one ({span}): {total}.</>;
    else say = <>{me.rep} in {me.month}: this row and up to 2 before it ({span}): {total}.</>;
    if (me.amount === null) say = <>{say} Its own amount is NULL, which SUM skips.</>;
    out.push({ at: k, say });
  });
  out.push({ at: rows.length - 1, hold: 2, say: windowSummary(frame, rows) });
  return out;
}


function windowSummary(frame: FrameId, rows: readonly WindowRow[]): ReactNode {
  const kept = <>All {rows.length} rows are still here: a window function adds a column, it doesn't collapse rows the way GROUP BY does.</>;
  if (frame === 'default') {
    const shared = rows.filter((w, k) => k > 0 && SALES[rows[k - 1].sale].region === SALES[w.sale].region && SALES[rows[k - 1].sale].month === SALES[w.sale].month).length;
    return <>{kept} Note the {plural(shared, 'tied month')} where two rows share one total: that's the RANGE default. Switch to ROWS UNBOUNDED PRECEDING to split them.</>;
  }
  return kept;
}

// ── Ranking ─────────────────────────────────────────────────────────────

/** The ranking caption, naming a real tie from the data. */
export function rankCaption(rows: readonly RankRow[] = runRanking()): ReactNode {
  const tie = rows.find((r) => r.tied);
  if (!tie) return <>No ties here, so all three numberings agree.</>;
  const s = SALES[tie.sale];
  const part = rows.filter((r) => SALES[r.sale].region === s.region);
  const after = part.find((r) => SALES[r.sale].amount! < s.amount!);
  return <>In {s.region}, two sales tie at {s.amount}. <b>ROW_NUMBER</b> still gives them different numbers (the id breaks the tie); <b>RANK</b> gives both{' '}
    <span className="hl info">{tie.rank}</span>{after ? <> and skips to {after.rank}</> : ''}; <b>DENSE_RANK</b> gives both{' '}
    <span className="hl info">{tie.denseRank}</span>{after ? <> and carries on with {after.denseRank}</> : ''}.</>;
}
