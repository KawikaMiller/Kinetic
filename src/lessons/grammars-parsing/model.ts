import type { Dfa } from '../../core/automata';

/**
 * Context-free grammars over the batch language's expression tokens. Terminals are `num`
 * (any run of digits in the input) or a single character such as + * ( ). Each T2-B5
 * lesson keeps its own copy of these constants, since lessons can't import each other.
 */

export interface Rule {
  lhs: string;
  /** Empty = ε. */
  rhs: string[];
}

export interface Grammar {
  start: string;
  rules: Rule[];
  nonterminals: string[];
}

export const EPS = 'ε';
export const NUM = 'num';

export const PRESET_GRAMMARS = [
  { id: 'ambiguous', label: 'Ambiguous', text: 'E -> E + E | E * E | ( E ) | num', sample: '1 + 2 * 3' },
  { id: 'layered', label: 'Layered', text: 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | num', sample: '1 + 2 * 3' },
  { id: 'brackets', label: 'Balanced brackets', text: 'S -> ( S ) S | ε', sample: '(()())' },
] as const;

// ── Reading a grammar the learner typed ──────────────────────────────

export const LIMITS = { chars: 300, nonterminals: 6, rules: 12, rhs: 6 };

export type GrammarCheck = { ok: true; grammar: Grammar } | { ok: false; error: string };

export function parseGrammar(text: string): GrammarCheck {
  if (text.length > LIMITS.chars) return { ok: false, error: `Keep the grammar under ${LIMITS.chars} characters.` };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: 'Type at least one production, like E -> E + E | num.' };
  const rules: Rule[] = [];
  for (const [n, line] of lines.entries()) {
    const m = /^(\S+)\s*(?:->|→)(.*)$/.exec(line);
    if (!m) return { ok: false, error: `Line ${n + 1}: write it as A -> x y | z.` };
    const lhs = m[1];
    if (lhs.length > 3 || !/^[A-Z][A-Za-z']*$/.test(lhs)) return { ok: false, error: `Line ${n + 1}: a non-terminal is a capital letter, optionally followed by letters or ' (up to 3 characters).` };
    for (const alt of m[2].split('|')) {
      const rhs = alt.trim().split(/\s+/).filter((s) => s && s !== EPS);
      if (rhs.length > LIMITS.rhs) return { ok: false, error: `Line ${n + 1}: keep each alternative to ${LIMITS.rhs} symbols.` };
      rules.push({ lhs, rhs });
    }
  }
  const nonterminals = [...new Set(rules.map((r) => r.lhs))];
  if (nonterminals.length > LIMITS.nonterminals) return { ok: false, error: `Keep it to ${LIMITS.nonterminals} non-terminals.` };
  if (rules.length > LIMITS.rules) return { ok: false, error: `Keep it to ${LIMITS.rules} alternatives in total.` };
  for (const r of rules)
    for (const s of r.rhs)
      if (!nonterminals.includes(s) && s !== NUM && Array.from(s).length !== 1)
        return { ok: false, error: `"${s}" isn't a non-terminal with its own line, num, or a single character, so no input could contain it.` };
  const grammar = { start: rules[0].lhs, rules, nonterminals };
  const loop = selfDeriving(grammar);
  if (loop) return { ok: false, error: `${loop} can turn into itself without consuming any input, so it has endlessly many trees. That's not modelled here.` };
  return { ok: true, grammar };
}

export const isNonterminal = (g: Grammar, s: string) => g.nonterminals.includes(s);

/** Non-terminals that can derive the empty string. */
export function nullable(g: Grammar): Set<string> {
  const out = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of g.rules) if (!out.has(r.lhs) && r.rhs.every((s) => out.has(s))) {
      out.add(r.lhs);
      changed = true;
    }
  }
  return out;
}

/** A non-terminal A with A ⇒+ A consuming nothing (a unit cycle, perhaps through nullable neighbours), if any. */
export function selfDeriving(g: Grammar): string | null {
  const eps = nullable(g);
  const step = new Map(g.nonterminals.map((a) => [a, new Set<string>()]));
  for (const r of g.rules)
    r.rhs.forEach((s, i) => {
      if (isNonterminal(g, s) && r.rhs.every((t, j) => j === i || eps.has(t))) step.get(r.lhs)!.add(s);
    });
  for (const a of g.nonterminals) {
    const seen = new Set<string>();
    const stack = [...step.get(a)!];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === a) return a;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...step.get(x)!);
    }
  }
  return null;
}

