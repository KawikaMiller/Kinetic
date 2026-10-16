/**
 * Scene 2 and 3's model: a backup plan, five scenarios it is judged against, and the hidden faults a never-tested backup set can carry.
 * Every scenario strikes at the same minute, Thursday 14:07, so the verdicts compare plans and nothing else. Times are illustrative.
 */
import { mulberry32 } from '../../core/random';
import {
  BAD_DEPLOY_AT, DEFAULT_THROUGHPUT, MIN_PER_HOUR, clock, seededGaps, restore, restoreTime, seededHistory, snapshotsFor, type Restored, type RestoreInput, type Snapshot,
} from './backup';
import { GAP_WINDOW_H } from './window';

export type Method = 'replica' | 'snapshots' | 'snapshots-log';
export type Where = 'disk' | 'account' | 'region' | 'separate';
export type Tests = 'never' | 'quarterly' | 'weekly';
export type ScenarioId = 'disk' | 'migration' | 'ransomware' | 'region' | 'untested';

export interface Plan {
  method: Method;
  snapshotH: number;
  logMin: number;
  /** Copies in all: the first sits on the database's own disk, the others in `where`. */
  copies: 1 | 2 | 3;
  where: Where;
  /** Days an object lock keeps a copy from being deleted; 0 is off. */
  immutableDays: number;
  tests: Tests;
  /** The encryption key is kept with the backup (true) or in a separate place the backup does not hold (false). */
  keyWith: boolean;
}

export const DEFAULT_PLAN: Plan = { method: 'snapshots-log', snapshotH: 24, logMin: 15, copies: 2, where: 'separate', immutableDays: 7, tests: 'weekly', keyWith: true };
/** A plan with the three things the spec's broken modes break. */
export const WEAK_PLAN: Plan = { method: 'replica', snapshotH: 24, logMin: 15, copies: 1, where: 'disk', immutableDays: 0, tests: 'never', keyWith: false };

/**
 * A scenario of the incident: when the attacker's credentials are noticed, an object lock of at least this many days has held.
 * Assumptions, stated on screen: the lock is one nobody (the account owner included) can shorten, and "another region" is still the same account.
 */
export const DETECTION_DAYS = 3;
/** Illustrative: a replica trails the primary by about a minute, and failing over to it takes about five. */
export const REPLICA_LAG_MIN = 1;
export const FAILOVER_MIN = 5;
export const INCIDENT_AT = BAD_DEPLOY_AT;
/** A dropped table is noticed this long after the drop: by then the log archive has shipped the segment that holds the minute before it. */
export const DETECTED_AFTER_MIN = 30;

export const SCENARIOS: { id: ScenarioId; label: string; story: string }[] = [
  { id: 'disk', label: 'A disk fails', story: 'The disk holding the database and its local backup is lost.' },
  { id: 'migration', label: 'A bad migration drops a table', story: 'At 14:07 a deployment drops a table and every replica copies the drop a second later.' },
  { id: 'ransomware', label: 'Ransomware or a stolen credential', story: 'An attacker with the account\'s credentials deletes what they can reach, backups included.' },
  { id: 'region', label: 'The primary region is lost', story: 'Everything in the database\'s region is gone.' },
  { id: 'untested', label: 'The backup was never restorable', story: 'The disaster is an ordinary one, and the restore is tried for the first time.' },
];

export interface Verdict {
  ok: boolean;
  lostMin: number | null;
  downtimeMin: number | null;
  why: string;
}

/** The place the extra copies sit, or null when there is none off the database's disk: two copies on the same disk are one failure domain. */
const copiesOffDisk = (p: Plan) => (p.copies >= 2 && p.where !== 'disk' ? p.where : null);
const reaches = (p: Plan, ...places: Where[]) => copiesOffDisk(p) !== null && places.includes(p.where);

