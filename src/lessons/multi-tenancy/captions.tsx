import type { ReactNode } from 'react';
import { integer, joinList, pct, plural, sig } from '../../core/format';
import { assignments, enumerateOverlap, exactIdentical, exactShare, type Estimate } from './combos';
import { ISOLATION_NAME, type Isolation, type QueryResult } from './data';
import { P99_LIMIT_MS, SHARD_CAPACITY, type Policy, type Run } from './shardSim';

export const tenantName = (i: number): string => `Tenant ${i + 1}`;
export const msText = (ms: number | null): string => (ms === null ? 'none served' : ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`);

export function policyNames(p: Policy): string[] {
  return [p.rateLimit && 'a per-tenant rate limit', p.bulkhead && 'a bulkhead', p.fair && 'fair queueing'].filter((x): x is string => x !== false);
}

/** What the run shows for the tenant at the centre of the scene, from the run's own numbers. */
export function noisyCaption(run: Run, actor: number): ReactNode {
  const a = run.tenants[actor];
  const neighbours = run.tenants.filter((t) => t.shard === a.shard && t.tenant !== actor);
  const hurt = run.tenants.filter((t) => t.hurt && t.tenant !== actor);
  const names = policyNames(run.config.policy);
  const shard = run.shards[a.shard];
  return (
    <>
      {tenantName(actor)} asks its shard for {sig(a.demandWork)} ms of work a second; the shard has {integer(SHARD_CAPACITY)}, and {sig((shard.demandWork / SHARD_CAPACITY) * 100)}% of it is wanted.{' '}
      {neighbours.length === 0 ? <>Nobody else shares shard {a.shard + 1}.</> : <>It shares shard {a.shard + 1} with {joinList(neighbours.map((t) => tenantName(t.tenant)))}.</>}{' '}
      {names.length ? <>Protection on: {joinList(names)}. </> : <>No protection is on. </>}
      {hurt.length === 0 ? (
        <span className="hl ok wrap">no neighbour is hurt</span>
      ) : (
        <span className="hl bad wrap">
          {plural(hurt.length, 'neighbour')} hurt: {joinList(hurt.map((t) => tenantName(t.tenant)))}
        </span>
      )}
      .
    </>
  );
}

export function shuffleCaption(n: number, k: number, estimate: Estimate, overlap: { sharing: boolean; identical: boolean }): ReactNode {
  const e = enumerateOverlap(n, k);
  return (
    <>
      {n} workers, {k} for each tenant: {integer(assignments(n, k))} possible assignments. Another tenant shares a worker with the noisy one in {e.sharing} of {e.total} ({pct(exactShare(n, k), 1)}) and loses every worker in {e.identical} ({pct(exactIdentical(n, k), 1)}). {integer(estimate.samples)} random assignments measured {pct(estimate.share, 1)} and {pct(estimate.identical, 1)}.{' '}
      {overlap.identical ? <span className="hl bad wrap">this tenant has the same workers: all down</span> : overlap.sharing ? <span className="hl orange wrap">this tenant shares a worker and keeps the rest</span> : <span className="hl ok wrap">this tenant shares no worker</span>}
    </>
  );
}

export function dataCaption(model: Isolation, ran: boolean, tenant: string, result: QueryResult, rowLevelSecurity: boolean): ReactNode {
  if (!ran) return <>{ISOLATION_NAME[model]}. Run the query that forgets the tenant filter and count what comes back for {tenant}.</>;
  return (
    <>
      {ISOLATION_NAME[model]}, as {tenant}, with the filter forgotten: {plural(result.rows.length, 'row')} came back, {result.leaked === 0 ? <span className="hl ok wrap">none from another tenant</span> : <span className="hl bad wrap">{result.leaked} from other tenants</span>}
      {model === 'pooled' ? (rowLevelSecurity ? ', because row-level security applies the filter inside the database (here the policy is on, the role is covered and the tenant is set).' : ', because the filter was the application\'s job.') : ', because this connection reaches only this tenant\'s data.'}
    </>
  );
}

export const hurtLimitText = `p99 over ${P99_LIMIT_MS} ms, or 1% of requests lost`;
