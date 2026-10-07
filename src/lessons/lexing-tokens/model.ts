import { dfaStep, longestMatch, type Dfa, type State } from '../../core/automata';

/**
 * The batch's small expression language, as this lesson lexes it (each T2-B5 lesson keeps
 * its own copy of these constants, since lessons can't import each other):
 *   numbers 42 and 3.14 · identifiers [A-Za-z_][A-Za-z0-9_]* · keywords let fn if then else true false
 *   operators + ++ - * / ^ = · parentheses · strings "…" on one line · // comments · spaces, tabs, newlines
 */
export const KEYWORDS = ['let', 'fn', 'if', 'then', 'else', 'true', 'false'] as const;

export type Kind = 'NUMBER' | 'IDENT' | 'KEYWORD' | 'STRING' | 'OP' | 'LPAREN' | 'RPAREN' | 'WS' | 'COMMENT' | 'ERROR';

/** Kinds the lexer throws away instead of handing to the parser. */
export const DISCARDED: readonly Kind[] = ['WS', 'COMMENT'];

export interface Token {
  kind: Kind;
  text: string;
  /** Code-unit offsets into the source, end exclusive. */
  start: number;
  end: number;
  /** 1-based, counting characters (code points), as an editor shows them. */
  line: number;
  col: number;
  /** Error tokens only. */
  message?: string;
}

// ── The combined lexer DFA ───────────────────────────────────────────

