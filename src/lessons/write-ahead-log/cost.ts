/** Scene 3's two cost models: group commit (one fsync shared by waiting committers) and checkpoint interval (recovery work against write overhead). */
import { mulberry32 } from '../../core/random';
import { DEFAULT_POLICY, PAGES, applyOp, checkpoint, crash, fresh, recoverySteps, type Machine, type Op, type Policy } from './wal';

// ── Group commit ──────────────────────────────────────────────────────

/** Illustrative fsync latencies: roughly an SSD and a spinning disk. Verify against your own device. */
export const FSYNC_SSD_MS = 0.5;
export const FSYNC_HDD_MS = 10;
export const MIN_FSYNC_MS = 0.1;
export const MAX_FSYNC_MS = 12;
export const MAX_COMMITTERS = 64;
/** How long a committer thinks between commits, as a fraction of the fsync latency (seeded, uniform from zero). */
export const THINK_FRACTION = 0.1;
export const HORIZON_MS = 600;
export const GROUP_SEED = 11;

export interface GroupRun {
  commits: number;
  fsyncs: number;
  /** Commits per second. */
  throughput: number;
}

/** Closed loop: `committers` clients each wait for their commit, think a little, and ask again. One fsync device, one fsync at a time. */
export function groupCommit(latencyMs: number, committers: number, grouped: boolean, seed = GROUP_SEED): GroupRun {
  const rnd = mulberry32(seed);
  const think = () => rnd() * latencyMs * THINK_FRACTION;
  const ready = Array.from({ length: committers }, think);
  let free = 0;
  let commits = 0;
  let fsyncs = 0;
  for (;;) {
    const first = Math.min(...ready);
    const start = Math.max(free, first);
    const done = start + latencyMs;
    if (done > HORIZON_MS) break;
    const waiting = ready.map((r, i) => ({ r, i })).filter(({ r }) => r <= start);
    const batch = grouped ? waiting : [waiting.sort((a, b) => a.r - b.r || a.i - b.i)[0]];
    for (const { i } of batch) ready[i] = done + think();
    commits += batch.length;
    fsyncs += 1;
    free = done;
  }
  return { commits, fsyncs, throughput: (commits * 1000) / HORIZON_MS };
}

/** The ceiling without grouping: one commit per fsync. */
export const ungroupedCeiling = (latencyMs: number) => 1000 / latencyMs;

// ── Checkpoints ───────────────────────────────────────────────────────

/** The checkpoint intervals the slider offers, in log records (0: never). */
export const CHECKPOINT_INTERVALS = [0, 6, 12, 18, 24, 36] as const;
export const DEFAULT_INTERVAL_INDEX = 0;
export const WORKLOAD_TXS = 12;
export const WORKLOAD_SEED = 5;

/** A fixed workload: 12 transactions, each writing two random pages and committing, run with no page flushed except by checkpoints. */
export function workloadOps(seed = WORKLOAD_SEED): Op[] {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const ops: Op[] = [];
  for (let tx = 1; tx <= WORKLOAD_TXS; tx++) {
    ops.push({ kind: 'write', tx, page: pick(PAGES), value: 1 + pick(99) }, { kind: 'write', tx, page: pick(PAGES), value: 1 + pick(99) }, { kind: 'commit', tx });
  }
  return ops;
}

export interface CheckpointRun {
  interval: number;
  records: number;
  checkpoints: number;
  /** Page writes the checkpoints cost. */
  pageWrites: number;
  /** The most log records recovery scans (redo point to the end) over every point the crash could fall at. */
  worstScanned: number;
  /** The same, averaged over those crash points. */
  averageScanned: number;
  /** How many crash points were tried. */
  crashPoints: number;
}

export function checkpointRun(interval: number, seed = WORKLOAD_SEED): CheckpointRun {
  let m: Machine = fresh();
  let checkpoints = 0;
  let sinceLast = 0;
  const scans: number[] = [];
  const scanIfCrashedNow = () => {
    // a crash right after the log was fsynced: the whole log is durable, recovery scans from the redo point
    const durable = { ...m, durable: m.log.length };
    scans.push(recoverySteps(crash(durable, false)).events.filter((e) => e.kind === 'redo' || e.kind === 'skip').length);
  };
  for (const op of workloadOps(seed)) {
    const before = m.log.length;
    m = applyOp(m, op);
    sinceLast += m.log.length - before;
    scanIfCrashedNow();
    if (interval > 0 && sinceLast >= interval) {
      const r = checkpoint(m);
      if ('m' in r) {
        m = r.m;
        checkpoints += 1;
        sinceLast = 0;
        scanIfCrashedNow();
      }
    }
  }
  const sum = scans.reduce((a, b) => a + b, 0);
  return { interval, records: m.log.length, checkpoints, pageWrites: m.pageWrites, worstScanned: Math.max(...scans), averageScanned: Math.round((sum / scans.length) * 10) / 10, crashPoints: scans.length };
}

/** What committing the same workload costs under a policy: page writes on the commit path against log fsyncs. */
export function commitCost(policy: Partial<Policy>, seed = WORKLOAD_SEED) {
  let m = fresh({ ...DEFAULT_POLICY, ...policy });
  for (const op of workloadOps(seed)) m = applyOp(m, op);
  return { commits: m.acked.length, pageWrites: m.pageWrites, fsyncs: m.fsyncs, records: m.log.length };
}
