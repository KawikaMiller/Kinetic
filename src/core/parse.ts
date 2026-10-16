/**
 * A plain decimal integer as a learner types it: digits with an optional leading minus.
 * Number() also accepts "0x10", "1e1", "+5", "5." and so on, which nobody means as a whole number here.
 */
const DECIMAL_INT = /^-?\d+$/;

/** One integer typed by the learner, like " -7 ". Null when empty or not a plain decimal integer. */
export function parseInteger(text: string): number | null {
  const t = text.trim();
  return DECIMAL_INT.test(t) ? Number(t) : null;
}

/**
 * Parse a list typed by the learner, like "1, 3 ,4  8", into integers.
 * Commas and/or whitespace separate values. Null when empty or when any value isn't a plain decimal integer.
 */
export function parseIntegers(text: string): number[] | null {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  return tokens.length && tokens.every((t) => DECIMAL_INT.test(t)) ? tokens.map(Number) : null;
}

// ── Bounded integer fields ───────────────────────────────────────────

/** Prefixed spellings a bounded-integer field can accept besides plain digits: 0x… and 0b…. */
export type IntPrefix = 'hex' | 'binary';

/** A field's parse: the value, or the sentence to show the learner instead. */
export type FieldParse<T> = { ok: true; value: T } | { ok: false; error: string };

export interface IntFieldMessages<T> {
  /** Nothing typed (after any ignored separators are removed). */
  empty: string;
  /** Not a whole number in an accepted spelling; gets the text as typed, trimmed. */
  invalid: (typed: string) => string;
  /** Below `min`; gets the value read and the cleaned text it came from. */
  tooSmall: (value: T, text: string) => string;
  /** Above `max`; gets the value read and the cleaned text it came from. */
  tooBig: (value: T, text: string) => string;
  /** Refuse any leading minus (- or −) with this before anything else is checked ("Primes are positive"). */
  negative?: string;
  /** With `thousands`: refuse commas that don't sit between groups of three digits with this, ahead of `invalid`. */
  grouping?: string;
}

export interface IntFieldOptions<T extends number | bigint> {
  min: T;
  max: T;
  /** Prefixed spellings also accepted (case-insensitive): 'hex' reads 0xCA, 'binary' reads 0b1010. */
  prefixes?: readonly IntPrefix[];
  /** Base of plain, unprefixed digits (default 10). A hex-only field passes 16, so "1e400" is 0x1E400. */
  plainRadix?: 10 | 16;
  /** Ignore underscores anywhere: 0b1100_1010. */
  underscores?: boolean;
  /** Ignore whitespace anywhere: 0xFFFF FFFF. */
  spaces?: boolean;
  /** Accept commas between groups of three digits: 1,000,003. */
  thousands?: boolean;
  /** Read a leading typographic minus (−7) as a minus. */
  typographicMinus?: boolean;
  messages?: Partial<IntFieldMessages<T>>;
}

const THOUSANDS = /^\d{1,3}(,\d{3})+$/;
const LEADING_MINUS = /^[-−]/;

/** The exact integer `t` spells under the field's rules, or null. Only plain decimal takes a minus. */
function spelledInteger(t: string, prefixes: readonly IntPrefix[], plainRadix: 10 | 16): bigint | null {
  if (prefixes.includes('hex') && /^0x[0-9a-f]+$/i.test(t)) return BigInt(`0x${t.slice(2)}`);
  if (prefixes.includes('binary') && /^0b[01]+$/i.test(t)) return BigInt(`0b${t.slice(2)}`);
  if (plainRadix === 16) return /^[0-9a-f]+$/i.test(t) ? BigInt(`0x${t}`) : null;
  return /^-?\d+$/.test(t) ? BigInt(t) : null;
}

/**
 * The shared core: reads exactly (as a bigint, so a long digit run is refused, never rounded)
 * and checks the bounds; `toT` turns the bigint into the caller's flavour for the messages.
 */
function parseField<T extends number | bigint>(text: string, o: IntFieldOptions<T>, toT: (v: bigint) => T): FieldParse<T> {
  const range = () => `Keep it between ${o.min} and ${o.max}.`;
  const m: IntFieldMessages<T> = {
    empty: 'Type a whole number.',
    invalid: (typed) => `"${typed}" isn't a whole number.`,
    tooSmall: range,
    tooBig: range,
    ...o.messages,
  };
  const typed = text.trim();
  let t = typed;
  if (o.underscores) t = t.replace(/_/g, '');
  if (o.spaces) t = t.replace(/\s/g, '');
  if (!t) return { ok: false, error: m.empty };
  if (o.thousands && t.includes(',')) {
    if (THOUSANDS.test(t)) t = t.replace(/,/g, '');
    else if (m.grouping) return { ok: false, error: m.grouping };
  }
  if (m.negative && LEADING_MINUS.test(t)) return { ok: false, error: m.negative };
  if (o.typographicMinus) t = t.replace(/^−/, '-');
  const exact = spelledInteger(t, o.prefixes ?? [], o.plainRadix ?? 10);
  if (exact === null) return { ok: false, error: m.invalid(typed) };
  if (exact < BigInt(o.min)) return { ok: false, error: m.tooSmall(toT(exact), t) };
  if (exact > BigInt(o.max)) return { ok: false, error: m.tooBig(toT(exact), t) };
  return { ok: true, value: toT(exact) };
}

