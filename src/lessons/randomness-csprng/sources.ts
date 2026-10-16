/** The eight uses of randomness to sort, with the bin each belongs in and the reason shown on reveal. */

export type Bin = 'csprng' | 'seeded' | 'any';

export const BINS: { id: Bin; label: string }[] = [
  { id: 'csprng', label: 'Needs a CSPRNG' },
  { id: 'seeded', label: 'A reproducible seeded PRNG' },
  { id: 'any', label: 'Any PRNG is fine' },
];

export interface Use {
  id: string;
  label: string;
  bin: Bin;
  reason: string;
}

export const USES: readonly Use[] = [
  { id: 'session-id', label: 'A session identifier', bin: 'csprng', reason: 'Anyone who can predict it can use someone else\'s session, so it must come from a cryptographically secure generator.' },
  { id: 'reset-token', label: 'A password-reset token', bin: 'csprng', reason: 'It is a secret that grants access, so an attacker must not be able to guess or compute the next one.' },
  { id: 'cbc-iv', label: 'An AES-CBC IV', bin: 'csprng', reason: 'CBC needs an unpredictable IV for each message, so draw it from a CSPRNG (it need not be secret, but it must not be guessable).' },
  { id: 'api-key', label: 'An API key', bin: 'csprng', reason: 'Like a password, its strength is its unpredictability, so it comes from a CSPRNG and is long enough to be out of reach.' },
  { id: 'monte-carlo', label: 'A Monte Carlo run you need to reproduce', bin: 'seeded', reason: 'You want the same numbers from the same seed, so a seeded generator such as mulberry32 is the right tool, and a CSPRNG would make the run unrepeatable.' },
  { id: 'level', label: 'A game level generated from a seed', bin: 'seeded', reason: 'Players share a seed to get the same level, so the generator must be deterministic for a given seed.' },
  { id: 'jitter', label: 'Retry backoff jitter', bin: 'any', reason: 'It only spreads retries out in time. Nothing is protected by it and nothing needs repeating, so any generator will do.' },
  { id: 'shuffle', label: 'Shuffling test data, where a failing run does not need replaying', bin: 'any', reason: 'Nothing secret depends on the order, and no one needs to replay it. (If you want to replay a failing run, log a seed and use the seeded generator.)' },
];

export const KEY: Record<string, Bin> = Object.fromEntries(USES.map((u) => [u.id, u.bin]));
