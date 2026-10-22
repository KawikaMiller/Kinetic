/**
 * flp-impossibility, scene 1 and scene 3(a): three processes, binary inputs, and ONE round of news.
 * Each process broadcasts its input; the protocol is a `PureProtocol`, so the explorer and the seeded
 * harness run the same functions.
 *
 * - 'one' (the timeout protocol): decide on the FIRST message heard, with a decision rule D(own, heard).
 *   It cannot wait for a process that might be dead, so it always decides.
 * - 'all' (wait for all three): decide only after hearing both others, on the majority of the three
 *   inputs. Nothing decides while a process stays silent.
 */
import { explore } from '../../core/explore';
import { networkExplorer, type NetState, type PureProtocol } from '../../core/pureProtocol';
import { createCluster, type Cluster, type Safety, type Snapshot } from '../../core/distSim';
import { asDistNodes } from '../../core/pureProtocol';
import { mulberry32 } from '../../core/random';

export type Bit = 0 | 1;
export const PROCS = ['P0', 'P1', 'P2'] as const;
export const PROCESS_COUNT = PROCS.length;
export type Inputs = readonly [Bit, Bit, Bit];
export type Mode = 'one' | 'all';

/** D(own, heard) as four bits, cells in the order 00, 01, 10, 11 (index = own * 2 + heard). */
export type RuleTable = readonly [Bit, Bit, Bit, Bit];
export const CELL_LABELS = ['00', '01', '10', '11'] as const;
/** The default: AND. */
export const AND_TABLE: RuleTable = [0, 0, 0, 1];
export const OR_TABLE: RuleTable = [0, 1, 1, 1];

/** Per process, per slot (which other process it heard: its first or second other), a table. */
export type RuleSet = readonly (readonly [RuleTable, RuleTable])[];
export const symmetric = (t: RuleTable): RuleSet => PROCS.map(() => [t, t] as const);

/** The two processes other than `i`, in index order. */
export const others = (i: number): [number, number] => [0, 1, 2].filter((j) => j !== i) as [number, number];

export const INPUT_VECTORS: Inputs[] = Array.from({ length: 8 }, (_, n) => [(n >> 2) & 1, (n >> 1) & 1, n & 1] as unknown as Inputs);
/** Which other process each process hears first: bit i of a pattern picks the slot for process i. */
export const PATTERNS = [0, 1, 2, 3, 4, 5, 6, 7];
export const SCENARIOS = INPUT_VECTORS.length * PATTERNS.length;

export const majority = (inputs: Inputs): Bit => (inputs[0] + inputs[1] + inputs[2] >= 2 ? 1 : 0);

/** What each process decides when it hears first from the slot its pattern bit picks. */
export function decisionsOf(inputs: Inputs, pattern: number, rules: RuleSet): Bit[] {
  return PROCS.map((_, i) => {
    const slot = (pattern >> i) & 1;
    const heard = inputs[others(i)[slot]];
    return rules[i][slot][inputs[i] * 2 + heard];
  });
}

/** Decisions under either protocol: 'all' waits for every input and decides the majority, whatever the order. */
export const decisionsFor = (mode: Mode, inputs: Inputs, pattern: number, rules: RuleSet): Bit[] =>
  mode === 'all' ? PROCS.map(() => majority(inputs)) : decisionsOf(inputs, pattern, rules);

export interface Verdict {
  agree: boolean;
  valid: boolean;
}
export function verdictOf(inputs: Inputs, decisions: readonly Bit[]): Verdict {
  const agree = decisions.every((d) => d === decisions[0]);
  const same = inputs.every((b) => b === inputs[0]);
  return { agree, valid: !same || decisions.every((d) => d === inputs[0]) };
}

/** Every delivery pattern for one input vector. */
export interface PatternRow {
  pattern: number;
  /** The slot each process hears first, as the process it hears. */
  heardFirst: string[];
  decisions: Bit[];
  verdict: Verdict;
}
export function patternRows(inputs: Inputs, rules: RuleSet, mode: Mode = 'one'): PatternRow[] {
  return PATTERNS.map((pattern) => {
    const decisions = decisionsFor(mode, inputs, pattern, rules);
    return {
      pattern,
      heardFirst: PROCS.map((_, i) => PROCS[others(i)[(pattern >> i) & 1]]),
      decisions,
      verdict: verdictOf(inputs, decisions),
    };
  });
}

