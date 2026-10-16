/**
 * K3-22 parseKit: what a lesson needs to read a small learner-typed language (a regex dialect, grammar
 * rules, PDA transitions, macro definitions) without `eval`, `RegExp` or `new Function` ever touching
 * the learner's text, and to refuse with the place that is wrong.
 *
 *  - `tokenize`: lesson-authored token rules, matched in order at each position, whitespace skipped.
 *  - `cursorOf`: peek / next / fail over a token list, for a small hand-written recursive descent.
 *  - `parseKitRows`: one rule per line on top of `parseRows` (limits, comments, nouns), each line
 *    tokenized and read with a cursor; every refusal names its line AND column.
 *  - `parseKitLine`: the same for one single-line field (a pattern, an expression).
 *  - `parseBoundedList`: a typed list of whole numbers with a count and a value range, refused by reason.
 *
 * Columns are 1-based, count Unicode code points (an emoji is one column, a tab is one), and refer to
 * the line as typed, indent included. Line limits count UTF-16 units, as `parseRows` always has.
 */
import { parseIntegers, parseRows, type FieldParse, type RowFail, type RowParseOptions } from './parse';

// ── Tokens ──────────────────────────────────────────────────────────────

/** One token: what kind of thing it is, the characters it covers, and where it starts. */
export interface Token {
  kind: string;
  text: string;
  /** 1-based column of its first character on the line as typed. */
  column: number;
}

/** A lesson-authored token rule. `pattern` is matched at the current position only, so write it without anchors (it is compiled unicode-aware and sticky; give a literal using \p{L} the u flag so the type-checker agrees); it must never match the empty string. */
export interface TokenRule {
  kind: string;
  pattern: RegExp;
}

/** Characters as a reader counts them: code points, so one emoji is one column. */
const codePoints = (s: string) => [...s].length;

/** The rule's pattern as a sticky, unicode-aware copy (the lesson wrote it, never the learner). */
function stickyCopy(rule: TokenRule): RegExp {
  return new RegExp(rule.pattern.source, `${rule.pattern.flags.replace(/[ygu]/g, '')}uy`);
}

export type Tokenized = { ok: true; tokens: Token[] } | { ok: false; error: string; column: number };

/**
 * Cut `text` into tokens by trying `rules` in order at each position (first match wins, so list
 * longer spellings first). Whitespace between tokens is skipped; anything no rule starts with is
 * refused at its column. `startColumn` is the column of `text[0]` when `text` is the tail of a line.
 */
export function tokenize(text: string, rules: readonly TokenRule[], startColumn = 1): Tokenized {
  const compiled = rules.map((r) => ({ kind: r.kind, re: stickyCopy(r) }));
  const tokens: Token[] = [];
  let index = 0;
  let column = startColumn;
  while (index < text.length) {
    const rest = text.slice(index);
    const gap = /^\s+/u.exec(rest);
    if (gap) {
      index += gap[0].length;
      column += codePoints(gap[0]);
      continue;
    }
    let matched: { kind: string; text: string } | null = null;
    for (const { kind, re } of compiled) {
      re.lastIndex = index;
      const m = re.exec(text);
      if (m && m[0].length > 0) {
        matched = { kind, text: m[0] };
        break;
      }
    }
    if (!matched) {
      const [char] = rest;
      return { ok: false, column, error: `unexpected "${char}".` };
    }
    tokens.push({ kind: matched.kind, text: matched.text, column });
    index += matched.text.length;
    column += codePoints(matched.text);
  }
  return { ok: true, tokens };
}

// ── Reading tokens ──────────────────────────────────────────────────────

/** A position in a token list with the refusals a parser needs. */
export interface TokenCursor {
  /** The next token without taking it. */
  peek(): Token | undefined;
  /** Take the next token. */
  next(): Token | undefined;
  /** Take the next token only if it has this kind (or one of these kinds). */
  accept(...kinds: string[]): Token | undefined;
  /** Take every token that is left. */
  rest(): Token[];
  atEnd(): boolean;
  /** Refuse at the next token's column, or just past the last token when the line has run out. */
  fail(error: string): RowFail;
  /** Refuse at a token already taken. */
  failAt(token: Token, error: string): RowFail;
}

/** A cursor over `tokens`. `lineEndColumn` is where a refusal lands when the line has run out and there are no tokens. */
export function cursorOf(tokens: readonly Token[], lineEndColumn = 1): TokenCursor {
  let i = 0;
  const last = tokens[tokens.length - 1];
  const endColumn = last ? last.column + codePoints(last.text) : lineEndColumn;
  return {
    peek: () => tokens[i],
    next: () => tokens[i++],
    accept(...kinds) {
      const t = tokens[i];
      if (t && kinds.includes(t.kind)) {
        i++;
        return t;
      }
      return undefined;
    },
    rest() {
      const left = tokens.slice(i);
      i = tokens.length;
      return left;
    },
    atEnd: () => i >= tokens.length,
    fail: (error) => ({ ok: false, error, column: tokens[i]?.column ?? endColumn }),
    failAt: (token, error) => ({ ok: false, error, column: token.column }),
  };
}

/** What a reader of one line (or one field) returns: a value, or the sentence and the column to show. */
export type KitRead<T> = { ok: true; value: T } | RowFail;

/** Read all of a cursor's tokens with `read`, refusing whatever it leaves over ("unexpected ..."). */
function readAll<T>(cursor: TokenCursor, read: (cursor: TokenCursor) => KitRead<T>): KitRead<T> {
  const value = read(cursor);
  if (!value.ok) return value;
  const extra = cursor.peek();
  return extra ? cursor.failAt(extra, `unexpected "${extra.text}": nothing can follow here.`) : value;
}