/** Is there a backup, or a replica, that survives this scenario? */
function survives(p: Plan, id: ScenarioId): { ok: boolean; why: string } {
  if (id === 'migration') {
    if (p.method === 'replica') return { ok: false, why: 'a replica is not a backup: it applied the drop too, and no earlier copy exists' };
    return { ok: true, why: '' };
  }
  if (id === 'disk') {
    if (p.method === 'replica') return { ok: true, why: '' };
    return copiesOffDisk(p) ? { ok: true, why: '' } : { ok: false, why: 'the only copy was on the failed disk' };
  }
  if (id === 'region') {
    const ok = reaches(p, 'region', 'separate');
    return ok ? { ok, why: '' } : { ok, why: p.method === 'replica' && p.copies === 1 ? 'the replica was in the lost region' : 'every copy was in the lost region' };
  }
  if (id === 'ransomware') {
    if (p.method === 'replica') return { ok: false, why: 'a replica is reachable with the same credentials and was encrypted too' };
    if (p.copies < 2) return { ok: false, why: 'the only copy was on the host the attacker controls' };
    if (p.where === 'disk') return { ok: false, why: 'the copies were on the same disk, within the attacker reach, and a lock on that disk protects nothing' };
    if (p.where === 'separate') return { ok: true, why: '' };
    return p.immutableDays >= DETECTION_DAYS ? { ok: true, why: '' } : { ok: false, why: `the copies were in the same account and not locked for the ${DETECTION_DAYS} days it takes to notice` };
  }
  return { ok: true, why: '' };
}

/** The latest minute a plan can restore to when the incident strikes: the incident minute with the log, the last snapshot without. */
function plannedInput(p: Plan, seed: number): RestoreInput {
  return { history: seededHistory(seed), snapshots: snapshotsFor(p.snapshotH), logMin: p.method === 'snapshots-log' ? p.logMin : null, gaps: new Set(), disasterAt: INCIDENT_AT };
}

export function verdict(p: Plan, id: ScenarioId, seed: number): Verdict {
  const s = survives(p, id);
  if (!s.ok) return { ok: false, lostMin: null, downtimeMin: null, why: s.why };
  if (id === 'untested') {
    const fault = hiddenFault(seed, p);
    if (fault !== null && p.tests === 'never') return { ok: false, lostMin: null, downtimeMin: null, why: `never tested: ${FAULT_TEXT[fault]}, found only now` };
  }
  if (p.method === 'replica') return { ok: true, lostMin: REPLICA_LAG_MIN, downtimeMin: FAILOVER_MIN, why: 'failed over to the replica' };
  const input = { ...plannedInput(p, seed), disasterAt: id === 'migration' ? INCIDENT_AT + DETECTED_AFTER_MIN : INCIDENT_AT };
  const target = id === 'migration' ? INCIDENT_AT - 1 : INCIDENT_AT;
  const r = restore(input, target);
  const lost = INCIDENT_AT - r.reached;
  const down = Math.round(restoreTime(input, target, DEFAULT_THROUGHPUT).totalS / 60);
  // With a log archive and no gaps the only reason is the unshipped last segment: the plan scene explains that once, under the table.
  const reason = p.method === 'snapshots-log' ? null : r.reason;
  return { ok: true, lostMin: lost, downtimeMin: down, why: `restored to ${clock(r.reached)}${reason ? `: ${reason}` : ''}` };
}

// ── hidden faults ─────────────────────────────────────────────────────

export type Fault = 'corrupt' | 'gap' | 'key' | 'script' | 'domain';
export const FAULT_TEXT: Record<Fault, string> = {
  corrupt: 'a backup file is corrupt',
  gap: 'a log segment is missing and replay cannot cross it',
  key: 'the encryption key was lost',
  script: 'the restore script was written for an older version',
  domain: 'the backup sits in the same failure domain as the database',
};
export const FAULT_PROBABILITY = 0.35;

/** The faults a plan can carry: a lost key needs a key kept apart, a log gap needs a log archive, a shared domain needs a copy that is not elsewhere. */
export function possibleFaults(p: Plan): Fault[] {
  const out: Fault[] = ['corrupt', 'script'];
  if (p.method === 'snapshots-log') out.push('gap');
  if (!p.keyWith) out.push('key');
  if (p.copies === 1 || p.where === 'disk') out.push('domain');
  return out;
}

/** The one hidden fault of this plan's backups on this seed, or null. */
export function hiddenFault(seed: number, p: Plan): Fault | null {
  const rnd = mulberry32(seed * 6151 + 29);
  const all = possibleFaults(p);
  const has = rnd() < FAULT_PROBABILITY;
  const which = all[Math.floor(rnd() * all.length)];
  return has ? which : null;
}

