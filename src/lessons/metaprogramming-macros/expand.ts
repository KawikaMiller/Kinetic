/**
 * The three ways to expand a macro call, a safe evaluator for the result, and the checks that say what went wrong.
 *
 *   text       substitute the argument TOKENS into the template tokens, then read the result (the C preprocessor model)
 *   tree       substitute the argument SUBTREE into the template tree (Lisp and Rust macros work on trees)
 *   hygienic   tree substitution, with the template's own binders renamed so they cannot capture the caller's names
 *
 * A macro that expands into itself stops at EXPANSION_LIMIT and says so.
 */
import type { Tone } from '../../core/tone';
import { parseTokens, type MacroDef, type MacroToken, type Node, type Origin } from './macroLang';

export const EXPANSION_LIMIT = 20;
/** The most nodes (or, for the text expander, tokens) an expansion may hold: typed nesting like M(M(M(M(a)))) multiplies the size at every level. */
export const SIZE_LIMIT = 500;
export type Strategy = 'text' | 'tree' | 'hygienic';

/** `tokens` is the final text after text substitution (the tree strategies print their tree instead). */
export type Expanded = { ok: true; tree: Node; expansions: number; tokens?: MacroToken[] } | { ok: false; error: string };

const limitError = `Stopped at the expansion limit of ${EXPANSION_LIMIT}: this macro expands into itself, or the nested calls need more than ${EXPANSION_LIMIT} expansions.`;
const sizeError = `Stopped: the expansion grew past ${SIZE_LIMIT} nodes (tokens, for the text expansion) and was not finished. Nested calls of a macro that uses its parameter many times multiply the size at every level.`;
const unknownMacro = (name: string, known: string) => `Unknown macro ${name}: only ${known} is defined here.`;

// ── Text substitution ───────────────────────────────────────────────

/** The index just past the `)` that closes the `(` at `open`, with the top-level arguments' token lists. */
function splitArguments(tokens: readonly MacroToken[], open: number): { args: MacroToken[][]; end: number } | null {
  const args: MacroToken[][] = [[]];
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'punct' && t.text === '(') {
      depth++;
      if (depth === 1) continue;
    } else if (t.kind === 'punct' && t.text === ')') {
      depth--;
      if (depth === 0) return { args: args.length === 1 && args[0].length === 0 ? [] : args, end: i + 1 };
    } else if (t.kind === 'punct' && t.text === ',' && depth === 1) {
      args.push([]);
      continue;
    }
    args[args.length - 1].push(t);
  }
  return null;
}

export function expandText(def: MacroDef, call: readonly MacroToken[]): Expanded {
  let tokens = [...call];
  let expansions = 0;
  let instance = 0;
  for (;;) {
    const at = tokens.findIndex((t, i) => t.kind === 'name' && t.text === def.name && tokens[i + 1]?.text === '(');
    if (at < 0) break;
    const parts = splitArguments(tokens, at + 1);
    if (!parts) return { ok: false, error: `The call to ${def.name} is missing its closing bracket.` };
    if (parts.args.length !== def.params.length) return { ok: false, error: `${def.name} takes ${def.params.length} ${def.params.length === 1 ? 'argument' : 'arguments'} but the call gives ${parts.args.length}.` };
    expansions++;
    if (expansions > EXPANSION_LIMIT) return { ok: false, error: limitError };
    const grownBy = def.body.reduce((sum, t) => sum + (t.kind === 'name' && def.params.includes(t.text) ? parts.args[def.params.indexOf(t.text)].length : 1), 0);
    if (tokens.length - (parts.end - at) + grownBy > SIZE_LIMIT) return { ok: false, error: sizeError };
    const replacement = def.body.flatMap((t): MacroToken[] => {
      const which = t.kind === 'name' ? def.params.indexOf(t.text) : -1;
      if (which < 0) return [{ ...t, origin: 'template', arg: null }];
      instance++;
      return parts.args[which].map((a) => ({ ...a, arg: instance }));
    });
    tokens = [...tokens.slice(0, at), ...replacement, ...tokens.slice(parts.end)];
  }
  const tree = parseTokens(tokens);
  if (!tree.ok) return { ok: false, error: `After expansion the text does not read as an expression: ${tree.error}` };
  const unknown = firstUnknownCall(tree.value, def.name);
  if (unknown) return { ok: false, error: unknownMacro(unknown, def.name) };
  return { ok: true, tree: tree.value, expansions, tokens };
}

// ── Tree substitution ───────────────────────────────────────────────

