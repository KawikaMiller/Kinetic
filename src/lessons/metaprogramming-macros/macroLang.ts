/**
 * The toy expression language of the macro scene, read by a hand-written parser (core/parseKit tokens and
 * cursor). Nothing the learner types is ever run as JavaScript: expressions become a tree that a small
 * evaluator walks.
 *
 *   expr   := 'let' name '=' expr 'in' expr | sum
 *   sum    := term (('+' | '-') term)*          term := factor (('*' | '/') factor)*
 *   factor := number | name | 'next' '(' ')' | NAME '(' expr (',' expr)* ')' | '(' expr ')'
 *
 * `next()` returns 1, 2, 3, ... on its successive calls. A macro is `macro NAME(p, q) = template`.
 */
import { cursorOf, parseKitLine, tokenize, type KitRead, type Token, type TokenCursor, type TokenRule } from '../../core/parseKit';

export const MAX_TEMPLATE_CHARS = 60;
export const MAX_DEFINITION_CHARS = 80;
export const MAX_CALL_CHARS = 40;
export const MAX_PARAMS = 3;
const KEYWORDS = new Set(['macro', 'let', 'in']);

/** Where a piece of the expanded program came from. */
export type Origin = 'caller' | 'template' | 'renamed';

/** A token that knows its origin, and which copy of an argument it belongs to (text substitution only). */
export interface MacroToken extends Token {
  origin: Origin;
  arg: number | null;
}

export interface Node {
  id: number;
  kind: 'num' | 'var' | 'next' | 'bin' | 'let' | 'call';
  /** The number as typed, the name, the operator, the binder, or the macro called. */
  text: string;
  kids: Node[];
  origin: Origin;
  arg: number | null;
}

const TOKENS: TokenRule[] = [
  { kind: 'number', pattern: /\d+/ },
  { kind: 'name', pattern: /[A-Za-z_][A-Za-z0-9_]*/ },
  { kind: 'punct', pattern: /[(),=+\-*/]/ },
];

/** Tokens of a typed text, all of one origin. */
export function lex(text: string, origin: Origin): { ok: true; tokens: MacroToken[] } | { ok: false; error: string; column: number } {
  const cut = tokenize(text, TOKENS);
  if (!cut.ok) return cut;
  return { ok: true, tokens: cut.tokens.map((t) => ({ ...t, origin, arg: null })) };
}

export interface Builder {
  next: () => number;
}
export const newBuilder = (): Builder => {
  let n = 0;
  return { next: () => n++ };
};

const tokenOf = (t: Token): MacroToken => t as MacroToken;

/** Read one expression from the cursor. */
export function readExpression(c: TokenCursor, b: Builder): KitRead<Node> {
  const node = (kind: Node['kind'], text: string, kids: Node[], t: MacroToken): Node => ({ id: b.next(), kind, text, kids, origin: t.origin, arg: t.arg });

  /** Take the next token only if it is this punctuation. */
  const symbol = (text: string): boolean => {
    const t = c.peek();
    if (!t || t.kind !== 'punct' || t.text !== text) return false;
    c.next();
    return true;
  };

  const expr = (): KitRead<Node> => {
    const first = c.peek();
    if (first && first.kind === 'name' && first.text === 'let') {
      c.next();
      const name = c.accept('name');
      if (!name || KEYWORDS.has(name.text)) return c.fail('let needs a name to bind, like: let t = 3 in t.');
      if (!symbol('=')) return c.fail('expected "=" after the name.');
      const value = expr();
      if (!value.ok) return value;
      const inTok = c.accept('name');
      if (!inTok || inTok.text !== 'in') return c.fail('expected "in" after the value of let.');
      const body = expr();
      if (!body.ok) return body;
      const bound = node('let', name.text, [value.value, body.value], tokenOf(first));
      return { ok: true, value: bound };
    }
    return sum();
  };

  const binary = (next: () => KitRead<Node>, ops: string): KitRead<Node> => {
    let left = next();
    if (!left.ok) return left;
    for (;;) {
      const op = c.peek();
      if (!op || op.kind !== 'punct' || !ops.includes(op.text)) return left;
      c.next();
      const right = next();
      if (!right.ok) return right;
      left = { ok: true, value: node('bin', op.text, [left.value, right.value], tokenOf(op)) };
    }
  };
  const sum = (): KitRead<Node> => binary(term, '+-');
  const term = (): KitRead<Node> => binary(factor, '*/');

  const factor = (): KitRead<Node> => {
    const t = c.next();
    if (!t) return c.fail('an expression is missing here.');
    if (t.kind === 'number') return { ok: true, value: node('num', t.text, [], tokenOf(t)) };
    if (t.kind === 'punct' && t.text === '(') {
      const inner = expr();
      if (!inner.ok) return inner;
      if (!symbol(')')) return c.fail('expected ")" to close the bracket.');
      return inner;
    }
    if (t.kind === 'name' && !KEYWORDS.has(t.text)) {
      const open = c.peek();
      if (open && open.kind === 'punct' && open.text === '(') {
        c.next();
        const args: Node[] = [];
        if (!(c.peek()?.kind === 'punct' && c.peek()!.text === ')')) {
          for (;;) {
            const arg = expr();
            if (!arg.ok) return arg;
            args.push(arg.value);
            const sep = c.peek();
            if (sep && sep.kind === 'punct' && sep.text === ',') {
              c.next();
              continue;
            }
            break;
          }
        }
        const close = c.next();
        if (!close || close.text !== ')') return c.fail('expected ")" to end the call.');
        if (t.text === 'next') return args.length === 0 ? { ok: true, value: node('next', 'next()', [], tokenOf(t)) } : c.failAt(t, 'next() takes no arguments.');
        return { ok: true, value: node('call', t.text, args, tokenOf(t)) };
      }
      return { ok: true, value: node('var', t.text, [], tokenOf(t)) };
    }
    return c.failAt(t, `unexpected "${t.text}": an expression starts with a number, a name, "let" or a bracket.`);
  };

  return expr();
}

