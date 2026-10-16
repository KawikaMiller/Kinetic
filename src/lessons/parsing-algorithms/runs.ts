/**
 * The two parsers run on a token string, one step at a time: top-down (a predictive parser reading the LL(1)
 * table, taking the first rule of a conflicted cell as a hand-written recursive-descent parser would) and
 * bottom-up (a shift-reduce parser reading the SLR table). Each records every step with its stack and tree.
 * Pure: the stage draws what these return.
 */
import { END, cellKey, isNonterminal, type Grammar } from './grammar';
import { actionText, type Action, type LrAutomaton, type LrTable } from './lr';

/** Nested expansions without reading a token that a recursive-descent parser may make before the lesson stops it. */
export const RECURSION_BUDGET = 50;
/** Steps of the shift-reduce parser before the lesson gives up. */
export const LR_STEP_BUDGET = 500;
export const MAX_TOKENS = 12;

export const EMPTY_STRING = 'ε';

/** A parse-tree node. A terminal or ε leaf has no children; a nonterminal not yet expanded also has none. */
export interface PNode {
  id: number;
  symbol: string;
  children: number[];
}

export type Form = string[];

// ── Top-down ────────────────────────────────────────────────────────

export interface TdFrame {
  /** Expected symbols, next first, each with its tree node. */
  stack: { symbol: string; node: number }[];
  /** Tokens read so far. */
  pos: number;
  /** Nodes that exist at this frame (later nodes are not drawn yet). */
  poolSize: number;
  action: string;
  kind: 'start' | 'expand' | 'match' | 'error' | 'budget' | 'accept';
  /** The node expanded or matched by this step. */
  node: number | null;
}

export interface TdRun {
  frames: TdFrame[];
  nodes: PNode[];
  status: 'accepted' | 'rejected' | 'budget';
  message: string;
  /** The leftmost derivation: the sentential form after each expansion, starting at the start symbol. */
  forms: Form[];
}

const tokenName = (t: string | undefined) => (t === undefined ? 'the end of input' : `"${t}"`);

export function runTopDown(g: Grammar, table: ReadonlyMap<string, readonly number[]>, tokens: readonly string[]): TdRun {
  const nodes: PNode[] = [{ id: 0, symbol: g.start, children: [] }];
  let stack = [{ symbol: g.start, node: 0 }];
  let pos = 0;
  let sinceRead = 0;
  const frames: TdFrame[] = [];
  const forms: Form[] = [[g.start]];
  const push = (kind: TdFrame['kind'], action: string, node: number | null) => frames.push({ stack: stack.map((s) => ({ ...s })), pos, poolSize: nodes.length, action, kind, node });
  push('start', `Start with ${g.start} on the stack.`, null);
  const finish = (status: TdRun['status'], kind: TdFrame['kind'], message: string): TdRun => {
    push(kind, message, null);
    return { frames, nodes, status, message, forms };
  };
  for (;;) {
    const top = stack[0];
    if (!top) {
      if (pos === tokens.length) return finish('accepted', 'accept', 'The stack is empty and the input is used up: accepted.');
      return finish('rejected', 'error', `The stack is empty but ${tokenName(tokens[pos])} is left: rejected.`);
    }
    if (!isNonterminal(top.symbol)) {
      if (tokens[pos] === top.symbol) {
        stack = stack.slice(1);
        pos++;
        sinceRead = 0;
        push('match', `Match "${top.symbol}".`, top.node);
        continue;
      }
      return finish('rejected', 'error', `Expected "${top.symbol}" but found ${tokenName(tokens[pos])}: rejected.`);
    }
    const look = tokens[pos] ?? END;
    const cell = table.get(cellKey(top.symbol, look));
    if (!cell || cell.length === 0) return finish('rejected', 'error', `No rule for ${top.symbol} when the next token is ${tokenName(tokens[pos])}: rejected.`);
    if (sinceRead >= RECURSION_BUDGET) return finish('budget', 'budget', `Recursion budget reached: ${RECURSION_BUDGET} nested expansions without reading a token. Stopped.`);
    const prod = g.productions[cell[0]];
    const kids = (prod.rhs.length ? prod.rhs : [EMPTY_STRING]).map((symbol) => {
      const node: PNode = { id: nodes.length, symbol, children: [] };
      nodes.push(node);
      return node;
    });
    nodes[top.node].children = kids.map((k) => k.id);
    stack = [...(prod.rhs.length ? kids.map((k) => ({ symbol: k.symbol, node: k.id })) : []), ...stack.slice(1)];
    sinceRead++;
    forms.push([...tokens.slice(0, pos), ...stack.map((s) => s.symbol)]);
    const rule = `${prod.lhs} -> ${prod.rhs.length ? prod.rhs.join(' ') : EMPTY_STRING}`;
    push('expand', cell.length > 1 ? `Expand ${rule} (the cell holds ${cell.length} rules: the first is taken).` : `Expand ${rule}.`, top.node);
  }
}