const countNodes = (n: Node): number => 1 + n.kids.reduce((sum, k) => sum + countNodes(k), 0);

/** The name of the first call in the tree that is not a call of `known`, or null. */
function firstUnknownCall(n: Node, known: string): string | null {
  if (n.kind === 'call' && n.text !== known) return n.text;
  for (const k of n.kids) {
    const found = firstUnknownCall(k, known);
    if (found) return found;
  }
  return null;
}

const copy = (n: Node, ids: { next: number }): Node => ({ ...n, id: ids.next++, kids: n.kids.map((k) => copy(k, ids)) });

interface Substitution {
  params: ReadonlyMap<string, Node>;
  /** Template binders renamed in this scope (hygienic only): old name -> fresh name. */
  renames: ReadonlyMap<string, string>;
  fresh: () => number;
  hygienic: boolean;
  ids: { next: number };
}

/** The template tree with the arguments put in place of the parameters (each occurrence gets its own copy). */
function substitute(n: Node, s: Substitution): Node {
  const id = s.ids.next++;
  if (n.kind === 'var') {
    const arg = s.params.get(n.text);
    if (arg) return copy(arg, s.ids);
    const renamed = s.renames.get(n.text);
    return renamed ? { ...n, id, text: renamed, origin: 'renamed', kids: [] } : { ...n, id, kids: [] };
  }
  if (n.kind === 'let') {
    const [value, body] = n.kids;
    const binder = s.hygienic ? `${n.text}#${s.fresh()}` : n.text;
    const inner: Substitution = {
      ...s,
      params: new Map([...s.params].filter(([name]) => name !== n.text)),
      renames: s.hygienic ? new Map([...s.renames, [n.text, binder]]) : s.renames,
    };
    return { ...n, id, text: binder, origin: s.hygienic ? 'renamed' : n.origin, kids: [substitute(value, s), substitute(body, inner)] };
  }
  return { ...n, id, kids: n.kids.map((k) => substitute(k, s)) };
}

export function expandTree(def: MacroDef, call: Node, hygienic: boolean): Expanded {
  const ids = { next: 1000 };
  let expansions = 0;
  let fresh = 0;
  let failure: string | null = null;
  const walk = (n: Node): Node => {
    if (failure) return n;
    const kids = n.kids.map(walk);
    if (n.kind !== 'call') return { ...n, kids };
    if (n.text !== def.name) {
      failure = unknownMacro(n.text, def.name);
      return n;
    }
    if (kids.length !== def.params.length) {
      failure = `${def.name} takes ${def.params.length} ${def.params.length === 1 ? 'argument' : 'arguments'} but the call gives ${kids.length}.`;
      return n;
    }
    expansions++;
    if (expansions > EXPANSION_LIMIT) {
      failure = limitError;
      return n;
    }
    const body = substitute(def.bodyTree, { params: new Map(def.params.map((p, i) => [p, kids[i]])), renames: new Map(), fresh: () => ++fresh, hygienic, ids });
    if (countNodes(body) > SIZE_LIMIT) {
      failure = sizeError;
      return n;
    }
    return walk(body);
  };
  const tree = walk(call);
  return failure ? { ok: false, error: failure } : { ok: true, tree, expansions };
}

export function expand(strategy: Strategy, def: MacroDef, callTokens: readonly MacroToken[], callTree: Node): Expanded {
  return strategy === 'text' ? expandText(def, callTokens) : expandTree(def, callTree, strategy === 'hygienic');
}

// ── Evaluation ──────────────────────────────────────────────────────

export type Evaluated = { ok: true; value: number; nextCalls: number } | { ok: false; error: string };

/** Walk the tree with the caller's variables; `next()` returns 1, 2, 3 ... in the order it is evaluated. */
export function evaluate(root: Node, vars: Readonly<Record<string, number>>): Evaluated {
  let calls = 0;
  const ev = (n: Node, env: Readonly<Record<string, number>>): number => {
    switch (n.kind) {
      case 'num':
        return Number(n.text);
      case 'var': {
        if (!Object.hasOwn(env, n.text)) throw new EvaluationError(`unknown name "${n.text}"`);
        return env[n.text];
      }
      case 'next':
        return ++calls;
      case 'let': {
        const value = ev(n.kids[0], env);
        return ev(n.kids[1], { ...env, [n.text]: value });
      }
      case 'bin': {
        const l = ev(n.kids[0], env);
        const r = ev(n.kids[1], env);
        if (n.text === '/' && r === 0) throw new EvaluationError('division by zero in this toy language');
        const value = n.text === '+' ? l + r : n.text === '-' ? l - r : n.text === '*' ? l * r : l / r;
        if (!Number.isFinite(value)) throw new EvaluationError('the value grew too large for this toy language');
        return value;
      }
      case 'call':
        throw new EvaluationError(`the call to ${n.text} was not expanded`);
    }
  };
  try {
    return { ok: true, value: ev(root, vars), nextCalls: calls };
  } catch (e) {
    if (e instanceof EvaluationError) return { ok: false, error: e.message };
    throw e;
  }
}

