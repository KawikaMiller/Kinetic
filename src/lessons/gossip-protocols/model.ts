/**
 * Gossip on the real core/distSim: a rumour spreading by push, pull or push-pull in synchronous rounds (scenes 1 and 2), and
 * membership by heartbeat-counter gossip (scene 3). Pure logic, no React.
 *
 * Rounds: every node's round timer fires at the same ROUND_MS tick, and every message lands (1 to 10 ms) before the next tick.
 * A node acts on what it knew when the round began, which is what makes the one-step expectations below exact.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32, type Rnd } from '../../core/random';

export const ROUND_MS = 100;
/** The instant inside a round after which every message of that round has landed. */
export const ROUND_SETTLED_MS = 50;
export const HORIZON_ROUNDS = 30;
export const SWEEP_SEEDS = 200;
export const CLUSTER_SIZES = [8, 16, 32, 64, 128, 256] as const;
export const FANOUT = { min: 1, max: 4, default: 1 } as const;
export const LOSS = { min: 0, max: 0.3, step: 0.05, default: 0 } as const;
export const RUMOUR_VERSION = 1;

export type Mode = 'push' | 'pull' | 'push-pull';
export const MODES: readonly Mode[] = ['push', 'pull', 'push-pull'];
const pushes = (m: Mode) => m !== 'pull';
const pulls = (m: Mode) => m !== 'push';

export interface SpreadSetup {
  n: number;
  f: number;
  mode: Mode;
  /** An informed node pushes in the round after it learns the rumour and then stops (push only). */
  die: boolean;
  loss: number;
  seed: number;
}

/** The broken mode of rule 0: infect-and-die at n = 16, fanout 3 (fanout 2 fails on 92% of seeds, too close to the cap to be the default). */
export const BROKEN_SPREAD = { n: 16, f: 3, mode: 'push', die: true, loss: 0 } as const;
/** The lowest seed (from 1) on which that mode leaves a node out at the horizon: pinned by the test. */
export const BROKEN_SPREAD_SEED = 1;

export const defaultSpread = (): SpreadSetup => ({ n: 16, f: FANOUT.default, mode: 'push', die: false, loss: LOSS.default, seed: 1 });

/** Infect-and-die only changes who pushes, so it is ignored (and not offered) when the mode never pushes. */
export const dieApplies = (mode: Mode): boolean => pushes(mode);

/* ---------- one-step expectations (exact given i informed) and the recursion built from them ---------- */

/** Chance an uninformed node is not hit by any of `pushers * f` pushes, each aimed uniformly at the other n - 1 nodes and delivered with chance 1 - loss. */
export const pushSurvival = (n: number, f: number, pushers: number, loss: number): number => (1 - (1 - loss) / (n - 1)) ** (f * pushers);

/** Chance an uninformed node's f pull requests all miss an informed node (or a message of the round trip is lost). */
export const pullSurvival = (n: number, f: number, informed: number, loss: number): number => (1 - (informed * (1 - loss) ** 2) / (n - 1)) ** f;

/** E[uninformed after one round] when `informed` nodes know the rumour at the start; `pushers` of them push (all of them unless infect-and-die). */
export function expectedUninformedNext(n: number, f: number, mode: Mode, informed: number, loss = 0, pushers = informed): number {
  const u = n - informed;
  const push = pushes(mode) ? pushSurvival(n, f, pushers, loss) : 1;
  const pull = pulls(mode) ? pullSurvival(n, f, informed, loss) : 1;
  return u * push * pull;
}

/** The mean-field recursion: expected uninformed count at the end of each round, treating the expected informed count as the count. */
export function expectedCurve(setup: Omit<SpreadSetup, 'seed'>, rounds: number): number[] {
  const { n, f, mode, die, loss } = setup;
  const useDie = die && dieApplies(mode);
  const out = [n - 1];
  let newest = 1;
  for (let r = 1; r <= rounds; r++) {
    const u = out[r - 1];
    const next = expectedUninformedNext(n, f, mode, n - u, loss, useDie ? newest : n - u);
    newest = u - next;
    out.push(next);
  }
  return out;
}

/** First round at which the expected uninformed count is below `limit`, or null within `maxRounds`. */
export function roundsBelow(setup: Omit<SpreadSetup, 'seed'>, limit = 0.5, maxRounds = 200): number | null {
  const curve = expectedCurve(setup, maxRounds);
  const r = curve.findIndex((u) => u < limit);
  return r < 0 ? null : r;
}