// ── Bottom-up ───────────────────────────────────────────────────────

export interface BuEntry {
  state: number;
  symbol: string | null;
  node: number | null;
}

export interface BuFrame {
  stack: BuEntry[];
  pos: number;
  action: string;
  kind: 'start' | 'shift' | 'reduce' | 'accept' | 'error' | 'conflict' | 'budget';
  /** Grammar production number (1-based, as the tables print it) for a reduce. */
  reduced: number | null;
  /** The node a shift created or a reduce joined. */
  node: number | null;
}

export interface BuRun {
  frames: BuFrame[];
  nodes: PNode[];
  status: 'accepted' | 'rejected' | 'conflict' | 'budget';
  message: string;
  /** The reverse of a rightmost derivation: the sentence first, then the form after each reduce, ending at the start symbol. */
  forms: Form[];
}

/** Picks the action of a conflicted cell, or null while the learner has not chosen one. */
export type Resolver = (cell: string, actions: readonly Action[]) => Action | null;

export function runBottomUp(auto: LrAutomaton, table: LrTable, tokens: readonly string[], resolve: Resolver): BuRun {
  const nodes: PNode[] = [];
  let stack: BuEntry[] = [{ state: 0, symbol: null, node: null }];
  let pos = 0;
  const frames: BuFrame[] = [];
  const push = (kind: BuFrame['kind'], action: string, reduced: number | null, node: number | null) => frames.push({ stack: stack.map((e) => ({ ...e })), pos, action, kind, reduced, node });
  const sentential = () => [...stack.flatMap((e) => (e.symbol === null ? [] : [e.symbol])), ...tokens.slice(pos)];
  const forms: Form[] = [[...tokens]];
  push('start', 'Start in state 0 with an empty stack.', null, null);
  const done = (status: BuRun['status'], kind: BuFrame['kind'], message: string): BuRun => {
    push(kind, message, null, null);
    return { frames, nodes, status, message, forms };
  };
  for (let step = 0; step < LR_STEP_BUDGET; step++) {
    const state = stack[stack.length - 1].state;
    const look = tokens[pos] ?? END;
    const cellId = cellKey(String(state), look);
    const cell = table.actions.get(cellId);
    if (!cell) return done('rejected', 'error', `State ${state} has no action on ${tokenName(tokens[pos])}: rejected.`);
    let act: Action | null = cell[0];
    if (cell.length > 1) {
      act = resolve(cellId, cell);
      if (!act) return done('conflict', 'conflict', `State ${state} on ${tokenName(tokens[pos])} is a conflict (${cell.map(actionText).join(' or ')}): choose one in the table.`);
    }
    if (act.kind === 'accept') return done('accepted', 'accept', 'Accept: the whole input reduces to the start symbol.');
    if (act.kind === 'shift') {
      const leaf: PNode = { id: nodes.length, symbol: look, children: [] };
      nodes.push(leaf);
      stack = [...stack, { state: act.to, symbol: look, node: leaf.id }];
      pos++;
      push('shift', `Shift "${look}" and go to state ${act.to}.`, null, leaf.id);
      continue;
    }
    const prod = auto.productions[act.prod];
    const popped = stack.slice(stack.length - prod.rhs.length);
    const kids = popped.map((e) => e.node as number);
    if (prod.rhs.length === 0) {
      const eps: PNode = { id: nodes.length, symbol: EMPTY_STRING, children: [] };
      nodes.push(eps);
      kids.push(eps.id);
    }
    const parent: PNode = { id: nodes.length, symbol: prod.lhs, children: kids };
    nodes.push(parent);
    stack = stack.slice(0, stack.length - prod.rhs.length);
    const to = table.gotos.get(cellKey(String(stack[stack.length - 1].state), prod.lhs));
    if (to === undefined) return done('rejected', 'error', `State ${stack[stack.length - 1].state} has no goto on ${prod.lhs}: rejected.`);
    stack = [...stack, { state: to, symbol: prod.lhs, node: parent.id }];
    forms.push(sentential());
    push('reduce', `Reduce ${prod.lhs} -> ${prod.rhs.length ? prod.rhs.join(' ') : EMPTY_STRING}, then go to state ${to}.`, act.prod, parent.id);
  }
  return done('budget', 'budget', `Did not finish within ${LR_STEP_BUDGET} steps.`);
}

