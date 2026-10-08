// Factors (something you know, have, are) and how strong a set of ways in really is.
import type { Tone } from '../../core/tone';

export type FactorKind = 'know' | 'have' | 'are';

export interface Factor {
  id: string;
  kind: FactorKind;
  label: string;
}

export const FACTORS: Factor[] = [
  { id: 'password', kind: 'know', label: 'Password' },
  { id: 'question', kind: 'know', label: 'Security question' },
  { id: 'app', kind: 'have', label: 'Authenticator app' },
  { id: 'key', kind: 'have', label: 'Hardware key' },
  { id: 'finger', kind: 'are', label: 'Fingerprint' },
];

export const KIND_LABEL: Record<FactorKind, string> = { know: 'Know', have: 'Have', are: 'Are' };
export const KIND_TONE: Record<FactorKind, Tone> = { know: 'sky', have: 'amber', are: 'pink' };

export const kindsOf = (ids: readonly string[]): FactorKind[] => {
  const kinds = new Set(ids.map((id) => FACTORS.find((f) => f.id === id)!.kind));
  return (['know', 'have', 'are'] as FactorKind[]).filter((k) => kinds.has(k));
};

/** Multi-factor means at least two different kinds, not two of the same kind. */
export const isMultiFactor = (ids: readonly string[]) => kindsOf(ids).length >= 2;

export const FACTOR_PRESETS: { id: string; label: string; ids: string[] }[] = [
  { id: 'two-know', label: 'Password + security question', ids: ['password', 'question'] },
  { id: 'app', label: 'Password + authenticator app', ids: ['password', 'app'] },
  { id: 'key', label: 'Hardware key + fingerprint', ids: ['key', 'finger'] },
];

// ── How strong the ways in are ────────────────────────────────────────

export type Strength = 'weak' | 'phishable' | 'resistant';
export const STRENGTH_RANK: Record<Strength, number> = { weak: 0, phishable: 1, resistant: 2 };
export const STRENGTH_LABEL: Record<Strength, string> = {
  weak: 'weak: can be guessed, intercepted or talked out of someone',
  phishable: 'phishable: a fake site can collect it and pass it on',
  resistant: 'phishing-resistant: bound to the real site',
};
export const STRENGTH_TONE: Record<Strength, Tone> = { weak: 'bad', phishable: 'orange', resistant: 'ok' };

export interface Path {
  id: string;
  role: 'sign-in' | 'recovery';
  label: string;
  strength: Strength;
  /** One plain-words sentence on the risk. */
  risk: string;
}

export const PATHS: Path[] = [
  { id: 'passkey', role: 'sign-in', label: 'Passkey', strength: 'resistant', risk: 'Signs a challenge for the real site only; there is nothing to type or pass on.' },
  { id: 'totp', role: 'sign-in', label: 'Password + authenticator code', strength: 'phishable', risk: 'Both can be typed into a look-alike site, which can pass them on within the 30 seconds.' },
  { id: 'password', role: 'sign-in', label: 'Password only', strength: 'weak', risk: 'One secret: guessed, reused from another breach, or phished.' },
  { id: 'second-passkey', role: 'recovery', label: 'A second passkey or key', strength: 'resistant', risk: 'Same protection as the first, kept somewhere else (a safe, another device).' },
  { id: 'backup-codes', role: 'recovery', label: 'Printed backup codes', strength: 'phishable', risk: 'Single-use and kept offline, but a fake site can still collect one if you type it in.' },
  { id: 'sms', role: 'recovery', label: 'Code by text message', strength: 'weak', risk: 'A SIM swap moves your number to someone else, and the code can be typed into a fake site too.' },
  { id: 'questions', role: 'recovery', label: 'Security questions', strength: 'weak', risk: 'The answers are facts that others can look up or guess.' },
];

/** The strength of a set of enabled ways in: an attacker uses the weakest one. null when nothing is enabled. */
export function weakestOf(ids: readonly string[]): Strength | null {
  const ranks = ids.map((id) => STRENGTH_RANK[PATHS.find((p) => p.id === id)!.strength]);
  if (!ranks.length) return null;
  const min = Math.min(...ranks);
  return (Object.keys(STRENGTH_RANK) as Strength[]).find((s) => STRENGTH_RANK[s] === min)!;
}

export const DEFAULT_PATHS = ['passkey', 'sms'];
