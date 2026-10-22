/**
 * flp-impossibility, scene 2 and 3(b): a deterministic crash-tolerant protocol in the style of Ben-Or's, without its
 * coin, for n = 3 and f = 1. A round has two phases. Phase 1: each process takes any two of the three estimates
 * (its own included) and proposes v if the two are equal, bottom otherwise. Phase 2: it takes any two of the three
 * proposals; two equal non-bottom proposals decide that value (and adopt it), any non-bottom proposal is adopted, and
 * otherwise it keeps its own estimate (the coin variant flips a coin instead). Late messages are ignored.
 *
 * The scheduler picks which two messages each process takes: that choice is the whole adversary.
 */
import { explore, type ActionLabel } from '../../core/explore';
import { mulberry32 } from '../../core/random';
import { PROCS, type Bit, type Inputs } from './onePhase';
import { propagateValency, type Valency } from './valency';

export type Prop = Bit | null;
export const PROCESS_COUNT = 3;
export const TAKES_PER_PHASE = 2;

export interface RProc {
  /** The round in progress (1-based). */
  round: number;
  phase: 1 | 2;
  est: Bit;
  /** The estimate broadcast at the start of each round started so far. */
  estHist: Bit[];
  /** The proposal broadcast at the end of phase 1 of each round, bottom as null. */
  propHist: Prop[];
  /** Messages taken in the current phase: [from, value]. */
  taken: [number, Prop][];
  decision: Bit | null;
  /** Finished the last round of the horizon. */
  done: boolean;
}
export interface RState {
  procs: RProc[];
}
export type Coin = (process: number, round: number) => Bit;

export function initialState(estimates: readonly Bit[], decisions: readonly (Bit | null)[] = [null, null, null]): RState {
  return { procs: estimates.map((est, i) => ({ round: 1, phase: 1, est, estHist: [est], propHist: [], taken: [], decision: decisions[i], done: false })) };
}

export type Take = { ok: true; state: RState } | { ok: false; reason: string };

/** The message of process `j` that a process in (round, phase) could take now, or why there is none. */
function available(from: RProc, name: string, round: number, phase: 1 | 2): { ok: true; value: Prop } | { ok: false; reason: string } {
  if (phase === 1) return from.estHist.length >= round ? { ok: true, value: from.estHist[round - 1] } : { ok: false, reason: `${name} has not started round ${round} yet.` };
  return from.propHist.length >= round ? { ok: true, value: from.propHist[round - 1] } : { ok: false, reason: `${name} has not sent its round ${round} proposal yet.` };
}

/** Process `i` takes the current-phase message of process `j`; the second take applies the phase rule. */
export function take(state: RState, i: number, j: number, horizon: number, coin?: Coin): Take {
  const p = state.procs[i];
  if (p.done) return { ok: false, reason: `${PROCS[i]} finished round ${horizon}.` };
  if (p.taken.some(([from]) => from === j)) return { ok: false, reason: `${PROCS[i]} already took ${PROCS[j]}'s message in this phase.` };
  const msg = available(state.procs[j], PROCS[j], p.round, p.phase);
  if (!msg.ok) return msg;
  const taken: [number, Prop][] = [...p.taken, [j, msg.value]];
  let next: RProc = { ...p, taken };
  if (taken.length === TAKES_PER_PHASE) next = finishPhase(next, i, horizon, coin);
  return { ok: true, state: { procs: state.procs.map((q, k) => (k === i ? next : q)) } };
}

function finishPhase(p: RProc, i: number, horizon: number, coin?: Coin): RProc {
  const [a, b] = [p.taken[0][1], p.taken[1][1]];
  if (p.phase === 1) return { ...p, phase: 2, taken: [], propHist: [...p.propHist, a === b ? a : null] };
  let est = p.est;
  let decision = p.decision;
  if (a !== null && a === b) {
    est = a;
    decision = decision ?? a;
  } else if (a !== null || b !== null) {
    est = (a ?? b) as Bit;
  } else if (coin) {
    est = coin(i, p.round);
  }
  const round = p.round + 1;
  const done = round > horizon;
  return { ...p, est, decision, taken: [], round, phase: 1, done, estHist: done ? p.estHist : [...p.estHist, est] };
}

/** Every take the scheduler may make next, in a fixed order. */
export function takes(state: RState, horizon: number): { label: ActionLabel; next: RState }[] {
  const out: { label: ActionLabel; next: RState }[] = [];
  state.procs.forEach((p, i) => {
    PROCS.forEach((_, j) => {
      const t = take(state, i, j, horizon);
      if (t.ok) out.push({ label: { actor: PROCS[i], text: `${PROCS[i]} takes ${PROCS[j]}'s phase-${p.phase} message` }, next: t.state });
    });
  });
  return out;
}

