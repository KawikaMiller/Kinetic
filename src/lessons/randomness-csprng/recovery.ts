/**
 * A toy generator built for this page: a 16-bit LCG whose output is the top 4 bits of its state. The "solver" is a brute
 * force over its 65,536 states, to show that a generator whose state can be inferred from its outputs is not secret.
 * It is not a method for anything real, and the lesson offers no step for any real generator.
 */

export const STATE_BITS = 16;
export const STATES = 2 ** STATE_BITS;
export const OUTPUT_BITS = 4;
const A = 25_173;
const C = 13_849;
export const NEXT_COUNT = 20;
/** The most outputs the learner can reveal. */
export const MAX_OUTPUTS = 8;

export const toyStep = (s: number): number => (A * s + C) % STATES;
export const toyOutput = (s: number): number => s >>> (STATE_BITS - OUTPUT_BITS);

/** The first `n` outputs after `seed`: step, then read the top bits. */
export function outputsFrom(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = toyStep(s);
    out.push(toyOutput(s));
  }
  return out;
}

/** Every starting state whose first outputs equal `observed`: a brute-force pass over all 65,536. */
export function candidates(observed: readonly number[]): number[] {
  const found: number[] = [];
  for (let seed = 0; seed < STATES; seed++) {
    let s = seed;
    let match = true;
    for (const o of observed) {
      s = toyStep(s);
      if (toyOutput(s) !== o) {
        match = false;
        break;
      }
    }
    if (match) found.push(seed);
  }
  return found;
}

/** How many starting states are still consistent after each of the first `n` outputs of `seed`. */
export function candidateCounts(seed: number, n: number): number[] {
  const outs = outputsFrom(seed, n);
  return Array.from({ length: n }, (_, i) => candidates(outs.slice(0, i + 1)).length);
}

/** When exactly one state is left, the next outputs it predicts after the observed ones; otherwise null. */
export function predictNext(observed: readonly number[], count = NEXT_COUNT): number[] | null {
  const left = candidates(observed);
  return left.length === 1 ? outputsFrom(left[0], observed.length + count).slice(observed.length) : null;
}

// ── Seed entropy ─────────────────────────────────────────────────────────

export type Coarseness = 'seconds' | 'milliseconds' | 'system';

export const COARSENESS: readonly { id: Coarseness; label: string }[] = [
  { id: 'seconds', label: 'A clock in whole seconds' },
  { id: 'milliseconds', label: 'A clock in milliseconds' },
  { id: 'system', label: 'A random 128-bit value from the system' },
];

export const WINDOWS: readonly { id: string; label: string; seconds: number }[] = [
  { id: 'hour', label: 'an hour', seconds: 3600 },
  { id: 'day', label: 'a day', seconds: 86_400 },
  { id: 'week', label: 'a week', seconds: 604_800 },
];

export const SYSTEM_SEED_BITS = 128;

/** How many seeds someone who knows roughly when the generator was seeded has to consider, and what that is in bits. */
export function seedSpace(c: Coarseness, windowSeconds: number): { seeds: number; bits: number } {
  if (c === 'system') return { seeds: 2 ** SYSTEM_SEED_BITS, bits: SYSTEM_SEED_BITS };
  const seeds = windowSeconds * (c === 'seconds' ? 1 : 1000);
  return { seeds, bits: Math.log2(seeds) };
}
