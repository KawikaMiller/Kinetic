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

/** The side a cheating prover guesses the verifier will call: left with no history, else the side called last (a habit it can see). It never looks ahead. */
export function predictNext(history: readonly Side[]): Side {
  return history.length === 0 ? 'L' : history[history.length - 1];
}

/** The shortest run of identical or strictly alternating calls the page flags as a pattern. */
export const PATTERN_MIN = 6;

/** Whether a call sequence is a run the cheater's habit-follower can ride: one side throughout, or strictly alternating, over at least PATTERN_MIN calls. */
export function isPattern(calls: readonly Side[]): boolean {
  if (calls.length < PATTERN_MIN) return false;
  const constant = calls.every((c) => c === calls[0]);
  const alternating = calls.every((c, i) => i === 0 || c !== calls[i - 1]);
  return constant || alternating;
}

/** The chance that n fair random calls are flagged: 4 of the 2^n sequences (two constant, two alternating) for n >= 2, so 2^-(n-2). */
export const patternFalseAlarm = (n: number): number => (n < PATTERN_MIN ? 0 : 2 ** -(n - 2));

export interface Round {
  call: Side;
  /** The side the prover went in: a cheater's guess; a prover who knows the passphrase can come out either way. */
  entered: Side | null;
  passed: boolean;
}

/** The prover's answers to the verifier's calls. A cheater's side is a causal guess from the history (or a seeded coin for the random policy), never from the future or from the declared policy. */
export function answers(kind: ProverKind, seed: number, calls: readonly Side[], policy: Policy): Round[] {
  return calls.map((call, i) => {
    if (kind === 'knows') return { call, entered: null, passed: true };
    const entered = policy === 'random' ? coin(seed, CHEATER_SALT, i) : predictNext(calls.slice(0, i));
    return { call, entered, passed: entered === call };
  });
}

/** The calls after the verifier presses a call button: nothing is appended once ten rounds are played, a verdict is in, or the prover has been caught (calls stop at the failure; reset starts a new run). */
export function appendCall(kind: ProverKind, seed: number, policy: Policy, calls: readonly Side[], side: Side, decided: boolean): readonly Side[] {
  if (decided || calls.length >= MAX_ROUNDS || meter(answers(kind, seed, calls, policy)).failedAt !== null) return calls;
  return [...calls, side];
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

/** The verifier-side caption, derived from the whole state: the failure round wins over the last round, and the meter is quoted only while the prover is still passing. */
export function verifierCaption(kind: ProverKind, rounds: readonly Round[], accepted: boolean | null): string {
  const m = meter(rounds);
  const n = rounds.length;
  const caught = m.failedAt === null ? null : rounds[m.failedAt - 1];
  if (accepted !== null) {
    const v = verdict(kind, accepted);
    const tail =
      caught ? ` It was caught in round ${m.failedAt}.`
      : kind === 'cheater' && m.struck ? ` The meter assumes your challenges are unpredictable; yours were not, and this prover cheated and passed ${m.passed} of ${n}.`
      : '';
    return `${accepted ? 'You accepted' : 'You rejected'}: the prover ${kind === 'knows' ? 'knew the passphrase' : 'was a cheater'}, so you were ${v.correct ? 'right' : 'wrong'}.${tail}`;
  }
  if (n === 0) return 'Call a side each round; a prover who knows the passphrase can always come out of it. Then accept or reject.';
  if (caught) return `Round ${m.failedAt}: the prover could not come out of the ${SIDE_NAME[caught.call]} path, so it does not know the passphrase. Calls stop at the catch (Reset starts a new run); you can still accept or reject.`;
  const base = `${n} round${n === 1 ? '' : 's'} passed: the meter reads ${m.value}`;
  return m.struck
    ? `${base}, but your ${n} calls are one side or strictly alternating, so the meter does not apply: a cheater who follows that habit passes them all.`
    : `${base}, assuming your calls were unpredictable.`;
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
