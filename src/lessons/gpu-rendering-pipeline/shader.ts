/**
 * The fragment-shader expression language of scene 2: a toy, not GLSL. Learner text goes through a
 * tokeniser, a precedence parser and a tree walk written here; it is never handed to eval or to
 * the Function constructor. Grammar:
 *
 *   expr  = term (("+" | "-") term)*
 *   term  = unary (("*" | "/") unary)*
 *   unary = ("-" | "+") unary | atom
 *   atom  = number | input | function "(" expr ("," expr)* ")" | "(" expr ")"
 *
 * Division by zero and overflow follow IEEE (infinity, NaN); the renderer marks such pixels bad.
 */
import { cursorOf, parseKitLine, type KitRead, type TokenCursor, type TokenRule } from '../../core/parseKit';
import type { Shader, ShaderInputs } from './render';

export const MAX_CHARS = 120;
export const MAX_TOKENS = 60;
/** How deeply parentheses and calls may nest. */
export const MAX_DEPTH = 12;

export const INPUT_NAMES = ['u', 'v', 'nl', 'z', 'x', 'y', 'bx', 'by', 'bz'] as const;
export type InputName = (typeof INPUT_NAMES)[number];

/** Each function's argument count and its meaning, written out so a test can compare it with real JavaScript. */
export const FUNCTIONS = {
  sin: { arity: 1, run: (a: number[]) => Math.sin(a[0]) },
  cos: { arity: 1, run: (a: number[]) => Math.cos(a[0]) },
  abs: { arity: 1, run: (a: number[]) => Math.abs(a[0]) },
  floor: { arity: 1, run: (a: number[]) => Math.floor(a[0]) },
  fract: { arity: 1, run: (a: number[]) => a[0] - Math.floor(a[0]) },
  sqrt: { arity: 1, run: (a: number[]) => Math.sqrt(a[0]) },
  min: { arity: 2, run: (a: number[]) => Math.min(a[0], a[1]) },
  max: { arity: 2, run: (a: number[]) => Math.max(a[0], a[1]) },
  step: { arity: 2, run: (a: number[]) => (a[1] < a[0] ? 0 : 1) },
  pow: { arity: 2, run: (a: number[]) => Math.pow(a[0], a[1]) },
  clamp: { arity: 3, run: (a: number[]) => Math.min(Math.max(a[0], a[1]), a[2]) },
  mix: { arity: 3, run: (a: number[]) => a[0] * (1 - a[2]) + a[1] * a[2] },
  smoothstep: {
    arity: 3,
    run: (a: number[]) => {
      const t = Math.min(Math.max((a[2] - a[0]) / (a[1] - a[0]), 0), 1);
      return t * t * (3 - 2 * t);
    },
  },
} as const;
export type FunctionName = keyof typeof FUNCTIONS;
const isFunction = (name: string): name is FunctionName => Object.hasOwn(FUNCTIONS, name);
const isInput = (name: string): name is InputName => (INPUT_NAMES as readonly string[]).includes(name);

export type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: InputName }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { t: 'call'; fn: FunctionName; args: Node[] };