// ---------- one round, chosen in advance ----------

/** The two sources a process takes in a phase, ascending. */
export type Pair = readonly [number, number];
export const PAIRS: readonly Pair[] = [[0, 1], [0, 2], [1, 2]];
export interface RoundChoices {
  phase1: readonly Pair[];
  phase2: readonly Pair[];
}
/**
 * The witness: P0 takes {P0, P2}, P1 takes {P1, P2}, P2 takes {P2, P0}, in both phases. From inputs 0 0 1 every
 * process proposes bottom, nobody decides and every estimate is unchanged.
 */
export const RING: readonly Pair[] = [[0, 2], [1, 2], [0, 2]];
export const CYCLE_WITNESS: RoundChoices = { phase1: RING, phase2: RING };
/** Deliveries in one round: 3 processes x 2 takes x 2 phases. */
export const DELIVERIES_PER_ROUND = PROCESS_COUNT * TAKES_PER_PHASE * 2;

export interface Configuration {
  est: Bit[];
  decision: (Bit | null)[];
}
export interface RoundOutcome {
  proposals: Prop[];
  after: Configuration;
}

/** Play one whole round: every process finishes phase 1, then phase 2, taking the chosen pairs. */
export function playRound(before: Configuration, choices: RoundChoices, coin?: Coin): RoundOutcome {
  let state = initialState(before.est, before.decision);
  const apply = (i: number, j: number) => {
    const t = take(state, i, j, 1, coin);
    if (!t.ok) throw new Error(t.reason);
    state = t.state;
  };
  for (const phase of [choices.phase1, choices.phase2]) PROCS.forEach((_, i) => phase[i].forEach((j) => apply(i, j)));
  return {
    proposals: state.procs.map((p) => p.propHist[0]),
    after: { est: state.procs.map((p) => p.est), decision: state.procs.map((p) => p.decision) },
  };
}

export const sameConfiguration = (a: Configuration, b: Configuration): boolean =>
  a.est.every((e, i) => e === b.est[i]) && a.decision.every((d, i) => d === b.decision[i]);

/** Every one of the 3^6 = 729 round schedules (a pair per process per phase). */
export function allChoices(): RoundChoices[] {
  const out: RoundChoices[] = [];
  const triples = PAIRS.flatMap((a) => PAIRS.flatMap((b) => PAIRS.map((c) => [a, b, c] as const)));
  for (const phase1 of triples) for (const phase2 of triples) out.push({ phase1, phase2 });
  return out;
}

/** The round schedules that leave everybody undecided and every estimate unchanged, from `est`. */
export function cyclingChoices(est: readonly Bit[]): RoundChoices[] {
  const start: Configuration = { est: [...est], decision: [null, null, null] };
  return allChoices().filter((c) => sameConfiguration(playRound(start, c).after, start));
}

/** The round Assist loads: the known ring when it cycles from these inputs, else the first cycling round found, else none. */
export function assistChoices(est: readonly Bit[]): RoundChoices | null {
  const cycling = cyclingChoices(est);
  const ring = cycling.find((c) => JSON.stringify(c) === JSON.stringify(CYCLE_WITNESS));
  return ring ?? cycling[0] ?? null;
}

export const pairText = (pair: Pair): string => `{${PROCS[pair[0]]}, ${PROCS[pair[1]]}}`;

/** A choice grid cell: which sources a process has picked in a phase, capped at two. */
export type Picks = readonly (readonly number[])[];
export const pinnedTakeRefusal = (i: number): string => `${PROCS[i]} already took ${TAKES_PER_PHASE} messages in this phase and moved on; late messages are ignored in this toy.`;

/** Toggle `source` in the picks of one cell: a third pick is refused with the pinned text. */
export function togglePick(picks: readonly number[], i: number, source: number): { ok: true; picks: number[] } | { ok: false; reason: string } {
  if (picks.includes(source)) return { ok: true, picks: picks.filter((s) => s !== source) };
  if (picks.length >= TAKES_PER_PHASE) return { ok: false, reason: pinnedTakeRefusal(i) };
  return { ok: true, picks: [...picks, source].sort((a, b) => a - b) };
}

/** The grid as choices, once every cell holds exactly two picks. */
export function choicesFromGrid(phase1: Picks, phase2: Picks): RoundChoices | null {
  const full = (g: Picks) => g.length === PROCESS_COUNT && g.every((c) => c.length === TAKES_PER_PHASE);
  if (!full(phase1) || !full(phase2)) return null;
  return { phase1: phase1.map((c) => [c[0], c[1]] as Pair), phase2: phase2.map((c) => [c[0], c[1]] as Pair) };
}

// ---------- the coin ----------

export const COIN_ROUNDS = 8;
export const COIN_SEEDS = 1000;

