// The users table, the attacker's lookup table and the cracking-time arithmetic for lane ②.
// Frame builders (with captions) are in passwordFrames.tsx.
import type { Frame } from '../../core/types';

export type Storage = 'plain' | 'hash' | 'salt';
export type User = 'alice' | 'bob';
export const USERS: User[] = ['alice', 'bob'];
export const PASSWORD = 'hunter2';

export const SALTS: Record<User, string> = { alice: 'c81e7a', bob: '4f0d92' };
/** The attacker's precomputed hash → password lookup table (a tiny one: real ones hold billions). */
export const LOOKUP = ['123456', 'password', PASSWORD, 'qwerty'];
/** Everything the users table and the lookup table need, hashed for real. */
export const INPUTS = [...LOOKUP, SALTS.alice + PASSWORD, SALTS.bob + PASSWORD];

// 26^8 lowercase 8-letter passwords, at ~10 billion SHA-256/s (one modern GPU)
// vs ~10 thousand bcrypt/s at a sensible cost factor. Both rates are ballpark assumptions.
export const SPACE = 26 ** 8;
export const FAST_RATE = 1e10;
export const SLOW_RATE = 1e4;
export const FAST_S = SPACE / FAST_RATE;
export const SLOW_DAYS = SPACE / SLOW_RATE / 86400;
/** How many times longer the slow hash takes. The race bars aren't drawn to this scale. */
export const SLOWDOWN = FAST_RATE / SLOW_RATE;
/** Fraction of the track the slow bar fills (to scale it would be 1 / SLOWDOWN: invisible). */
export const SLOW_BAR_DRAWN = 0.004;

export interface PwFrame extends Frame {
  storage: Storage;
  breach: boolean;
  cracked: User[];
  lookup: 'hit' | 'miss' | null;
  race: 'none' | 'fast' | 'slow';
}

/** The text that gets hashed for a user under each storage scheme (null: stored as typed). */
export const hashInput = (storage: Storage, u: User) => (storage === 'plain' ? null : storage === 'hash' ? PASSWORD : SALTS[u] + PASSWORD);

/** Which users a leak exposes to the lookup table, given real digests (`hashOf`). */
export function crackedBy(storage: Storage, hashOf: (input: string) => string): User[] {
  if (storage === 'plain') return USERS.slice();
  const table = new Set(LOOKUP.map(hashOf));
  return USERS.filter((u) => table.has(hashOf(hashInput(storage, u)!)));
}
