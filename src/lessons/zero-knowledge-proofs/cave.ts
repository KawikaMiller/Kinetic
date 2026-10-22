import { mulberry32 } from '../../core/random';

/** The cave: a ring with a door in the middle. The prover enters at the mouth, goes down the left or the right path, and the verifier calls a side. */
export type Side = 'L' | 'R';
export type ProverKind = 'knows' | 'cheater';
/** How the verifier chooses calls: every one by hand, always left, strictly alternating, or from the seeded generator. */
export type Policy = 'manual' | 'always-left' | 'alternate' | 'random';

export const MAX_ROUNDS = 10;
export const SIDE_NAME: Record<Side, string> = { L: 'left', R: 'right' };
export const flip = (s: Side): Side => (s === 'L' ? 'R' : 'L');

/** After n passed rounds an unpredictable verifier is wrong about a cheater with probability 2^-n: the meter reads 1 - 2^-n. */
export const confidence = (rounds: number): number => 1 - 2 ** -rounds;

/** A seeded prover who knows the passphrase or does not (the page reveals which only at the verdict). */
export const proverKind = (seed: number): ProverKind => (mulberry32(seed)() < 0.5 ? 'knows' : 'cheater');

const coin = (seed: number, salt: number, index: number): Side => (mulberry32((seed * 7919 + salt * 104729 + index * 15485863) >>> 0)() < 0.5 ? 'L' : 'R');
const VERIFIER_SALT = 1;
const CHEATER_SALT = 2;

/** The call a policy makes in round `index` (0-based) when it does not ask the learner: alternation starts on left. */
export function policyCall(policy: Policy, index: number, seed: number): Side {
  if (policy === 'always-left') return 'L';
  if (policy === 'alternate') return index % 2 === 0 ? 'L' : 'R';
  return coin(seed, VERIFIER_SALT, index);
}

/** The side a cheating prover guesses the verifier will call: left with no history, else the habit it can see. */
export function predictNext(history: readonly Side[]): Side {
  const n = history.length;
  if (n === 0) return 'L';
  if (n >= 3 && history[n - 1] !== history[n - 2] && history[n - 2] !== history[n - 3]) return flip(history[n - 1]);
  return history[n - 1];
}

/** Whether a call sequence is a simple pattern a predictor can follow: one side throughout, or strictly alternating, over at least 3 calls. */
export function isPattern(calls: readonly Side[]): boolean {
  if (calls.length < 3) return false;
  const constant = calls.every((c) => c === calls[0]);
  const alternating = calls.every((c, i) => i === 0 || c !== calls[i - 1]);
  return constant || alternating;
}

export interface Round {
  call: Side;
  /** The side the prover went in: a cheater's guess; a prover who knows the passphrase can come out either way. */
  entered: Side | null;
  passed: boolean;
}

/** The prover's answers to the verifier's calls. A cheater's side is a causal guess from the policy or the history, never from the future. */
export function answers(kind: ProverKind, seed: number, calls: readonly Side[], policy: Policy): Round[] {
  return calls.map((call, i) => {
    if (kind === 'knows') return { call, entered: null, passed: true };
    const entered =
      policy === 'always-left' ? 'L'
      : policy === 'alternate' ? policyCall('alternate', i, seed)
      : policy === 'manual' ? predictNext(calls.slice(0, i))
      : coin(seed, CHEATER_SALT, i);
    return { call, entered, passed: entered === call };
  });
}

export interface Meter {
  /** Rounds passed in a row from the start. */
  passed: number;
  failedAt: number | null;
  value: number;
  /** True when the calls follow a pattern: the meter assumes unpredictable challenges, and these were not. */
  struck: boolean;
}

export function meter(rounds: readonly Round[]): Meter {
  const failed = rounds.findIndex((r) => !r.passed);
  const passed = failed < 0 ? rounds.length : failed;
  return { passed, failedAt: failed < 0 ? null : failed + 1, value: confidence(passed), struck: isPattern(rounds.map((r) => r.call)) };
}

export interface Verdict {
  kind: ProverKind;
  accepted: boolean;
  correct: boolean;
}

export const verdict = (kind: ProverKind, accepted: boolean): Verdict => ({ kind, accepted, correct: accepted === (kind === 'knows') });

/* ── the cheater's side of the cave ───────────────────────────────────────── */

export interface CheaterGame {
  /** Round at which the cheater was caught (1-based), or null while it survives. */
  caughtAt: number | null;
  survived: number;
}

/** You choose the side to enter each round; the seeded verifier calls a random side; the first mismatch ends the game. */
export function cheaterGame(seed: number, entered: readonly Side[]): CheaterGame {
  for (let i = 0; i < entered.length; i++) {
    if (entered[i] !== coin(seed, VERIFIER_SALT, i)) return { caughtAt: i + 1, survived: i };
  }
  return { caughtAt: null, survived: entered.length };
}

export const verifierCall = (seed: number, index: number): Side => coin(seed, VERIFIER_SALT, index);

export interface Survival {
  games: number;
  rounds: number;
  survived: number;
  expected: number;
  sigma: number;
  withinThreeSigma: boolean;
}

/** `games` seeded games in which a cheater guesses a side each round: how many survive `rounds` rounds, against games / 2^rounds. */
export function survival(seed: number, rounds: number, games: number): Survival {
  const guess = mulberry32(seed + 17);
  const call = mulberry32(seed + 29);
  let survived = 0;
  for (let g = 0; g < games; g++) {
    let alive = true;
    for (let i = 0; i < rounds; i++) {
      if ((guess() < 0.5) !== (call() < 0.5)) alive = false;
    }
    if (alive) survived++;
  }
  const p = 2 ** -rounds;
  const expected = games * p;
  const sigma = Math.sqrt(games * p * (1 - p));
  return { games, rounds, survived, expected, sigma, withinThreeSigma: Math.abs(survived - expected) <= 3 * sigma };
}
