import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  DB, GLYPH, condText, evaluate, intermediateRows, postOrder, resultOf, sameRows, schemaOf, type Evaluation, type Expr, type Mode, type NodeResult, type Rewrite,
} from './model';
import { runNullQuery, type NullQueryId, type NullRun, type Variant } from './nulls';

/** run: the operator works on its inputs. collapse: π or ∪ merges the duplicates it just made (set mode). */
export type Phase = 'run' | 'collapse';

export interface AlgebraFrame extends Frame {
  /** The operator being applied, or null for the intro and the summary. */
  node: string | null;
  phase: Phase;
  /** Nodes whose result is known by this frame (they show a row count). */
  done: readonly string[];
}

/** The operator in words, with its parameters: "σ teacher = 'Hopper'". */
export function nodeTitle(e: Expr): string {
  switch (e.op) {
    case 'rel':
      return e.name;
    case 'select':
      return `σ ${condText(e.cond)}`;
    case 'project':
      return `π ${e.cols.join(', ')}`;
    case 'rename':
      return `ρ ${e.to} ← ${e.from}`;
    default:
      return GLYPH[e.op];
  }
}

const rowsOf = (r: NodeResult | undefined) => (r && r.ok ? r.out.rows.length : 0);
const n = (k: number) => plural(k, 'row');
const code = (s: string) => <code>{s}</code>;

/** A value to name a row by in a caption: the first text column, else the first column. */
function rowName(e: Expr, ev: Evaluation, i: number): string {
  const r = ev.get(e.id);
  if (!r || !r.ok) return '';
  const t = r.out.types.indexOf('text');
  const v = r.out.rows[i][t >= 0 ? t : 0];
  return String(v);
}

function listNames(xs: string[]): string {
  if (xs.length <= 3) return xs.join(', ');
  return `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more`;
}