// ── Input ────────────────────────────────────────────────────────────

export interface Tok {
  /** The grammar terminal it matches: `num` or the character itself. */
  t: string;
  text: string;
}

export const MAX_TOKENS = 15;
const MAX_DIGITS = 6;

export type InputCheck = { ok: true; tokens: Tok[] } | { ok: false; error: string };

/** Digit runs become `num`; any other non-space character is a terminal of its own. */
export function tokenize(text: string): InputCheck {
  const tokens: Tok[] = [];
  for (const m of text.matchAll(/(\d+)|(\S)/gu)) {
    if (m[1] && m[1].length > MAX_DIGITS) return { ok: false, error: `Keep numbers to ${MAX_DIGITS} digits.` };
    tokens.push(m[1] ? { t: NUM, text: m[1] } : { t: m[2], text: m[2] });
  }
  if (tokens.length > MAX_TOKENS) return { ok: false, error: `Keep it to ${MAX_TOKENS} tokens.` };
  return { ok: true, tokens };
}

// ── Recognising: which non-terminal derives which span (CYK-style fixpoint) ──

export type SpanTable = Map<string, boolean[][]>;

/** derives(A, i, j): A ⇒* tokens[i..j). A CYK-style table for any grammar: ε and left recursion are fine. */
export function spanTable(g: Grammar, ts: readonly string[]): SpanTable {
  const n = ts.length;
  const D: SpanTable = new Map(g.nonterminals.map((a) => [a, Array.from({ length: n + 1 }, () => Array<boolean>(n + 1).fill(false))]));
  // Shortest spans first; within one span, repeat until nothing changes (unit and ε rules
  // let a span depend on itself through another non-terminal).
  for (let len = 0; len <= n; len++)
    for (let i = 0; i + len <= n; i++) {
      const j = i + len;
      for (let changed = true; changed; ) {
        changed = false;
        for (const r of g.rules)
          if (!D.get(r.lhs)![i][j] && seqDerives(g, D, ts, r.rhs, i, j)) {
            D.get(r.lhs)![i][j] = true;
            changed = true;
          }
      }
    }
  return D;
}

/** Can the symbol sequence derive tokens[i..j), given the span table? */
export function seqDerives(g: Grammar, D: SpanTable, ts: readonly string[], seq: readonly string[], i: number, j: number): boolean {
  // reach[k] = after the symbols so far, can we be at position k?
  let reach = new Set([i]);
  for (const s of seq) {
    const next = new Set<number>();
    for (const k of reach) {
      if (isNonterminal(g, s)) {
        for (let m = k; m <= j; m++) if (D.get(s)![k][m]) next.add(m);
      } else if (k < j && ts[k] === s) next.add(k + 1);
    }
    reach = next;
    if (!reach.size) return false;
  }
  return reach.has(j);
}

export function recognises(g: Grammar, ts: readonly string[]): boolean {
  return spanTable(g, ts).get(g.start)![0][ts.length];
}

// ── Parse trees ──────────────────────────────────────────────────────

export interface PNode {
  sym: string;
  /** Leaf text for terminals (the number for num); ε leaves have text ''. */
  text?: string;
  rule?: number;
  children: PNode[];
}

export const MAX_TREES = 20;

