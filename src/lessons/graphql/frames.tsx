import type { ReactNode } from 'react';
import { bytes, ms, pct, plural } from '../../core/format';
import { timeFrames } from '../../core/frames';
import type { Frame } from '../../core/types';
import { DB_CALL_MS, POOL_SIZE, type Execution } from './exec';
import { RTT_MS, SCREEN_ORDERS, planGraphql, planRest, type GraphqlPlan, type RestPlan } from './rest';
import { LIMITS } from './schema';
import { EXEC_CAP, levelCount, levelSummary, roundsFor, type CostView, type LevelSummary } from './scenes';

const group = (n: number) => n.toLocaleString('en-US');
const kb = (n: number) => bytes(n, { base: 1000 });

// ── REST against GraphQL ────────────────────────────────────────────────

export interface CompareFrame extends Frame {
  /** Time shown, ms. */
  now: number;
}

const TIME_STEPS = 24;
const MILESTONE_HOLD = 2.5;

export function compareIntro(rest: RestPlan): ReactNode {
  return <>The screen needs a user's name and their last {SCREEN_ORDERS} orders with product names. REST takes {rest.requests.length} requests; GraphQL takes 1.
    Round trip {ms(RTT_MS)}, illustrative. Press play.</>;
}

interface Milestone {
  t: number;
  say: ReactNode;
}

export function compareMilestones(rest: RestPlan, gql: GraphqlPlan): Milestone[] {
  const wave1 = rest.requests.filter((r) => r.wave === 1);
  const failed = rest.requests.filter((r) => r.status === 503);
  const unused = rest.bytes - rest.usefulBytes;
  const err = gql.body.errors?.[0];
  const dbCalls = gql.execution.dbCalls.length;
  return [
    {
      t: wave1[0].end,
      say: <><b>REST</b>, {ms(wave1[0].end)}: the user and the orders list are in ({kb(wave1[0].bytes)} and {kb(wave1[1].bytes)}). Only now does the client know
        which products to ask for, so the next {rest.requests.length - 2} requests can leave.</>,
    },
    {
      t: gql.end,
      say: <><b>GraphQL</b>, {ms(gql.end)}: one response of {kb(gql.responseBytes)}, exactly the requested shape. The server ran its resolvers first ({plural(dbCalls, 'database call')}),
        and the answer is <span className="hl ok">HTTP {gql.status}</span>
        {err ? <>, with <span className="hl orange">{err.path.join('.')}</span> null and an <code>errors</code> entry: &quot;{err.message}&quot;.</> : '.'}</>,
    },
    {
      t: rest.totalMs,
      say: <><b>REST</b>, {ms(rest.totalMs)}: {rest.requests.length} responses, {kb(rest.bytes)} in all, of which the screen uses {kb(rest.usefulBytes)} ({pct(unused / rest.bytes)} is{' '}
        <span className="hl">unused</span>).
        {failed.length ? <> <span className="hl bad">{failed[0].path} returned 503</span>; the client still holds the other {rest.requests.length - failed.length} responses.</> : null}</>,
    },
  ];
}

export function compareSummary(rest: RestPlan, gql: GraphqlPlan): ReactNode {
  return <>Done. REST: {rest.requests.length} requests, {ms(rest.totalMs)}, {kb(rest.bytes)}. GraphQL: 1 request, {ms(gql.end)}, {kb(gql.responseBytes)} back and {kb(gql.requestBytes)} of
    query sent. GraphQL saved round trips, not work: the server still resolved every field. Illustrative timings and a simplified executor.</>;
}

export function compareFrames(failProductId: number | null): { frames: CompareFrame[]; end: number } {
  const rest = planRest(failProductId);
  const gql = planGraphql(failProductId);
  const end = Math.max(rest.totalMs, gql.end);
  const frames = timeFrames({
    end, steps: TIME_STEPS, milestones: compareMilestones(rest, gql), intro: compareIntro(rest), summary: compareSummary(rest, gql), hold: MILESTONE_HOLD,
  });
  return { frames, end };
}

// ── Level by level ──────────────────────────────────────────────────────

export interface LevelFrame extends Frame {
  /** The level being resolved; -1 before the first. */
  level: number;
}

