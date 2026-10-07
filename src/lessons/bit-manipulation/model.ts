import { fromBits, fromBitsSigned, toBits, type Bit } from '../../core/bits';

/** Register widths. 8 is a teaching width; JavaScript itself always computes in 32 bits. */
export type Width = 8 | 32;
export const WIDTHS: readonly Width[] = [8, 32];

export type Op = '&' | '|' | '^' | '~' | '<<' | '>>' | '>>>';
export const OPS: readonly Op[] = ['&', '|', '^', '~', '<<', '>>', '>>>'];

export const isShift = (op: Op) => op === '<<' || op === '>>' || op === '>>>';
/** Ops that read register B. `~` and the shifts read only A (shifts also take a count n). */
export const usesB = (op: Op) => op === '&' || op === '|' || op === '^';

/** Largest shift count the slider offers: 8-bit stays inside the byte; 32-bit goes past 31 to show the mod-32 rule. */
export const maxShift = (width: Width) => (width === 8 ? 7 : 33);

/** The shift JavaScript really performs: only the low 5 bits of the count are used (n mod 32). */
export const shiftCount = (n: number, width: Width) => (width === 32 ? n & 31 : n);

/** Smallest and largest value a learner may type for a register. 32-bit accepts signed and unsigned spellings. */
export const RANGE: Record<Width, { min: number; max: number }> = {
  8: { min: 0, max: 255 },
  32: { min: -(2 ** 31), max: 2 ** 32 - 1 },
};

/** A register's stored value: 0..255 in 8-bit mode, a signed int32 in 32-bit mode (as JS holds it). */
export const toRegister = (v: number, width: Width) => (width === 8 ? v & 0xff : v | 0);

export const fitsWidth = (v: number, width: Width) => Number.isInteger(v) && v >= RANGE[width].min && v <= RANGE[width].max;

export type Parsed = { ok: true; value: number } | { ok: false; error: string };

const DECIMAL = /^-?\d+$/;
const HEX = /^0x[0-9a-f]+$/i;
const BINARY = /^0b[01]+$/i;

/**
 * A register value typed in decimal (-5), hex (0xFF) or binary (0b1010); underscores are
 * ignored. Anything else, and anything out of range for the width, is refused: never
 * rounded, masked or cut off. 32-bit accepts -2147483648..4294967295 (signed or unsigned
 * spelling of the same 32 bits) and stores it as the int32 JS would use.
 */
export function parseRegister(text: string, width: Width): Parsed {
  const t = text.trim().replace(/_/g, '');
  if (!t) return { ok: false, error: 'Type a number: 202, 0xCA or 0b11001010.' };
  let value: number;
  if (DECIMAL.test(t)) value = Number(t);
  else if (HEX.test(t)) value = parseInt(t.slice(2), 16);
  else if (BINARY.test(t)) value = parseInt(t.slice(2), 2);
  else return { ok: false, error: `"${text.trim()}" isn't a whole number in decimal, 0x hex or 0b binary.` };
  const { min, max } = RANGE[width];
  if (value < min || value > max) {
    return {
      ok: false,
      error: width === 8
        ? `8-bit mode holds 0 to 255, so ${t} is refused, not cut down. Switch to 32-bit for more.`
        : `${t} needs more than 32 bits. JavaScript's bitwise operators only see 32.`,
    };
  }
  return { ok: true, value: toRegister(value, width) };
}

/** The register's bits, MSB first. */
export const bitsOf = (v: number, width: Width) => toBits(v, width);

/** Bit number (0 = least significant) of MSB-first index `i`. */
export const bitNumber = (i: number, width: Width) => width - 1 - i;

/** One output column: its bit and the rule that produced it. */
export interface Column {
  bit: Bit;
  rule: string;
}

/**
 * Output column `i` (MSB-first) of `op`, worked out from the input bits alone, the way
 * the hardware does it: each column of &, |, ^, ~ looks only at its own column; a shift
 * copies a bit from k places away, filling the edge with 0 or (for >>) the sign bit.
 */