/** The uninformed fraction s left by infect-and-die at fanout f in a very large cluster: the root of s = exp(-f (1 - s)) in (0, 0.5), by bisection. */
export function finalUninformedFraction(f: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid - Math.exp(-f * (1 - mid)) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** The push-gossip reference log2 n + ln n (the form of a classical result; named in the lesson as from memory). */
export const pushReference = (n: number): number => Math.log2(n) + Math.log(n);

/* ---------- the spread on distSim ---------- */

export type SpreadMsg = { type: 'push' | 'rumour'; version: number } | { type: 'pull' };

export interface SpreadView {
  version: number;
}

const idOf = (i: number) => `n${i}`;
const SPREAD_STREAM = 0x5bd1e995;

export interface Spread {
  cluster: Cluster<SpreadMsg, SpreadView>;
  /** Version each node holds now (0 = does not know the rumour). */
  versions: number[];
  setup: SpreadSetup;
}

/** Faults a safety sweep adds on top of the learner's loss; the lesson's own controls never set them. */
export interface ExtraFaults {
  duplicate?: number;
  loss?: number;
}

export function buildSpread(setup: SpreadSetup, extra: ExtraFaults = {}): Spread {
  const { n, f, mode, die } = setup;
  const useDie = die && dieApplies(mode);
  const pick: Rnd = mulberry32(setup.seed ^ SPREAD_STREAM);
  const versions: number[] = Array.from({ length: n }, (_, i) => (i === 0 ? RUMOUR_VERSION : 0));
  const pushTurns = Array.from({ length: n }, (_, i) => (i === 0 ? (useDie ? 1 : Infinity) : 0));
  const knewAtStart = Array.from({ length: n }, () => false);
  const peerOf = (self: number): string => {
    const k = Math.floor(pick() * (n - 1));
    return idOf(k >= self ? k + 1 : k);
  };
  const learn = (i: number, version: number) => {
    if (version > versions[i]) {
      versions[i] = version;
      pushTurns[i] = useDie ? 1 : Infinity;
    }
  };
  const nodes: Record<string, DistNode<SpreadMsg, SpreadView>> = {};
  for (let i = 0; i < n; i++) {
    nodes[idOf(i)] = {
      init: (ctx) => ctx.setTimer('round', ROUND_MS),
      onTimer: (ctx: NodeCtx<SpreadMsg>) => {
        knewAtStart[i] = versions[i] > 0;
        if (pushes(mode) && knewAtStart[i] && pushTurns[i] > 0) {
          for (let k = 0; k < f; k++) ctx.send(peerOf(i), { type: 'push', version: versions[i] });
          pushTurns[i] -= 1;
        }
        if (pulls(mode) && !knewAtStart[i]) for (let k = 0; k < f; k++) ctx.send(peerOf(i), { type: 'pull' });
        ctx.setTimer('round', ROUND_MS);
      },
      onMessage: (ctx, msg) => {
        const p = msg.payload;
        if (p.type === 'pull') {
          if (knewAtStart[i]) ctx.send(msg.from, { type: 'rumour', version: versions[i] });
        } else learn(i, p.version);
      },
      snapshot: () => ({ version: versions[i] }),
    };
  }
  const cluster = createCluster<SpreadMsg, SpreadView>({ seed: setup.seed, nodes, loss: setup.loss, duplicate: extra.duplicate });
  return { cluster, versions, setup };
}

export interface SpreadRun {
  setup: SpreadSetup;
  /** informed[r][i]: does node i know the rumour at the end of round r (r = 0 is the start). */
  informed: boolean[][];
  /** Informed count at the end of each round. */
  counts: number[];
  /** Messages sent up to the end of each round. */
  messages: number[];
  /** First round at which every node is informed, or null within the horizon. */
  completeAt: number | null;
}

/** Run until everyone is informed or `maxRounds` rounds have passed, recording the state at the end of each round. */
export function runSpread(setup: SpreadSetup, maxRounds = HORIZON_ROUNDS): SpreadRun {
  const s = buildSpread(setup);
  const informed: boolean[][] = [s.versions.map((v) => v > 0)];
  const messages = [0];
  let completeAt: number | null = setup.n === 1 ? 0 : null;
  for (let r = 1; r <= maxRounds && completeAt === null; r++) {
    s.cluster.run({ until: r * ROUND_MS + ROUND_SETTLED_MS });
    informed.push(s.versions.map((v) => v > 0));
    messages.push(s.cluster.trace.filter((row) => row.kind === 'send').length);
    if (informed[r].every(Boolean)) completeAt = r;
  }
  return { setup, informed, counts: informed.map((row) => row.filter(Boolean).length), messages, completeAt };
}

/** Rule 0 (a bounded liveness check, stated as one): by round H every node holds the rumour. */
export const coveredAtHorizon = (run: SpreadRun, horizon = HORIZON_ROUNDS): boolean => run.completeAt !== null && run.completeAt <= horizon;

/** Nodes that never heard the rumour by the end of the run. */
export const leftOut = (run: SpreadRun): number[] => run.informed[run.informed.length - 1].flatMap((on, i) => (on ? [] : [i]));

export function failingSeeds(base: Omit<SpreadSetup, 'seed'>, from = 1, to = SWEEP_SEEDS + 1): number[] {
  const bad: number[] = [];
  for (let seed = from; seed < to; seed++) if (!coveredAtHorizon(runSpread({ ...base, seed }))) bad.push(seed);
  return bad;
}

/** Safety, checked on every event: a node holds a version somebody wrote (here 0 or the rumour's), and never a lower one than before. */
export function spreadSafety(): Safety<SpreadView> {
  let previous: Record<string, number> = {};
  return (snap) => {
    for (const [id, node] of Object.entries(snap.nodes)) {
      const v = node.state?.version ?? 0;
      if (v !== 0 && v !== RUMOUR_VERSION) return `${id} holds version ${v}, which nobody wrote`;
      if (v < (previous[id] ?? 0)) return `${id} went from version ${previous[id]} down to ${v}`;
    }
    previous = Object.fromEntries(Object.entries(snap.nodes).map(([id, node]) => [id, node.state?.version ?? 0]));
    return null;
  };
}

export interface SpreadSweep {
  /** Seeds on which everyone was informed within the horizon. */
  completed: number;
  /** Seeds that left at least one node out at the horizon. */
  failed: number;
  /** Mean rounds over the seeds that completed, or null when none did. */
  meanRounds: number | null;
}

/** The learner's setting over seeds 1 to `seeds`: how many seeds cover everyone by the horizon, and how long those take. */
export function sweepSpread(base: Omit<SpreadSetup, 'seed'>, seeds = SWEEP_SEEDS): SpreadSweep {
  let completed = 0;
  let total = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const run = runSpread({ ...base, seed });
    if (coveredAtHorizon(run)) {
      completed += 1;
      total += run.completeAt ?? 0;
    }
  }
  return { completed, failed: seeds - completed, meanRounds: completed === 0 ? null : total / completed };
}

