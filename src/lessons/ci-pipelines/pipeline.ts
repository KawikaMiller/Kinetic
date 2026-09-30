/**
 * A CI pipeline as a DAG of jobs, scheduled with unlimited runners: every job starts as
 * soon as all of its dependencies have passed. Durations are illustrative seconds.
 */

export type Branch = 'main' | 'feature';
export type Shards = 1 | 2 | 4;

export interface PipelineOptions {
  cache: boolean;
  shards: Shards;
  failFast: boolean;
  branch: Branch;
  /** Break one unit test: the first unit shard fails part-way through. */
  brokenTest: boolean;
}

export type JobKind = 'install' | 'check' | 'build' | 'test' | 'package' | 'deploy';

export interface Job {
  id: string;
  label: string;
  kind: JobKind;
  deps: string[];
  duration: number;
  /** Column in the drawing (0 = first stage); jobs in a column are drawn in list order. */
  stage: number;
  /** Install restored from the dependency cache. */
  cacheHit?: boolean;
}

export const DURATION = {
  installCold: 90,
  installCached: 8,
  lint: 20,
  typecheck: 35,
  build: 60,
  /** Total unit-test time, split across shards. */
  unitTotal: 240,
  /** Each shard pays for its own runner start-up and artifact download. */
  shardOverhead: 12,
  integration: 120,
  e2e: 150,
  package: 25,
  deploy: 40,
} as const;

/** The broken unit test fails this far into its shard. */
export const FAIL_AT = 0.4;

export function unitShardIds(shards: Shards): string[] {
  return Array.from({ length: shards }, (_, i) => `unit-${i + 1}`);
}

export function buildJobs(o: Pick<PipelineOptions, 'cache' | 'shards' | 'branch'>): Job[] {
  const units = unitShardIds(o.shards);
  const shardTime = Math.ceil(DURATION.unitTotal / o.shards) + DURATION.shardOverhead;
  const jobs: Job[] = [
    { id: 'install', label: 'install', kind: 'install', deps: [], duration: o.cache ? DURATION.installCached : DURATION.installCold, stage: 0, cacheHit: o.cache },
    { id: 'lint', label: 'lint', kind: 'check', deps: ['install'], duration: DURATION.lint, stage: 1 },
    { id: 'typecheck', label: 'typecheck', kind: 'check', deps: ['install'], duration: DURATION.typecheck, stage: 1 },
    { id: 'build', label: 'build', kind: 'build', deps: ['install'], duration: DURATION.build, stage: 1 },
    ...units.map((id, i): Job => ({
      id, label: o.shards === 1 ? 'unit tests' : `unit ${i + 1}/${o.shards}`, kind: 'test', deps: ['build'], duration: shardTime, stage: 2,
    })),
    { id: 'integration', label: 'integration', kind: 'test', deps: ['build'], duration: DURATION.integration, stage: 2 },
    { id: 'e2e', label: 'e2e', kind: 'test', deps: [...units, 'integration'], duration: DURATION.e2e, stage: 3 },
    { id: 'package', label: 'package', kind: 'package', deps: ['e2e', 'lint', 'typecheck'], duration: DURATION.package, stage: 4 },
  ];
  if (o.branch === 'main') jobs.push({ id: 'deploy', label: 'deploy', kind: 'deploy', deps: ['package'], duration: DURATION.deploy, stage: 5 });
  return jobs;
}

export type JobStatus = 'passed' | 'failed' | 'blocked' | 'cancelled';

export interface Scheduled {
  job: Job;
  status: JobStatus;
  /** Seconds from the push; null if it never started. */
  start: number | null;
  end: number | null;
}

export interface Run {
  jobs: Scheduled[];
  /** Seconds from the push until the pipeline finished (or stopped). */
  wallClock: number;
  /** Sum of every job that ran: what the misconception thinks the wall clock is. */
  jobSeconds: number;
  /** Longest dependency chain when everything passes, first job first. */
  criticalPath: string[];
  failed: string | null;
}

export function byId(jobs: readonly Job[]): Map<string, Job> {
  return new Map(jobs.map((j) => [j.id, j]));
}

/** Every job that (transitively) depends on `id`. */
export function descendants(jobs: readonly Job[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (from: string) => {
    for (const j of jobs) {
      if (j.deps.includes(from) && !out.has(j.id)) {
        out.add(j.id);
        walk(j.id);
      }
    }
  };
  walk(id);
  return out;
}

/** Longest path through the DAG by duration (earliest finish times), with the chain that makes it. */
export function longestPath(jobs: readonly Job[]): { length: number; path: string[] } {
  const map = byId(jobs);
  const finish = new Map<string, number>();
  const via = new Map<string, string | null>();
  const visit = (id: string): number => {
    const known = finish.get(id);
    if (known !== undefined) return known;
    const job = map.get(id)!;
    let best = 0;
    let from: string | null = null;
    for (const d of job.deps) {
      const f = visit(d);
      if (f > best) {
        best = f;
        from = d;
      }
    }
    finish.set(id, best + job.duration);
    via.set(id, from);
    return best + job.duration;
  };
  let end: string | null = null;
  let length = 0;
  for (const j of jobs) {
    const f = visit(j.id);
    if (f > length) {
      length = f;
      end = j.id;
    }
  }
  const path: string[] = [];
  for (let at = end; at; at = via.get(at) ?? null) path.unshift(at);
  return { length, path };
}

/** Schedule the pipeline with unlimited runners, applying the broken test and fail-fast. */
export function runPipeline(o: PipelineOptions): Run {
  const jobs = buildJobs(o);
  const map = byId(jobs);
  const failing = o.brokenTest ? unitShardIds(o.shards)[0] : null;
  const start = new Map<string, number>();
  const end = new Map<string, number>();
  const status = new Map<string, JobStatus>();

  // Earliest start = when the last dependency passes; a failed dependency blocks the job.
  const settle = (id: string): void => {
    if (status.has(id)) return;
    const job = map.get(id)!;
    job.deps.forEach(settle);
    if (job.deps.some((d) => status.get(d) !== 'passed')) {
      status.set(id, 'blocked');
      return;
    }
    const s = Math.max(0, ...job.deps.map((d) => end.get(d)!));
    start.set(id, s);
    if (id === failing) {
      end.set(id, s + job.duration * FAIL_AT);
      status.set(id, 'failed');
    } else {
      end.set(id, s + job.duration);
      status.set(id, 'passed');
    }
  };
  jobs.forEach((j) => settle(j.id));

  if (failing && o.failFast) {
    // Fail fast: the moment one job fails, cancel everything still running or not yet started.
    const failTime = end.get(failing)!;
    for (const j of jobs) {
      if (j.id === failing || status.get(j.id) === 'blocked') continue;
      const s = start.get(j.id)!;
      if (end.get(j.id)! > failTime) {
        status.set(j.id, 'cancelled');
        if (s >= failTime) {
          start.delete(j.id);
          end.delete(j.id);
        } else end.set(j.id, failTime);
      }
    }
  }

  const scheduled = jobs.map((job) => ({
    job,
    status: status.get(job.id)!,
    start: start.get(job.id) ?? null,
    end: end.get(job.id) ?? null,
  }));
  const ran = scheduled.filter((s) => s.start !== null);
  return {
    jobs: scheduled,
    wallClock: Math.max(0, ...ran.map((s) => s.end!)),
    jobSeconds: ran.reduce((sum, s) => sum + (s.end! - s.start!), 0),
    criticalPath: longestPath(jobs).path,
    failed: failing,
  };
}
