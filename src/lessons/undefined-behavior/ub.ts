/**
 * Models for the undefined-behavior lesson. Nothing here is C and nothing here is a compiler: the "assumes no
 * overflow" column applies one rule by hand, and the integers are JavaScript numbers wrapped to a width with
 * core/bits. Every claim about what a real compiler may do is shown as an example, not run.
 */
import { fromBits, fromBitsSigned, toBits } from '../../core/bits';

export const WIDTHS = [8, 16, 32] as const;
export type Width = (typeof WIDTHS)[number];

export interface IntType {
  width: Width;
  signed: boolean;
}

export const rangeOf = ({ width, signed }: IntType) => (signed ? { min: -(2 ** (width - 1)), max: 2 ** (width - 1) - 1 } : { min: 0, max: 2 ** width - 1 });

/** A value reduced into the type's range the way two's complement wraps it. */
export const wrap = (v: number, { width, signed }: IntType): number => (signed ? fromBitsSigned(toBits(v, width)) : fromBits(toBits(v, width)));

/** `x + 1 < x` with the sum wrapping (as with -fwrapv, or as unsigned arithmetic always behaves): 1 or 0. */
export const asWritten = (x: number, t: IntType): number => (wrap(x + 1, t) < x ? 1 : 0);

/**
 * The same function after the toy rewriter applies "x + c < x is false for signed x and c > 0", which follows from
 * signed overflow being undefined. For unsigned x the rule does not apply, because unsigned wrap-around is defined.
 */
export const assumingNoOverflow = (x: number, t: IntType): number => (t.signed ? 0 : asWritten(x, t));

/** Does the original have defined behaviour at x? Signed `x + 1` overflows only at the maximum. */
export const isDefined = (x: number, t: IntType): boolean => !t.signed || x !== rangeOf(t).max;

export const differs = (x: number, t: IntType): boolean => asWritten(x, t) !== assumingNoOverflow(x, t);

/** Every input of a type at width 8 or 16 whose two columns disagree. */
export function differingInputs(t: IntType): number[] {
  const { min, max } = rangeOf(t);
  const out: number[] = [];
  for (let x = min; x <= max; x++) if (differs(x, t)) out.push(x);
  return out;
}

/** The values the chips offer, in order, for a type: five signed, four unsigned. */
export function boundaryValues(t: IntType): number[] {
  const { min, max } = rangeOf(t);
  return t.signed ? [min, -1, 0, max - 1, max] : [min, 1, max - 1, max];
}

export interface Retarget {
  x: number;
  /** Set when the value had to change to fit the new type. */
  note: string | null;
}

/** Keep the learner's input when the type changes: wrap it into the new range and say so when it moved. */
export function retarget(x: number, from: IntType, to: IntType): Retarget {
  const next = wrap(x, to);
  if (next === x) return { x, note: null };
  const toName = `${to.signed ? 'signed' : 'unsigned'} ${to.width}-bit`;
  const fromName = `${from.signed ? 'signed' : 'unsigned'} ${from.width}-bit`;
  return { x: next, note: `The ${fromName} value ${x.toLocaleString('en-US')} does not fit ${to.signed ? 'a' : 'an'} ${toName} integer, so it wraps to ${next.toLocaleString('en-US')}.` };
}

/* ---------- the null check after the dereference ---------- */

/** A fictional address set; address 0 is null. Cell contents are made up. */
export const POINTERS: { address: number; label: string }[] = [
  { address: 0, label: 'NULL' },
  { address: 0x1000, label: '0x1000' },
  { address: 0x1008, label: '0x1008' },
  { address: 0x2000, label: '0x2000' },
  { address: 0x3000, label: '0x3000' },
];

export const MEMORY = new Map<number, number>([[0x1000, 7], [0x1008, 42], [0x2000, 100], [0x3000, -5]]);

/** `int v = *p; if (p == NULL) return -1; return v;` for a non-null p. Null is outside the contract: it is not run. */
export function withCheck(p: number): number {
  const v = MEMORY.get(p) as number;
  return p === 0 ? -1 : v;
}

/** The same function once the check is removed because `*p` already assumed p is not null. */
export function withoutCheck(p: number): number {
  return MEMORY.get(p) as number;
}

/** Three outcomes the standard allows for `*p` when p is null: examples, not a prediction. */
export const NULL_OUTCOMES: readonly string[] = [
  'the program crashes at the load',
  'the check is removed and the function returns whatever the load produced',
  'the load is dropped and the function returns a garbage value',
];

/* ---------- the defences ---------- */

export type DefenceId = 'none' | 'wrapv' | 'sanitize' | 'checked' | 'language';

export const DEFENCES: { id: DefenceId; label: string }[] = [
  { id: 'none', label: 'Nothing (optimiser assumes no overflow)' },
  { id: 'wrapv', label: '-fwrapv' },
  { id: 'sanitize', label: '-fsanitize=undefined' },
  { id: 'checked', label: 'Checked arithmetic' },
  { id: 'language', label: 'A language that defines it' },
];

export interface DefenceOutcome {
  /** What the function returns (null when the defence reports instead of returning a value). */
  result: number | null;
  /** The behaviour in a sentence. */
  outcome: string;
  /** What the defence does to the silent bug: leaves it silent, makes it visible (still undefined), or defines it. */
  status: DefenceStatus;
}

export type DefenceStatus = 'silent' | 'visible' | 'defined';

const INT32: IntType = { width: 32, signed: true };

/** The message a UBSan-style report has the form of: shown from memory, with the numbers filled in. */
export const sanitizerMessage = (x: number) =>
  `runtime error: signed integer overflow: ${x} + 1 cannot be represented in type 'int'`;

/** What each defence does to `overflows(x)` for a 32-bit signed x. */
export function defenceOutcome(id: DefenceId, x: number): DefenceOutcome {
  const overflowed = x === rangeOf(INT32).max;
  const wrapped = asWritten(x, INT32);
  switch (id) {
    case 'none':
      return { result: 0, outcome: overflowed ? 'the check was folded away, so the overflow goes unnoticed' : 'returns 0, which is right for this input', status: 'silent' };
    case 'wrapv':
      return { result: wrapped, outcome: overflowed ? 'signed wrap is defined, so the check stays and fires' : 'returns 0, as written', status: 'defined' };
    case 'sanitize':
      return { result: overflowed ? null : wrapped, outcome: overflowed ? `${sanitizerMessage(x)}; by default the run then continues, and with -fno-sanitize-recover it aborts (from memory)` : 'no report: nothing overflowed', status: 'visible' };
    case 'checked':
      return { result: overflowed ? 1 : 0, outcome: overflowed ? 'the add reports overflow in its return value, so the program can handle it' : 'the add reports no overflow', status: 'defined' };
    case 'language':
      return { result: wrapped, outcome: overflowed ? 'wraps, as in Java and Go (Rust release builds wrap, debug builds panic)' : 'returns 0, as written', status: 'defined' };
  }
}
