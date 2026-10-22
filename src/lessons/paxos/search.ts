/**
 * paxos: the two ways safety is checked. The exhaustive leg runs the protocol over the explorer's non-consuming network
 * (every loss, duplication and reordering at once); the seeded leg runs the same functions on `core/distSim` with delay,
 * loss, duplication and a partition. The screen says which ran.
 */
import { explore } from '../../core/explore';
import { networkExplorer, type NetState } from '../../core/pureProtocol';
import { createCluster, type Cluster, type Safety, type Snapshot } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { nearestRank } from '../../core/stats';
import { pacedNodes } from './paced';
import {
  ACCEPTORS, PROPOSERS, RETRY_BALLOTS, THREE_BALLOTS, TWO_BALLOTS, atMostOneChosen, chosenPairs, configFor, protocolFor,
  type BallotCounts, type Bug, type PaxosMsg, type PaxosState,
} from './protocol';

// ---------- the exhaustive leg ----------

/** The explorer's budget for three ballots: above the full space (119,865 states), so the search finishes. */
export const THREE_BALLOT_STATE_CAP = 150_000;

export interface Exhaustive {
  states: number;
  depth: number;
  truncated: boolean;
  /** Reachable states by what is chosen in them. */
  none: number;
  chosenA: number;
  chosenB: number;
  init: NetState<PaxosState, PaxosMsg>;
  violation: { message: string; path: { text: string; actor: string; state: NetState<PaxosState, PaxosMsg> }[] } | null;
}

/** BFS over every schedule of `counts` ballots; `maxStates` truncates (and the lesson then says "not exhaustive"). */
export function exhaustiveSearch(counts: BallotCounts, bug: Bug, maxStates?: number): Exhaustive {
  const config = configFor(counts, bug);
  const net = networkExplorer(protocolFor(config));
  const safe = atMostOneChosen(config);
  const tally = { none: 0, chosenA: 0, chosenB: 0 };
  const result = explore({
    ...net,
    maxStates,
    invariant: (s: NetState<PaxosState, PaxosMsg>) => safe(net.nodeStates(s)),
    onVisit: ({ state }) => {
      const values = chosenPairs(net.nodeStates(state)).map((c) => c.value);
      if (values.length === 0) tally.none++;
      if (values.includes('A')) tally.chosenA++;
      if (values.includes('B')) tally.chosenB++;
    },
  });
  return {
    states: result.states,
    depth: result.depth,
    truncated: result.truncated,
    init: net.init,
    ...tally,
    violation: result.violation && {
      message: result.violation.message,
      path: result.violation.path.map((p) => ({ text: p.label.text, actor: p.label.actor, state: p.state })),
    },
  };
}

export const EXHAUSTIVE_BALLOTS = { two: TWO_BALLOTS, three: THREE_BALLOTS } as const;

/** An explored state's node states by id (acceptors first, then proposers: the protocol's node order). */
export const nodeRecord = (state: NetState<PaxosState, PaxosMsg>): Record<string, PaxosState> =>
  Object.fromEntries([...ACCEPTORS, ...PROPOSERS].map((id, i) => [id, state.nodes[i]]));

// ---------- the seeded leg ----------

export const LATENCY_MS = { min: 1, max: 10 } as const;
/** The proposer's retry timeout, ms: a delay since anything last happened to it. */
export const RETRY_TIMEOUT_MS = 60;
/** With randomised backoff a retry waits a further uniform 0 to this many ms. */
export const BACKOFF_MAX_MS = 50;
export const OFFSET_WINDOW_MS = { min: 10, max: 60, default: 30 } as const;
export const LOSS_PERCENT = { min: 0, max: 20 } as const;
export const DUPLICATE_RATE = 0.1;
export const SEED_RANGE = { from: 1, to: 201 } as const;
export const SEEDS_TOTAL = SEED_RANGE.to - SEED_RANGE.from;
/** The partition that cuts one acceptor off from everyone, drawn from the seed. */
const PARTITION_START_MS = { min: 0, max: 40 } as const;
const PARTITION_LENGTH_MS = 50;

export interface SeedOptions {
  bug: Bug;
  /** P2 starts a uniform 0 to this many ms after P1. */
  offsetWindowMs: number;
  /** Loss probability in percent. */
  lossPercent: number;
  /** Randomised backoff on the retry. */
  backoff: boolean;
  counts?: BallotCounts;
}

export const DEFAULT_OPTIONS: SeedOptions = { bug: 'none', offsetWindowMs: OFFSET_WINDOW_MS.default, lossPercent: 0, backoff: false };