export interface MacroDef {
  name: string;
  params: string[];
  /** The template's tokens, origin 'template'. */
  body: MacroToken[];
  bodyTree: Node;
}

export type DefParse = { ok: true; value: MacroDef } | { ok: false; error: string };

/** `macro NAME(p, q) = template`, template at most 60 characters. */
export function parseMacroDef(text: string): DefParse {
  const eq = text.indexOf('=');
  if (eq >= 0 && text.slice(eq + 1).trim().length > MAX_TEMPLATE_CHARS) return { ok: false, error: `The template is ${text.slice(eq + 1).trim().length} characters; the limit is ${MAX_TEMPLATE_CHARS}.` };
  const read = parseKitLine<{ name: string; params: string[]; rest: Token[] }>(text, {
    tokens: TOKENS,
    maxChars: MAX_DEFINITION_CHARS,
    empty: 'Type a macro, like: macro SQUARE(x) = x * x',
    read: (c) => {
      const kw = c.accept('name');
      if (!kw || kw.text !== 'macro') return c.fail('a definition starts with the word macro.');
      const name = c.accept('name');
      if (!name || KEYWORDS.has(name.text) || name.text === 'next') return c.fail('a macro needs a name of its own, like SQUARE.');
      if (!(c.peek()?.text === '(')) return c.fail('expected "(" and the parameter names after the macro name.');
      c.next();
      const params: string[] = [];
      while (c.peek() && c.peek()!.text !== ')') {
        const p = c.accept('name');
        if (!p || KEYWORDS.has(p.text)) return c.fail('a parameter is a name.');
        if (params.includes(p.text)) return c.failAt(p, `the parameter ${p.text} appears twice.`);
        params.push(p.text);
        if (c.peek()?.text === ',') c.next();
        else if (c.peek()?.text !== ')') return c.fail('separate parameters with commas.');
      }
      if (c.peek()?.text !== ')') return c.fail('expected ")" after the parameters.');
      c.next();
      if (params.length > MAX_PARAMS) return c.failAt(name, `a macro has at most ${MAX_PARAMS} parameters.`);
      if (c.peek()?.text !== '=') return c.fail('expected "=" and the template.');
      c.next();
      return { ok: true, value: { name: name.text, params, rest: c.rest() } };
    },
  });
  if (!read.ok) return { ok: false, error: read.error };
  const body = read.value.rest.map((t): MacroToken => ({ ...t, origin: 'template', arg: null }));
  if (body.length === 0) return { ok: false, error: 'The template is empty: write an expression after "=".' };
  const tree = parseTokens(body);
  if (!tree.ok) return { ok: false, error: `In the template: ${tree.error}` };
  return { ok: true, value: { name: read.value.name, params: read.value.params, body, bodyTree: tree.value } };
}

/** Read a whole token list as one expression (the second parse of text substitution, and the template check). */
export function parseTokens(tokens: readonly MacroToken[]): { ok: true; value: Node } | { ok: false; error: string } {
  const c = cursorOf(tokens);
  const r = readExpression(c, newBuilder());
  if (!r.ok) return { ok: false, error: r.error };
  const extra = c.peek();
  return extra ? { ok: false, error: `unexpected "${extra.text}": nothing can follow here.` } : r;
}

export type CallParse = { ok: true; tokens: MacroToken[]; tree: Node } | { ok: false; error: string };

/** The caller's expression: tokens (for text substitution) and a tree (for the other two). */
export function parseCall(text: string): CallParse {
  const read = parseKitLine<Node>(text, {
    tokens: TOKENS,
    maxChars: MAX_CALL_CHARS,
    empty: 'Type an expression, like: SQUARE(a + 1)',
    read: (c) => readExpression(c, newBuilder()),
  });
  if (!read.ok) return { ok: false, error: read.error };
  const lexed = lex(text, 'caller');
  if (!lexed.ok) return { ok: false, error: lexed.error };
  // The positioned read above found no refusal; the tree is rebuilt from tokens that carry their origin.
  const tree = parseTokens(lexed.tokens);
  return tree.ok ? { ok: true, tokens: lexed.tokens, tree: tree.value } : { ok: false, error: tree.error };
}
