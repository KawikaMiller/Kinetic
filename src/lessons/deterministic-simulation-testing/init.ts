/** What each scene opens in (pure) and the sentences its captions are built from. */
import type { SeedsResult } from '../../core/distSim';
import { integer, pctText } from '../../core/format';
import type { BookMsg } from './booking';
import {
  BROKEN_SEED, HUNT_N, LOSS, WINDOW, boundaryOf, expectedTries, failureProbability, type Exhaustive, type Hunt, type LiveHunt,
} from './model';

export interface HuntState {
  windowMs: number;
  loss: number;
  n: number;
  start: number;
  /** False until the learner presses Hunt: nothing has run. */
  ran: boolean;
  /** The failing seed the learner picked, or null for the first one. */
  selected: number | null;
  /** Trace hashes of "Replay seed" and "Replay again" for the selected seed. */
  replays: (string | null)[];
}
export const initialHunt = (): HuntState => ({ windowMs: WINDOW.default, loss: LOSS.default, n: HUNT_N.default, start: 1, ran: false, selected: null, replays: [null, null] });

export interface MoveState {
  seed: number;
  gap: number;
  requestA: boolean;
  requestB: boolean;
  dropReplicate: boolean;
  /** The traced boundary stays hidden until the learner asks, so finding where the verdict flips is a task and not a read-out. */
  reveal: boolean;
}
export const DEFAULT_GAP = 0;
export const initialMove = (): MoveState => ({ seed: BROKEN_SEED, gap: DEFAULT_GAP, requestA: true, requestB: true, dropReplicate: false, reveal: false });

export interface LeakState {
  leak: boolean;
  fix: boolean;
  seed: number;
  /** Trace hashes of single replays, newest last. */
  replays: string[];
  /** The last "replay 20 times": runs that matched the first, and runs that failed. */
  twenty: { agree: number; failed: number } | null;
  /** The last seeded-versus-live comparison. */
  compare: { seeded: { tries: number | null; replayed: number }; live: LiveHunt & { replayed: number } } | null;
  /** The last hunt on the current mode: failures out of N. */
  fixHunt: { failures: number; n: number } | null;
}
export const FIX_HUNT_N = 200;
export const initialLeak = (): LeakState => ({ leak: false, fix: false, seed: BROKEN_SEED, replays: [], twenty: null, compare: null, fixHunt: null });

export type ExhaustiveState = { mode: 'async' | 'single-writer' };
export const initialExhaustive = (): ExhaustiveState => ({ mode: 'async' });

/** The leak scene's opening sentence: whether the seed oversells comes from the run, and the replay claim is scoped to "almost every". */
export function leakIntro(seed: number, failed: boolean, leak: boolean, fix: boolean): string {
  const verdict = failed ? `Seed ${seed} oversells with independent grants.` : fix ? `Seed ${seed} passes, because all bookings go through r1, which alone grants.` : `Seed ${seed} passes with independent grants (${pctText(1 - failureProbability(WINDOW.default, 0), 0)} of seeds pass at a window of ${WINDOW.default} ms).`;
  const replay = leak ? 'With ambient randomness on, a node reads a counter that outlives the run, so almost every replay is a different run.' : 'The seed is the whole input, so a replay is the same run.';
  return `${verdict} ${replay}`;
}

export const randomText = 'a stand-in for ambient nondeterminism: a module-level counter that is not reset between runs (lesson source may not call the clock or an unseeded random generator, so this is the labelled stand-in)';

export function selectedSeed(s: HuntState, h: Hunt | null): number | null {
  return s.selected ?? h?.failures[0] ?? null;
}

export function huntCaption(s: HuntState, h: Hunt | null): string {
  const exact = pctText(failureProbability(s.windowMs, s.loss), 1);
  if (!s.ran || h === null) return `Two clients book one seat on two replicas; the seed decides when each request arrives, how long each replicate message takes and which are lost. Press Hunt to try ${integer(s.n)} seeds; the exact chance a seed fails is ${exact}.`;
  if (h.failures.length === 0) return `${integer(h.count)} schedules passed. That says nothing about the schedules not tried; the exact chance a seed fails is ${exact}.`;
  return `Seed ${h.failures[0]} is the first to oversell, after ${h.triesToFirst} tried (the exact mean wait is ${expectedTries(s.windowMs, s.loss).toFixed(2)}). ${h.failures.length} of ${integer(h.count)} seeds fail, sampled, against the exact ${exact}.`;
}

/** What editing the fault list did: the unedited schedule's verdict against the edited one. */
export function editedLabel(baselineFailed: boolean, failed: boolean): string {
  if (baselineFailed) return failed ? 'still fails' : 'now passes';
  return failed ? 'now fails' : 'still passes';
}

export function moveCaption(m: MoveState, failed: boolean, baselineFailed: boolean, replicate: { delayMs: number | null; dropped: boolean }): string {
  const verdict = `At a gap of ${m.gap} ms: ${failed ? 'both clients are granted the seat' : 'only one client is granted the seat'}.`;
  if (!m.requestA || !m.requestB) return `${verdict} Only one booking is in the schedule, so there is no race: one grant is all there can be, whatever the gap.`;
  const edit = m.dropReplicate ? ` Every replicate from r1 is dropped in this schedule, which ${failed && !baselineFailed ? 'is what makes it fail: the edit caused the failure' : failed ? 'is not needed for this failure' : 'does not matter here because B is first'}.` : '';
  if (!m.reveal) return `${verdict}${edit} Move the gap to find where the verdict flips; the traced boundary is hidden until you press Show the boundary.`;
  if (replicate.dropped) return `${verdict}${edit} The replicate was dropped, so no delay applies to it.`;
  if (replicate.delayMs === null) return `${verdict}${edit} No replicate message was sent in this run.`;
  const d = replicate.delayMs.toFixed(2);
  return `${verdict}${edit} The earlier request's replicate takes ${d} ms (read from this run's trace), so any gap under ${d} ms oversells, in a failing run and a passing one alike.`;
}

/** Sub-line of the replicate-delay stat: the two boundaries only once the learner has asked to see them. */
export const delaySub = (m: Pick<MoveState, 'reveal' | 'seed'>): string => (m.reveal ? `this seed: ${boundaryText(m.seed)}` : 'hidden: find where the verdict flips, then press Show the boundary');

export const boundaryText = (seed: number): string => `${boundaryOf(seed, 1).toFixed(2)} ms when A is first, ${boundaryOf(seed, -1).toFixed(2)} ms when B is first`;

/** What the exhaustive check ran and found, in the lesson's fixed phrasings (AC-0/T4 #27, #28). */
export function exhaustiveText(ex: Exhaustive): string {
  if (ex.violation) return `Shortest counterexample: ${ex.violation.path.length} steps (breadth-first, so no shorter schedule breaks the rule in this model); ${integer(ex.states)} states visited before it was found.`;
  if (ex.truncated) return `No violation in the first ${integer(ex.states)} states explored; not exhaustive.`;
  return `Holds in all ${integer(ex.states)} reachable states of this model: two replicas, the two bookings, every delivery order, any message lost or delivered twice.`;
}

export function seededText(r: SeedsResult<BookMsg>, seeds = 200): string {
  return r.ok
    ? `${integer(r.seeds)} schedules passed (seeds 1 to ${seeds}, with 10% loss and 15% duplication); sampled, not exhaustive.`
    : `Fails on seed ${r.seed}: ${r.message} (the lowest failing seed of the ${seeds} tried, with 10% loss and 15% duplication, so it can differ from the Hunt scene's lowest seed; sampled).`;
}