const TOKENS: readonly TokenRule[] = [
  { kind: 'num', pattern: /\d+(?:\.\d+)?|\.\d+/ },
  { kind: 'name', pattern: /[A-Za-z_][A-Za-z0-9_]*/ },
  { kind: 'op', pattern: /[-+*/]/ },
  { kind: 'lp', pattern: /\(/ },
  { kind: 'rp', pattern: /\)/ },
  { kind: 'comma', pattern: /,/ },
  { kind: 'assign', pattern: /=/ },
  { kind: 'quote', pattern: /["'`]/ },
];

const LIST_INPUTS = INPUT_NAMES.join(', ');

function readExpr(c: TokenCursor, depth: number): KitRead<Node> {
  const left = readTerm(c, depth);
  if (!left.ok) return left;
  let node = left.value;
  for (let t = c.peek(); t?.kind === 'op' && (t.text === '+' || t.text === '-'); t = c.peek()) {
    c.next();
    const right = readTerm(c, depth);
    if (!right.ok) return right;
    node = { t: 'bin', op: t.text as '+' | '-', a: node, b: right.value };
  }
  return { ok: true, value: node };
}

function readTerm(c: TokenCursor, depth: number): KitRead<Node> {
  const left = readUnary(c, depth);
  if (!left.ok) return left;
  let node = left.value;
  for (let t = c.peek(); t?.kind === 'op' && (t.text === '*' || t.text === '/'); t = c.peek()) {
    c.next();
    const right = readUnary(c, depth);
    if (!right.ok) return right;
    node = { t: 'bin', op: t.text as '*' | '/', a: node, b: right.value };
  }
  return { ok: true, value: node };
}

function readUnary(c: TokenCursor, depth: number): KitRead<Node> {
  const t = c.peek();
  if (t?.kind === 'op' && (t.text === '-' || t.text === '+')) {
    c.next();
    const inner = readUnary(c, depth);
    if (!inner.ok) return inner;
    return { ok: true, value: t.text === '-' ? { t: 'neg', a: inner.value } : inner.value };
  }
  return readAtom(c, depth);
}

function readAtom(c: TokenCursor, depth: number): KitRead<Node> {
  const t = c.next();
  if (!t) return c.fail('the expression ends too soon: a value is missing.');
  if (t.kind === 'num') return { ok: true, value: { t: 'num', v: Number(t.text) } };
  if (t.kind === 'assign') return c.failAt(t, 'assignments are not part of this language: type an expression, not a statement.');
  if (t.kind === 'quote') return c.failAt(t, 'strings are not part of this language: every value is a number.');
  if (t.kind === 'lp') {
    if (depth >= MAX_DEPTH) return c.failAt(t, `nested more than ${MAX_DEPTH} levels deep.`);
    const inner = readExpr(c, depth + 1);
    if (!inner.ok) return inner;
    return c.accept('rp') ? inner : c.fail('a closing ")" is missing.');
  }
  if (t.kind === 'name') {
    if (c.peek()?.kind === 'lp') return readCall(c, t, depth);
    if (isInput(t.text)) return { ok: true, value: { t: 'var', name: t.text } };
    if (isFunction(t.text)) return c.failAt(t, `${t.text} is a function: call it as ${t.text}(...).`);
    return c.failAt(t, `unknown name "${t.text}": the inputs are ${LIST_INPUTS}.`);
  }
  return c.failAt(t, `unexpected "${t.text}": a value was expected here.`);
}

/** A token left over after a whole expression was read: say what it is. */
function readAtomOrFail(c: TokenCursor, extra: { text: string; kind: string; column: number }): KitRead<Program> {
  if (extra.kind === 'assign') return c.failAt(extra, 'assignments are not part of this language: type an expression, not a statement.');
  if (extra.kind === 'quote') return c.failAt(extra, 'strings are not part of this language: every value is a number.');
  return c.failAt(extra, `unexpected "${extra.text}": nothing can follow a complete expression here.`);
}

function readCall(c: TokenCursor, name: { text: string; column: number; kind: string }, depth: number): KitRead<Node> {
  if (isInput(name.text)) return c.failAt(name, `${name.text} is an input, not a function.`);
  if (!isFunction(name.text)) return c.failAt(name, `unknown function "${name.text}": the functions are ${Object.keys(FUNCTIONS).join(', ')}.`);
  const open = c.next();
  if (open && depth >= MAX_DEPTH) return c.failAt(open, `nested more than ${MAX_DEPTH} levels deep.`);
  const args: Node[] = [];
  if (!c.accept('rp')) {
    do {
      const arg = readExpr(c, depth + 1);
      if (!arg.ok) return arg;
      args.push(arg.value);
    } while (c.accept('comma'));
    if (!c.accept('rp')) return c.fail('a closing ")" is missing.');
  }
  const { arity } = FUNCTIONS[name.text];
  if (args.length !== arity) return c.failAt(name, `${name.text} takes ${arity} ${arity === 1 ? 'argument' : 'arguments'}, not ${args.length}.`);
  return { ok: true, value: { t: 'call', fn: name.text, args } };
}

export interface Program {
  source: string;
  tree: Node;
  tokens: number;
}
export type ParseResult = { ok: true; value: Program } | { ok: false; error: string; column?: number };

/** Read one channel's text; refuses with the reason and the column. */
export function parseChannel(text: string): ParseResult {
  return parseKitLine<Program>(text, {
    tokens: TOKENS,
    maxChars: MAX_CHARS,
    empty: 'type an expression for this channel.',
    place: 'column',
    read: (cursor) => {
      const tokens = cursor.rest();
      if (tokens.length > MAX_TOKENS) return cursor.failAt(tokens[MAX_TOKENS], `that is ${tokens.length} tokens; keep it to ${MAX_TOKENS} or fewer.`);
      const fresh = cursorOf(tokens);
      const tree = readExpr(fresh, 0);
      if (!tree.ok) return tree;
      const extra = fresh.peek();
      if (extra) return readAtomOrFail(fresh, extra);
      return { ok: true, value: { source: text, tree: tree.value, tokens: tokens.length } };
    },
  });
}

/** The tree walk: IEEE arithmetic over the nine inputs. */
export function run(node: Node, inputs: ShaderInputs): number {
  switch (node.t) {
    case 'num': return node.v;
    case 'var': return inputs[node.name];
    case 'neg': return -run(node.a, inputs);
    case 'bin': {
      const a = run(node.a, inputs);
      const b = run(node.b, inputs);
      return node.op === '+' ? a + b : node.op === '-' ? a - b : node.op === '*' ? a * b : a / b;
    }
    case 'call': return FUNCTIONS[node.fn].run(node.args.map((a) => run(a, inputs)));
  }
}

export type CompileResult = { ok: true; shader: Shader } | { ok: false; errors: (string | null)[] };

/** The three channels as one shader, or the reason each bad channel was refused (null for a good one). */
export function compileChannels(fields: readonly [string, string, string]): CompileResult {
  const parsed = fields.map(parseChannel);
  if (parsed.every((p) => p.ok)) {
    const trees = parsed.map((p) => (p.ok ? p.value.tree : null));
    return { ok: true, shader: (i) => trees.map((t) => (t ? run(t, i) : 0)) as [number, number, number] };
  }
  return { ok: false, errors: parsed.map((p) => (p.ok ? null : p.error)) };
}

export interface ShaderPreset {
  id: string;
  label: string;
  fields: readonly [string, string, string];
}
const same = (expression: string): [string, string, string] => [expression, expression, expression];
export const SHADER_PRESETS: readonly ShaderPreset[] = [
  { id: 'flat', label: 'flat colour', fields: ['0.9', '0.55', '0.2'] },
  { id: 'rainbow', label: 'barycentric rainbow', fields: ['bx', 'by', 'bz'] },
  { id: 'lambert', label: 'Lambert', fields: ['nl', 'nl', 'nl'] },
  { id: 'checker', label: 'checker', fields: same('abs(step(0.5, fract(u*4)) - step(0.5, fract(v*4)))') },
  { id: 'fog', label: 'depth fog', fields: same('clamp((0.94 - z) * 14, 0, 1)') },
  { id: 'toon', label: 'toon', fields: same('floor(nl*3)/3') },
  { id: 'broken', label: 'sqrt of a negative', fields: ['sqrt(x - 0.5)', '0.4', '0.4'] },
];
export const DEFAULT_PRESET = 'lambert';