/** The lowest failing seed (from 1) at the default offset window, per planted bug: pinned in paxos.test.ts against forSeeds. */
export const BROKEN_SEED_BELOW_PROMISE = 2;
export const BROKEN_SEED_IGNORE_PROMISED = 1;
export const seedFor = (bug: Bug): number => (bug === 'acceptBelowPromise' ? BROKEN_SEED_BELOW_PROMISE : bug === 'ignorePromised' ? BROKEN_SEED_IGNORE_PROMISED : SEED_RANGE.from);

/** The safety rule: at most one value is chosen, after every event. */
export const oneValueRule: Safety<PaxosState> = (snap) => atMostOneChosen(configFor(RETRY_BALLOTS))(statesOf(snap));

export const statesOf = (snap: Snapshot<PaxosState>): Record<string, PaxosState> =>
  Object.fromEntries([...ACCEPTORS, ...PROPOSERS].map((id) => [id, snap.nodes[id].state as PaxosState]));

export function paxosScenario(options: SeedOptions) {
  return (seed: number): Cluster<PaxosMsg, PaxosState> => {
    const rnd = mulberry32(seed * 7919 + 13);
    const offset = rnd() * options.offsetWindowMs;
    const cut = ACCEPTORS[Math.floor(rnd() * ACCEPTORS.length)];
    const cutFrom = PARTITION_START_MS.min + rnd() * (PARTITION_START_MS.max - PARTITION_START_MS.min);
    const retry = () => RETRY_TIMEOUT_MS + (options.backoff ? rnd() * BACKOFF_MAX_MS : 0);
    const config = configFor(options.counts ?? RETRY_BALLOTS, options.bug);
    const nodes = pacedNodes(protocolFor(config), { first: (id) => (id === 'P2' ? 1 + offset : 1), retry });
    const cluster = createCluster<PaxosMsg, PaxosState>({ seed, nodes, latency: LATENCY_MS, loss: options.lossPercent / 100, duplicate: DUPLICATE_RATE });
    cluster.partition(cut, ACCEPTORS.filter((a) => a !== cut), cutFrom, cutFrom + PARTITION_LENGTH_MS);
    return cluster;
  };
}

export interface SeedRun {
  /** The first safety message broken, or null. */
  violation: string | null;
  /** True time at which some value was first chosen, or null when none was by the end of the run. */
  decidedAt: number | null;
  /** The value chosen (the first one, when two were). */
  value: string | null;
}

export function runPaxosSeed(options: SeedOptions, seed: number): SeedRun {
  const cluster = paxosScenario(options)(seed);
  cluster.start();
  let violation: string | null = null;
  let decidedAt: number | null = null;
  let value: string | null = null;
  for (;;) {
    const snap = cluster.snapshot();
    const states = statesOf(snap);
    const chosen = chosenPairs(states);
    if (chosen.length > 0 && decidedAt === null) {
      decidedAt = snap.time;
      value = chosen[0].value;
    }
    violation = violation ?? oneValueRule(snap);
    if (!cluster.step()) break;
  }
  return { violation, decidedAt, value };
}

export interface SeedSweep {
  failing: number[];
  lowestFailing: number | null;
  message: string | null;
  decided: number;
  seeds: number;
  /** Decision times (ms) of the seeds that decided, ascending. */
  times: number[];
  median: number | null;
  p95: number | null;
}

const sweepCache = new Map<string, SeedSweep>();
/** `sweepSeeds` remembered per option set: a slider drag revisits the same 21 loss values. */
export function cachedSweep(options: SeedOptions): SeedSweep {
  const key = JSON.stringify(options);
  const hit = sweepCache.get(key);
  if (hit) return hit;
  const fresh = sweepSeeds(options);
  sweepCache.set(key, fresh);
  return fresh;
}

export function sweepSeeds(options: SeedOptions): SeedSweep {
  const failing: number[] = [];
  const times: number[] = [];
  let message: string | null = null;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
    const run = runPaxosSeed(options, seed);
    if (run.violation !== null) {
      failing.push(seed);
      message = message ?? run.violation;
    }
    if (run.decidedAt !== null) times.push(run.decidedAt);
  }
  times.sort((a, b) => a - b);
  return {
    failing,
    lowestFailing: failing[0] ?? null,
    message,
    decided: times.length,
    seeds: SEEDS_TOTAL,
    times,
    median: nearestRank(times, 50),
    p95: nearestRank(times, 95),
  };
}
