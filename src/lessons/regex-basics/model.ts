// Regex tester logic. Every match, group and replacement comes from the real JavaScript
// RegExp engine (matchAll + the `d` flag for indices, replaceAll). The only hand-written
// part is the token explainer, which describes the pattern and never decides what matches.

export type FlagId = 'g' | 'i' | 'm' | 's';
export const FLAGS: readonly FlagId[] = ['g', 'i', 'm', 's'];

/** Stop collecting after this many matches: the page stays fast on a pattern like `.?`. */
export const MAX_MATCHES = 200;

export interface Range {
  start: number;
  end: number;
}

export interface GroupHit extends Range {
  /** Capture number (1 = the first `(`). */
  n: number;
  name: string | null;
  /** null when the group didn't take part in this match (e.g. the other side of `|`). */
  text: string | null;
}

export interface MatchHit extends Range {
  text: string;
  groups: GroupHit[];
}

export type RunResult =
  | { ok: true; matches: MatchHit[]; capped: boolean }
  | { ok: false; error: string };

const flagString = (flags: readonly FlagId[], extra = '') => [...new Set([...flags, ...extra])].join('');

/** Compile, or return the engine's own error message. */
function compile(pattern: string, flags: string): RegExp | string {
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Every match of `pattern` in `text`, with capture groups and their positions. */
export function runRegex(pattern: string, flags: readonly FlagId[], text: string, max = MAX_MATCHES): RunResult {
  // `d` adds match indices; it changes nothing about what matches. Errors are reported
  // with the learner's own flags, so the message never mentions the internal `d`.
  const re = compile(pattern, flagString(flags, 'd'));
  if (typeof re === 'string') {
    const own = compile(pattern, flagString(flags));
    return { ok: false, error: typeof own === 'string' ? own : re };
  }
  const names = captureNames(pattern);
  const raw = re.global ? [...take(text.matchAll(re), max + 1)] : [re.exec(text)].filter((m): m is RegExpExecArray => m !== null);
  const capped = raw.length > max;
  const matches = raw.slice(0, max).map((m) => toHit(m, names));
  return { ok: true, matches, capped };
}

function* take<T>(it: Iterable<T>, n: number): Generator<T> {
  let i = 0;
  for (const x of it) {
    if (i++ >= n) return;
    yield x;
  }
}

function toHit(m: RegExpExecArray | RegExpMatchArray, names: readonly (string | null)[]): MatchHit {
  const indices = (m as RegExpMatchArray & { indices: ([number, number] | undefined)[] }).indices;
  const [start, end] = indices[0] ?? [m.index ?? 0, (m.index ?? 0) + m[0].length];
  const groups: GroupHit[] = [];
  for (let n = 1; n < m.length; n++) {
    const span = indices[n];
    groups.push({ n, name: names[n - 1] ?? null, text: m[n] ?? null, start: span?.[0] ?? -1, end: span?.[1] ?? -1 });
  }
  return { start, end, text: m[0], groups };
}

// Sentinels bracket each replacement so the preview can highlight what changed. They're
// stripped from user input first, so they can never collide with real text.
const OPEN = '\u0001';
const CLOSE = '\u0002';
export const stripSentinels = (s: string) => s.replaceAll(OPEN, '').replaceAll(CLOSE, '');

export type ReplaceResult =
  | { ok: true; out: string; parts: { text: string; replaced: boolean }[] }
  | { ok: false; error: string };

/**
 * `text.replaceAll(re, replacement)` with the real engine (so `$1`, `$<name>`, `$&` expand
 * exactly as JavaScript does). replaceAll needs the g flag, so it's always added here.
 */
export function replacePreview(pattern: string, flags: readonly FlagId[], text: string, replacement: string): ReplaceResult {
  const re = compile(pattern, flagString(flags, 'g'));
  if (typeof re === 'string') return { ok: false, error: re };
  const marked = stripSentinels(text).replaceAll(re, OPEN + stripSentinels(replacement) + CLOSE);
  const parts: { text: string; replaced: boolean }[] = [];
  for (const piece of marked.split(OPEN)) {
    const close = piece.indexOf(CLOSE);
    if (close < 0) {
      if (piece) parts.push({ text: piece, replaced: false });
      continue;
    }
    parts.push({ text: piece.slice(0, close), replaced: true });
    const rest = piece.slice(close + 1);
    if (rest) parts.push({ text: rest, replaced: false });
  }
  return { ok: true, out: parts.map((p) => p.text).join(''), parts };
}

// ─── Token explainer ───────────────────────────────────────────────────────

export type TokenKind =
  | 'literal' | 'class' | 'set' | 'any' | 'anchor' | 'boundary' | 'escape'
  | 'group-open' | 'group-close' | 'or' | 'backref' | 'unknown';

export interface Token extends Range {
  text: string;
  kind: TokenKind;
  /** Plain-English meaning. */
  meaning: string;
  /** False for syntax this explainer doesn't cover: it says so instead of guessing. */
  explained: boolean;
  /** Capture number for a capturing group's open/close token. */
  group?: number;
}

/** What an atom means once, and in the plural for "one or more …". */
interface AtomDesc {
  one: string;
  many: string;
}

const CLASS_ESCAPES: Record<string, AtomDesc> = {
  d: { one: 'a digit (0-9)', many: 'digits' },
  D: { one: 'a non-digit character', many: 'non-digit characters' },
  w: { one: 'a word character (letter, digit or _)', many: 'word characters' },
  W: { one: 'a non-word character', many: 'non-word characters' },
  s: { one: 'a whitespace character', many: 'whitespace characters' },
  S: { one: 'a non-whitespace character', many: 'non-whitespace characters' },
};

const CONTROL_ESCAPES: Record<string, string> = {
  n: 'a newline', t: 'a tab', r: 'a carriage return', f: 'a form feed', v: 'a vertical tab', '0': 'the null character',
};

const QUANTIFIER = /^(?:([*+?])|\{(\d+)(?:(,)(\d*))?\})(\??)/;

/** Break a pattern into chips with meanings. Concatenating every token's text gives back the pattern. */
export function tokenize(pattern: string, flags: readonly FlagId[] = []): Token[] {
  const multiline = flags.includes('m');
  const dotAll = flags.includes('s');
  const tokens: Token[] = [];
  const openGroups: { group?: number; label: string }[] = [];
  let captures = 0;
  let i = 0;

  const push = (start: number, end: number, kind: TokenKind, meaning: string, explained = true, group?: number) =>
    tokens.push({ start, end, text: pattern.slice(start, end), kind, meaning, explained, group });

  /** Consume a quantifier after an atom; returns the full atom+quantifier token. */
  const atom = (start: number, end: number, kind: TokenKind, desc: AtomDesc, explained = true) => {
    const q = QUANTIFIER.exec(pattern.slice(end));
    if (!q) return push(start, end, kind, capitalise(desc.one), explained);
    push(start, end + q[0].length, kind, capitalise(quantify(desc, q)), explained);
    i = end + q[0].length;
  };

  while (i < pattern.length) {
    const start = i;
    const c = pattern[i];

    if (c === '\\') {
      const e = pattern[i + 1];
      if (e === undefined) {
        push(i, i + 1, 'unknown', 'A backslash with nothing after it: not a valid pattern', false);
        i += 1;
        continue;
      }
      i += 2;
      if (CLASS_ESCAPES[e]) {
        atom(start, i, 'class', CLASS_ESCAPES[e]);
      } else if (e === 'b' || e === 'B') {
        push(start, i, 'boundary', e === 'b' ? 'A word boundary (between a word character and a non-word one)' : 'Not a word boundary');
      } else if (/[1-9]/.test(e)) {
        while (/\d/.test(pattern[i] ?? '')) i++;
        const n = pattern.slice(start + 1, i);
        atom(start, i, 'backref', { one: `the same text group ${n} matched`, many: `copies of what group ${n} matched` });
      } else if (e === 'k' && pattern[i] === '<') {
        const close = pattern.indexOf('>', i);
        if (close < 0) {
          push(start, i, 'unknown', 'Not explained here', false);
          continue;
        }
        const name = pattern.slice(i + 1, close);
        i = close + 1;
        atom(start, i, 'backref', { one: `the same text the "${name}" group matched`, many: `copies of the "${name}" group` });
      } else if (CONTROL_ESCAPES[e]) {
        atom(start, i, 'escape', { one: CONTROL_ESCAPES[e], many: `${CONTROL_ESCAPES[e].replace(/^an? /, '')}s` });
      } else if (e === 'x' && /^[0-9a-fA-F]{2}/.test(pattern.slice(i))) {
        i += 2;
        const ch = String.fromCharCode(parseInt(pattern.slice(start + 2, i), 16));
        atom(start, i, 'escape', { one: `the character ${quote(ch)}`, many: `${quote(ch)} characters` });
      } else if (e === 'u' && /^[0-9a-fA-F]{4}/.test(pattern.slice(i))) {
        i += 4;
        const ch = String.fromCharCode(parseInt(pattern.slice(start + 2, i), 16));
        atom(start, i, 'escape', { one: `the character ${quote(ch)}`, many: `${quote(ch)} characters` });
      } else if (/[A-Za-z]/.test(e)) {
        // \p{…}, \c…, and letters that mean something only in other flavours.
        atom(start, i, 'unknown', { one: `${pattern.slice(start, i)}: not explained here`, many: 'not explained here' }, false);
      } else {
        atom(start, i, 'escape', { one: `a literal ${quote(e)}`, many: `literal ${quote(e)} characters` });
      }
      continue;
    }

    if (c === '[') {
      const end = classEnd(pattern, i);
      if (end < 0) {
        push(i, pattern.length, 'unknown', 'A character set that never closes: not a valid pattern', false);
        i = pattern.length;
        continue;
      }
      i = end;
      const set = describeSet(pattern.slice(start + 1, end - 1));
      atom(start, end, 'set', set.desc, set.explained);
      continue;
    }

    if (c === '(') {
      const rest = pattern.slice(i + 1);
      let len = 1;
      let label: string;
      let group: number | undefined;
      const named = /^\?<([A-Za-z_$][\w$]*)>/.exec(rest);
      if (named) {
        group = ++captures;
        len += named[0].length;
        label = `group ${group} "${named[1]}"`;
        push(start, start + len, 'group-open', `Start of ${label}: remembers what it matches under the name "${named[1]}"`, true, group);
      } else if (rest.startsWith('?:')) {
        len += 2;
        label = 'a non-capturing group';
        push(start, start + len, 'group-open', 'Start of a group that groups without remembering (non-capturing)');
      } else if (rest.startsWith('?=') || rest.startsWith('?!')) {
        len += 2;
        label = rest.startsWith('?=') ? 'a lookahead' : 'a negative lookahead';
        push(start, start + len, 'group-open', rest.startsWith('?=') ? 'Lookahead: the text ahead must match this, without consuming it' : 'Negative lookahead: the text ahead must NOT match this');
      } else if (rest.startsWith('?<=') || rest.startsWith('?<!')) {
        len += 3;
        label = rest.startsWith('?<=') ? 'a lookbehind' : 'a negative lookbehind';
        push(start, start + len, 'group-open', rest.startsWith('?<=') ? 'Lookbehind: the text just before must match this' : 'Negative lookbehind: the text just before must NOT match this');
      } else if (rest.startsWith('?')) {
        len += 1;
        label = 'a group';
        push(start, start + len, 'unknown', 'A group with syntax not explained here', false);
      } else {
        group = ++captures;
        label = `group ${group}`;
        push(start, start + 1, 'group-open', `Start of group ${group}: remembers what it matches (a capture)`, true, group);
      }
      openGroups.push({ group, label });
      i = start + len;
      continue;
    }

    if (c === ')') {
      const g = openGroups.pop();
      i += 1;
      const label = g?.label ?? 'a group that was never opened';
      const q = QUANTIFIER.exec(pattern.slice(i));
      const repeat = q ? `, ${quantifierPhrase(q)}` : '';
      if (q) i += q[0].length;
      push(start, i, 'group-close', `End of ${label}${repeat}`, g !== undefined, g?.group);
      continue;
    }

    if (c === '|') {
      i += 1;
      push(start, i, 'or', 'Or: match the part on the left or the part on the right');
      continue;
    }

    if (c === '^' || c === '$') {
      i += 1;
      const where = c === '^' ? 'Start' : 'End';
      push(start, i, 'anchor', multiline ? `${where} of a line (the m flag is on)` : `${where} of the whole text (turn on m for each line)`);
      continue;
    }

    if (c === '.') {
      i += 1;
      atom(start, i, 'any', dotAll
        ? { one: 'any character, line breaks included (s flag)', many: 'characters of any kind' }
        : { one: 'any character except a line break', many: 'characters (any except line breaks)' });
      continue;
    }

    if ('*+?'.includes(c) || (c === '{' && QUANTIFIER.test(pattern.slice(i)))) {
      const q = QUANTIFIER.exec(pattern.slice(i));
      i += q ? q[0].length : 1;
      push(start, i, 'unknown', `${pattern.slice(start, i)} with nothing before it to repeat: not a valid pattern`, false);
      continue;
    }

    // A run of plain characters (a lone ']' or '{' is plain here too). A quantifier only
    // applies to the last character: "ab+" is "a" then "b+".
    let end = i + 1;
    while (end < pattern.length && !'\\[()|^$.*+?'.includes(pattern[end]) && !(pattern[end] === '{' && QUANTIFIER.test(pattern.slice(end)))) end++;
    const quantified = QUANTIFIER.test(pattern.slice(end));
    if (quantified && end - i > 1) end -= 1;
    const run = pattern.slice(i, end);
    i = end;
    if (run.length === 1) {
      atom(start, end, 'literal', charDesc(run));
    } else {
      push(start, end, 'literal', `The exact text ${quote(run)}`);
    }
  }
  return tokens;
}

function capitalise(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

/** Characters that read badly inside quotes get a name instead. */
const CHAR_NAMES: Record<string, { one: string; many: string }> = {
  ' ': { one: 'a space', many: 'spaces' },
  '"': { one: 'a double quote (")', many: 'double quotes' },
  "'": { one: "a single quote (')", many: 'single quotes' },
};

/** Literal text in «guillemets», with spaces made visible, so quotes and spaces stay readable. */
function quote(s: string) {
  if (s.length === 1 && CHAR_NAMES[s]) return CHAR_NAMES[s].one;
  return `«${s.replaceAll(' ', '␣')}»`;
}

const charDesc = (ch: string): AtomDesc =>
  CHAR_NAMES[ch] ? { one: CHAR_NAMES[ch].one, many: CHAR_NAMES[ch].many } : { one: `the character ${quote(ch)}`, many: `${quote(ch)} characters` };

interface Quantifier {
  sym?: string;
  min?: string;
  /** `{n,}` / `{n,m}` rather than an exact `{n}`. */
  range: boolean;
  max?: string;
  lazy: boolean;
}

const readQuantifier = (q: RegExpExecArray): Quantifier => ({ sym: q[1], min: q[2], range: q[3] === ',', max: q[4], lazy: q[5] === '?' });

/** Only repeats that can vary in length are greedy or lazy (an exact {3} is neither). */
function greed(q: Quantifier): string {
  if (q.lazy) return ' (lazy: as few as it can)';
  return q.sym === '*' || q.sym === '+' || q.range ? ' (greedy: as many as it can)' : '';
}

function quantifierPhrase(match: RegExpExecArray): string {
  const q = readQuantifier(match);
  if (q.sym === '*') return `repeated zero or more times${greed(q)}`;
  if (q.sym === '+') return `repeated one or more times${greed(q)}`;
  if (q.sym === '?') return `optional${greed(q)}`;
  if (!q.range) return `repeated exactly ${q.min} times`;
  if (q.max === '') return `repeated ${q.min} or more times${greed(q)}`;
  return `repeated ${q.min} to ${q.max} times${greed(q)}`;
}

/** "digits" + "{3}" → "exactly 3 digits". Greedy and lazy are always spelled out. */
function quantify(desc: AtomDesc, match: RegExpExecArray): string {
  const q = readQuantifier(match);
  if (q.sym === '*') return `zero or more ${desc.many}${greed(q)}`;
  if (q.sym === '+') return `one or more ${desc.many}${greed(q)}`;
  if (q.sym === '?') return `optional: ${desc.one}${greed(q)}`;
  if (!q.range) return q.min === '1' ? `exactly one: ${desc.one}` : `exactly ${q.min} ${desc.many}`;
  if (q.max === '') return `${q.min} or more ${desc.many}${greed(q)}`;
  return `${q.min} to ${q.max} ${desc.many}${greed(q)}`;
}

/** Index just past the `]` that closes the set opened at `open`, or -1. */
function classEnd(p: string, open: number): number {
  for (let j = open + 1; j < p.length; j++) {
    if (p[j] === '\\') j++;
    else if (p[j] === ']') return j + 1;
  }
  return -1;
}

function describeSet(body: string): { desc: AtomDesc; explained: boolean } {
  const negated = body.startsWith('^');
  const inner = negated ? body.slice(1) : body;
  const items: string[] = [];
  let explained = true;
  for (let j = 0; j < inner.length; j++) {
    const ch = inner[j];
    if (ch === '\\') {
      const e = inner[j + 1] ?? '';
      j++;
      if (CLASS_ESCAPES[e]) items.push(CLASS_ESCAPES[e].many);
      else if (CONTROL_ESCAPES[e]) items.push(CONTROL_ESCAPES[e]);
      else if (/[A-Za-z]/.test(e)) {
        items.push(`\\${e} (not explained)`);
        explained = false;
      } else items.push(quote(e));
    } else if (inner[j + 1] === '-' && j + 2 < inner.length && inner[j + 2] !== '\\') {
      items.push(`${ch}-${inner[j + 2]}`);
      j += 2;
    } else {
      items.push(quote(ch));
    }
  }
  const list = items.join(', ') || 'nothing';
  return negated
    ? { desc: { one: `any character except ${list}`, many: `characters other than ${list}` }, explained }
    : { desc: { one: `one of ${list}`, many: `characters from ${list}` }, explained };
}

/** The name of each capture group in order (null for unnamed), as the engine numbers them. */
export function captureNames(pattern: string): (string | null)[] {
  return tokenize(pattern)
    .filter((t) => t.kind === 'group-open' && t.group !== undefined)
    .map((t) => /^\(\?<([A-Za-z_$][\w$]*)>/.exec(t.text)?.[1] ?? null);
}

// ─── What each token matched (still the real engine) ───────────────────────

const PROBE = 'kineticProbe';

/**
 * The text a single token matched, found by wrapping just that token in a named group and
 * running the real engine again. Returns null when that can't be done faithfully:
 * alternation bars, non-capturing groups, and patterns with numbered back-references
 * (an extra group would renumber them).
 */
export function tokenRanges(pattern: string, flags: readonly FlagId[], text: string, tokens: readonly Token[]): (Range[] | null)[] {
  const run = runRegex(pattern, flags, text);
  if (!run.ok) return tokens.map(() => null);
  const numbered = tokens.some((t) => t.kind === 'backref' && /^\\\d/.test(t.text));
  return tokens.map((t) => {
    if (t.kind === 'or' || !t.explained) return null;
    if (t.kind === 'group-open' || t.kind === 'group-close') {
      if (t.group === undefined) return null;
      return run.matches.map((m) => m.groups[t.group! - 1]).filter((g) => g && g.start >= 0).map((g) => ({ start: g.start, end: g.end }));
    }
    if (numbered || pattern.includes(PROBE)) return null;
    const probe = `${pattern.slice(0, t.start)}(?<${PROBE}>${pattern.slice(t.start, t.end)})${pattern.slice(t.end)}`;
    const re = compile(probe, flagString(flags, 'd'));
    if (typeof re === 'string') return null;
    const found = re.global ? [...take(text.matchAll(re), MAX_MATCHES)] : [re.exec(text)].filter((m): m is RegExpExecArray => m !== null);
    return found.flatMap((m) => {
      const span = (m as RegExpMatchArray & { indices: { groups?: Record<string, [number, number] | undefined> } }).indices.groups?.[PROBE];
      return span ? [{ start: span[0], end: span[1] }] : [];
    });
  });
}

// ─── Highlighting ───────────────────────────────────────────────────────────

export interface Segment {
  text: string;
  /** Index of the match covering this text, or null outside every match. */
  match: number | null;
  /** Innermost capture group (1-based) covering it inside that match. */
  group: number | null;
  /** Inside a range the hovered token matched. */
  hover: boolean;
  /** A zero-width match or hover position (an anchor, a lookahead): drawn as a caret. */
  caret?: 'match' | 'hover';
}

/** Split `text` into runs that share the same match, innermost group and hover state. */
export function highlightSegments(text: string, matches: readonly MatchHit[], hover: readonly Range[] = []): Segment[] {
  const cuts = new Set([0, text.length]);
  const add = (r: Range) => {
    cuts.add(r.start);
    cuts.add(r.end);
  };
  matches.forEach((m) => {
    add(m);
    m.groups.forEach((g) => g.start >= 0 && add(g));
  });
  hover.forEach(add);
  const points = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);

  const covers = (r: Range, at: number) => r.start <= at && at < r.end;
  const segments: Segment[] = [];
  points.forEach((at, k) => {
    for (const m of matches) if (m.start === at && m.end === at) segments.push({ text: '', match: null, group: null, hover: false, caret: 'match' });
    for (const h of hover) if (h.start === at && h.end === at) segments.push({ text: '', match: null, group: null, hover: false, caret: 'hover' });
    const next = points[k + 1];
    if (next === undefined || next === at) return;
    const matchIndex = matches.findIndex((m) => covers(m, at));
    const m = matches[matchIndex];
    const inner = m?.groups
      .filter((g) => g.start >= 0 && covers(g, at))
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    segments.push({
      text: text.slice(at, next),
      match: matchIndex >= 0 ? matchIndex : null,
      group: inner?.n ?? null,
      hover: hover.some((h) => covers(h, at)),
    });
  });
  return segments;
}

// ─── Everything the Stage shows, in one call (run in a worker) ─────────────

export interface AnalyzeRequest {
  pattern: string;
  flags: FlagId[];
  text: string;
  /** Present in replace mode. */
  replacement?: string;
}

export interface Analysis {
  run: RunResult;
  tokens: Token[];
  hits: (Range[] | null)[];
  replaced: ReplaceResult | null;
}

export function analyze(req: AnalyzeRequest): Analysis {
  const text = stripSentinels(req.text);
  const tokens = tokenize(req.pattern, req.flags);
  const run = runRegex(req.pattern, req.flags, text);
  return {
    run,
    tokens,
    hits: tokenRanges(req.pattern, req.flags, text, tokens),
    replaced: req.replacement === undefined ? null : replacePreview(req.pattern, req.flags, text, req.replacement),
  };
}

// ─── Presets ────────────────────────────────────────────────────────────────

/** The same sample log the command-line lesson pipes through grep. */
export const ACCESS_LOG = [
  '203.0.113.7 - - [08/Mar/2026:09:15:02 +0000] "GET /api/users HTTP/1.1" 200 512',
  '198.51.100.4 - - [08/Mar/2026:09:15:04 +0000] "POST /api/orders HTTP/1.1" 500 87',
  '203.0.113.7 - - [08/Mar/2026:09:15:09 +0000] "GET /index.html HTTP/1.1" 200 2048',
  '192.0.2.33 - - [08/Mar/2026:09:15:11 +0000] "GET /api/orders/42 HTTP/1.1" 404 64',
  '198.51.100.4 - - [08/Mar/2026:09:15:15 +0000] "POST /api/orders HTTP/1.1" 500 87',
  '203.0.113.7 - - [08/Mar/2026:09:15:21 +0000] "GET /api/users/7 HTTP/1.1" 500 91',
  '192.0.2.33 - - [08/Mar/2026:09:15:24 +0000] "GET /index.html HTTP/1.1" 200 2048',
  '198.51.100.4 - - [08/Mar/2026:09:15:30 +0000] "POST /api/orders HTTP/1.1" 500 87',
  '203.0.113.50 - - [08/Mar/2026:09:15:33 +0000] "GET /api/health HTTP/1.1" 200 15',
  '192.0.2.33 - - [08/Mar/2026:09:15:38 +0000] "POST /api/login HTTP/1.1" 500 120',
  '203.0.113.7 - - [08/Mar/2026:09:15:41 +0000] "GET /favicon.ico HTTP/1.1" 404 0',
  '198.51.100.4 - - [08/Mar/2026:09:15:47 +0000] "POST /api/orders HTTP/1.1" 201 87',
].join('\n');

export interface Preset {
  id: string;
  label: string;
  pattern: string;
  flags: FlagId[];
  text: string;
  /** Present for presets that open in replace mode. */
  replacement?: string;
  caption: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'log',
    label: 'Access log',
    pattern: '"(?<method>GET|POST) (?<path>\\S+) [^"]*" (?<status>\\d{3})',
    flags: ['g'],
    text: ACCESS_LOG,
    caption: 'Pull the method, path and status code out of every log line: three named groups, one row per match.',
  },
  {
    id: 'date',
    label: 'ISO date → d/m/y',
    pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})',
    flags: ['g'],
    text: 'Released 2026-03-08, patched 2026-11-01, retired 2027-01-31.',
    replacement: '$<day>/$<month>/$<year>',
    caption: 'Named groups in a replacement: $<day>/$<month>/$<year> reorders each date. The preview is String.replaceAll.',
  },
  {
    id: 'greedy',
    label: 'Greedy <.+>',
    pattern: '<.+>',
    flags: ['g'],
    text: '<b>bold</b> and <i>italic</i>',
    caption: 'Greedy: .+ runs as far as it can, to the LAST > on the line, so one match swallows everything.',
  },
  {
    id: 'lazy',
    label: 'Lazy <.+?>',
    pattern: '<.+?>',
    flags: ['g'],
    text: '<b>bold</b> and <i>italic</i>',
    caption: 'Lazy: .+? stops at the FIRST > it can, so each tag is its own match.',
  },
  {
    id: 'anchors',
    label: 'Anchors ^ $',
    pattern: '^error: (.+)$',
    flags: ['g'],
    text: 'error: disk full\nwarning: cpu at 91%\nerror: request timed out',
    caption: 'Without the m flag, ^ and $ mean the start and end of the whole text, so this finds nothing. Turn on m.',
  },
  {
    id: 'escape',
    label: 'Escaping . vs \\.',
    pattern: 'file.txt',
    flags: ['g'],
    text: 'file.txt  file-txt  filetxt  file_txt',
    caption: 'An unescaped . means "any character", so file.txt also matches file-txt and file_txt. Escape it: file\\.txt.',
  },
  {
    id: 'email',
    label: 'Too-strict email',
    pattern: '^[a-z0-9.]+@[a-z]+\\.[a-z]{2,3}$',
    flags: ['g', 'm'],
    text: 'ada@example.com\na+tag@x.io\nbob@mail.company.co.uk\nMAX@EXAMPLE.COM\nnot-an-email',
    caption: 'This "email regex" rejects real addresses: a + tag, a sub-domain, capitals. Validate loosely, then confirm by sending a message.',
  },
];