export interface BackupSet {
  id: string;
  label: string;
  /** The snapshot, or null for the log archive. */
  snapshot: Snapshot | null;
  fault: Fault | null;
  /** The restore test has looked at it. */
  tested: boolean;
  /** For the log archive: the missing segment. */
  gapSegment: number | null;
}

/** The backup sets a plan holds at the incident, with the seed's hidden fault placed on one of them. */
export function backupSets(p: Plan, seed: number): BackupSet[] {
  const snaps = snapshotsFor(p.snapshotH).filter((s) => s.t <= INCIDENT_AT);
  const sets: BackupSet[] = snaps.map((s, i) => ({ id: `s${i}`, label: `${clock(s.t)} ${s.kind}`, snapshot: s, fault: null, tested: false, gapSegment: null }));
  if (p.method === 'snapshots-log') sets.push({ id: 'log', label: `log archive, a segment every ${p.logMin} min`, snapshot: null, fault: null, tested: false, gapSegment: null });
  const f = hiddenFault(seed, p);
  if (f === null) return sets;
  const rnd = mulberry32(seed * 31 + 7);
  const target = f === 'gap' ? sets.findIndex((s) => s.snapshot === null) : f === 'corrupt' ? Math.floor(rnd() * Math.max(1, sets.filter((s) => s.snapshot).length)) : 0;
  const at = Math.max(0, target);
  const gapSegment = f === 'gap' ? [...seededGaps(seed, p.logMin, INCIDENT_AT - MIN_PER_HOUR, 1, INCIDENT_AT - GAP_WINDOW_H * MIN_PER_HOUR)][0] : null;
  return sets.map((s, i) => (i === at ? { ...s, fault: f, gapSegment: f === 'gap' ? gapSegment : null } : s));
}

export interface Outcome {
  restored: boolean;
  reached: number;
  lostMin: number;
  why: string;
}

/** Restore at the incident from these sets: a lost key or a stale script stops everything, a corrupt or shared-domain set cuts the chain, a log gap stops the replay. */
export function restoreFrom(p: Plan, sets: readonly BackupSet[], seed: number): Outcome {
  const stop = sets.find((s) => s.fault === 'key' || s.fault === 'script');
  if (stop) return { restored: false, reached: 0, lostMin: INCIDENT_AT, why: FAULT_TEXT[stop.fault!] };
  const snaps = snapshotsFor(p.snapshotH).filter((s) => s.t <= INCIDENT_AT);
  const usable: Snapshot[] = [];
  for (const snap of snaps) {
    const set = sets.find((s) => s.snapshot?.t === snap.t);
    if (set && (set.fault === 'corrupt' || set.fault === 'domain')) break;
    usable.push(snap);
  }
  const log = sets.find((s) => s.snapshot === null);
  const gaps = new Set<number>(log?.fault === 'gap' && log.gapSegment !== null ? [log.gapSegment] : []);
  const r: Restored = restore({ history: seededHistory(seed), snapshots: usable, logMin: p.method === 'snapshots-log' ? p.logMin : null, gaps, disasterAt: INCIDENT_AT }, INCIDENT_AT);
  const lostMin = INCIDENT_AT - r.reached;
  return { restored: true, reached: r.reached, lostMin, why: r.reason ?? 'restored to the incident minute' };
}

/** The same restore with every fault cleared: what the plan would have done had its backups been sound. */
export const soundOutcome = (p: Plan, seed: number): Outcome => restoreFrom(p, backupSets(p, seed).map((s) => ({ ...s, fault: null, gapSegment: null })), seed);

export const SEEDS = Array.from({ length: 200 }, (_, i) => i);
/** Does an untested plan fail the disaster on this seed: it cannot restore, or it restores less than a sound plan would. */
export function failsUntested(p: Plan, seed: number): boolean {
  const o = restoreFrom(p, backupSets(p, seed), seed);
  const sound = soundOutcome(p, seed);
  return !o.restored || o.reached < sound.reached;
}

export const lowestUntestedFailure = (p: Plan, only?: Fault): number | undefined => SEEDS.find((s) => (only === undefined || hiddenFault(s, p) === only) && failsUntested(p, s));
