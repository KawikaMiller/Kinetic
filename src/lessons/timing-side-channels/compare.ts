/**
 * Two lesson-authored comparison functions with a counter inside the real code. The counts are deterministic: this file
 * measures nothing and reads no clock. The token is a fixed fake, assembled from parts so no source line is credential-shaped.
 */
import { fakeSecret } from '../../core/fakeSecret';

export const SECRET_TEXT = fakeSecret('demo-', 'tok-', '7Hq2zX9');
export const SECRET_BYTES: readonly number[] = [...new TextEncoder().encode(SECRET_TEXT)];
export const MAX_GUESS_BYTES = 16;

export interface Comparison {
  /** The function's answer. */
  equal: boolean;
  /** Byte comparisons the function executed, counted by an instrument inside it. */
  comparisons: number;
  /** The function stopped at the length check, before comparing any byte. */
  lengthMismatch: boolean;
  /** The byte positions the function looked at, in order. */
  visited: number[];
}

/** Returns at the first mismatching byte. The length check comes first and is not a byte comparison. */
export function earlyExitCompare(secret: readonly number[], guess: readonly number[]): Comparison {
  const visited: number[] = [];
  if (secret.length !== guess.length) return { equal: false, comparisons: 0, lengthMismatch: true, visited };
  for (let i = 0; i < secret.length; i++) {
    visited.push(i);
    if (secret[i] !== guess[i]) return { equal: false, comparisons: visited.length, lengthMismatch: false, visited };
  }
  return { equal: true, comparisons: visited.length, lengthMismatch: false, visited };
}

/** Visits every byte, accumulates the differences with OR, and tests once at the end. */
export function constantTimeCompare(secret: readonly number[], guess: readonly number[]): Comparison {
  const visited: number[] = [];
  if (secret.length !== guess.length) return { equal: false, comparisons: 0, lengthMismatch: true, visited };
  let difference = 0;
  for (let i = 0; i < secret.length; i++) {
    visited.push(i);
    difference |= secret[i] ^ guess[i];
  }
  return { equal: difference === 0, comparisons: visited.length, lengthMismatch: false, visited };
}

export type CompareFn = 'early' | 'constant';
export const COMPARE_FNS: Record<CompareFn, (secret: readonly number[], guess: readonly number[]) => Comparison> = {
  early: earlyExitCompare,
  constant: constantTimeCompare,
};

export interface Guess {
  text: string;
  bytes: readonly number[];
}

export type GuessParse = { ok: true; value: Guess } | { ok: false; error: string };

// oxlint-disable-next-line no-control-regex -- the point of this pattern is to match control characters
const CONTROL = /[\u0000-\u001f\u007f]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** The typed guess as UTF-8 bytes: at most 16, no control characters, no unpaired surrogates. Refusals name the problem. */
export function parseGuess(text: string): GuessParse {
  if (CONTROL.test(text)) return { ok: false, error: 'Control characters are not accepted: type printable text.' };
  if (LONE_SURROGATE.test(text)) return { ok: false, error: 'That text holds half of a character (an unpaired surrogate), which has no UTF-8 encoding.' };
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > MAX_GUESS_BYTES) {
    return { ok: false, error: `That is ${bytes.length} bytes in UTF-8; the limit is ${MAX_GUESS_BYTES}.` };
  }
  return { ok: true, value: { text, bytes } };
}

/** How many leading bytes of the guess equal the secret's (an independent definition of the prefix). */
export function matchedPrefix(secret: readonly number[], guess: readonly number[]): number {
  let k = 0;
  while (k < secret.length && k < guess.length && secret[k] === guess[k]) k++;
  return k;
}

export type ByteState = 'match' | 'mismatch' | 'unvisited';

/** What each byte position of the guess looked like to a function: compared and equal, compared and different, or never visited. */
export function byteStates(secret: readonly number[], guess: readonly number[], c: Comparison): ByteState[] {
  const seen = new Set(c.visited);
  return guess.map((b, i) => (!seen.has(i) ? 'unvisited' : secret[i] === b ? 'match' : 'mismatch'));
}

export const DEFAULT_GUESS = 'demo-tok-AAAAAAA';

export const compareOpening = (): { text: string; fn: CompareFn } => ({ text: DEFAULT_GUESS, fn: 'early' });
