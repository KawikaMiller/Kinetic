/**
 * distributed-sql-truetime: the arithmetic of commit wait over an uncertainty interval.
 *
 * Model: a shard leader's clock reads true time plus a constant error `e`. TT.now() is the interval [c - eps, c + eps]
 * around the reading c. `eps` is the ASSUMED bound the system waits out; `delta` is the ACTUAL bound on the clocks' errors.
 * A read-write transaction picks the timestamp s = TT.now().latest = c + eps at commit start and, with commit wait, acknowledges
 * only when TT.now().earliest > s, which is true time t + 2 eps. Everything here is a model statement: no product is shown running.
 */

export const T1_START_MS = 100;
/** The strict inequality of "TT.now().earliest > s", as a tiny extra delay in the simulation. */
export const WAIT_EPSILON_MS = 0.001;

export const EPSILON_MS = { min: 0, max: 20, default: 7 } as const;
export const DELTA_MS = { min: 0, max: 25, default: 7 } as const;
export const GAP_MS = { min: 0, max: 20, default: 5 } as const;
export const ERROR_MS = { min: -25, max: 25 } as const;
export const SEED_RANGE = { from: 1, to: 201 } as const;
export const SEEDS_TOTAL = SEED_RANGE.to - SEED_RANGE.from;

export interface RaceInput {
  epsilon: number;
  /** The clock errors of shard 1's and shard 2's leaders, ms. */
  e1: number;
  e2: number;
  /** The gap between T1's acknowledgement and T2's start, ms. */
  gap: number;
  commitWait: boolean;
}

export interface Race {
  /** True time T1 starts committing. */
  t1: number;
  /** T1's timestamp: its leader's TT.now().latest. */
  s1: number;
  /** The commit wait T1 pays, ms (2 eps with the wait, 0 without). */
  waitMs: number;
  /** True time T1 is acknowledged. */
  ackAt: number;
  /** True time T2 starts, after the acknowledgement. */
  t2: number;
  /** T2's timestamp. */
  s2: number;
  /** T2's timestamp is strictly larger than T1's (a tie is a violation). */
  ordered: boolean;
  /** T2's snapshot read at s2 sees T1's write (the latest version at or below s2). */
  sees: boolean;
}

/** The commit wait as the lesson states it: until TT.now().earliest > s, which is 2 eps after the start. */
export const commitWaitMs = (epsilon: number, commitWait: boolean): number => (commitWait ? 2 * epsilon : 0);

export function race(i: RaceInput): Race {
  const t1 = T1_START_MS;
  const s1 = t1 + i.e1 + i.epsilon;
  const waitMs = commitWaitMs(i.epsilon, i.commitWait);
  const ackAt = t1 + waitMs;
  const t2 = ackAt + i.gap;
  const s2 = t2 + i.e2 + i.epsilon;
  return { t1, s1, waitMs, ackAt, t2, s2, ordered: s2 > s1, sees: s1 <= s2 };
}

/** The race rule in one line: T2 is ordered after T1 exactly when w + g + e2 - e1 > 0. */
export const orderedByFormula = (i: RaceInput): boolean => commitWaitMs(i.epsilon, i.commitWait) + i.gap + i.e2 - i.e1 > 0;

/** The seeded draw: the clock errors uniform in [-delta, delta] and the gap uniform in [0, G]. */
export function drawRace(rnd: () => number, delta: number, gapMax: number): { e1: number; e2: number; gap: number } {
  const e1 = Math.round((rnd() * 2 - 1) * delta * 1000) / 1000;
  const e2 = Math.round((rnd() * 2 - 1) * delta * 1000) / 1000;
  const gap = Math.round(rnd() * gapMax * 1000) / 1000;
  return { e1, e2, gap };
}

/**
 * The share of races that break external consistency, in closed form. e1 and e2 are independent uniform on [-delta, delta], so
 * D = e1 - e2 is triangular with P(D >= x) = (2 delta - x)^2 / (8 delta^2) for 0 <= x <= 2 delta; the gap is uniform on [0, G].
 * A race breaks when D >= w + g (a tie is a violation): P = (1/G) * integral_0^G P(D >= w + g) dg.
 */