/** Mean rounds to inform everyone over `seeds` seeds (runs that miss the horizon count as 60). */
export function meanRounds(base: Omit<SpreadSetup, 'seed'>, seeds = SWEEP_SEEDS): number {
  let total = 0;
  for (let seed = 1; seed <= seeds; seed++) total += runSpread({ ...base, seed }, 60).completeAt ?? 60;
  return total / seeds;
}

/* ---------- scene 3: membership by heartbeat-counter gossip ---------- */

export const MEMBER = {
  n: { min: 8, max: 64, default: 16 },
  f: { min: 1, max: 3, default: 2 },
  tFail: { min: 4, max: 20, default: 12 },
  cutRounds: { min: 5, max: 40, default: 20 },
} as const;
export const CRASH_ROUND = 40;
export const CUT_FROM_ROUND = 40;
export const MEMBER_ROUNDS = 140;
/** Where accuracy and safety are checked: fault-free runs of this many rounds. */
export const ACCURACY_ROUNDS = 100;
/** The lowest seed (from 1) on which T_fail = 12 at f = 1, n = 16 suspects a live node: pinned by the test. */
export const BROKEN_MEMBER_SEED = 1;
export const BROKEN_MEMBER = { n: 16, f: 1, tFail: 12 } as const;
export const FIXED_MEMBER = { n: 16, f: 1, tFail: 20 } as const;

export interface MemberSetup {
  n: number;
  f: number;
  tFail: number;
  seed: number;
  crash: boolean;
  cut: boolean;
  cutRounds: number;
}