/** Every parse tree for the input (up to MAX_TREES), in a fixed order. */
export function parseTrees(g: Grammar, tokens: readonly Tok[], cap = MAX_TREES): PNode[] {
  const ts = tokens.map((t) => t.t);
  const D = spanTable(g, ts);
  const memo = new Map<string, PNode[]>();
  const trees = (a: string, i: number, j: number): PNode[] => {
    const key = `${a} ${i} ${j}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const out: PNode[] = [];
    if (D.get(a)![i][j])
      g.rules.forEach((r, ri) => {
        if (r.lhs !== a || out.length >= cap) return;
        for (const kids of seqTrees(r.rhs, i, j)) {
          out.push({ sym: a, rule: ri, children: kids.length ? kids : [{ sym: EPS, text: '', children: [] }] });
          if (out.length >= cap) break;
        }
      });
    memo.set(key, out);
    return out;
  };
  const seqTrees = (seq: readonly string[], i: number, j: number): PNode[][] => {
    if (!seq.length) return i === j ? [[]] : [];
    const [s, ...rest] = seq;
    const out: PNode[][] = [];
    for (let m = i; m <= j; m++) {
      if (!isNonterminal(g, s)) {
        if (m !== i + 1 || i >= j || ts[i] !== s) continue;
        for (const tail of seqTrees(rest, m, j)) out.push([{ sym: s, text: tokens[i].text, children: [] }, ...tail]);
      } else {
        if (!D.get(s)![i][m] || !seqDerives(g, D, ts, rest, m, j)) continue;
        for (const head of trees(s, i, m)) for (const tail of seqTrees(rest, m, j)) {
          out.push([head, ...tail]);
          if (out.length >= cap) return out;
        }
      }
      if (out.length >= cap) break;
    }
    return out;
  };
  return D.get(g.start)![0][ts.length] ? trees(g.start, 0, ts.length) : [];
}

/** The rule indices a leftmost derivation applies to build this tree (pre-order). */
export function leftmostRules(tree: PNode): number[] {
  if (tree.rule === undefined) return [];
  return [tree.rule, ...tree.children.flatMap(leftmostRules)];
}

// ── Building a derivation step by step ───────────────────────────────

/** A tree node with an id, for drawing and for expanding the leftmost non-terminal. */
export interface DNode {
  id: string;
  sym: string;
  text?: string;
  children: string[];
}

export interface Derivation {
  nodes: Record<string, DNode>;
  /** The sentential form: node ids, left to right. */
  form: string[];
  /** The leftmost non-terminal left to expand, or null when the form is all terminals. */
  next: string | null;
  /** The rule just applied (null at the start). */
  lastRule: number | null;
}

/** Apply `rules` in leftmost order from the start symbol. Throws if one doesn't fit (callers check first). */
export function derive(g: Grammar, tokens: readonly Tok[], rules: readonly number[]): Derivation {
  const nodes: Record<string, DNode> = { n0: { id: 'n0', sym: g.start, children: [] } };
  let form = ['n0'];
  let counter = 1;
  let lastRule: number | null = null;
  const leftmost = () => form.find((id) => isNonterminal(g, nodes[id].sym)) ?? null;
  for (const ri of rules) {
    const target = leftmost();
    const rule = g.rules[ri];
    if (!target || rule.lhs !== nodes[target].sym) throw new Error('rule does not apply');
    const kids = (rule.rhs.length ? rule.rhs : [EPS]).map((sym) => {
      const id = `n${counter++}`;
      nodes[id] = { id, sym, children: [] };
      return id;
    });
    nodes[target].children = kids;
    const at = form.indexOf(target);
    form = [...form.slice(0, at), ...kids.filter((k) => nodes[k].sym !== EPS), ...form.slice(at + 1)];
    lastRule = ri;
  }
  // Terminal leaves take the text of the input token in their position.
  let k = 0;
  for (const id of form) if (!isNonterminal(g, nodes[id].sym)) {
    if (k < tokens.length && tokens[k].t === nodes[id].sym) nodes[id].text = tokens[k].text;
    k++;
  }
  return { nodes, form, next: leftmost(), lastRule };
}

/** Can this sentential form still derive the input? (Terminal prefix matches, the rest derives the remainder.) */
export function viable(g: Grammar, tokens: readonly Tok[], d: Derivation, D = spanTable(g, tokens.map((t) => t.t))): boolean {
  const ts = tokens.map((t) => t.t);
  return seqDerives(g, D, ts, d.form.map((id) => d.nodes[id].sym), 0, ts.length);
}

// ── Brute-force derivation search (the independent check on the recogniser) ──

/** Every terminal string of length ≤ maxLen the grammar derives, by breadth-first leftmost derivation. */
export function languageUpTo(g: Grammar, maxLen: number): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  let layer: string[][] = [[g.start]];
  while (layer.length) {
    const next: string[][] = [];
    for (const form of layer) {
      const k = form.findIndex((s) => isNonterminal(g, s));
      if (k === -1) {
        out.add(form.join(' '));
        continue;
      }
      for (const r of g.rules) if (r.lhs === form[k]) {
        const f = [...form.slice(0, k), ...r.rhs, ...form.slice(k + 1)];
        const terminals = f.filter((s) => !isNonterminal(g, s)).length;
        if (terminals > maxLen || f.length > 2 * maxLen + 2) continue;
        const key = f.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(f);
      }
    }
    layer = next;
  }
  return out;
}

// ── Evaluating an arithmetic tree bottom-up ──────────────────────────

/** A node's value: num leaves, x + y, x * y, ( x ), and single-child chains. Undefined otherwise. */
export function evaluate(node: PNode): number | undefined {
  if (node.sym === NUM) return Number(node.text);
  const kids = node.children.filter((c) => c.sym !== EPS);
  if (kids.length === 1) return evaluate(kids[0]);
  if (kids.length === 3) {
    const [a, op, b] = kids;
    if (a.sym === '(' && b.sym === ')') return evaluate(op);
    const x = evaluate(a);
    const y = evaluate(b);
    if (x === undefined || y === undefined) return undefined;
    if (op.sym === '+') return x + y;
    if (op.sym === '*') return x * y;
  }
  return undefined;
}

/** The tree as a fully bracketed expression: its structure, ignoring grammar steps. */
export function bracketed(node: PNode): string {
  if (!node.children.length) return node.text ?? node.sym;
  const kids = node.children.filter((c) => c.sym !== EPS);
  if (kids.length === 1) return bracketed(kids[0]);
  if (kids.length === 3 && kids[0].sym === '(' && kids[2].sym === ')') return bracketed(kids[1]);
  if (kids.length === 3 && (kids[1].sym === '+' || kids[1].sym === '*')) return `(${bracketed(kids[0])} ${kids[1].sym} ${bracketed(kids[2])})`;
  return kids.map(bracketed).join(' ');
}

/** The usual reading: * before +, both left to right. Bracketed like `bracketed`, or null if it isn't such an expression. */
export function precedenceReading(tokens: readonly Tok[]): string | null {
  let i = 0;
  const peek = () => tokens[i]?.t;
  const atom = (): string | null => {
    if (peek() === NUM) return tokens[i++].text;
    if (peek() === '(') {
      i++;
      const e = sum();
      if (e === null || peek() !== ')') return null;
      i++;
      return e;
    }
    return null;
  };
  const product = (): string | null => {
    let left = atom();
    while (left !== null && peek() === '*') {
      i++;
      const right = atom();
      left = right === null ? null : `(${left} * ${right})`;
    }
    return left;
  };
  const sum = (): string | null => {
    let left = product();
    while (left !== null && peek() === '+') {
      i++;
      const right = product();
      left = right === null ? null : `(${left} + ${right})`;
    }
    return left;
  };
  const e = sum();
  return e !== null && i === tokens.length ? e : null;
}

// ── Why not regex: a counting DFA for brackets ───────────────────────

/** "( × n then ) × n". */
export const nested = (n: number) => '('.repeat(n) + ')'.repeat(n);

/**
 * The best a k-state DFA can do for balanced brackets: count the open depth 0..k-1.
 * One more ( than it can count has no arrow, so the machine dies.
 */
export function countingDfa(k: number): Dfa {
  const states = Array.from({ length: k }, (_, i) => `c${i}`);
  const delta: Record<string, Record<string, string>> = {};
  states.forEach((s, i) => {
    delta[s] = {};
    if (i + 1 < k) delta[s]['('] = states[i + 1];
    if (i > 0) delta[s][')'] = states[i - 1];
  });
  return { kind: 'dfa', states, alphabet: ['(', ')'], start: 'c0', accept: ['c0'], delta };
}

export const BRACKETS = PRESET_GRAMMARS[2].text;