/** Across all 64 scenarios: how many break agreement, how many break validity. */
export function scenarioCounts(rules: RuleSet, mode: Mode = 'one'): { disagree: number; invalid: number; scenarios: number } {
  let disagree = 0;
  let invalid = 0;
  for (const inputs of INPUT_VECTORS) {
    for (const pattern of PATTERNS) {
      const v = verdictOf(inputs, decisionsFor(mode, inputs, pattern, rules));
      if (!v.agree) disagree++;
      if (!v.valid) invalid++;
    }
  }
  return { disagree, invalid, scenarios: SCENARIOS };
}

/** All 16 symmetric rules, as tables (bit k of n is cell k). */
export const ALL_TABLES: RuleTable[] = Array.from({ length: 16 }, (_, n) => [n & 1, (n >> 1) & 1, (n >> 2) & 1, (n >> 3) & 1] as unknown as RuleTable);

export interface RuleSearch {
  rules: number;
  agreeing: number;
  valid: number;
  /** Agreeing on all 64 scenarios AND valid. */
  safe: number;
}

/** Try every symmetric rule D (16) on the 64 scenarios. */
export function trySymmetricRules(): RuleSearch {
  let agreeing = 0;
  let valid = 0;
  let safe = 0;
  for (const t of ALL_TABLES) {
    const c = scenarioCounts(symmetric(t));
    const a = c.disagree === 0;
    const v = c.invalid === 0;
    if (a) agreeing++;
    if (v) valid++;
    if (a && v) safe++;
  }
  return { rules: ALL_TABLES.length, agreeing, valid, safe };
}

/** The mixed cells (01 and 10) are the free bits when validity pins 00 -> 0 and 11 -> 1. */
export const MIXED_CELLS = [1, 2] as const;
export const PER_PROCESS_FREE_BITS = PROCESS_COUNT * 2 * MIXED_CELLS.length;
export const PER_PROCESS_RULES = 2 ** PER_PROCESS_FREE_BITS;

/** The per-process rule set with validity pinned and its 12 free bits read from `n`. */
export function pinnedRuleSet(n: number): RuleSet {
  let bit = 0;
  const next = (): Bit => ((n >> bit++) & 1) as Bit;
  return PROCS.map(() => {
    const table = () => {
      const t: Bit[] = [0, 0, 0, 1];
      for (const cell of MIXED_CELLS) t[cell] = next();
      return t as unknown as RuleTable;
    };
    return [table(), table()] as const;
  });
}

/** Try every per-process rule with validity pinned: 4,096 of them. Returns how many agree on all 64 scenarios. */
export function tryPerProcessRules(): { rules: number; safe: number } {
  let safe = 0;
  for (let n = 0; n < PER_PROCESS_RULES; n++) if (scenarioCounts(pinnedRuleSet(n)).disagree === 0) safe++;
  return { rules: PER_PROCESS_RULES, safe };
}

/**
 * Test-only fact: of all 2^24 per-process rules, with validity NOT pinned, those that agree on every one
 * of the 64 scenarios. A rule is 24 bits (process, slot, cell); each scenario reads three of them.
 */
export function agreementOnlySurvivors(): number[] {
  const cellBit = (i: number, slot: number, own: number, heard: number) => (i * 2 + slot) * 4 + own * 2 + heard;
  const reads = INPUT_VECTORS.flatMap((inputs) =>
    PATTERNS.map((pattern) =>
      PROCS.map((_, i) => {
        const slot = (pattern >> i) & 1;
        return cellBit(i, slot, inputs[i], inputs[others(i)[slot]]);
      }),
    ),
  );
  const survivors: number[] = [];
  const total = 2 ** (PROCESS_COUNT * 2 * 4);
  for (let rule = 0; rule < total; rule++) {
    let agrees = true;
    for (const [a, b, c] of reads) {
      const x = (rule >> a) & 1;
      if (x !== ((rule >> b) & 1) || x !== ((rule >> c) & 1)) {
        agrees = false;
        break;
      }
    }
    if (agrees) survivors.push(rule);
  }
  return survivors;
}