export function column(op: Op, a: readonly Bit[], b: readonly Bit[], n: number, i: number): Column {
  const width = a.length as Width;
  const k = shiftCount(n, width);
  const at = (j: number) => `bit ${bitNumber(j, width)}`;
  switch (op) {
    case '&': {
      const bit = (a[i] & b[i]) as Bit;
      return { bit, rule: `${a[i]} & ${b[i]} → ${bit}` };
    }
    case '|': {
      const bit = (a[i] | b[i]) as Bit;
      return { bit, rule: `${a[i]} | ${b[i]} → ${bit}` };
    }
    case '^': {
      const bit = (a[i] ^ b[i]) as Bit;
      return { bit, rule: `${a[i]} ^ ${b[i]} → ${bit}` };
    }
    case '~': {
      const bit = (1 - a[i]) as Bit;
      return { bit, rule: `~${a[i]} → ${bit}` };
    }
    case '<<': {
      const src = i + k;
      return src < width ? { bit: a[src], rule: `A's ${at(src)} (${a[src]}) moves up ${k}` } : { bit: 0, rule: 'a 0 is shifted in from the right' };
    }
    case '>>': {
      const src = i - k;
      return src >= 0 ? { bit: a[src], rule: `A's ${at(src)} (${a[src]}) moves down ${k}` } : { bit: a[0], rule: `a copy of the sign bit (${a[0]})` };
    }
    case '>>>': {
      const src = i - k;
      return src >= 0 ? { bit: a[src], rule: `A's ${at(src)} (${a[src]}) moves down ${k}` } : { bit: 0, rule: 'a 0 is shifted in from the left' };
    }
  }
}

/** Every output column, MSB first. */
export function resultBits(op: Op, a: number, b: number, n: number, width: Width): Bit[] {
  const ab = bitsOf(a, width);
  const bb = bitsOf(b, width);
  return ab.map((_, i) => column(op, ab, bb, n, i).bit);
}

/**
 * The value the output bits mean. 8-bit: the byte 0..255. 32-bit: what JavaScript returns,
 * a signed int32 for every operator except >>>, whose result is unsigned.
 */
export function resultValue(op: Op, bits: readonly Bit[], width: Width): number {
  if (width === 8 || op === '>>>') return fromBits(bits);
  return fromBitsSigned(bits);
}

/** What real JavaScript gives for `a op b` (or `a op n`) on these numbers. */
export function jsEval(op: Op, a: number, b: number, n: number): number {
  switch (op) {
    case '&': return a & b;
    case '|': return a | b;
    case '^': return a ^ b;
    case '~': return ~a;
    case '<<': return a << n;
    case '>>': return a >> n;
    case '>>>': return a >>> n;
  }
}

/** The expression as code: "A & B", "~A", "A >> 3". */
export const expression = (op: Op, n: number) => (op === '~' ? '~A' : isShift(op) ? `A ${op} ${n}` : `A ${op} B`);

/**
 * In 8-bit mode, why real JS's 32-bit answer can differ from the byte on screen.
 * 'same': JS's low 8 bits equal the byte. 'wider': same low 8 bits, but JS kept more
 * (a negative ~A, a << that grew past 255). 'sign': the 8-bit view copied bit 7 as a sign
 * bit for >>, which JS doesn't, because in 32 bits bit 7 isn't the sign bit.
 */
export function jsDifference(op: Op, a: number, b: number, n: number): 'same' | 'wider' | 'sign' {
  const byte = resultValue(op, resultBits(op, a, b, n, 8), 8);
  const js = jsEval(op, a, b, n);
  if (js === byte) return 'same';
  return (js & 0xff) === byte ? 'wider' : 'sign';
}