class EvaluationError extends Error {}

// ── What went wrong ─────────────────────────────────────────────────

export interface Problems {
  /** Nodes whose operator belongs to an argument that the text substitution cut apart. */
  regrouped: number[];
  /** Caller names that landed inside a template binder of the same name. */
  captured: number[];
}

const tokenArgs = (n: Node): number[] => [n.arg ?? -1, ...n.kids.flatMap(tokenArgs)];

export function findProblems(root: Node): Problems {
  const regrouped: number[] = [];
  const captured: number[] = [];
  const visit = (n: Node, scope: readonly { name: string; origin: Origin }[]) => {
    if (n.kind === 'bin' && n.arg !== null && tokenArgs(n).some((a) => a !== n.arg)) regrouped.push(n.id);
    if (n.kind === 'var' && n.origin === 'caller') {
      const binder = [...scope].reverse().find((b) => b.name === n.text);
      if (binder && binder.origin === 'template') captured.push(n.id);
    }
    if (n.kind === 'let') {
      visit(n.kids[0], scope);
      visit(n.kids[1], [...scope, { name: n.text, origin: n.origin }]);
    } else n.kids.forEach((k) => visit(k, scope));
  };
  visit(root, []);
  return { regrouped, captured };
}

/** Node colours for the tree: wrong ones bad, renamed binders ok, argument pieces info, template pieces violet. */
export function marksOf(root: Node, problems: Problems): Map<number, Tone> {
  const marks = new Map<number, Tone>();
  const walk = (n: Node) => {
    marks.set(n.id, n.origin === 'renamed' ? 'ok' : n.origin === 'caller' ? 'info' : 'violet');
    n.kids.forEach(walk);
  };
  walk(root);
  for (const id of [...problems.regrouped, ...problems.captured]) marks.set(id, 'bad');
  return marks;
}

// ── The expansion as source ─────────────────────────────────────────

export interface PrintToken {
  text: string;
  node: number;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
const prec = (n: Node) => (n.kind === 'bin' ? PRECEDENCE[n.text] : n.kind === 'let' ? 0 : 3);

/** The tree as tokens, with brackets only where the grouping needs them (each bracket belongs to the node it wraps). */
export function printTree(n: Node): PrintToken[] {
  const wrap = (child: Node, needs: boolean): PrintToken[] => (needs ? [{ text: '(', node: child.id }, ...printTree(child), { text: ')', node: child.id }] : printTree(child));
  switch (n.kind) {
    case 'num':
    case 'var':
    case 'next':
      return [{ text: n.text, node: n.id }];
    case 'call':
      return [{ text: n.text, node: n.id }, { text: '(', node: n.id }, ...n.kids.flatMap((k, i) => [...(i ? [{ text: ',', node: n.id }] : []), ...printTree(k)]), { text: ')', node: n.id }];
    case 'bin':
      return [...wrap(n.kids[0], prec(n.kids[0]) < prec(n)), { text: n.text, node: n.id }, ...wrap(n.kids[1], prec(n.kids[1]) <= prec(n))];
    case 'let':
      return [{ text: 'let', node: n.id }, { text: n.text, node: n.id }, { text: '=', node: n.id }, ...printTree(n.kids[0]), { text: 'in', node: n.id }, ...printTree(n.kids[1])];
  }
}

const NO_SPACE_BEFORE = new Set([')', ',']);
const isName = (text: string) => /^[A-Za-z_]/.test(text) && text !== 'let' && text !== 'in';

/** Tokens joined as source: spaces between them except inside brackets and before commas. */
export function sourceText(tokens: readonly { text: string }[]): string {
  return tokens
    .map((t, i) => {
      const prev = i > 0 ? tokens[i - 1].text : null;
      const glued = prev === null || prev === '(' || NO_SPACE_BEFORE.has(t.text) || (t.text === '(' && isName(prev));
      return glued ? t.text : ` ${t.text}`;
    })
    .join('');
}