const names = (rows: LevelSummary['resolvers']): string => rows.map((r) => `${r.count > 1 ? `${r.count} × ` : ''}${r.typeField}`).join(', ');

export function levelCaption(exec: Execution, level: number): ReactNode {
  const s = levelSummary(exec, level);
  const calls = s.calls;
  let db: ReactNode;
  if (!calls.length) db = <>No database calls: these are plain property reads.</>;
  else if (calls[0].batched) {
    db = <><span className="hl violet">One batched call</span> for {plural(calls[0].invocations.length, 'resolver')}: <code>{calls[0].sql}</code>. A DataLoader gathered the lookups made in the same tick and asked for each distinct id once.</>;
  } else if (calls.length === 1) {
    db = <>1 database call: <code>{calls[0].sql}</code>.</>;
  } else {
    db = <><span className="hl info">{calls.length} database calls</span>, one per resolver, on {POOL_SIZE} connections: {plural(roundsFor(calls.length), 'round')} of {ms(DB_CALL_MS)}. This is the N + 1 pattern.</>;
  }
  return <>Level {level}: {plural(s.total, 'resolver')} ran ({names(s.resolvers)}). {db} Level done at {ms(s.endsAt)}.</>;
}

export function levelIntro(exec: Execution, dataLoader: boolean): ReactNode {
  return <>The server resolves the query one level at a time, parents before children. {dataLoader ? 'A DataLoader batches product lookups.' : 'Each resolver does its own database lookup.'}{' '}
    This run has {plural(levelCount(exec), 'level')}. Press play.</>;
}

export function levelSummaryCaption(exec: Execution, dataLoader: boolean): ReactNode {
  const products = exec.dbCalls.filter((c) => c.kind === 'products');
  const errors = exec.errors.length;
  return <>Done in {ms(exec.totalMs)}: {plural(exec.invocations.length, 'resolver call')} and {plural(exec.dbCalls.length, 'database call')}
    {products.length ? <> ({plural(products.length, 'product call')}{dataLoader ? ', batched' : ', one per order'})</> : null}.
    {errors ? <> <span className="hl orange">{plural(errors, 'field')} failed</span>: the response is still HTTP 200, with those fields null (this schema&apos;s fields are nullable; an error in a non-null field would null its nearest nullable parent) and {errors === 1 ? 'an entry' : 'entries'} in <code>errors</code>.</> : null} Simplified executor; timings illustrative.</>;
}

export function levelFrames(exec: Execution, dataLoader: boolean): LevelFrame[] {
  const n = levelCount(exec);
  return [
    { level: -1, say: levelIntro(exec, dataLoader) },
    ...Array.from({ length: n }, (_, level) => ({ level, say: levelCaption(exec, level), hold: 1.5 })),
    { level: n - 1, say: levelSummaryCaption(exec, dataLoader), hold: 2 },
  ];
}

// ── The cost scene ──────────────────────────────────────────────────────

export function costCaption(view: CostView, levels: number, first: number): ReactNode {
  const asked = `${group(view.names)} ${view.names === 1 ? 'name' : 'names'}`;
  switch (view.status) {
    case 'rejected': {
      const v = view.outcome.verdict;
      return <><span className="hl bad">Rejected before any resolver ran</span>: {v.problems.join(' and ')}. The query would need {group(v.cost)} resolver calls to return {asked}: far more than a
        screen needs, and nobody had to run it to know. Resolvers run: 0.</>;
    }
    case 'skipped':
      return <>Limits off, and the query would take {group(view.cost)} resolver calls to return {asked}. This lesson won&apos;t run more than {group(EXEC_CAP)} in your browser; a real server without limits would try, for every client that asks.</>;
    case 'executed': {
      const e = view.outcome.execution;
      const v = view.outcome.verdict;
      return <><span className="hl ok">Accepted</span>: depth {v.depth} (limit {LIMITS.maxDepth}) and cost {group(v.cost)} (limit {group(LIMITS.maxCost)}). It ran {plural(e.invocations.length, 'resolver')} and {plural(e.dbCalls.length, 'database call')}{' '}
        and returned {asked}{levels === 0 ? '' : ` (${first} friends, ${levels} ${levels === 1 ? 'level' : 'levels'} deep)`}.</>;
    }
  }
}
