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
}
export const DEFAULT_GAP = 0;
export const initialMove = (): MoveState => ({ seed: BROKEN_SEED, gap: DEFAULT_GAP, requestA: true, requestB: true, dropReplicate: false });

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

export function moveCaption(m: MoveState, failed: boolean, delayMs: number | null): string {
  const rule = delayMs === null ? 'No replicate message was delivered in this run, so nothing tells the second replica about the first booking.' : `This seed oversells when the later request arrives before the earlier one's replicate does: that replicate took ${delayMs.toFixed(2)} ms, so any gap under ${delayMs.toFixed(2)} ms oversells.`;
  return `At a gap of ${m.gap} ms: ${failed ? 'both clients are granted the seat' : 'only one client is granted the seat'}. ${rule}`;
}

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
    : `Fails on seed ${r.seed}: ${r.message} (the lowest failing seed of the ${seeds} tried, sampled).`;
}
