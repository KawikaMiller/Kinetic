/**
 * The state each scene opens in (pure, so a test can switch through all of them and check none leaks into
 * another), the renewal scene's refusal and outcome table, and scene 3's reading of a run.
 */
import { DEFAULT_SETUP, HEARTBEAT_DEFAULT_MS, PINNED_SEED, WORK_A_RENEW_MS, runLease, statsAt, type FenceMode, type LeaseRun, type LeaseSetup, type PauseAt } from './model';

export const initialFailure = (): LeaseSetup => ({ ...DEFAULT_SETUP });

export const RENEW_TTL_MS = 9_000;
export const RENEW_PAUSE_MS = 12_000;
export const initialRenew = (): LeaseSetup => ({
  ...DEFAULT_SETUP,
  ttlMs: RENEW_TTL_MS,
  heartbeatMs: HEARTBEAT_DEFAULT_MS,
  workMs: WORK_A_RENEW_MS,
  pauseMs: RENEW_PAUSE_MS,
  pauseAt: 'job',
  mode: 'none',
});

export type Purpose = 'efficiency' | 'correctness';
export interface NeedsState {
  purpose: Purpose;
  storeChecks: boolean;
}
export const initialNeeds = (): NeedsState => ({ purpose: 'correctness', storeChecks: true });

/** Scene 3 always runs the default pause against fencing tokens; only whether storage checks them changes. */
export const needsSetup = (n: NeedsState): LeaseSetup => ({ ...DEFAULT_SETUP, mode: 'fence', storeChecks: n.storeChecks });

/** What a lapsed lease cost, read from the run: jobs that ran twice and stale writes that landed. */
export interface NeedsReading {
  /** Clients that ran their job to the end (each wrote once). */
  jobsRun: number;
  staleApplied: number;
  rejected: number;
}
export function needsReading(run: LeaseRun): NeedsReading {
  const s = statsAt(run, Infinity);
  return { jobsRun: run.store.length, staleApplied: s.staleApplied, rejected: s.rejected };
}

/** The lease must outlast one heartbeat interval, or it lapses between renewals; null when the pair is fine. */
export function validateRenew(ttlMs: number, heartbeatMs: number): string | null {
  return ttlMs <= heartbeatMs ? 'The lease would lapse between renewals: the TTL has to be longer than the heartbeat interval.' : null;
}

export const PAUSE_GRID_MS: readonly number[] = [0, 3_000, 6_000, 10_000, 15_000, 20_000];
export type Outcome = 'fine' | 'stopped' | 'rejected' | 'stale';
export const OUTCOME_LABEL: Record<Outcome, string> = {
  fine: 'fine',
  stopped: 'A stops',
  rejected: 'rejected',
  stale: 'stale write applied',
};

export function outcomeOf(run: LeaseRun): Outcome {
  const s = statsAt(run, Infinity);
  if (s.staleApplied > 0) return 'stale';
  if (s.rejected > 0) return 'rejected';
  return run.abandoned.length > 0 ? 'stopped' : 'fine';
}

export interface TableRow {
  id: string;
  label: string;
  mode: FenceMode;
  pauseAt: PauseAt;
}
export const TABLE_ROWS: readonly TableRow[] = [
  { id: 'none', label: 'No fencing', mode: 'none', pauseAt: 'job' },
  { id: 'check-before', label: 'Check first, pause before the check', mode: 'check', pauseAt: 'job' },
  { id: 'check-after', label: 'Check first, pause after the check', mode: 'check', pauseAt: 'write' },
  { id: 'fence', label: 'Fencing tokens', mode: 'fence', pauseAt: 'job' },
];

export interface TableCell {
  pauseMs: number;
  outcome: Outcome;
}

/** One sentence over the table: for each safeguard, how many of its pauses ended in a stale write. Counted from the cells. */
export function staleCounts(table: readonly { row: TableRow; cells: readonly TableCell[] }[]): string {
  return table
    .map(({ row, cells }) => `${row.label}: ${cells.filter((c) => c.outcome === 'stale').length} of ${cells.length} pauses end in a stale write`)
    .join('. ')
    .concat('.');
}

/** Every row of the table run through the simulator at every pause of the grid, under the learner's TTL, heartbeat and partition. */
export function outcomeTable(base: LeaseSetup): { row: TableRow; cells: TableCell[] }[] {
  return TABLE_ROWS.map((row) => ({
    row,
    cells: PAUSE_GRID_MS.map((pauseMs) => ({ pauseMs, outcome: outcomeOf(runLease({ ...base, mode: row.mode, pauseAt: row.pauseAt, pauseMs })) })),
  }));
}

/** What the pinned seed of a mode says, for the line next to the load button. */
export function pinnedText(mode: FenceMode): string {
  const seed = PINNED_SEED[mode];
  return seed === null
    ? 'None of the 200 seeded schedules breaks the data rules (F1, F2) in this mode.'
    : `Seed ${seed} is the lowest of 200 seeded schedules that breaks the data rules (F1, F2) in this mode.`;
}