// ── Trees: independent derivation generators and the value of a tree ─

/** The sentential forms from the start symbol down to the sentence, always expanding the `side`-most nonterminal of the tree. Reads only the finished tree. */
export function derivationFromTree(nodes: readonly PNode[], root: number, side: 'leftmost' | 'rightmost'): Form[] {
  type Slot = { node: number };
  let form: Slot[] = [{ node: root }];
  const text = (f: Slot[]) => f.flatMap((s) => (nodes[s.node].symbol === EMPTY_STRING ? [] : [nodes[s.node].symbol]));
  const out: Form[] = [text(form)];
  for (;;) {
    const pick = side === 'leftmost' ? form.findIndex((s) => nodes[s.node].children.length > 0) : form.map((s) => nodes[s.node].children.length > 0).lastIndexOf(true);
    if (pick < 0) return out;
    form = [...form.slice(0, pick), ...nodes[form[pick].node].children.map((node) => ({ node })), ...form.slice(pick + 1)];
    out.push(text(form));
  }
}

/** The tree's value with its ids numbered 2, 3, 4, ... left to right (`+` and `*` operators, parentheses), or null when the tree is not an expression. */
export function evaluateTree(nodes: readonly PNode[], root: number): number | null {
  let nextId = 2;
  const ev = (id: number): number | null => {
    const n = nodes[id];
    if (n.children.length === 0) return n.symbol === 'id' ? nextId++ : null;
    const kids = n.children.map((c) => nodes[c]);
    if (kids.length === 1) return ev(kids[0].id);
    if (kids.length === 3 && kids[0].symbol === '(' && kids[2].symbol === ')') return ev(kids[1].id);
    if (kids.length === 3 && (kids[1].symbol === '+' || kids[1].symbol === '*')) {
      const l = ev(kids[0].id);
      const r = ev(kids[2].id);
      if (l === null || r === null) return null;
      return kids[1].symbol === '+' ? l + r : l * r;
    }
    return null;
  };
  return ev(root);
}

/** Roots of the finished bottom-up parse (the one tree under the start symbol), or null. */
export function bottomUpRoot(run: BuRun): number | null {
  const last = run.frames[run.frames.length - 1];
  const entries = last.stack.filter((e) => e.node !== null);
  return run.status === 'accepted' && entries.length === 1 ? (entries[0].node as number) : null;
}

/** The most expansions in a row without a token being read: how deep the recursion went before a token was needed. */
export function longestExpansionRun(frames: readonly TdFrame[]): number {
  let best = 0;
  let current = 0;
  for (const f of frames) {
    current = f.kind === 'expand' ? current + 1 : f.kind === 'match' ? 0 : current;
    best = Math.max(best, current);
  }
  return best;
}
