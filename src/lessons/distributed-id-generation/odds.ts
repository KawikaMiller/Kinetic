// Collision odds for random IDs: the birthday problem (core/stats collisionProbability) at ID sizes.
import { power } from '../../core/format';
import { collisionProbability } from '../../core/stats';

/** Random bits in each kind of random ID. */
export const RANDOM_BITS = [
  { bits: 32, label: '32-bit random ID' },
  { bits: 64, label: '64-bit random ID' },
  { bits: 122, label: 'UUIDv4 (122 random bits)' },
] as const;

export const probabilityOf = (n: number, bits: number) => collisionProbability(n, 2 ** bits).p;

/**
 * About how many random IDs make a collision as likely as `p`: n ≈ √(−2 N ln(1 − p)) for a space of
 * N = 2^bits values (the birthday approximation, good while n is far below N).
 */
export const idsForOdds = (bits: number, p: number) => Math.sqrt(-2 * 2 ** bits * Math.log(1 - p));

/** A probability as people read it: a percentage above 0.1%, otherwise a × 10ⁿ figure. */
export function formatProbability(p: number): string {
  if (p === 0) return '0';
  if (p >= 0.9995) return '100%';
  if (p >= 0.001) return `${(p * 100).toFixed(p >= 0.1 ? 0 : 2)}%`;
  const exponent = Math.floor(Math.log10(p));
  const mantissa = p / 10 ** exponent;
  return `${mantissa.toFixed(1)} × ${power(exponent, 10)}`;
}

/** An ID count as a short number: 77 thousand, 5.1 billion, 2.7 × 10¹⁸. */
export function formatCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${Math.round(n / 1000)} thousand`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} million`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)} billion`;
  const exponent = Math.floor(Math.log10(n));
  return `${(n / 10 ** exponent).toFixed(1)} × ${power(exponent, 10)}`;
}
