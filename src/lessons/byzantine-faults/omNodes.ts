/**
 * byzantine-faults, scene 4 and the seeded leg: OM(m) on `core/distSim`. A traitor is a node closure that sends the
 * seeded lie for each edge; the harness stamps `from`, so a traitor can lie about content, not about who it is. The
 * algorithm assumes reliable, synchronous channels: delivery is 1 to 10 ms, there is no loss, and every lieutenant
 * decides at a fixed time after the last round could have arrived.
 */
import { createCluster, type Cluster, type DistNode, type Safety, type Snapshot } from '../../core/distSim';
import { COMMANDER, RETREAT, generalName, majorityOf, runOm, seededSetup, type Bit, type SeededSetup } from './om';

export interface OmMsg {
  /** The instance path: path[0] is the commander and the last entry the sender. */
  path: number[];
  value: Bit;
}

export interface OmNodeState {
  traitor: boolean;
  /** The loyal commander's order (the commander's own state), or null. */
  order: Bit | null;
  decision: Bit | null;
}

export const LATENCY_MS = { min: 1, max: 10 } as const;
/** Decide after this many ms: later than the last of m + 1 rounds can arrive. */
export const decideAtMs = (m: number): number => LATENCY_MS.max * (m + 1) + 5;
const DECIDE_TIMER = 'decide';
export const SEED_RANGE = { from: 1, to: 201 } as const;
export const SEEDS_TOTAL = SEED_RANGE.to - SEED_RANGE.from;
/** The lowest failing seeds (from 1) of OM(1) with one traitor at 3 generals and OM(2) with two traitors at 6: pinned in byzantine.test.ts against forSeeds. */
export const BROKEN_SEED_OM1 = 9;
export const BROKEN_SEED_OM2 = 19;
/** OM(2) at scene 4 draws this many traitors from the seed. */
export const OM2_TRAITORS = 2;

const pathKey = (i: number, path: readonly number[]) => `${i}|${path.join('.')}`;

function buildNodes(setup: SeededSetup): Record<string, DistNode<OmMsg, OmNodeState>> {
  const lieutenants = Array.from({ length: setup.n - 1 }, (_, k) => k + 1);
  const nodes: Record<string, DistNode<OmMsg, OmNodeState>> = {};
  for (let i = 0; i < setup.n; i++) {
    const received = new Map<string, Bit>();
    let decision: Bit | null = null;
    const traitor = setup.traitors.has(i);
    const value = (path: number[]): Bit => {
      const direct = received.get(pathKey(i, path)) ?? RETREAT;
      if (path.length - 1 === setup.m) return direct;
      const others = lieutenants.filter((j) => !path.includes(j) && j !== i);
      return majorityOf([direct, ...others.map((j) => value([...path, j]))]);
    };
    nodes[generalName(i)] = {
      init: (ctx) => {
        if (i === COMMANDER) {
          for (const to of lieutenants) ctx.send(generalName(to), { path: [COMMANDER], value: traitor ? setup.bit(COMMANDER, [COMMANDER], to) : setup.order });
        } else ctx.setTimer(DECIDE_TIMER, decideAtMs(setup.m));
      },
      onMessage: (ctx, msg) => {
        const { path, value: v } = msg.payload;
        received.set(pathKey(i, path), v);
        if (path.length - 1 >= setup.m) return;
        const next = [...path, i];
        for (const to of lieutenants.filter((l) => !next.includes(l))) ctx.send(generalName(to), { path: next, value: traitor ? setup.bit(i, next, to) : v });
      },
      onTimer: () => {
        decision = value([COMMANDER]);
      },
      snapshot: () => ({ traitor, order: i === COMMANDER ? setup.order : null, decision }),
    };
  }
  return nodes;
}

export function omScenario(n: number, m: number, traitorCount: number) {
  return (seed: number): Cluster<OmMsg, OmNodeState> => {
    const setup = seededSetup(seed, n, m, traitorCount);
    return createCluster<OmMsg, OmNodeState>({ seed, nodes: buildNodes(setup), latency: LATENCY_MS });
  };
}

export const statesOf = (snap: Snapshot<OmNodeState>): OmNodeState[] => Object.values(snap.nodes).map((x) => x.state as OmNodeState);

/** IC1 and IC2 over the decided loyal lieutenants, after every event. Two rules, so a failing seed names which one broke. */
export const ic1: Safety<OmNodeState> = (snap) => {
  const states = statesOf(snap).slice(1).filter((s) => !s.traitor && s.decision !== null);
  return states.every((s) => s.decision === states[0].decision) ? null : 'IC1 broken: loyal lieutenants decided different values';
};
export const ic2: Safety<OmNodeState> = (snap) => {
  const [commander, ...rest] = statesOf(snap);
  if (commander.traitor) return null;
  return rest.filter((s) => !s.traitor && s.decision !== null).every((s) => s.decision === commander.order) ? null : 'IC2 broken: a loyal lieutenant did not obey the loyal commander';
};
export const RULES: readonly Safety<OmNodeState>[] = [ic1, ic2];
/** The names of `RULES`, in the same order. */
export const RULE_NAMES = ['IC1', 'IC2'] as const;

export interface OmSeedRun {
  setup: SeededSetup;
  /** The lieutenants' decisions in the harness, by general index (traitors included, for display). */
  decisions: (Bit | null)[];
  broken: string | null;
  rule: number | null;
  messages: number;
}

/** One seeded run to its end, checking IC1 and IC2 after every event. */
export function runOmSeed(n: number, m: number, traitorCount: number, seed: number): OmSeedRun {
  const cluster = omScenario(n, m, traitorCount)(seed);
  cluster.start();
  let broken: string | null = null;
  let rule: number | null = null;
  const check = () => {
    if (broken !== null) return;
    const snap = cluster.snapshot();
    RULES.forEach((r, k) => {
      const msg = broken === null ? r(snap) : null;
      if (msg !== null) {
        broken = msg;
        rule = k;
      }
    });
  };
  check();
  while (cluster.step()) check();
  const final = statesOf(cluster.snapshot());
  const sends = cluster.trace.filter((r) => r.kind === 'send').length;
  return { setup: seededSetup(seed, n, m, traitorCount), decisions: final.map((s) => s.decision), broken, rule, messages: sends };
}

export interface OmSweep {
  failing: number[];
  lowestFailing: number | null;
  message: string | null;
  rule: number | null;
  seeds: number;
}

export function sweepOm(n: number, m: number, traitorCount: number): OmSweep {
  const failing: number[] = [];
  let message: string | null = null;
  let rule: number | null = null;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
    const run = runOmSeed(n, m, traitorCount, seed);
    if (run.broken !== null) {
      failing.push(seed);
      message = message ?? run.broken;
      rule = rule ?? run.rule;
    }
  }
  return { failing, lowestFailing: failing[0] ?? null, message, rule, seeds: SEEDS_TOTAL };
}

/** The synchronous reference for a seed: the same lies through the pure recursion, for comparison with the harness. */
export function referenceDecisions(n: number, m: number, traitorCount: number, seed: number): (Bit | null)[] {
  const setup = seededSetup(seed, n, m, traitorCount);
  const run = runOm(setup);
  return Array.from({ length: n }, (_, i) => (i === COMMANDER ? null : (run.decisions.get(i) ?? null)));
}
