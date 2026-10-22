// Seeded fault schedules for the Raft model: the same schedule runs against every variant, and the
// safety monitor is shown the cluster after every event (deliveries, timers, crashes, partitions).
import { integer } from '../../core/format';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import { SafetyMonitor, type SafetyViolation } from './safety';
import { N, nodeName, Raft, type RaftVariant } from './sim';

export const SCHEDULE_SEEDS = 200;
/** Faults are injected for this long, then everything heals and restarts and the cluster settles. */
export const FAULT_MS = 60_000;
export const SETTLE_MS = 20_000;
export const TICK_MS = 20;
/** Wire faults applied to every message of every schedule. */
export const SCHEDULE_LOSS = 0.1;
export const SCHEDULE_DUPLICATE = 0.1;
/** The schedule's own random stream is the seed run through this constant, so it is independent of the sim's draws. */
const SCHEDULE_SALT = 0x9e3779b9;
const GAP_MS = { min: 400, max: 2500 } as const;
const MAX_MINORITY = 2;
const SETTLE_COMMAND_AT_MS = [2_000, 6_000, 10_000] as const;

/**
 * The lowest of the seeds 1 to 200 on which each planted bug breaks a property, and the property it breaks
 * first. check.test.ts re-derives both by brute force, so a change to the model that moves them fails there.
 */
export const BROKEN_SEED = { 'commit-without-majority': 1, 'vote-without-log-check': 3 } as const;
export const BROKEN_RULE = { 'commit-without-majority': 'committed-on-majority', 'vote-without-log-check': 'leader-completeness' } as const;

export type ScheduleAction =
  | { at: number; kind: 'command' }
  | { at: number; kind: 'crash'; node: number }
  | { at: number; kind: 'restart'; node: number }
  | { at: number; kind: 'partition'; minority: number[] }
  | { at: number; kind: 'heal' };

export const describeAction = (a: ScheduleAction): string => {
  const t = `${(a.at / 1000).toFixed(1)} s`;
  switch (a.kind) {
    case 'command':
      return `${t} client command`;
    case 'crash':
      return `${t} crash ${nodeName(a.node)}`;
    case 'restart':
      return `${t} restart ${nodeName(a.node)}`;
    case 'partition':
      return `${t} cut off ${a.minority.map(nodeName).join(' + ')}`;
    case 'heal':
      return `${t} heal the network`;
  }
};

/** One fault step chosen from the cluster's current shape: what is down, and whether the network is cut. */
function nextAction(at: number, rnd: Rnd, down: Set<number>, cut: { on: boolean }): ScheduleAction {
  const roll = rnd();
  if (roll < 0.45) return { at, kind: 'command' };
  if (roll < 0.7) {
    const dead = [...down];
    const alive = Array.from({ length: N }, (_, i) => i).filter((i) => !down.has(i));
    if (dead.length && (alive.length === 1 || rnd() < 0.5)) {
      const node = pick(dead, rnd);
      down.delete(node);
      return { at, kind: 'restart', node };
    }
    const node = pick(alive, rnd);
    down.add(node);
    return { at, kind: 'crash', node };
  }
  if (cut.on) {
    cut.on = false;
    return { at, kind: 'heal' };
  }
  cut.on = true;
  const size = randInt(1, MAX_MINORITY, rnd);
  const members = new Set<number>();
  while (members.size < size) members.add(randInt(0, N - 1, rnd));
  return { at, kind: 'partition', minority: [...members].sort((a, b) => a - b) };
}

/** The fault schedule of a seed: random commands, crashes, restarts and partitions, then a heal-everything tail. */
export function buildSchedule(seed: number): ScheduleAction[] {
  const rnd = mulberry32((seed ^ SCHEDULE_SALT) >>> 0);
  const down = new Set<number>();
  const cut = { on: false };
  const actions: ScheduleAction[] = [];
  for (let at = randInt(GAP_MS.min, GAP_MS.max, rnd); at < FAULT_MS; at += randInt(GAP_MS.min, GAP_MS.max, rnd)) {
    actions.push(nextAction(at, rnd, down, cut));
  }
  if (cut.on) actions.push({ at: FAULT_MS, kind: 'heal' });
  for (const node of [...down].sort((a, b) => a - b)) actions.push({ at: FAULT_MS, kind: 'restart', node });
  for (const offset of SETTLE_COMMAND_AT_MS) actions.push({ at: FAULT_MS + offset, kind: 'command' });
  return actions;
}

export function applyAction(raft: Raft, a: ScheduleAction) {
  switch (a.kind) {
    case 'command':
      raft.clientCommand();
      break;
    case 'crash':
    case 'restart':
      raft.toggleNode(a.node);
      break;
    case 'partition':
      raft.setPartition(true, a.minority);
      break;
    case 'heal':
      raft.setPartition(false);
      break;
  }
}

export interface ScheduleResult {
  seed: number;
  variant: RaftVariant;
  violation: SafetyViolation | null;
  /** Events the monitor was shown before the run ended (or failed). */
  events: number;
  /** How many entries were committed, so a pass is not an idle cluster. */
  committed: number;
  actions: ScheduleAction[];
}

/** Run one seed's schedule against a variant, with the monitor watching after every event. */
export function runSchedule(seed: number, variant: RaftVariant): ScheduleResult {
  const actions = buildSchedule(seed);
  const raft = new Raft({ rnd: mulberry32(seed), variant, loss: SCHEDULE_LOSS, duplicate: SCHEDULE_DUPLICATE });
  const monitor = new SafetyMonitor();
  raft.observer = (r) => monitor.observe(r);
  let next = 0;
  for (let t = 0; t < FAULT_MS + SETTLE_MS && !monitor.violation; t += TICK_MS) {
    while (next < actions.length && actions[next].at <= t) applyAction(raft, actions[next++]);
    raft.step(TICK_MS);
  }
  return { seed, variant, violation: monitor.violation, events: monitor.events, committed: monitor.committedCount, actions };
}

export interface CheckSummary {
  variant: RaftVariant;
  seeds: number;
  failures: number;
  /** The lowest seed that failed, with its violation and schedule; null when every seed passed. */
  lowest: ScheduleResult | null;
  /** Events the monitor checked across all seeds. */
  events: number;
}

/** Run seeds 1..count and report how many broke a safety rule and the lowest that did. */
export function checkSeeds(variant: RaftVariant, count = SCHEDULE_SEEDS): CheckSummary {
  let failures = 0;
  let events = 0;
  let lowest: ScheduleResult | null = null;
  for (let seed = 1; seed <= count; seed += 1) {
    const result = runSchedule(seed, variant);
    events += result.events;
    if (!result.violation) continue;
    failures += 1;
    lowest ??= result;
  }
  return { variant, seeds: count, failures, lowest, events };
}

/** The sentence under the "check" button: what ran, how many seeds broke a property, and the lowest that did. */
export function describeCheck(s: CheckSummary): string {
  const ran = `${integer(s.seeds)} seeded schedules, ${integer(s.events)} events checked`;
  if (!s.lowest?.violation) return `Sampled, not exhaustive: none of ${ran}, broke a property. That is evidence for the real rules, not a proof.`;
  return `Broke a property on ${s.failures} of ${s.seeds} seeds (${ran}). Lowest failing seed ${s.lowest.seed}: ${s.lowest.violation.rule}.`;
}
