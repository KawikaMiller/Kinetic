/**
 * The lesson's regex dialect: literals, `.`, `|`, `*`, `+`, `?`, groups, simple sets and one back-reference
 * kind (`\1`..`\9`). Parsed by hand through core/parseKit, so no learner text ever reaches `RegExp`, `eval`
 * or `new Function`. Every refusal names its position.
 *
 * Node ids are handed out in the order nodes are finished, which is the post-order the construction
 * scene walks.
 */
import { parseKitLine, type KitRead, type TokenCursor, type TokenRule } from '../../core/parseKit';

export const MAX_PATTERN_CHARS = 24;
export const MAX_SUBJECT_CHARS = 24;

export type RepOp = '*' | '+' | '?';

export type RegexNode =
  | { kind: 'lit'; id: number; ch: string }
  | { kind: 'any'; id: number }
  | { kind: 'set'; id: number; chars: string[] }
  | { kind: 'backref'; id: number; group: number }
  | { kind: 'cat'; id: number; parts: RegexNode[] }
  | { kind: 'alt'; id: number; options: RegexNode[] }
  | { kind: 'rep'; id: number; op: RepOp; child: RegexNode }
  | { kind: 'group'; id: number; index: number; child: RegexNode };

export interface ParsedRegex {
  source: string;
  root: RegexNode;
  /** Number of capture groups. */
  groups: number;
  /** The pattern needs memory of what a group matched, which no automaton has. */
  usesBackref: boolean;
}

const TOKENS: TokenRule[] = [
  { kind: 'backref', pattern: /\\[1-9]/ },
  { kind: 'escape', pattern: /\\[.|*+?()[\]\\]/ },
  { kind: 'badescape', pattern: /\\[\s\S]?/ },
  { kind: 'unsupported', pattern: /[\^${}]/ },
  { kind: 'quant', pattern: /[*+?]/ },
  { kind: 'bar', pattern: /\|/ },
  { kind: 'open', pattern: /\(/ },
  { kind: 'close', pattern: /\)/ },
  { kind: 'lbracket', pattern: /\[/ },
  { kind: 'rbracket', pattern: /\]/ },
  { kind: 'dot', pattern: /\./ },
  { kind: 'lit', pattern: /[^\\|()[\]*+?.^${}\s]/u },
];

const unsupportedWhy = (ch: string) => `"${ch}" is not part of this small dialect.`;

/** Refuse the first space or tab: the token reader skips them, which would silently change the pattern. */
function firstSpace(text: string): number {
  return [...text].findIndex((c) => /\s/u.test(c));
}

function reader(): { read: (c: TokenCursor) => KitRead<ParsedRegex & { source: string }> } {
  let nextId = 0;
  let groups = 0;
  const closed = new Set<number>();
  let usesBackref = false;
  const id = () => nextId++;

  const readSet = (c: TokenCursor): KitRead<RegexNode> => {
    const chars: string[] = [];
    for (;;) {
      const t = c.peek();
      if (!t) return c.fail('missing ] to close the set.');
      if (t.kind === 'rbracket') {
        c.next();
        return chars.length ? { ok: true, value: { kind: 'set', id: id(), chars } } : c.failAt(t, 'an empty set matches nothing: list at least one character.');
      }
      c.next();
      if (t.kind === 'unsupported' || t.kind === 'badescape' || t.kind === 'backref' || t.kind === 'escape') {
        return c.failAt(t, t.kind === 'unsupported' ? unsupportedWhy(t.text) : 'escapes inside a set are not part of this dialect.');
      }
      if (t.kind === 'lbracket') return c.failAt(t, 'sets cannot be nested here.');
      if (t.text === '-') return c.failAt(t, 'ranges like a-c are not part of this dialect: list the characters.');
      chars.push(t.text);
    }
  };

  const readAtom = (c: TokenCursor): KitRead<RegexNode> => {
    const t = c.next();
    if (!t) return c.fail('nothing to repeat.');
    switch (t.kind) {
      case 'lit':
        return { ok: true, value: { kind: 'lit', id: id(), ch: t.text } };
      case 'escape':
        return { ok: true, value: { kind: 'lit', id: id(), ch: t.text[1] } };
      case 'dot':
        return { ok: true, value: { kind: 'any', id: id() } };
      case 'backref': {
        const group = Number(t.text[1]);
        if (!closed.has(group)) return c.failAt(t, `${t.text} needs group ${group} to be closed before it.`);
        usesBackref = true;
        return { ok: true, value: { kind: 'backref', id: id(), group } };
      }
      case 'lbracket':
        return readSet(c);
      case 'open': {
        const index = ++groups;
        const inner = readAlt(c);
        if (!inner.ok) return inner;
        const end = c.accept('close');
        if (!end) return c.failAt(t, `the group opened here is never closed: add a ).`);
        closed.add(index);
        return { ok: true, value: { kind: 'group', id: id(), index, child: inner.value } };
      }
      case 'quant':
        return c.failAt(t, 'nothing to repeat.');
      case 'rbracket':
        return c.failAt(t, 'this ] closes nothing.');
      case 'unsupported':
        return c.failAt(t, unsupportedWhy(t.text));
      default:
        return c.failAt(t, `unknown escape ${t.text}: only \\1 to \\9 and the escaped symbols are part of this dialect.`);
    }
  };

  const readRep = (c: TokenCursor): KitRead<RegexNode> => {
    const atom = readAtom(c);
    if (!atom.ok) return atom;
    const q = c.accept('quant');
    if (!q) return atom;
    const after = c.peek();
    if (after?.kind === 'quant') {
      return c.failAt(after, after.text === '?' ? 'lazy quantifiers (*? +? ??) are described in this lesson, not built in.' : 'nothing to repeat.');
    }
    return { ok: true, value: { kind: 'rep', id: id(), op: q.text as RepOp, child: atom.value } };
  };

  const readCat = (c: TokenCursor): KitRead<RegexNode> => {
    const parts: RegexNode[] = [];
    for (;;) {
      const next = c.peek();
      if (!next || next.kind === 'bar' || next.kind === 'close') break;
      const part = readRep(c);
      if (!part.ok) return part;
      parts.push(part.value);
    }
    if (parts.length === 0) return c.fail('empty alternative: write something here.');
    return { ok: true, value: parts.length === 1 ? parts[0] : { kind: 'cat', id: id(), parts } };
  };

  const readAlt = (c: TokenCursor): KitRead<RegexNode> => {
    const options: RegexNode[] = [];
    for (;;) {
      const option = readCat(c);
      if (!option.ok) return option;
      options.push(option.value);
      if (!c.accept('bar')) break;
    }
    return { ok: true, value: options.length === 1 ? options[0] : { kind: 'alt', id: id(), options } };
  };

  return {
    read: (c) => {
      const root = readAlt(c);
      if (!root.ok) return root;
      const stray = c.peek();
      if (stray) return c.failAt(stray, 'this ) closes nothing.');
      return { ok: true, value: { source: '', root: root.value, groups, usesBackref } };
    },
  };
}

