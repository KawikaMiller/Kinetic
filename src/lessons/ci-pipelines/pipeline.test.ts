import { describe, expect, it } from 'vitest';
import { buildJobs, descendants, DURATION, FAIL_AT, runPipeline, unitShardIds, type Job, type PipelineOptions, type Shards } from './pipeline';

/** Every chain from a root to a sink, summed: the brute-force reference for the critical path. */
function bruteForceLongest(jobs: Job[]): number {
  const map = new Map(jobs.map((j) => [j.id, j]));
  const children = (id: string) => jobs.filter((j) => j.deps.includes(id));
  let best = 0;
  const walk = (id: string, sum: number) => {
    const total = sum + map.get(id)!.duration;
    const next = children(id);
    if (!next.length) best = Math.max(best, total);
    next.forEach((c) => walk(c.id, total));
  };
  jobs.filter((j) => j.deps.length === 0).forEach((r) => walk(r.id, 0));
  return best;
}

const COMBOS: PipelineOptions[] = [];
for (const cache of [false, true])
  for (const shards of [1, 2, 4] as Shards[])
    for (const branch of ['main', 'feature'] as const)
      for (const failFast of [false, true]) COMBOS.push({ cache, shards, branch, failFast, brokenTest: false });

describe('scheduling', () => {
  it.each(COMBOS)('wall clock = longest path through the DAG (%o)', (o) => {
    const run = runPipeline(o);
    expect(run.wallClock).toBe(bruteForceLongest(buildJobs(o)));
    expect(run.jobs.every((s) => s.status === 'passed')).toBe(true);
  });

  it('the wall clock is far less than the sum of all jobs', () => {
    for (const o of COMBOS) {
      const run = runPipeline(o);
      expect(run.jobSeconds).toBeGreaterThan(run.wallClock);
    }
  });

  it('every job starts exactly when its last dependency finishes', () => {
    const run = runPipeline(COMBOS[0]);
    const end = new Map(run.jobs.map((s) => [s.job.id, s.end!]));
    for (const s of run.jobs) expect(s.start).toBe(Math.max(0, ...s.job.deps.map((d) => end.get(d)!)));
  });

  it('the cache and sharding shorten the critical path', () => {
    const base = { shards: 1 as Shards, branch: 'main' as const, failFast: false, brokenTest: false };
    const cold = runPipeline({ ...base, cache: false }).wallClock;
    const warm = runPipeline({ ...base, cache: true }).wallClock;
    expect(cold - warm).toBe(DURATION.installCold - DURATION.installCached);
    const sharded = runPipeline({ ...base, cache: true, shards: 4 }).wallClock;
    expect(sharded).toBeLessThan(warm);
  });

  it('deploy only exists on main', () => {
    const ids = (branch: 'main' | 'feature') => buildJobs({ cache: true, shards: 2, branch }).map((j) => j.id);
    expect(ids('main')).toContain('deploy');
    expect(ids('feature')).not.toContain('deploy');
  });

  it('reports a critical path that is a real dependency chain', () => {
    const o = COMBOS[3];
    const jobs = new Map(buildJobs(o).map((j) => [j.id, j]));
    const { criticalPath, wallClock } = runPipeline(o);
    expect(criticalPath.reduce((s, id) => s + jobs.get(id)!.duration, 0)).toBe(wallClock);
    for (let i = 1; i < criticalPath.length; i++) expect(jobs.get(criticalPath[i])!.deps).toContain(criticalPath[i - 1]);
  });
});

describe('failure propagation', () => {
  it.each(COMBOS.filter((o) => !o.failFast))('a broken test blocks exactly its descendants (%o)', (o) => {
    const run = runPipeline({ ...o, brokenTest: true });
    const failing = unitShardIds(o.shards)[0];
    const blocked = new Set(run.jobs.filter((s) => s.status === 'blocked').map((s) => s.job.id));
    expect(blocked).toEqual(descendants(buildJobs(o), failing));
    expect(run.jobs.find((s) => s.job.id === failing)!.status).toBe('failed');
    expect(run.jobs.filter((s) => !blocked.has(s.job.id) && s.job.id !== failing).every((s) => s.status === 'passed')).toBe(true);
    if (o.branch === 'main') expect(blocked.has('deploy')).toBe(true);
  });

  it.each(COMBOS.filter((o) => o.failFast))('fail fast stops everything at the moment of failure (%o)', (o) => {
    const run = runPipeline({ ...o, brokenTest: true });
    const failing = run.jobs.find((s) => s.status === 'failed')!;
    const failTime = failing.start! + failing.job.duration * FAIL_AT;
    expect(failing.end).toBeCloseTo(failTime);
    expect(run.wallClock).toBeCloseTo(failTime);
    for (const s of run.jobs) {
      if (s.status === 'passed') expect(s.end!).toBeLessThanOrEqual(failTime);
      if (s.status === 'cancelled' && s.start !== null) expect(s.end).toBeCloseTo(failTime);
    }
    // Something was actually running in parallel and got cut short.
    expect(run.jobs.some((s) => s.status === 'cancelled' && s.start !== null)).toBe(true);
  });
});