/** Exact probability that nobody has decided after round r (r = 1..rounds) under a fixed schedule and fair coins: DP over estimate vectors. */
export function undecidedProbabilities(est0: readonly Bit[], choices: RoundChoices, rounds: number): number[] {
  let dist = new Map<string, number>([[est0.join(''), 1]]);
  const out: number[] = [];
  for (let r = 1; r <= rounds; r++) {
    const next = new Map<string, number>();
    for (const [key, mass] of dist) {
      const est = [...key].map(Number) as Bit[];
      for (let c = 0; c < 8; c++) {
        const coins: Bit[] = [(c >> 2) & 1, (c >> 1) & 1, c & 1] as Bit[];
        const o = playRound({ est, decision: [null, null, null] }, choices, (i) => coins[i]);
        if (o.after.decision.some((d) => d !== null)) continue;
        const k = o.after.est.join('');
        next.set(k, (next.get(k) ?? 0) + mass / 8);
      }
    }
    dist = next;
    out.push([...dist.values()].reduce((a, b) => a + b, 0));
  }
  return out;
}

/** How many of seeds 1..`seeds` are still undecided after each round 1..rounds (seeded fair coins, same fixed schedule). */
export function undecidedCounts(est0: readonly Bit[], choices: RoundChoices, rounds: number, seeds: number): number[] {
  const counts = Array.from({ length: rounds }, () => 0);
  for (let seed = 1; seed <= seeds; seed++) {
    const rnd = mulberry32(seed);
    let est = [...est0];
    let decided = false;
    for (let r = 1; r <= rounds && !decided; r++) {
      const coins: Bit[] = [rnd() < 0.5 ? 0 : 1, rnd() < 0.5 ? 0 : 1, rnd() < 0.5 ? 0 : 1];
      const o = playRound({ est, decision: [null, null, null] }, choices, (i) => coins[i]);
      decided = o.after.decision.some((d) => d !== null);
      est = o.after.est;
      if (!decided) counts[r - 1]++;
    }
  }
  return counts;
}

// ---------- the exhaustive search ----------

export const EXHAUSTIVE_ROUNDS = 2;

export interface ExhaustiveResult {
  states: number;
  truncated: boolean;
  /** Reachable states in which two processes decided different values. */
  disagreements: number;
  /** Terminal states (every process finished the horizon) and how many of them still have an undecided process. */
  terminal: number;
  terminalUndecided: number;
  valency: Valency;
}

export const decidedIn = (s: RState): Bit[] => s.procs.map((p) => p.decision).filter((d): d is Bit => d !== null);

/** Explore every schedule of takes for `inputs` up to `horizon` rounds. */
export function exhaustive(inputs: Inputs, horizon: number): ExhaustiveResult {
  const result = explore<RState, ActionLabel>({
    init: initialState(inputs),
    actions: (s) => takes(s, horizon),
    key: (s) => JSON.stringify(s.procs),
    graph: true,
  });
  const graph = result.graph!;
  let disagreements = 0;
  let terminal = 0;
  let terminalUndecided = 0;
  graph.states.forEach((s, i) => {
    const decided = decidedIn(s);
    if (decided.includes(0) && decided.includes(1)) disagreements++;
    if (graph.edges[i].length === 0) {
      terminal++;
      if (s.procs.some((p) => p.decision === null)) terminalUndecided++;
    }
  });
  const analysis = propagateValency(graph, decidedIn);
  return { states: result.states, truncated: result.truncated, disagreements, terminal, terminalUndecided, valency: analysis.valency };
}

// ---------- scene 2 helpers ----------

export const START_INPUTS: Inputs = [0, 0, 1];
export const MAX_REPEATS = 50;

/** The configuration after each of `repeats` rounds under one fixed schedule, stopping at the first decision. */
export function repeatRounds(start: Configuration, choices: RoundChoices, repeats: number): { rounds: RoundOutcome[]; decidedIn: number | null } {
  const rounds: RoundOutcome[] = [];
  let now = start;
  for (let r = 1; r <= repeats; r++) {
    const outcome = playRound(now, choices);
    rounds.push(outcome);
    now = outcome.after;
    if (now.decision.some((d) => d !== null)) return { rounds, decidedIn: r };
  }
  return { rounds, decidedIn: null };
}

/** The exhaustive facts for one horizon, memoised per (inputs, horizon) because each search visits tens of thousands of states. */
const searchMemo = new Map<string, ExhaustiveResult>();
export function searchFor(inputs: Inputs, horizon: number): ExhaustiveResult {
  const key = `${inputs.join('')}|${horizon}`;
  const hit = searchMemo.get(key);
  if (hit) return hit;
  const result = exhaustive(inputs, horizon);
  searchMemo.set(key, result);
  return result;
}