export const defaultMember = (): MemberSetup => ({ n: MEMBER.n.default, f: MEMBER.f.default, tFail: MEMBER.tFail.default, seed: 1, crash: false, cut: false, cutRounds: MEMBER.cutRounds.default });

export interface MemberView {
  round: number;
  /** Ids of the nodes this node suspects, worked out at its own round tick. */
  suspects: number[];
  counters: readonly number[];
}

export type MemberMsg = { type: 'table'; counters: number[] };

export interface Membership {
  cluster: Cluster<MemberMsg, MemberView>;
  setup: MemberSetup;
  /** The node tables, read live: counters[i][j] is what node i believes node j's heartbeat counter is. */
  counters: number[][];
  lastGrowth: number[][];
  suspects: number[][];
  /** Is node i up (not crashed) right now? Mirrors the harness's crash for drawing and tests. */
  upAt: (i: number, round: number) => boolean;
}

export function buildMembership(setup: MemberSetup, extra: ExtraFaults = {}): Membership {
  const { n, f, tFail } = setup;
  const pick: Rnd = mulberry32(setup.seed ^ SPREAD_STREAM);
  const counters = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const lastGrowth = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const suspects: number[][] = Array.from({ length: n }, () => []);
  const rounds = Array.from({ length: n }, () => 0);
  const nodes: Record<string, DistNode<MemberMsg, MemberView>> = {};
  for (let i = 0; i < n; i++) {
    nodes[idOf(i)] = {
      init: (ctx) => ctx.setTimer('round', ROUND_MS),
      onTimer: (ctx) => {
        rounds[i] += 1;
        counters[i][i] += 1;
        lastGrowth[i][i] = rounds[i];
        suspects[i] = [];
        for (let j = 0; j < n; j++) if (j !== i && rounds[i] - lastGrowth[i][j] >= tFail) suspects[i].push(j);
        for (let k = 0; k < f; k++) {
          const peer = Math.floor(pick() * (n - 1));
          ctx.send(idOf(peer >= i ? peer + 1 : peer), { type: 'table', counters: counters[i].slice() });
        }
        ctx.setTimer('round', ROUND_MS);
      },
      onMessage: (_ctx, msg) => {
        msg.payload.counters.forEach((c, j) => {
          if (c > counters[i][j]) {
            counters[i][j] = c;
            lastGrowth[i][j] = rounds[i];
          }
        });
      },
      snapshot: () => ({ round: rounds[i], suspects: suspects[i], counters: counters[i] }),
    };
  }
  const cluster = createCluster<MemberMsg, MemberView>({ seed: setup.seed, nodes, loss: extra.loss, duplicate: extra.duplicate });
  if (setup.crash) cluster.crash(idOf(0), CRASH_ROUND * ROUND_MS);
  if (setup.cut) {
    const half = Math.floor(n / 2);
    const ids = Array.from({ length: n }, (_, i) => idOf(i));
    cluster.partition(ids.slice(0, half), ids.slice(half), CUT_FROM_ROUND * ROUND_MS, (CUT_FROM_ROUND + setup.cutRounds) * ROUND_MS);
  }
  const upAt = (i: number, round: number) => !(setup.crash && i === 0 && round >= CRASH_ROUND);
  return { cluster, setup, counters, lastGrowth, suspects, upAt };
}

/** Rule 1, accuracy: no up node suspects a node that is up (the nodes are up in a fault-free run). */
export const accuracyRule: Safety<MemberView> = (snap) => {
  for (const [id, node] of Object.entries(snap.nodes)) {
    if (!node.up || !node.state) continue;
    for (const j of node.state.suspects) {
      if (snap.nodes[idOf(j)].up) return `${id} suspects ${idOf(j)}, which is up, in its round ${node.state.round}`;
    }
  }
  return null;
};

/** Safety (always on): no node holds a counter for j above j's own counter, and counters never decrease. */
export function memberSafety(): Safety<MemberView> {
  let previous: Record<string, readonly number[]> = {};
  return (snap) => {
    for (const [id, node] of Object.entries(snap.nodes)) {
      const mine = node.state?.counters;
      if (!mine) continue;
      for (let j = 0; j < mine.length; j++) {
        const theirs = snap.nodes[idOf(j)].state?.counters[j] ?? 0;
        if (mine[j] > theirs) return `${id} holds counter ${mine[j]} for ${idOf(j)}, above its own ${theirs}`;
        if (previous[id] && mine[j] < previous[id][j]) return `${id} lowered its counter for ${idOf(j)}`;
      }
    }
    previous = Object.fromEntries(Object.entries(snap.nodes).map(([id, node]) => [id, node.state ? node.state.counters.slice() : []]));
    return null;
  };
}