/** `0x` plus the register's bits in hex, zero-padded to the width: 0xCA, 0xFFFFFFFF. */
export const hex = (v: number, width: Width) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(width / 4, '0')}`;

/** Indexes (MSB-first) where two bit rows differ. */
export const changedBits = (before: readonly Bit[], after: readonly Bit[]) =>
  before.flatMap((b, i) => (b !== after[i] ? [i] : []));

// ── Flags: one bit per feature ───────────────────────────────────────────

export type FlagOp = 'set' | 'clear' | 'toggle' | 'test';

/** A text-style flag word: bit k means one style is on. */
export const FLAG_NAMES = ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKE', 'CODE', 'LINK', 'HIDDEN', 'LOCKED'] as const;

/** The mask with only bit k set. */
export const maskOf = (k: number) => 1 << k;

/** set: f | MASK; clear: f & ~MASK; toggle: f ^ MASK. All on an 8-bit flag word. */
export function applyFlag(op: Exclude<FlagOp, 'test'>, f: number, mask: number): number {
  switch (op) {
    case 'set': return (f | mask) & 0xff;
    case 'clear': return f & ~mask & 0xff;
    case 'toggle': return (f ^ mask) & 0xff;
  }
}

/** test: (f & MASK) !== 0. */
export const testFlag = (f: number, mask: number) => (f & mask) !== 0;

// ── Tricks ───────────────────────────────────────────────────────────────

/** Set bits in the low 32 bits. */
export function popcount(x: number): number {
  let v = x >>> 0;
  let count = 0;
  while (v) {
    count += v & 1;
    v >>>= 1;
  }
  return count;
}

/** Kernighan's loop: x &= x - 1 clears the lowest set bit. Every value it passes through, ending at 0. */
export function kernighanTrail(x: number): number[] {
  const trail = [x >>> 0];
  let v = x >>> 0;
  while (v) {
    v = (v & (v - 1)) >>> 0;
    trail.push(v);
  }
  return trail;
}

/** x & -x keeps only the lowest set bit (0 stays 0), in an 8-bit register. */
export const lowestSetBit8 = (x: number) => x & -x & 0xff;

/** -x in an 8-bit register: ~x + 1, wrapped. */
export const negate8 = (x: number) => (~x + 1) & 0xff;

/** The tempting one-liner: true for every power of two, and also for 0 (and, in 32-bit JS, for -2147483648). */
export const isPowerOfTwoNaive = (x: number) => (x & (x - 1)) === 0;

/** The fixed test: x > 0 rules out 0 and every negative int32. */
export const isPowerOfTwo = (x: number) => x > 0 && (x & (x - 1)) === 0;

/** Why the naive test is wrong for x, or null when it agrees with the real answer. */
export function powerTrap(x: number): 'zero' | 'negative' | null {
  if (isPowerOfTwoNaive(x) === isPowerOfTwo(x)) return null;
  return x === 0 ? 'zero' : 'negative';
}

/** The three XOR-swap lines. */
export const SWAP_LINES = ['a = a ^ b', 'b = a ^ b', 'a = a ^ b'] as const;

/**
 * XOR swap, one state per line run (plus the start). With `alias` the two names are the
 * same variable (swap(x, x)): the first line computes x ^ x = 0 and the value is lost.
 */
export function xorSwap(a: number, b: number, alias: boolean): { a: number; b: number }[] {
  const states = [{ a, b: alias ? a : b }];
  let x = a;
  let y = alias ? a : b;
  for (let line = 0; line < SWAP_LINES.length; line++) {
    const v = x ^ y;
    if (line === 1) y = v;
    else x = v;
    // One variable under two names: whichever name is written, both read the new value.
    if (alias) x = y = v;
    states.push({ a: x, b: y });
  }
  return states;
}

// ── Presets ──────────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  label: string;
  width: Width;
  op: Op;
  a: number;
  b: number;
  n: number;
  /** What this is in real code. */
  note: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'chmod', label: 'chmod g+w', width: 32, op: '|', a: 0o755, b: 0o020, n: 0, note: 'chmod g+w ORs in the group-write bit: 0o755 | 0o020 = 0o775. Every other permission bit is untouched.' },
  { id: 'feature', label: 'Feature flag test', width: 8, op: '&', a: 0b1010_0110, b: 0b0000_0100, n: 0, note: 'Flags & MASK: a non-zero result means the flag is on. Here bit 2 is set, so the feature is enabled.' },
  { id: 'rgb-pack', label: 'RGB pack', width: 32, op: '|', a: 0xff << 16, b: 0x88 << 8, n: 0, note: '(r << 16) | (g << 8) | b: each channel sits in its own byte, so OR glues them together without overlap.' },
  { id: 'rgb-unpack', label: 'RGB unpack', width: 32, op: '>>', a: 0xff8800, b: 0, n: 8, note: 'Unpacking green: (rgb >> 8) & 0xFF. The shift brings green down to the low byte; the & 0xFF then drops red.' },
];

/** JavaScript's 32-bit surprises, each a one-click setup. Their values are computed, not typed in. */
export const JS_FACTS: readonly Preset[] = [
  { id: 'sign', label: '1 << 31', width: 32, op: '<<', a: 1, b: 0, n: 31, note: 'The 1 lands in bit 31, the sign bit, so JS reads the result as negative.' },
  { id: 'unsigned', label: '-1 >>> 0', width: 32, op: '>>>', a: -1, b: 0, n: 0, note: '>>> 0 changes no bits, but its result is read unsigned: the same 32 ones become 4294967295.' },
  { id: 'mod32', label: '5 << 32', width: 32, op: '<<', a: 5, b: 0, n: 32, note: 'JS uses only the low 5 bits of the count, so << 32 shifts by 0.' },
  { id: 'arith', label: '-16 >> 2', width: 32, op: '>>', a: -16, b: 0, n: 2, note: '>> copies the sign bit into the top, so a negative number stays negative: it divides by 4.' },
  { id: 'logical', label: '-16 >>> 2', width: 32, op: '>>>', a: -16, b: 0, n: 2, note: '>>> shifts zeros in, so the same bits come out as a huge positive number.' },
];
