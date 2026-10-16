import type { Result } from '../../core/result';
import { GEARS_MAX, M_MAX, M_MIN, type System } from './crt';

export const SUN_TZU: System = { moduli: [3, 5, 7], residues: [2, 3, 2] };
export const SHARED_DEFAULT: System = { moduli: [4, 6], residues: [2, 3] };

/** Coprime sets for the build and residue scenes (checked by a test). */
export const COPRIME_SETS: { id: string; label: string; moduli: number[] }[] = [
  { id: '3-5-7', label: '3, 5, 7', moduli: [3, 5, 7] },
  { id: '4-9-5', label: '4, 9, 5', moduli: [4, 9, 5] },
  { id: '7-8-9', label: '7, 8, 9', moduli: [7, 8, 9] },
];

export const GEAR_PRESETS: { id: string; label: string; system: System }[] = [
  { id: 'sun-tzu', label: "Sun Tzu's puzzle", system: SUN_TZU },
  { id: 'two', label: 'Two gears: 5 and 8', system: { moduli: [5, 8], residues: [3, 6] } },
  { id: 'shared', label: 'Share a factor: 4 and 6', system: SHARED_DEFAULT },
];

export interface RsaKey {
  id: string;
  label: string;
  p: bigint;
  q: bigint;
  e: bigint;
}

/** Public textbook-sized primes: toy numbers, never a key. */
export const KEYS: RsaKey[] = [
  { id: 'tiny', label: '61 x 53', p: 61n, q: 53n, e: 17n },
  { id: 'small', label: '101 x 103', p: 101n, q: 103n, e: 7n },
  { id: 'bigger', label: '211 x 223', p: 211n, q: 223n, e: 11n },
];

/** The opening state of each scene (pure, so a test can pin what each try-this starts from). */
export const OPENING = {
  gears: { system: SUN_TZU, x: 0 },
  build: { set: '3-5-7', residues: SUN_TZU.residues, gear: 0 },
  shared: { system: SHARED_DEFAULT },
  residue: { set: '3-5-7', u: 40, v: 35, op: 'add' as const },
  speed: { key: 'tiny', c: 65 },
} as const;

/** "3:2, 5:3, 7:2" means x = 2 (mod 3), x = 3 (mod 5), x = 2 (mod 7). */
export const formatSystem = (s: System): string => s.moduli.map((m, i) => `${m}:${s.residues[i]}`).join(', ');

const PAIR = /^(-?\d+)\s*:\s*(-?\d+)$/;

/** A system typed as modulus:remainder pairs, or the reason it is refused. Two or three gears; moduli 2 to 30; remainders 0 to m - 1. */
export function parseSystem(text: string, maxGears: number = GEARS_MAX): Result<System> {
  const parts = text.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Type modulus:remainder pairs, like 3:2, 5:3, 7:2.' };
  if (parts.length > maxGears) return { ok: false, error: `At most ${maxGears} gears here: that is ${parts.length}.` };
  if (parts.length < 2) return { ok: false, error: 'Two gears at least: one congruence alone has too many solutions to tell anything.' };
  const moduli: number[] = [];
  const residues: number[] = [];
  for (const part of parts) {
    const m = PAIR.exec(part);
    if (!m) return { ok: false, error: `"${part}" is not a pair like 7:2 (modulus, a colon, remainder), whole numbers only.` };
    const [modulus, residue] = [Number(m[1]), Number(m[2])];
    if (modulus === 1) return { ok: false, error: 'A modulus of 1 has only the remainder 0 and tells you nothing.' };
    if (modulus < M_MIN) return { ok: false, error: `A modulus of ${modulus} is not allowed: use ${M_MIN} to ${M_MAX}.` };
    if (modulus > M_MAX) return { ok: false, error: `A modulus of ${modulus} is too big for the gears: use ${M_MIN} to ${M_MAX}.` };
    if (residue < 0 || residue > modulus - 1) return { ok: false, error: `The remainder ${residue} does not fit mod ${modulus}: use 0 to ${modulus - 1}.` };
    moduli.push(modulus);
    residues.push(residue);
  }
  return { ok: true, value: { moduli, residues } };
}
