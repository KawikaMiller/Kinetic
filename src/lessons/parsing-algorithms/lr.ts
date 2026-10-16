/**
 * SLR(1): the LR(0) item sets, the automaton between them, and the ACTION and GOTO tables built with FOLLOW sets.
 * Real generators use stronger lookahead (LALR(1), LR(1)); SLR(1) is the textbook starting point.
 */
import { AUGMENTED, END, analyse, cellKey, isNonterminal, type Analysis, type Grammar, type Production } from './grammar';

export interface Item {
  /** Index into `LrAutomaton.productions` (0 is the augmented production). */
  prod: number;
  dot: number;
}

export interface LrState {
  id: number;
  items: Item[];
  /** The items that came from a goto (or the augmented start): the ones worth printing. */
  kernel: Item[];
}

export interface LrEdge {
  from: number;
  to: number;
  symbol: string;
}

export interface LrAutomaton {
  /** `productions[0]` is `$start -> S`; `productions[i]` for i >= 1 is the grammar's production i - 1, so rule numbers match the tables. */
  productions: Production[];
  states: LrState[];
  edges: LrEdge[];
}

const itemKey = (i: Item) => `${i.prod}.${i.dot}`;

export function buildAutomaton(g: Grammar): LrAutomaton {
  const productions: Production[] = [{ id: 0, lhs: AUGMENTED, rhs: [g.start] }, ...g.productions.map((p) => ({ ...p, id: p.id + 1 }))];
  const byLhs = new Map<string, number[]>();
  productions.forEach((p, i) => byLhs.set(p.lhs, [...(byLhs.get(p.lhs) ?? []), i]));

  const closure = (kernel: Item[]): Item[] => {
    const items = [...kernel];
    const seen = new Set(items.map(itemKey));
    for (let i = 0; i < items.length; i++) {
      const next = productions[items[i].prod].rhs[items[i].dot];
      if (next === undefined || !isNonterminal(next)) continue;
      for (const prod of byLhs.get(next) ?? []) {
        const item = { prod, dot: 0 };
        if (!seen.has(itemKey(item))) {
          seen.add(itemKey(item));
          items.push(item);
        }
      }
    }
    return items;
  };

  const states: LrState[] = [];
  const index = new Map<string, number>();
  const edges: LrEdge[] = [];
  const add = (kernel: Item[]): number => {
    const key = kernel.map(itemKey).sort().join(',');
    const known = index.get(key);
    if (known !== undefined) return known;
    const id = states.length;
    index.set(key, id);
    states.push({ id, items: closure(kernel), kernel });
    return id;
  };
  add([{ prod: 0, dot: 0 }]);
  for (let s = 0; s < states.length; s++) {
    const bySymbol = new Map<string, Item[]>();
    for (const item of states[s].items) {
      const sym = productions[item.prod].rhs[item.dot];
      if (sym !== undefined) bySymbol.set(sym, [...(bySymbol.get(sym) ?? []), { prod: item.prod, dot: item.dot + 1 }]);
    }
    for (const [symbol, kernel] of bySymbol) edges.push({ from: s, to: add(kernel), symbol });
  }
  return { productions, states, edges };
}

export type Action = { kind: 'shift'; to: number } | { kind: 'reduce'; prod: number } | { kind: 'accept' };

export const actionKey = (a: Action) => (a.kind === 'shift' ? `s${a.to}` : a.kind === 'reduce' ? `r${a.prod}` : 'acc');
/** Reduce rules print by the grammar's own number (the augmented rule is not numbered). */
export const actionText = (a: Action) => (a.kind === 'shift' ? `s${a.to}` : a.kind === 'reduce' ? `r${a.prod}` : 'acc');

export interface LrTable {
  /** ACTION cells (terminals and `$`) and GOTO cells (nonterminals) by (state, symbol). Two or more actions in a cell is a conflict. */
  actions: Map<string, Action[]>;
  gotos: Map<string, number>;
}

export function buildTable(auto: LrAutomaton, a: Analysis): LrTable {
  const actions = new Map<string, Action[]>();
  const gotos = new Map<string, number>();
  const put = (state: number, sym: string, act: Action) => {
    const k = cellKey(String(state), sym);
    const cell = actions.get(k) ?? [];
    if (!cell.some((x) => actionKey(x) === actionKey(act))) cell.push(act);
    actions.set(k, cell);
  };
  for (const e of auto.edges) {
    if (isNonterminal(e.symbol)) gotos.set(cellKey(String(e.from), e.symbol), e.to);
    else put(e.from, e.symbol, { kind: 'shift', to: e.to });
  }
  for (const s of auto.states) {
    for (const item of s.items) {
      const p = auto.productions[item.prod];
      if (item.dot < p.rhs.length) continue;
      if (item.prod === 0) {
        put(s.id, END, { kind: 'accept' });
        continue;
      }
      for (const t of a.follow.get(p.lhs) ?? []) put(s.id, t, { kind: 'reduce', prod: item.prod });
    }
  }
  return { actions, gotos };
}

export const lrConflicts = (t: LrTable) => [...t.actions.entries()].filter(([, cell]) => cell.length > 1).map(([k]) => k);

export const analyseLr = (g: Grammar) => {
  const a = analyse(g);
  const automaton = buildAutomaton(g);
  return { analysis: a, automaton, table: buildTable(automaton, a) };
};

/** The item as the textbook writes it: `E -> E + . T`. */
export function itemText(auto: LrAutomaton, i: Item): string {
  const p = auto.productions[i.prod];
  const rhs = p.rhs.map((s) => s);
  rhs.splice(i.dot, 0, '·');
  return `${p.lhs} -> ${rhs.join(' ')}`;
}
