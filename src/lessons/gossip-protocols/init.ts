/**
 * What each scene opens in (pure, so a test can check no scene leaks into another), the layout of the node grid,
 * and the sentences the captions are built from.
 */
import { decimal } from '../../core/format';
import {
  HORIZON_ROUNDS, defaultMember, defaultSpread, roundsBelow, type MemberSetup, type MembershipReadout, type SpreadRun, type SpreadSetup,
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

export function membershipCaption(setup: MemberSetup, readout: MembershipReadout): string {
  if (setup.crash && readout.detection !== null) {
    return `Node 0 crashed at round 40. The first node suspected it ${readout.firstSuspicion} rounds later and every up node did after ${readout.detection}, with T_fail = ${setup.tFail}.`;
  }
  if (setup.crash) return `Node 0 crashed at round 40 and not every up node suspects it by the end of the run.`;
  if (readout.falsePairs > 0) return `${readout.falsePairs} (observer, node) pair${readout.falsePairs === 1 ? '' : 's'} suspected a node that is up, at T_fail = ${setup.tFail} and fanout ${setup.f}${setup.cut ? ' (the cut causes some of them)' : ''}.`;
  return `No up node suspects an up node: T_fail = ${setup.tFail} rounds outlasts the time a heartbeat counter takes to reach everyone at fanout ${setup.f}.`;
}

export const meanText = (v: number | null): string => (v === null ? 'none completed' : decimal(v, 1));