// ---------- the protocol ----------

export interface OneState {
  input: Bit;
  /** Messages heard, in order: [from index, value]. */
  heard: [number, Bit][];
  decision: Bit | null;
  /** Whether this process has broadcast its input (the seeded harness starts it on a timeout). */
  sent: boolean;
}
export interface InputMsg {
  type: 'input';
  value: Bit;
}

export interface OneConfig {
  inputs: Inputs;
  mode: Mode;
  rules: RuleSet;
}

const indexOf = (id: string) => PROCS.indexOf(id as (typeof PROCS)[number]);

export function onePhaseProtocol(config: OneConfig, { preSent }: { preSent: boolean }): PureProtocol<OneState, InputMsg> {
  return {
    nodes: PROCS,
    init: (id): OneState => ({ input: config.inputs[indexOf(id)], heard: [], decision: null, sent: preSent }),
    describe: (m) => `input ${m.value}`,
    onTimeout: (id, s) => {
      if (s.sent) return null;
      return { state: { ...s, sent: true }, send: PROCS.filter((p) => p !== id).map((to) => ({ to, payload: { type: 'input', value: s.input } })) };
    },
    onMessage: (id, s, { from, payload }) => {
      const i = indexOf(id);
      const j = indexOf(from);
      if (s.decision !== null || s.heard.some(([f]) => f === j)) return { state: s, send: [] };
      const heard: [number, Bit][] = [...s.heard, [j, payload.value]];
      if (config.mode === 'one') {
        const slot = others(i).indexOf(j);
        return { state: { ...s, heard, decision: config.rules[i][slot][s.input * 2 + payload.value] }, send: [] };
      }
      if (heard.length < 2) return { state: { ...s, heard }, send: [] };
      const all = [s.input, heard[0][1], heard[1][1]];
      return { state: { ...s, heard, decision: all[0] + all[1] + all[2] >= 2 ? 1 : 0 }, send: [] };
    },
  };
}

/** The messages on the wire at the start: every process has already broadcast its input. */
export const startMessages = (inputs: Inputs, silent: number | null = null) =>
  PROCS.flatMap((from, i) => (i === silent ? [] : others(i).map((j) => ({ from, to: PROCS[j], payload: { type: 'input', value: inputs[i] } as InputMsg }))));

export type OneNet = ReturnType<typeof networkExplorer<OneState, InputMsg>>;

/** The explorer for a configuration: messages are consumed on delivery (the multiset network). */
export function oneExplorer(config: OneConfig): OneNet {
  return networkExplorer(onePhaseProtocol(config, { preSent: true }), { network: 'multiset', clientInputs: startMessages(config.inputs) });
}

export const decisionsIn = (states: Record<string, OneState>): (Bit | null)[] => PROCS.map((p) => states[p].decision);

/** Agreement and validity over the decided processes: null while both hold. */
export const safetyOf = (inputs: Inputs) => (states: Record<string, OneState>): string | null => {
  const decided = decisionsIn(states).filter((d): d is Bit => d !== null);
  if (decided.some((d) => d !== decided[0])) return `disagreement: ${PROCS.map((p, i) => `${p} ${decisionsIn(states)[i] ?? 'undecided'}`).join(', ')}`;
  if (inputs.every((b) => b === inputs[0]) && decided.some((d) => d !== inputs[0])) return 'validity: a decision differs from the common input';
  return null;
};
/** The node states of a distSim snapshot, by process id. */
export const statesOf = (snap: Snapshot<OneState>): Record<string, OneState> =>
  Object.fromEntries(PROCS.map((p) => [p, snap.nodes[p].state as OneState]));
/** The safety rule for `forSeeds`: the inputs are read back from the node states, so one rule serves every seed. */
export const agreementRule: Safety<OneState> = (snap) => {
  const states = statesOf(snap);
  return safetyOf(PROCS.map((p) => states[p].input) as unknown as Inputs)(states);
};