export type PatternParse = { ok: true; value: ParsedRegex } | { ok: false; error: string };

/** Parse one pattern, or refuse it with a positioned sentence. */
export function parsePattern(text: string): PatternParse {
  const space = firstSpace(text);
  if (space >= 0) return { ok: false, error: `Position ${space + 1}: spaces and tabs are not part of this dialect.` };
  const r = reader();
  const parsed = parseKitLine(text, {
    tokens: TOKENS,
    maxChars: MAX_PATTERN_CHARS,
    empty: 'Type a pattern.',
    place: 'position',
    tooLong: (n, max) => `That pattern is ${n} characters; the limit is ${max}.`,
    read: r.read,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, value: { ...parsed.value, source: text } };
}

export type SubjectParse = { ok: true; value: string[] } | { ok: false; error: string };

/** The subject as code points, at most 24 of them. Any character is allowed: it is only ever matched, never read as a pattern. */
export function parseSubject(text: string): SubjectParse {
  const chars = [...text];
  if (chars.length > MAX_SUBJECT_CHARS) return { ok: false, error: `That subject is ${chars.length} characters; the limit is ${MAX_SUBJECT_CHARS}.` };
  return { ok: true, value: chars };
}

/** Every node, children before parents (the order of `id`). */
export function nodesInOrder(root: RegexNode): RegexNode[] {
  const out: RegexNode[] = [];
  const walk = (n: RegexNode) => {
    if (n.kind === 'cat') n.parts.forEach(walk);
    else if (n.kind === 'alt') n.options.forEach(walk);
    else if (n.kind === 'rep' || n.kind === 'group') walk(n.child);
    out.push(n);
  };
  walk(root);
  return out;
}

/** A readable name for a node in captions: `b`, `[bc]`, `(…)*`. */
export function nodeText(n: RegexNode): string {
  switch (n.kind) {
    case 'lit':
      return n.ch;
    case 'any':
      return '.';
    case 'set':
      return `[${n.chars.join('')}]`;
    case 'backref':
      return `\\${n.group}`;
    case 'cat':
      return n.parts.map(nodeText).join('');
    case 'alt':
      return n.options.map(nodeText).join('|');
    case 'rep':
      return `${n.child.kind === 'lit' || n.child.kind === 'any' || n.child.kind === 'set' || n.child.kind === 'group' ? nodeText(n.child) : `(${nodeText(n.child)})`}${n.op}`;
    case 'group':
      return `(${nodeText(n.child)})`;
  }
}

/** The parse's counts the Thompson bound is stated in: atoms (things that match one character) and operators. */
export function countParts(root: RegexNode): { atoms: number; operators: number; alternations: number; alternationNodes: number; quantifiers: number; joins: number } {
  let atoms = 0;
  let alternations = 0;
  let alternationNodes = 0;
  let quantifiers = 0;
  let joins = 0;
  for (const n of nodesInOrder(root)) {
    if (n.kind === 'lit' || n.kind === 'any' || n.kind === 'set' || n.kind === 'backref') atoms++;
    else if (n.kind === 'alt') {
      alternations += n.options.length - 1;
      alternationNodes++;
    }
    else if (n.kind === 'rep') quantifiers++;
    else if (n.kind === 'cat') joins += n.parts.length - 1;
  }
  return { atoms, operators: alternations + quantifiers + joins, alternations, alternationNodes, quantifiers, joins };
}