/** What one operator did, worked out from its own detail. */
export function opCaption(e: Expr, ev: Evaluation, phase: Phase, mode: Mode): ReactNode {
  const r = ev.get(e.id)!;
  if (!r.ok) return <><span className="hl bad">{nodeTitle(e)}</span> can't run: {r.error}.</>;
  const d = r.detail;
  const out = r.out.rows.length;
  switch (d.op) {
    case 'rel':
      return <>{e.op === 'rel' ? e.name : ''} has {n(out)}.</>;
    case 'select': {
      const dropped = d.kept.filter((k) => !k).length;
      return <><span className="hl">{nodeTitle(e)}</span> tests every row and keeps the {d.kept.length - dropped} where it's true;{' '}
        {dropped === 0 ? 'none fail.' : <>{plural(dropped, 'row')} {dropped === 1 ? 'fails' : 'fail'} and {dropped === 1 ? 'drops' : 'drop'} out.</>}</>;
    }
    case 'project': {
      const dups = d.dupOf.filter((x) => x >= 0).length;
      const cols = (e as Expr & { op: 'project' }).cols.join(', ');
      if (phase === 'collapse')
        return <>A relation is a <b>set</b>, so the {plural(dups, 'duplicate')} <span className="hl violet">collapse</span>: {n(out)} left.</>;
      if (mode === 'bag') {
        const same = new Set(d.projected.map((x) => JSON.stringify(x))).size;
        return <><span className="hl">{nodeTitle(e)}</span> keeps only {cols}: {n(out)}.{' '}
          {same < out ? <>Bag mode keeps the {plural(out - same, 'repeat')}, as SQL's {code('SELECT')} does without {code('DISTINCT')}.</> : 'No row repeats.'}</>;
      }
      return <><span className="hl">{nodeTitle(e)}</span> cuts every row down to {cols}.{' '}
        {dups ? <>{plural(dups, 'row')} now <span className="hl violet">repeat{dups === 1 ? 's' : ''}</span> an earlier one.</> : <>No row repeats, so all {d.projected.length} stay.</>}</>;
    }
    case 'rename': {
      const x = e as Expr & { op: 'rename' };
      return <><span className="hl">ρ</span> renames {code(x.from)} to {code(x.to)}. The rows don't change; only the column's name does, which is how you
        join or multiply a relation with one sharing a column name.</>;
    }
    case 'join': {
      const [l, rr] = children2(e);
      const lc = schemaCols(l);
      const common = lc.filter((c) => schemaCols(rr).includes(c));
      const lost = [...d.leftUnmatched.map((i) => rowName(l, ev, i)), ...d.rightUnmatched.map((i) => rowName(rr, ev, i))];
      return <><span className="hl">⋈</span> pairs rows that agree on {common.length ? common.map((c, i) => <span key={c}>{i ? ', ' : ''}{code(c)}</span>) : 'nothing (no shared column, so it acts like ×)'}:{' '}
        {n(out)}.{lost.length ? <> Rows with no partner drop out: {listNames(lost)}.</> : ' Every row found a partner.'}</>;
    }
    case 'product': {
      const [l, rr] = children2(e);
      return <><span className="hl">×</span> pairs <b>every</b> row with every row, matching or not: {rowsOf(ev.get(l.id))} × {rowsOf(ev.get(rr.id))} = {n(out)}.</>;
    }
    case 'union': {
      const dups = d.dupOf.filter((x) => x >= 0).length;
      if (phase === 'collapse') return <>As a set, the {plural(dups, 'row')} in both inputs <span className="hl violet">collapse</span> to one each: {n(out)}.</>;
      return <><span className="hl">∪</span> stacks both inputs: {d.fromLeft} + {d.stacked.length - d.fromLeft} = {n(d.stacked.length)}.
        {mode === 'bag' ? <> Bag mode keeps them all ({code('UNION ALL')}).</> : dups ? <> {plural(dups, 'row')} appear on both sides.</> : ' Nothing appears twice.'}</>;
    }
    case 'diff': {
      const gone = d.removed.filter(Boolean).length;
      if (mode === 'bag')
        return <><span className="hl">−</span> is {code('EXCEPT ALL')} here: each right row cancels <b>one</b> matching left row, so a left row survives when it has more copies than the right: {gone} cancelled, {n(out)} left.</>;
      return <><span className="hl">−</span> keeps the left rows that aren't on the right: {gone} cancelled, {n(out)} left.</>;
    }
  }
}

function children2(e: Expr): [Expr, Expr] {
  if (e.op === 'rel' || e.op === 'select' || e.op === 'project' || e.op === 'rename') throw new Error('not binary');
  return [e.left, e.right];
}
const schemaCols = (e: Expr) => {
  const s = schemaOf(e);
  return s.ok ? s.schema.cols : [];
};

/** Frames for running a whole tree, operator by operator, children first. */
export function runFrames(e: Expr, mode: Mode): AlgebraFrame[] {
  const ev = evaluate(e, mode);
  const ops = postOrder(e);
  const frames: AlgebraFrame[] = [];
  const done: string[] = ops.filter((x) => x.op === 'rel').map((x) => x.id);
  frames.push({ node: null, phase: 'run', done: [...done], say: buildIntro(e, mode) });
  for (const x of ops) {
    if (x.op === 'rel') continue;
    const r = ev.get(x.id)!;
    if (!r.ok && !r.own) continue;
    frames.push({ node: x.id, phase: 'run', done: [...done], say: opCaption(x, ev, 'run', mode), hold: r.ok ? 1 : 2 });
    if (!r.ok) break;
    const d = r.detail;
    const collapses = mode === 'set' && (d.op === 'project' || d.op === 'union') && d.dupOf.some((k) => k >= 0);
    if (collapses) frames.push({ node: x.id, phase: 'collapse', done: [...done], say: opCaption(x, ev, 'collapse', mode) });
    done.push(x.id);
    frames[frames.length - 1] = { ...frames[frames.length - 1], done: [...done] };
  }
  frames.push({ node: null, phase: 'run', done: [...done], say: summary(e, ev, mode), hold: 2 });
  return frames;
}

function buildIntro(e: Expr, mode: Mode): ReactNode {
  const ops = postOrder(e).filter((x) => x.op !== 'rel').length;
  if (ops === 0) return <>Just the {e.op === 'rel' ? e.name : ''} relation. Click it, then wrap it in an operator from the palette.</>;
  return <>An expression of {plural(ops, 'operator')}, run bottom-up: each one takes whole relations in and gives a relation out.{' '}
    {mode === 'set' ? 'Set semantics, as in the algebra.' : <>Bag semantics, as SQL runs a plain {code('SELECT')}.</>} Press play.</>;
}

/** The closing caption: the result's size, or which node failed. */
export function summary(e: Expr, ev: Evaluation, mode: Mode): ReactNode {
  const bad = postOrder(e).find((x) => {
    const r = ev.get(x.id)!;
    return !r.ok && r.own;
  });
  if (bad) return <>Stopped at <span className="hl bad">{nodeTitle(bad)}</span>. Fix that node (pick it in the tree) and the rest can run.</>;
  const r = ev.get(e.id)!;
  const out = rowsOf(r);
  const dup = mode === 'bag' && r.ok && new Set(r.out.rows.map((x) => JSON.stringify(x))).size < out;
  return <>Result: {n(out)}.{dup ? <> Some repeat: switch to <b>Set</b> to see what the algebra (or {code('SELECT DISTINCT')}) gives.</> : ''}{' '}
    The SQL beside the tree asks the same question.</>;
}

// ── Pushdown ────────────────────────────────────────────────────────────

export interface PushFrame extends Frame {
  /** How many operators of each plan have run (0 = none yet). */
  steps: number;
}

export function pushdownFrames(unpushed: Expr, pushed: Expr, mode: Mode, rewrite: Rewrite = 'sigma'): PushFrame[] {
  const ua = postOrder(unpushed).filter((x) => x.op !== 'rel');
  const pa = postOrder(pushed).filter((x) => x.op !== 'rel');
  const ue = evaluate(unpushed, mode);
  const pe = evaluate(pushed, mode);
  const steps = Math.max(ua.length, pa.length);
  const reorder = rewrite === 'sigma-reorder';
  const frames: PushFrame[] = [{
    steps: 0,
    say: <>Two plans for one question. Left: join everything, then filter. Right: filter {code('Courses')} first{reorder ? ', and join the small side first' : ', with the joins in the same order'}.
      Press play to run both side by side.</>,
  }];
  for (let k = 0; k < steps; k++) {
    const u = ua[k];
    const p = pa[k];
    frames.push({
      steps: k + 1,
      say: <>Left: <span className="hl">{nodeTitle(u)}</span> makes {n(rowsOf(ue.get(u.id)))}. Right: <span className="hl">{nodeTitle(p)}</span> makes{' '}
        {n(rowsOf(pe.get(p.id)))}.</>,
    });
  }
  const ru = resultOf(unpushed, mode);
  const rp = resultOf(pushed, mode);
  const same = ru.ok && rp.ok && sameRows(ru.out, rp.out);
  const iu = intermediateRows(unpushed, mode);
  const ip = intermediateRows(pushed, mode);
  frames.push({
    steps,
    hold: 2,
    say: <>{same ? <>Same result, {n(rowsOf(ru))}.</> : <span className="hl bad">The results differ.</span>} But the intermediate tables held{' '}
      <span className={`hl ${iu > ip ? 'bad' : iu < ip ? 'ok' : ''}`}>{n(iu)}</span> against <span className={`hl ${ip < iu ? 'ok' : ip > iu ? 'bad' : ''}`}>{n(ip)}</span>.{' '}
      {reorder ? 'Two rewrites did that: σ moved below the join, and the joins were regrouped so the small, filtered side goes first (inner joins can be regrouped). ' : 'Only σ moved. '}
      An optimiser makes rewrites like these for you, which is why the order you write SQL in isn't the order it runs.</>,
  });
  return frames;
}

// ── NULL scene ──────────────────────────────────────────────────────────

const count = (run: NullRun) => run.result.rows.length;
const unknowns = (run: NullRun) => run.tested?.verdict.filter((t) => t === 'UNKNOWN').length ?? 0;

/** The NULL scene's caption, from the run itself. */
export function nullCaption(id: NullQueryId, v: Variant, unknownStudent: boolean, run: NullRun = runNullQuery(id, v, unknownStudent)): ReactNode {
  const k = count(run);
  const u = unknowns(run);
  const padded = run.padded.filter(Boolean).length;
  switch (id) {
    case 'eq-null':
      return v === 'trap'
        ? <>{code('teacher = NULL')} is <span className="hl orange">UNKNOWN</span> for {u === run.tested!.rows.length ? 'every' : u} row, even the one whose teacher is
          NULL: NULL means "no value known", so nothing equals it, not even NULL. WHERE keeps only TRUE: {n(k)}.</>
        : <>{code('IS NULL')} asks the right question and is never UNKNOWN: {n(k)}.</>;
    case 'not-equal':
      return v === 'trap'
        ? <>{code("teacher <> 'Hopper'")} is <span className="hl orange">UNKNOWN</span> for the course with no teacher, so it vanishes too: {n(k)}, though most
          people would count it as "not Hopper".</>
        : <>Asking for the NULL explicitly brings it back: {n(k)}.</>;
    case 'not-in':
      if (v === 'fix')
        return <>{code('NOT EXISTS')} asks "is there a matching enrolment?", and an UNKNOWN comparison is just not a match: {n(k)}
          {unknownStudent ? ', NULL row or not' : ''}.</>;
      return unknownStudent
        ? <>With one NULL in the subquery, {code('sid NOT IN (…)')} can never be TRUE: for a student with no enrolment it's{' '}
          {code('sid <> 1 AND … AND sid <> NULL')}, and that last part is UNKNOWN. <span className="hl orange">{u} UNKNOWN</span>, {n(k)}.</>
        : <>{code('NOT IN')} works while the subquery has no NULL: {n(k)}. Now turn on the enrolment with an unknown student.</>;
    case 'on-where':
      return v === 'trap'
        ? <>{code('WHERE e.sid = 1')} runs after the LEFT JOIN: it drops every pair that isn't Ada's (FALSE), and the course padded with NULL too,
          because NULL = 1 is <span className="hl orange">UNKNOWN</span> ({u} {u === 1 ? 'row' : 'rows'}). Courses Ada isn't on vanish, so the outer join
          became an inner one: {n(k)}.</>
        : <>In {code('ON')}, the test only decides which enrolments match. Courses Ada isn't on still appear once, with{' '}
          <span className="hl violet">NULL</span>: {n(k)}, {padded} padded.</>;
    case 'full':
      return v === 'trap'
        ? <>LEFT JOIN keeps every course ({padded} with no enrolment, padded with <span className="hl violet">NULL</span>) but drops enrolments whose course is
          gone: {n(k)}.</>
        : <>FULL JOIN keeps unmatched rows from <b>both</b> sides: the orphaned enrolment appears with a NULL title. {n(k)}, {padded} padded. (Postgres and SQL Server have FULL JOIN, SQLite from 3.39; MySQL and MariaDB don't.)</>;
  }
}

/** The three-relation schema, for the "what's in the database" line. */
export const SCHEMA_LINE = (Object.keys(DB) as (keyof typeof DB)[]).map((k) => `${k}(${DB[k].cols.join(', ')})`).join(' · ');