export interface MembershipRun {
  setup: MemberSetup;
  /** suspectsByRound[r][i]: the ids node i suspects at the end of round r (empty for a node that is down). */
  suspectsByRound: number[][][];
}

export function runMembership(setup: MemberSetup, rounds = MEMBER_ROUNDS): MembershipRun {
  const m = buildMembership(setup);
  const suspectsByRound: number[][][] = [m.suspects.map(() => [])];
  for (let r = 1; r <= rounds; r++) {
    m.cluster.run({ until: r * ROUND_MS + ROUND_SETTLED_MS });
    suspectsByRound.push(m.suspects.map((s, i) => (m.upAt(i, r) ? s.slice() : [])));
  }
  return { setup, suspectsByRound };
}

export interface MembershipReadout {
  /** Round of the first suspicion of node 0 after it crashed, counted from the crash; null if none. */
  firstSuspicion: number | null;
  /** Rounds from the crash until every up node suspects node 0; null if not by the end. */
  detection: number | null;
  /** Distinct (observer, live node) pairs that were ever suspected while the target was up. */
  falsePairs: number;
  /** Rounds after the cut healed until no up node suspects an up node; null if not by the end or no cut. */
  convergence: number | null;
}

export function readMembership(run: MembershipRun): MembershipReadout {
  const { crash, cut, cutRounds } = run.setup;
  const rounds = run.suspectsByRound.length - 1;
  const up = (j: number, r: number) => !(crash && j === 0 && r >= CRASH_ROUND);
  const falsePairs = new Set<string>();
  for (let r = 1; r <= rounds; r++) {
    run.suspectsByRound[r].forEach((list, i) => {
      for (const j of list) if (up(j, r)) falsePairs.add(`${i}>${j}`);
    });
  }
  let firstSuspicion: number | null = null;
  let detection: number | null = null;
  if (crash) {
    for (let r = CRASH_ROUND; r <= rounds; r++) {
      const observers = run.suspectsByRound[r].filter((_, i) => i !== 0);
      if (firstSuspicion === null && observers.some((l) => l.includes(0))) firstSuspicion = r - CRASH_ROUND;
      if (detection === null && observers.every((l) => l.includes(0))) detection = r - CRASH_ROUND;
    }
  }
  let convergence: number | null = null;
  if (cut) {
    const healed = CUT_FROM_ROUND + cutRounds;
    for (let r = healed; r <= rounds && convergence === null; r++) {
      const clean = run.suspectsByRound[r].every((list, i) => (i === 0 && crash ? true : list.every((j) => !up(j, r))));
      if (clean) convergence = r - healed;
    }
  }
  return { firstSuspicion, detection, falsePairs: falsePairs.size, convergence };
}

/** Per round: suspicions of nodes that are up (false) and of the crashed node (true), counted over the up observers. */
export function suspicionCounts(run: MembershipRun): { falseCount: number[]; trueCount: number[] } {
  const { crash } = run.setup;
  const falseCount: number[] = [];
  const trueCount: number[] = [];
  run.suspectsByRound.forEach((row, r) => {
    let bad = 0;
    let good = 0;
    for (const list of row) for (const j of list) {
        if (crash && j === 0 && r >= CRASH_ROUND) good += 1;
        else bad += 1;
      }
    falseCount.push(bad);
    trueCount.push(good);
  });
  return { falseCount, trueCount };
}

/** Seeds in [from, to) on which rule 1 fails in a fault-free run of ACCURACY_ROUNDS rounds. */
export function accuracyFailures(base: Pick<MemberSetup, 'n' | 'f' | 'tFail'>, from = 1, to = SWEEP_SEEDS + 1): number[] {
  const bad: number[] = [];
  for (let seed = from; seed < to; seed++) {
    const m = buildMembership({ ...defaultMember(), ...base, seed });
    m.cluster.start();
    let broken = false;
    while (m.cluster.queued > 0 && m.cluster.nextTime() <= ACCURACY_ROUNDS * ROUND_MS && !broken) {
      m.cluster.step();
      broken = accuracyRule(m.cluster.snapshot()) !== null;
    }
    if (broken) bad.push(seed);
  }
  return bad;
}
