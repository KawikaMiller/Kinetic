import { toBits, type Bit } from '../../core/bits';

/** Register widths the lesson offers. 24 bits exists for the #RRGGBB colour preset. */
export type Width = 8 | 16 | 24;
export const WIDTHS: readonly Width[] = [8, 16, 24];

export type Base = 2 | 8 | 10 | 16;

export const BASE_NAMES: Record<Base, string> = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hex' };

/** Largest value a register of `width` bits holds. */
export const maxValue = (width: Width) => 2 ** width - 1;

/** `value` written in `base` with its usual prefix, zero-padded to the register width. */
export function formatIn(value: number, base: Base, width: Width): string {
  switch (base) {
    case 10:
      return value.toString(10);
    case 16:
      return `0x${value.toString(16).toUpperCase().padStart(width / 4, '0')}`;
    case 8:
      return `0o${value.toString(8)}`;
    case 2:
      return groupDigits(value.toString(2).padStart(width, '0'), 4);
  }
}

/** Split a digit string into groups of `size` from the right: "101011" → "10 1011". */
export function groupDigits(digits: string, size: number): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= size) groups.unshift(digits.slice(Math.max(0, end - size), end));
  return groups.join(' ');
}

/** One hex digit for a run of MSB-first bits (a nibble). */
export const hexDigit = (bits: readonly Bit[]) => bits.reduce<number>((acc, b) => acc * 2 + b, 0).toString(16).toUpperCase();

const PREFIXES: { prefix: string; base: Base }[] = [
  { prefix: '0x', base: 16 },
  { prefix: '#', base: 16 },
  { prefix: '0o', base: 8 },
  { prefix: '0b', base: 2 },
];

export type Parsed = { ok: true; value: number; base: Base } | { ok: false; error: string };

/**
 * Parse a number typed in any base. A prefix (0x, #, 0o, 0b) picks the base; otherwise
 * `fallbackBase` applies. Underscores and spaces are ignored (0b1111_0000). Unlike
 * parseInt, a stray digit is an error rather than silently cut off: "12z" doesn't read as 12.
 */
export function parseAnyBase(input: string, fallbackBase: Base, width: Width): Parsed {
  let text = input.trim().toLowerCase().replace(/[_\s]/g, '');
  if (!text) return { ok: false, error: 'Type a number.' };
  let base = fallbackBase;
  const match = PREFIXES.find((p) => text.startsWith(p.prefix));
  if (match) {
    base = match.base;
    text = text.slice(match.prefix.length);
  }
  const digits = '0123456789abcdef'.slice(0, base);
  const bad = [...text].find((ch) => !digits.includes(ch));
  if (!text || bad !== undefined) {
    return { ok: false, error: `"${bad ?? input}" isn't a ${BASE_NAMES[base]} digit (allowed: ${digits}).` };
  }
  const value = parseInt(text, base);
  if (value > maxValue(width)) {
    return { ok: false, error: `${value} needs more than ${width} bits (max ${maxValue(width)}).` };
  }
  return { ok: true, value, base };
}

/**
 * How "+1" ripples through the bits: every trailing 1 becomes 0 (a carry moves left),
 * then the first 0 becomes 1. Indices are MSB-first, listed in the order they flip
 * (from the right). `landing` is null when every bit was 1: the value wraps to 0.
 */
export function countUpPlan(bits: readonly Bit[]): { carries: number[]; landing: number | null } {
  const carries: number[] = [];
  for (let i = bits.length - 1; i >= 0; i--) {
    if (bits[i] === 0) return { carries, landing: i };
    carries.push(i);
  }
  return { carries, landing: null };
}

/** One visible step of the "+1" ripple: the register after flipping one bit, with that bit ringed. */
export interface RippleStep {
  bits: Bit[];
  ring: number;
}

/** The "+1" ripple as steps the stage plays one at a time. Empty landing (all 1s) means it wrapped to 0. */
export function countUpSteps(bits: readonly Bit[]): RippleStep[] {
  const { carries, landing } = countUpPlan(bits);
  const steps: RippleStep[] = [];
  let current = [...bits];
  for (const i of [...carries, ...(landing === null ? [] : [landing])]) {
    current = current.map((b, j) => (j === i ? ((1 - b) as Bit) : b));
    steps.push({ bits: current, ring: i });
  }
  return steps;
}

/** chmod-style permission string for a 9-bit value: 0o755 → "rwxr-xr-x". */
export function rwxString(value: number): string {
  return toBits(value, 9)
    .map((bit, i) => (bit ? 'rwx'[i % 3] : '-'))
    .join('');
}

/** The three bytes of a 24-bit #RRGGBB colour. */
export const rgbBytes = (value: number): [number, number, number] => [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

export interface Preset {
  id: string;
  label: string;
  value: number;
  width: Width;
  /** Where you meet this base in real life. */
  note: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'colour', label: '#FF8800', value: 0xff8800, width: 24, note: 'A CSS colour: three bytes, one each for red, green and blue.' }, // allow-color: the preset's own text, a hex-number example
  { id: 'chmod', label: 'chmod 755', value: 0o755, width: 16, note: 'Unix permissions: each octal digit is 3 bits, read/write/execute for owner, group, others.' },
  { id: 'int16', label: '0x7FFF', value: 0x7fff, width: 16, note: 'The largest signed 16-bit number: every bit set except the top one.' },
  { id: 'kib', label: '1 KiB = 1024', value: 1024, width: 16, note: '1 KiB is 2¹⁰ bytes: a single 1 followed by ten 0s in binary.' },
];