/** The shortest schedule that breaks agreement for this configuration (BFS), or null. */
export function shortestDisagreement(config: OneConfig) {
  const net = oneExplorer(config);
  return explore({ ...net, invariant: (s: NetState<OneState, InputMsg>) => safetyOf(config.inputs)(net.nodeStates(s)) });
}

/** Deliveries in an explorer path (the first message heard is the whole story, so this is what "2 deliveries" counts). */
export const deliveriesIn = (path: readonly { label: { kind: string } }[]): number => path.filter((p) => p.label.kind === 'deliver').length;

// ---------- the seeded leg ----------

/** The inputs a seed draws. */
export function seededInputs(seed: number): Inputs {
  const rnd = mulberry32(seed * 2 + 1);
  return [rnd() < 0.5 ? 0 : 1, rnd() < 0.5 ? 0 : 1, rnd() < 0.5 ? 0 : 1];
}

export const LATENCY_MS = { min: 1, max: 10 } as const;
export const SEED_RUN_MS = 100;
/** The seeded runs' search range: seeds 1 to 200. */
export const SEED_RANGE = { from: 1, to: 201 } as const;
export const SEEDS_TOTAL = SEED_RANGE.to - SEED_RANGE.from;

/**
 * A seeded run on `core/distSim`: the seed draws the inputs, and the network latencies (1 to 10 ms) decide who hears
 * whom first. `silent` is a process whose messages never arrive (the adversary delays it for ever, which is a crash).
 */
export function seededScenario(mode: Mode, rules: RuleSet, silent: number | null = null) {
  return (seed: number): Cluster<InputMsg, OneState> => {
    const inputs = seededInputs(seed);
    const cluster = createCluster<InputMsg, OneState>({ seed, nodes: asDistNodes(onePhaseProtocol({ inputs, mode, rules }, { preSent: false })), latency: LATENCY_MS });
    if (silent !== null) cluster.dropWhere((m) => m.from === PROCS[silent], 0, SEED_RUN_MS);
    return cluster;
  };
}

export interface SeededResult {
  /** Seeds whose run broke agreement or validity. */
  failing: number[];
  /** Seeds on which some process had not decided when the run ended. */
  undecided: number;
  seeds: number;
}

export interface SeedRun {
  inputs: Inputs;
  /** What each process had decided when the run ended (null: undecided). */
  decisions: (Bit | null)[];
  /** The first safety message the run broke after any event, or null. */
  broken: string | null;
  /** Some process that was not held back had not decided at the end: the liveness fact. */
  undecided: boolean;
}

/** One seeded run, to the end, checking safety after every event. */
export function runSeed(mode: Mode, rules: RuleSet, seed: number, silent: number | null = null): SeedRun {
  const cluster = seededScenario(mode, rules, silent)(seed);
  const inputs = seededInputs(seed);
  let broken: string | null = null;
  cluster.start();
  for (;;) {
    broken = broken ?? safetyOf(inputs)(statesOf(cluster.snapshot()));
    if (cluster.queued === 0 || cluster.nextTime() > SEED_RUN_MS) break;
    cluster.step();
  }
  const finalStates = statesOf(cluster.snapshot());
  return {
    inputs,
    decisions: PROCS.map((p) => finalStates[p].decision),
    broken,
    undecided: PROCS.some((p, i) => i !== silent && finalStates[p].decision === null),
  };
}

/** Run seeds 1..200 to the end and count; safety is the rule, "undecided at the end" is liveness. */
export function runSeeds(mode: Mode, rules: RuleSet, silent: number | null = null): SeededResult {
  const failing: number[] = [];
  let undecided = 0;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
    const run = runSeed(mode, rules, seed, silent);
    if (run.broken !== null) failing.push(seed);
    if (run.undecided) undecided++;
  }
  return { failing, undecided, seeds: SEEDS_TOTAL };
}

/** The lowest seed on which the timeout protocol (AND rule) breaks agreement: pinned by flp.test.ts against forSeeds. */
export const BROKEN_SEED = 2;