/**
 * One whole number from a learner-typed field, within [min, max], or the reason it's refused.
 * Plain decimal by default; options add 0x / 0b spellings, a hex-only field, ignored
 * underscores / spaces, thousands commas and a typographic minus. Decimals, exponents
 * ("1e3"), "+5", Infinity and markup are always refused, and out-of-range values are
 * refused rather than clamped, masked or rounded. Every message has a generic default.
 *
 *   parseBoundedInt(text, { min: 0, max: 999, messages: { tooBig: () => 'Weights go from 0 to 999.' } })
 *   parseBoundedInt(text, { min: 0, max: 255, prefixes: ['hex', 'binary'], underscores: true })
 */
export const parseBoundedInt = (text: string, o: IntFieldOptions<number>): FieldParse<number> => parseField(text, o, Number);

/** parseBoundedInt for values past 2⁵³ (a 40-digit prime candidate, a 64-bit register). */
export const parseBoundedBigInt = (text: string, o: IntFieldOptions<bigint>): FieldParse<bigint> => parseField(text, o, (v) => v);

export interface DecimalFieldOptions {
  min: number;
  max: number;
  /** Read a leading typographic minus (−2.5) as a minus. */
  typographicMinus?: boolean;
  messages?: Partial<IntFieldMessages<number>>;
}

/** A plain decimal: optional minus, digits, optionally a point and more digits ("2.5", "-3", not ".5" or "2."). */
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * One plain decimal from a learner-typed field, within [min, max], or the reason it's refused.
 * Exponents ("1e3"), "+5", Infinity, NaN, units and markup are always refused; out-of-range
 * values are refused rather than clamped. Bounds are compared on the parsed double. Same
 * message shape as parseBoundedInt, with generic defaults.
 *
 *   parseBoundedDecimal(text, { min: 0, max: 1e6, messages: { tooSmall: () => "A weight can't be negative." } })
 */
export function parseBoundedDecimal(text: string, o: DecimalFieldOptions): FieldParse<number> {
  const range = () => `Keep it between ${o.min} and ${o.max}.`;
  const m: IntFieldMessages<number> = {
    empty: 'Type a number.',
    invalid: (typed) => `"${typed}" isn't a plain number like 2.5 or -3.`,
    tooSmall: range,
    tooBig: range,
    ...o.messages,
  };
  const typed = text.trim();
  if (!typed) return { ok: false, error: m.empty };
  if (m.negative && LEADING_MINUS.test(typed)) return { ok: false, error: m.negative };
  const t = o.typographicMinus ? typed.replace(/^−/, '-') : typed;
  if (!PLAIN_DECIMAL.test(t)) return { ok: false, error: m.invalid(typed) };
  const v = Number(t);
  if (v < o.min) return { ok: false, error: m.tooSmall(v, t) };
  if (v > o.max) return { ok: false, error: m.tooBig(v, t) };
  return { ok: true, value: v };
}

/** A learner-edited table, one rule per line: every row that parsed, or the first refusal with its 1-based line. */
export type RowParse<T> = { ok: true; rows: { line: number; value: T }[] } | { ok: false; error: string; line: number; column?: number };

/** A row reader's refusal; `column` (1-based, on the line as typed, indent included) makes the message "Line 3, column 7: ...". */
export type RowFail = { ok: false; error: string; column?: number };

const DEFAULT_ROW_NOUN = { one: 'rule', many: 'rules' };

export interface RowParseOptions<T> {
  /** Refuse a table with more rules than this (blank and comment lines don't count). */
  maxRows: number;
  /** Refuse a line longer than this many characters, before reading it. */
  maxLineChars: number;
  /** Lines starting with this (after trimming) are comments; default `#`. */
  comment?: string;
  /** What one row is called in the over-limit messages ("keep each rule", "more than 40 rules"); default rule / rules. */
  noun?: { one: string; many: string };
  /** Read one trimmed, non-empty line (`indent` is how many characters were trimmed off its front); return the value or the sentence to show. */
  row: (text: string, line: number, indent: number) => { ok: true; value: T } | RowFail;
}

/**
 * Reads a table of rules, one per line, with the bounds checked first and refusals that name the
 * line. Hand-written, so learner text never reaches `eval`. The caller reads each line with `row`,
 * then checks anything across lines (a duplicate rule) on the returned rows.
 */
export function parseRows<T>(text: string, o: RowParseOptions<T>): RowParse<T> {
  const comment = o.comment ?? '#';
  const noun = o.noun ?? DEFAULT_ROW_NOUN;
  const rows: { line: number; value: T }[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    if (lines[i].length > o.maxLineChars) {
      return { ok: false, line, error: `Line ${line} is ${lines[i].length} characters; keep each ${noun.one} to ${o.maxLineChars} or fewer.` };
    }
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith(comment)) continue;
    if (rows.length >= o.maxRows) return { ok: false, line, error: `Line ${line}: more than ${o.maxRows} ${noun.many}; delete one first.` };
    const read = o.row(trimmed, line, lines[i].length - lines[i].trimStart().length);
    if (!read.ok) {
      if (read.column === undefined) return { ok: false, line, error: `Line ${line}: ${read.error}` };
      return { ok: false, line, column: read.column, error: `Line ${line}, column ${read.column}: ${read.error}` };
    }
    rows.push({ line, value: read.value });
  }
  return { ok: true, rows };
}
