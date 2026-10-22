/**
 * What each scene opens in (pure, so a test can check no scene leaks into another), the layout of the node grid,
 * and the sentences the captions are built from.
 */
import { decimal, integer, pctText } from '../../core/format';
import {
  HORIZON_ROUNDS, MEMBER_SAFETY_CHECK, SPREAD_SAFETY_CHECK, SWEEP_SEEDS, defaultMember, defaultSpread, roundsBelow, type MemberSetup, type MembershipReadout, type MembershipRun,
  type SpreadRun, type SpreadSetup, type SpreadSweep,
} from './model';

export interface SpreadState {
  setup: SpreadSetup;
  /** The round the grid and the plot show. */
  round: number;
}
export const initialSpread = (): SpreadState => ({ setup: defaultSpread(), round: 0 });

export interface TheoryState {
  n: number;
  /** Measured mean rounds per cluster size, once the learner asked for it. */
  measured: { n: number; mean: number }[] | null;
}
export const THEORY_SIZES = [16, 64, 256] as const;
export const MEASURE_SIZES = [8, 16, 32, 64, 128, 256] as const;
export const initialTheory = (): TheoryState => ({ n: 16, measured: null });

export interface MemberState {
  setup: MemberSetup;
  round: number;
}
export const MEMBER_START_ROUND = 60;
export const initialMember = (): MemberState => ({ setup: defaultMember(), round: MEMBER_START_ROUND });

/** Rows and columns that lay n nodes out as a near-square grid. */
export function gridShape(n: number): { rows: number; cols: number } {
  const cols = Math.min(16, Math.ceil(Math.sqrt(n)));
  return { rows: Math.ceil(n / cols), cols };
}

export function spreadCaption(run: SpreadRun, round: number): string {
  const { n } = run.setup;
  const at = Math.min(round, run.counts.length - 1);
  const known = run.counts[at];
  const expected = roundsBelow(run.setup);
  if (at === 0) return `One node of ${n} knows the rumour. Each round it tells ${run.setup.f} random node${run.setup.f === 1 ? '' : 's'}${run.setup.mode === 'push' ? '' : run.setup.mode === 'pull' ? ' and every uninformed node asks f random nodes' : ', and every uninformed node asks too'}. Press Step one round.`;
  if (run.completeAt !== null && at >= run.completeAt) return `After round ${run.completeAt} all ${n} nodes know it. The expectation falls below half a node at round ${expected ?? 'later than 200'}.`;
  if (at >= run.counts.length - 1) return `Round ${at}: ${n - known} node${n - known === 1 ? '' : 's'} never heard it by the horizon of ${HORIZON_ROUNDS} rounds.`;
  return `After round ${at}: ${known} of ${n} nodes know the rumour (${n - known} do not yet).`;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function membershipCaption(setup: MemberSetup, readout: MembershipReadout): string {
  const falsePart =
    readout.falsePairs > 0
      ? `${readout.falsePairs} (observer, node) pair${plural(readout.falsePairs, '', 's')} suspected a node that is up, at T_fail = ${setup.tFail} and fanout ${setup.f}${setup.cut ? ' (the cut may account for some of them)' : ''}.`
      : '';
  if (setup.crash && readout.detection !== null) {
    return `Node 0 crashed at round 40. The first node suspected it ${readout.firstSuspicion} rounds later and every up node did after ${readout.detection}, with T_fail = ${setup.tFail}. ${falsePart}`.trim();
  }
  if (setup.crash) return `Node 0 crashed at round 40 and not every up node suspects it by the end of the run. ${falsePart}`.trim();
  if (falsePart !== '') return falsePart;
  return `No up node suspects an up node: T_fail = ${setup.tFail} rounds outlasts the time a heartbeat counter takes to reach everyone at fanout ${setup.f}.`;
}

/** Sub-line for the live-suspicion stat: says the cut is involved only when something was suspected. */
export const falsePairsSub = (setup: Pick<MemberSetup, 'cut'>, falsePairs: number): string =>
  setup.cut ? (falsePairs > 0 ? 'observer-node pairs, ever (the cut may account for some)' : 'observer-node pairs, ever (the cut caused none)') : 'observer-node pairs, ever';

/** The matrix draws at most this many nodes a side: past it each cell is a few pixels on a phone. */
export const MATRIX_MAX_NODES = 32;

/** Suspicions between observers and nodes that the capped matrix does not draw, at one round. */
export function undrawnSuspicions(run: MembershipRun, round: number, shown = MATRIX_MAX_NODES): number {
  let hidden = 0;
  run.suspectsByRound[round].forEach((list, i) => {
    for (const j of list) if (i >= shown || j >= shown) hidden += 1;
  });
  return hidden;
}

export const matrixCapText = (n: number, hidden: number, shown = MATRIX_MAX_NODES): string =>
  `Drawn: the first ${shown} of ${n} nodes (rows and columns). The other ${n - shown} are counted, not drawn: ${integer(hidden)} suspicion${plural(hidden, '', 's')} involving them at this round.`;

export const memberSafetyText = (): string => {
  const c = MEMBER_SAFETY_CHECK;
  return `Safety (no table holds a counter above its owner's, and none goes down): checked on every event in ${c.runs} seeded runs of ${c.n} nodes with ${pctText(c.loss, 0)} loss, ${pctText(c.duplicate, 0)} duplication, a crash and a cut, ${c.rounds} rounds each. Sampled over ${c.runs} seeds, not exhaustive; the lesson's tests ran it, this page does not rerun it.`;
};

export const spreadSafetyText = (): string => {
  const c = SPREAD_SAFETY_CHECK;
  return `Safety (a node holds only a version somebody wrote, and never a lower one): checked on every event in ${c.runs} seeded runs for each of the ${c.combinations} mode and infect-and-die combinations, ${c.n} nodes, fanout ${c.f}, ${pctText(c.duplicate, 0)} duplication, one crash and one partition. Sampled, not exhaustive; the lesson's tests ran it, this page does not rerun it.`;
};

/** Sub-lines for the measured-mean stat: says the mean is over the seeds that covered everyone, and that another set of seeds moves it. */
export const sweepSub = (sweep: Pick<SpreadSweep, 'completed' | 'failed'>): string[] => [
  `mean rounds over the ${sweep.completed} seeds that covered everyone (seeds 1 to ${SWEEP_SEEDS}, sampled; another ${SWEEP_SEEDS} seeds can move it a little)`,
  `fails to cover everyone by round ${HORIZON_ROUNDS} on ${sweep.failed} of ${SWEEP_SEEDS} seeds`,
];

/** The note under the log-n plot: the offset from the reference as measured (it varies a little with n), and what the sample is. */
export function offsetNote(measured: readonly { n: number; mean: number }[], reference: (n: number) => number): string {
  const offsets = measured.map((m) => m.mean - reference(m.n));
  const list = measured.map((m, k) => `${decimal(offsets[k] ?? 0, 2)} at n = ${m.n}`).join(', ');
  return `Measured minus reference: ${list}. That is between ${decimal(Math.min(...offsets), 2)} and ${decimal(Math.max(...offsets), 2)} rounds at these sizes, so the offset is about one round and bounded, not exactly constant. The dots are means over seeds 1 to ${SWEEP_SEEDS}; another ${SWEEP_SEEDS} seeds can move each by a fraction of a round.`;
}

export const meanText = (v: number | null): string => (v === null ? 'none completed' : decimal(v, 1));
