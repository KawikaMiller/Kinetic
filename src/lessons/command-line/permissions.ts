// Unix permission bits: nine bits, three for each of user (owner), group and other.
// Octal, symbolic and `ls -l` are three spellings of the same nine bits.
import type { Bit } from '../../core/bits';

export const CLASSES = ['user', 'group', 'other'] as const;
export type Who = (typeof CLASSES)[number];
export const ACTIONS = ['read', 'write', 'execute'] as const;
export type Action = (typeof ACTIONS)[number];
const LETTERS = ['r', 'w', 'x'] as const;

/** Plain name of permission bit i (most significant first): 0 → "user read", 4 → "group write". */
export const bitName = (i: number) => `${CLASSES[Math.floor(i / 3)]} ${ACTIONS[i % 3]}`;

/** 0o754 → [1,1,1, 1,0,1, 1,0,0], most significant first (user rwx, group rwx, other rwx). */
export const bitsFromMode = (mode: number): Bit[] => Array.from({ length: 9 }, (_, i) => ((mode >> (8 - i)) & 1) as Bit);
export const modeFromBits = (bits: readonly Bit[]) => bits.reduce((m: number, b) => (m << 1) | b, 0);

/** "754" */
export const octal = (mode: number) => mode.toString(8).padStart(3, '0');

/** "-rwxr-xr--", as `ls -l` prints it for a regular file. */
export const lsString = (mode: number) => `-${bitsFromMode(mode).map((b, i) => (b ? LETTERS[i % 3] : '-')).join('')}`;

/** "u=rwx,g=rx,o=r": what `chmod` accepts to set exactly these bits. */
export function symbolic(mode: number): string {
  const bits = bitsFromMode(mode);
  return CLASSES.map((c, k) => `${c[0]}=${LETTERS.filter((_, j) => bits[k * 3 + j]).join('')}`).join(',');
}

export const can = (mode: number, who: Who, action: Action) => bitsFromMode(mode)[CLASSES.indexOf(who) * 3 + ACTIONS.indexOf(action)] === 1;

/**
 * Apply a chmod mode argument to `current`: three or four octal digits, or symbolic clauses
 * like "u+x", "go-w", "a=r", "u=rwx,g=rx,o=" (comma-separated). Null if it isn't valid.
 */
/**
 * Real chmod accepts these, but they set the setuid, setgid or sticky bits, or use the X and
 * copy-from forms, none of which this nine-bit model draws: "4755", "u+s", "+t", "g=u", "a+X".
 * Only meaningful for an argument chmod() rejected.
 */
export function isUnmodelledMode(arg: string): boolean {
  const s = arg.trim();
  if (/^0*[1-7][0-7]{3}$/.test(s)) return true;
  return s.split(',').every((clause) => /^[ugoa]*[+\-=]([rwxXst]*|[ugo])$/.test(clause));
}

export function chmod(arg: string, current: number): number | null {
  const s = arg.trim();
  if (/^0?[0-7]{3}$/.test(s)) return parseInt(s, 8);
  let mode = current;
  for (const clause of s.split(',')) {
    const m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
    if (!m) return null;
    const who = (m[1] === '' || m[1].includes('a') ? 'ugo' : m[1]).split('');
    const mask = who.reduce((acc, w) => {
      const shift = (2 - 'ugo'.indexOf(w)) * 3;
      const perms = m[3].split('').reduce((p, l) => p | (1 << (2 - LETTERS.indexOf(l as (typeof LETTERS)[number]))), 0);
      return acc | (perms << shift);
    }, 0);
    const whoMask = who.reduce((acc, w) => acc | (0b111 << ((2 - 'ugo'.indexOf(w)) * 3)), 0);
    if (m[2] === '+') mode |= mask;
    else if (m[2] === '-') mode &= ~mask;
    else mode = (mode & ~whoMask) | mask;
  }
  return mode & 0o777;
}

/** Who's who for the "as user X" check: the file deploy.sh is owned by ada, group dev. */
export const PEOPLE: readonly { name: string; who: Who; why: string }[] = [
  { name: 'ada', who: 'user', why: 'owns the file' },
  { name: 'bob', who: 'group', why: 'in group dev' },
  { name: 'eve', who: 'other', why: 'everyone else' },
];

export const PERMISSION_PRESETS: readonly { mode: number; label: string; caption: string }[] = [
  { mode: 0o644, label: '644', caption: '644: the owner can read and write; everyone else can only read. The usual mode for a plain file.' },
  { mode: 0o755, label: '755', caption: '755: like 644, plus execute for everyone. The usual mode for scripts, programs and directories.' },
  { mode: 0o600, label: '600 (SSH key)', caption: '600: only the owner can read or write. ssh refuses to use a private key that others can read.' },
  { mode: 0o777, label: '777 (why not)', caption: '777: anyone on the machine can change this file. "Fixing" a permission error this way invites someone else to edit your script.' },
];