const range = (a: string, b: string) => Array.from({ length: b.charCodeAt(0) - a.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(a.charCodeAt(0) + i));
const DIGITS = range('0', '9');
const LETTERS = [...range('a', 'z'), ...range('A', 'Z'), '_'];
const SPACE = [' ', '\t', '\n'];
/** Every character the lesson's DFA names: printable ASCII, tab and newline. */
const ASCII = [...range(' ', '~'), '\t', '\n'];
/**
 * Stands in for every other character (é, emoji halves…) so the DFA's alphabet stays finite:
 * comments and strings may contain anything, no other token may. core/automata has no
 * "any other symbol" arrow, so the source is mapped through `toAlphabet` first.
 */
export const OTHER = '¤';
const ANY = [...ASCII, OTHER];

/** The source with every character outside the DFA's ASCII set replaced by OTHER, code unit for code unit. */
export const toAlphabet = (source: string) => source.replace(/[^\t\n\x20-\x7e]/g, OTHER);

/** A transition on a class of characters, with the label drawn on its arrow. */
interface Move {
  from: State;
  to: State;
  label: string;
  chars: readonly string[];
}

export const MOVES: Move[] = [
  { from: 'S', to: 'ws', label: '␣', chars: SPACE },
  { from: 'ws', to: 'ws', label: '␣', chars: SPACE },
  { from: 'S', to: 'int', label: '0-9', chars: DIGITS },
  { from: 'int', to: 'int', label: '0-9', chars: DIGITS },
  { from: 'int', to: 'dot', label: '.', chars: ['.'] },
  { from: 'dot', to: 'frac', label: '0-9', chars: DIGITS },
  { from: 'frac', to: 'frac', label: '0-9', chars: DIGITS },
  { from: 'S', to: 'id', label: 'a-z_', chars: LETTERS },
  { from: 'id', to: 'id', label: 'a-z0-9_', chars: [...LETTERS, ...DIGITS] },
  { from: 'S', to: 'plus', label: '+', chars: ['+'] },
  { from: 'plus', to: 'pp', label: '+', chars: ['+'] },
  { from: 'S', to: 'op', label: '-*^=', chars: ['-', '*', '^', '='] },
  { from: 'S', to: 'slash', label: '/', chars: ['/'] },
  { from: 'slash', to: 'cmt', label: '/', chars: ['/'] },
  { from: 'cmt', to: 'cmt', label: 'not ⏎', chars: ANY.filter((c) => c !== '\n') },
  { from: 'S', to: 'lp', label: '(', chars: ['('] },
  { from: 'S', to: 'rp', label: ')', chars: [')'] },
  { from: 'S', to: 'str', label: '"', chars: ['"'] },
  { from: 'str', to: 'str', label: 'not "', chars: ANY.filter((c) => c !== '"' && c !== '\n') },
  { from: 'str', to: 'strEnd', label: '"', chars: ['"'] },
];

/** Which token each accepting state produces. IDENT becomes KEYWORD by rule order (see `lex`). */
export const ACCEPTS: Record<State, Kind> = {
  ws: 'WS', int: 'NUMBER', frac: 'NUMBER', id: 'IDENT', plus: 'OP', pp: 'OP', op: 'OP', slash: 'OP', cmt: 'COMMENT', lp: 'LPAREN', rp: 'RPAREN', strEnd: 'STRING',
};

export const STATE_LABEL: Record<State, string> = {
  S: 'S', ws: 'ws', int: 'int', dot: '.', frac: 'frac', id: 'id', plus: '+', pp: '++', op: 'op', slash: '/', cmt: '//', lp: '(', rp: ')', str: '"…', strEnd: '"…"',
};

const STATES = Object.keys(STATE_LABEL);

export const LEXER: Dfa = {
  kind: 'dfa',
  states: STATES,
  alphabet: ANY,
  start: 'S',
  accept: Object.keys(ACCEPTS),
  delta: Object.fromEntries(STATES.map((s) => [s, Object.fromEntries(MOVES.filter((m) => m.from === s).flatMap((m) => m.chars.map((c) => [c, m.to])))])),
};

// ── Lexing ───────────────────────────────────────────────────────────

export interface LexOptions {
  /** The keyword rule is listed before the identifier rule, so it wins ties of equal length. */
  keywordsFirst: boolean;
}

/** The token kind for an accepted lexeme: keywords beat identifiers only when their rule comes first. */
export function classify(state: State, text: string, opts: LexOptions): Kind {
  const kind = ACCEPTS[state];
  if (kind === 'IDENT' && opts.keywordsFirst && (KEYWORDS as readonly string[]).includes(text)) return 'KEYWORD';
  return kind;
}

/** 1-based line and column (in characters) of an offset. */
export function position(source: string, offset: number): { line: number; col: number } {
  const before = source.slice(0, offset).split('\n');
  return { line: before.length, col: Array.from(before[before.length - 1]).length + 1 };
}

/** The error token at `pos` when no rule matches there: an unclosed string runs to the end of its line. */
export function errorAt(source: string, pos: number): Token {
  const at = position(source, pos);
  if (source[pos] === '"') {
    const nl = source.indexOf('\n', pos);
    const end = nl === -1 ? source.length : nl;
    return { kind: 'ERROR', text: source.slice(pos, end), start: pos, end, ...at, message: 'string never closed' };
  }
  const ch = String.fromCodePoint(source.codePointAt(pos)!);
  return { kind: 'ERROR', text: ch, start: pos, end: pos + ch.length, ...at, message: `unexpected character ${JSON.stringify(ch)}` };
}

/** Maximal munch over the combined DFA. Errors become tokens and lexing resumes after them. */
export function lex(source: string, opts: LexOptions = { keywordsFirst: true }): Token[] {
  const out: Token[] = [];
  const input = toAlphabet(source);
  let pos = 0;
  while (pos < source.length) {
    const m = longestMatch(LEXER, input, pos);
    if (!m) {
      const err = errorAt(source, pos);
      out.push(err);
      pos = err.end;
      continue;
    }
    const text = source.slice(pos, m.end);
    out.push({ kind: classify(m.state, text, opts), text, start: pos, end: m.end, ...position(source, pos) });
    pos = m.end;
  }
  return out;
}

/** The tokens a parser would receive: whitespace and comments dropped. */
export const kept = (tokens: readonly Token[]) => tokens.filter((t) => !DISCARDED.includes(t.kind));

// ── One scan, character by character (the frames replay this) ───────

export interface ScanStep {
  /** Index of the character just read. */
  at: number;
  /** DFA state after reading it; null when there was no arrow (the DFA died). */
  state: State | null;
}

export interface Scan {
  start: number;
  steps: ScanStep[];
  /** End of the longest accepted prefix (exclusive), or null: no token starts here. */
  acceptEnd: number | null;
  token: Token;
  /** Characters read past the last accepting point and given back (the dying character included). */
  givenBack: number;
}

/** Every scan the lexer makes, with each character it reads: what maximal munch actually does. */
export function scans(source: string, opts: LexOptions = { keywordsFirst: true }): Scan[] {
  const tokens = lex(source, opts);
  const input = toAlphabet(source);
  return tokens.map((token) => {
    const steps: ScanStep[] = [];
    let state: State | null = LEXER.start;
    let acceptEnd: number | null = null;
    for (let i = token.start; i < source.length && state !== null; i++) {
      state = dfaStep(LEXER, state, input[i]);
      steps.push({ at: i, state });
      if (state !== null && LEXER.accept.includes(state)) acceptEnd = i + 1;
    }
    const readTo = steps.length ? steps[steps.length - 1].at + 1 : token.start;
    const end = token.kind === 'ERROR' ? token.end : acceptEnd!;
    return { start: token.start, steps, acceptEnd: token.kind === 'ERROR' ? null : acceptEnd, token, givenBack: Math.max(0, readTo - end) };
  });
}

// ── The learner's line ───────────────────────────────────────────────

export const MAX_SOURCE = 80;

export type SourceCheck = { ok: true; source: string } | { ok: false; error: string };

/** Anything typed is lexed (unknown characters become error tokens); only the length is capped. */
export function checkSource(text: string): SourceCheck {
  if (Array.from(text).length > MAX_SOURCE) return { ok: false, error: `Keep the line to ${MAX_SOURCE} characters or fewer.` };
  return { ok: true, source: text };
}

export const PRESETS = [
  { id: 'let', label: 'let total = …', source: 'let total = price*qty + 10' },
  { id: 'iffy', label: 'iffy = 1', source: 'iffy = 1' },
  { id: 'plus', label: 'a+++b', source: 'a+++b' },
  { id: 'dots', label: 'x = 3.14.15', source: 'x = 3.14.15' },
  { id: 'backup', label: 'n = 3.x', source: 'n = 3.x' },
  { id: 'string', label: '"unterminated', source: 'say "unterminated' },
  { id: 'comment', label: '// comment', source: 'x = 1 // the rest is ignored' },
  { id: 'if', label: 'if x then 1', source: 'if x then 1 else 2' },
] as const;