// ── One rule per line ───────────────────────────────────────────────────

export interface KitRowOptions<T> extends Omit<RowParseOptions<T>, 'row'> {
  tokens: readonly TokenRule[];
  /** Read one line's tokens; refuse with `cursor.fail(...)`. Tokens left over are refused for you. */
  row: (cursor: TokenCursor, line: number) => KitRead<T>;
  /** The refusal for a table with no rules at all (default: none, an empty table is `ok` with no rows). */
  empty?: string;
}

export type KitRows<T> =
  | { ok: true; rows: { line: number; value: T }[] }
  | { ok: false; error: string; line: number; column?: number };

/**
 * A table of rules, one per line: `parseRows`' limits, comments and nouns, with each line tokenized
 * and read by `row`. A refusal says "Line 3, column 7: ..." (or "Line 3: ..." when a rule is wrong
 * as a whole and has no single place). Cross-line checks (duplicates) run on the returned rows.
 */
export function parseKitRows<T>(text: string, o: KitRowOptions<T>): KitRows<T> {
  const read = parseRows<T>(text, {
    maxRows: o.maxRows,
    maxLineChars: o.maxLineChars,
    comment: o.comment,
    noun: o.noun,
    row: (lineText, line, indent): KitRead<T> => {
      const cut = tokenize(lineText, o.tokens, indent + 1);
      if (!cut.ok) return cut;
      return readAll(cursorOf(cut.tokens, indent + 1), (cursor) => o.row(cursor, line));
    },
  });
  if (read.ok && o.empty !== undefined && read.rows.length === 0) return { ok: false, line: 1, error: o.empty };
  return read;
}

// ── One single-line field ───────────────────────────────────────────────

export interface KitLineOptions<T> {
  tokens: readonly TokenRule[];
  /** Refuse text longer than this many characters before reading it. */
  maxChars: number;
  read: (cursor: TokenCursor) => KitRead<T>;
  /** Refusal for nothing typed. */
  empty: string;
  /** Word before the number in a refusal: "Column 3: ..." (default) or "Position 3: ...". */
  place?: 'column' | 'position';
  /** Refusal for text over `maxChars`. */
  tooLong?: (chars: number, max: number) => string;
}

export type KitField<T> = { ok: true; value: T } | { ok: false; error: string; column?: number };

/** One field (a pattern, an expression): tokenized and read like a row, refused with its column. */
export function parseKitLine<T>(text: string, o: KitLineOptions<T>): KitField<T> {
  const word = o.place === 'position' ? 'Position' : 'Column';
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: o.empty };
  if (text.length > o.maxChars) {
    const tooLong = o.tooLong ?? ((n, max) => `That is ${n} characters; keep it to ${max} or fewer.`);
    return { ok: false, error: tooLong(text.length, o.maxChars) };
  }
  const indent = text.length - text.trimStart().length;
  const place = (r: { error: string; column?: number }): KitField<never> =>
    r.column === undefined ? { ok: false, error: r.error } : { ok: false, column: r.column, error: `${word} ${r.column}: ${r.error}` };
  const cut = tokenize(trimmed, o.tokens, indent + 1);
  if (!cut.ok) return place(cut);
  const read = readAll(cursorOf(cut.tokens, indent + 1), o.read);
  return read.ok ? read : place(read);
}

// ── A bounded list of whole numbers ─────────────────────────────────────

export interface BoundedListOptions {
  /** Fewest and most numbers. */
  min: number;
  max: number;
  /** Smallest and largest value allowed. */
  lo: number;
  hi: number;
  /** What the numbers are, for the default messages ("weights"). */
  noun: string;
  /** Refuse text longer than this many characters before splitting it. */
  maxChars?: number;
  messages?: Partial<{
    notNumbers: string;
    tooFew: (count: number) => string;
    tooMany: (count: number) => string;
    outOfRange: (value: number) => string;
    tooLong: (chars: number) => string;
  }>;
}

/**
 * A learner-typed list of whole numbers, commas and/or spaces between (`parseIntegers`), with its
 * count and every value checked and the reason named; `parseIntegers` alone returns only null.
 * Refuses the first value out of range, in the order typed.
 *
 *   parseBoundedList('3, 1, 99', { min: 2, max: 8, lo: 0, hi: 50, noun: 'values' })
 *   // { ok: false, error: '99 is outside 0 to 50 for values.' }
 */
export function parseBoundedList(text: string, o: BoundedListOptions): FieldParse<number[]> {
  const count = (n: number) => `Use ${o.min} to ${o.max} ${o.noun}: that is ${n}.`;
  const m = {
    notNumbers: 'Type whole numbers separated by commas or spaces.',
    tooFew: count,
    tooMany: count,
    outOfRange: (v: number) => `${v} is outside ${o.lo} to ${o.hi} for ${o.noun}.`,
    tooLong: (n: number) => `That is ${n} characters; keep it to ${o.maxChars} or fewer.`,
    ...o.messages,
  };
  if (o.maxChars !== undefined && text.length > o.maxChars) return { ok: false, error: m.tooLong(text.length) };
  const xs = parseIntegers(text);
  if (xs === null) return { ok: false, error: m.notNumbers };
  if (xs.length < o.min) return { ok: false, error: m.tooFew(xs.length) };
  if (xs.length > o.max) return { ok: false, error: m.tooMany(xs.length) };
  const bad = xs.find((x) => x < o.lo || x > o.hi);
  if (bad !== undefined) return { ok: false, error: m.outOfRange(bad) };
  return { ok: true, value: xs };
}