export function breakProbability(o: { delta: number; epsilon: number; gapMax: number; commitWait: boolean }): number {
  const w = commitWaitMs(o.epsilon, o.commitWait);
  const a = 2 * o.delta - w;
  if (o.delta === 0) return w === 0 && o.gapMax === 0 ? 1 : 0;
  if (a <= 0) return 0;
  if (o.gapMax === 0) return (a * a) / (8 * o.delta * o.delta);
  const m = Math.min(o.gapMax, a);
  return (a ** 3 - (a - m) ** 3) / 3 / (8 * o.delta * o.delta * o.gapMax);
}

/** The same integral by the midpoint rule: an independent check of the closed form. */
export function breakProbabilityByQuadrature(o: { delta: number; epsilon: number; gapMax: number; commitWait: boolean }, steps = 20_000): number {
  const w = commitWaitMs(o.epsilon, o.commitWait);
  const tail = (x: number) => (x >= 2 * o.delta ? 0 : x >= 0 ? (2 * o.delta - x) ** 2 / (8 * o.delta * o.delta) : 1 - (2 * o.delta + x) ** 2 / (8 * o.delta * o.delta));
  if (o.gapMax === 0) return tail(w);
  let sum = 0;
  for (let k = 0; k < steps; k++) sum += tail(w + ((k + 0.5) / steps) * o.gapMax);
  return sum / steps;
}

/** The price of the guarantee: every write waits 2 eps, so serial writes to one key commit at most 1000 / (2 eps) per second (a model statement). */
export const latencyBillMs = (epsilon: number): number => 2 * epsilon;
export const hotKeyBound = (epsilon: number): number | null => (epsilon === 0 ? null : 1000 / (2 * epsilon));

// ---------- snapshot reads (scene 1) ----------

export interface Version {
  at: number;
  value: string;
}
export const X_VERSIONS: readonly Version[] = [{ at: 5, value: 'a' }, { at: 12, value: 'b' }, { at: 20, value: 'c' }];
/** The transaction that wrote x@12 also wrote y@12, on another shard, with the same commit timestamp. */
export const Y_VERSIONS: readonly Version[] = [{ at: 12, value: 'p' }];
export const READ_TS = { min: 0, max: 30 } as const;

/** The latest version at or below `at` (a linear scan), or null. */
export function versionAt(versions: readonly Version[], at: number): Version | null {
  let best: Version | null = null;
  for (const v of versions) if (v.at <= at && (best === null || v.at > best.at)) best = v;
  return best;
}

/** The same lookup by binary search over a list sorted by timestamp. */
export function versionAtBinary(versions: readonly Version[], at: number): Version | null {
  let lo = 0;
  let hi = versions.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (versions[mid].at <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : versions[found];
}

export const clampReadTs = (t: number): number => Math.min(READ_TS.max, Math.max(READ_TS.min, t));

// ---------- two shards, two-phase commit (scene 3) ----------

export interface TwoShard {
  epsilon: number;
  /** The two participants' clock readings when they prepare, and the coordinator's. */
  clocks: readonly [number, number];
  coordinatorClock: number;
}

export interface TwoShardResult {
  /** Each participant's prepare timestamp: its own TT.now().latest. */
  prepares: [number, number];
  /** The coordinator's own latest. */
  coordinatorLatest: number;
  /** The maximum of all of them. */
  commitTimestamp: number;
  /** How long the coordinator's clock must advance before TT.now().earliest exceeds the commit timestamp. */
  waitMs: number;
}

export function twoShardCommit(t: TwoShard): TwoShardResult {
  const prepares: [number, number] = [t.clocks[0] + t.epsilon, t.clocks[1] + t.epsilon];
  const coordinatorLatest = t.coordinatorClock + t.epsilon;
  const commitTimestamp = Math.max(prepares[0], prepares[1], coordinatorLatest);
  return { prepares, coordinatorLatest, commitTimestamp, waitMs: Math.max(0, commitTimestamp + t.epsilon - t.coordinatorClock) };
}

/** The scene's preset: prepare timestamps 107 and 110 at eps = 7 (clocks 100 and 103), the coordinator reading 100. */
export const PRESET_TWO_SHARD: TwoShard = { epsilon: 7, clocks: [100, 103], coordinatorClock: 100 };
