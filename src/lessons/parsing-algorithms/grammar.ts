/**
 * Grammars for the parsing lesson: the rule editor's parser (through core/parseKit, positioned refusals), FIRST,
 * FOLLOW and nullable sets, the LL(1) predictive table, left-recursion detection and its removal.
 * Nothing the learner types reaches RegExp, eval or Function.
 *
 * Writing grammars: `E -> E + T | T`, one rule per line. A nonterminal starts with a capital letter; every other
 * word is a terminal; `eps` is the empty string. Symbols are separated by spaces.
 */
import { parseKitRows, type TokenRule } from '../../core/parseKit';

export const MAX_RULES = 6;
export const MAX_ALTERNATIVES = 4;
export const MAX_SYMBOLS = 5;
export const MAX_RULE_CHARS = 60;
/** The most characters the token field accepts, so a 12-token string always fits. */
export const MAX_TOKEN_TEXT = 80;
/** The end-of-input marker in tables. */
export const END = '$';
export const EPS = 'eps';
/** The augmented start symbol of the LR automaton; `$` is reserved so no learner symbol can clash. */
export const AUGMENTED = '$start';

export const isNonterminal = (s: string) => /^\p{Lu}/u.test(s);

export interface Production {
  /** Position in the grammar's production list (0-based), the number tables print + 1. */
  id: number;
  lhs: string;
  /** Empty for the empty string. */
  rhs: string[];
}

export interface Grammar {
  source: string;
  start: string;
  productions: Production[];
  /** Left-hand sides in rule order. */
  nonterminals: string[];
  /** Terminals in order of first appearance. */
  terminals: string[];
}

const TOKENS: TokenRule[] = [
  { kind: 'arrow', pattern: /->/ },
  { kind: 'bar', pattern: /\|/ },
  { kind: 'word', pattern: /[^\s|]+/u },
];

export type GrammarParse = { ok: true; value: Grammar } | { ok: false; error: string };

export const prodText = (p: Production) => `${p.lhs} -> ${p.rhs.length ? p.rhs.join(' ') : 'ε'}`;

/** The rules as editor text: alternatives of one left-hand side joined with `|`. */
export function grammarText(productions: readonly Production[]): string {
  const order: string[] = [];
  const alts = new Map<string, string[]>();
  for (const p of productions) {
    if (!alts.has(p.lhs)) {
      order.push(p.lhs);
      alts.set(p.lhs, []);
    }
    alts.get(p.lhs)!.push(p.rhs.length ? p.rhs.join(' ') : EPS);
  }
  return order.map((lhs) => `${lhs} -> ${alts.get(lhs)!.join(' | ')}`).join('\n');
}

export function parseGrammar(text: string): GrammarParse {
  const read = parseKitRows<{ lhs: string; alts: string[][] }>(text, {
    tokens: TOKENS,
    maxRows: MAX_RULES,
    maxLineChars: MAX_RULE_CHARS,
    noun: { one: 'rule', many: 'rules' },
    empty: 'Write at least one rule, like E -> id.',
    row: (c) => {
      const lhs = c.accept('word');
      if (!lhs) return c.fail('a rule starts with its nonterminal, like E -> id.');
      if (lhs.text.includes('->')) return c.failAt(lhs, 'put spaces around ->, like E -> id.');
      if (!isNonterminal(lhs.text) || lhs.text.startsWith('$')) return c.failAt(lhs, `"${lhs.text}" must start with a capital letter to be a nonterminal.`);
      if (!c.accept('arrow')) return c.fail('expected "->" after the nonterminal.');
      const alts: string[][] = [];
      let current: string[] = [];
      const finish = (): ReturnType<typeof c.fail> | null => {
        if (current.length === 0) return c.fail('empty alternative: write eps for the empty string.');
        if (current.includes(EPS) && current.length > 1) return c.fail('eps stands for the empty string and cannot sit beside other symbols.');
        if (current.length > MAX_SYMBOLS) return c.fail(`an alternative has ${current.length} symbols; the limit is ${MAX_SYMBOLS}.`);
        alts.push(current[0] === EPS ? [] : current);
        current = [];
        return null;
      };
      for (;;) {
        const t = c.next();
        if (!t) break;
        if (t.kind === 'arrow') return c.failAt(t, 'a second "->" on one rule: separate alternatives with |.');
        if (t.kind === 'bar') {
          const failed = finish();
          if (failed) return failed;
          if (alts.length >= MAX_ALTERNATIVES) return c.failAt(t, `a rule has at most ${MAX_ALTERNATIVES} alternatives.`);
          continue;
        }
        if (t.text.startsWith('$')) return c.failAt(t, '$ is reserved for the end of input.');
        if (t.text === 'ε') return c.failAt(t, 'write eps for the empty string.');
        if (t.text.includes('->')) return c.failAt(t, 'put spaces around ->: a symbol cannot contain it.');
        current.push(t.text);
      }
      const failed = finish();
      if (failed) return failed;
      if (alts.length > MAX_ALTERNATIVES) return c.fail(`a rule has at most ${MAX_ALTERNATIVES} alternatives.`);
      return { ok: true, value: { lhs: lhs.text, alts } };
    },
  });
  if (!read.ok) return { ok: false, error: read.error };
  const productions: Production[] = [];
  const seen = new Map<string, number>();
  for (const { line, value } of read.rows) {
    const first = seen.get(value.lhs);
    if (first !== undefined) return { ok: false, error: `Line ${line}: ${value.lhs} is already defined on line ${first}; put its alternatives on one line with |.` };
    seen.set(value.lhs, line);
    for (const rhs of value.alts) productions.push({ id: productions.length, lhs: value.lhs, rhs });
  }
  const nonterminals = [...seen.keys()];
  const terminals: string[] = [];
  for (const p of productions) for (const s of p.rhs) if (!isNonterminal(s) && !terminals.includes(s)) terminals.push(s);
  return { ok: true, value: { source: text, start: nonterminals[0], productions, nonterminals, terminals } };
}

// ── FIRST, FOLLOW, nullable ─────────────────────────────────────────

export interface Analysis {
  nullable: Set<string>;
  first: Map<string, Set<string>>;
  follow: Map<string, Set<string>>;
  /** Nonterminals used on a right-hand side but never given a rule. */
  undefinedNonterminals: string[];
  /** Nonterminals with a rule that the start symbol cannot reach. */
  unreachable: string[];
}

/** FIRST (terminals only) of a sequence, and whether the whole sequence can be empty. */
export function firstOfSequence(seq: readonly string[], a: Pick<Analysis, 'first' | 'nullable'>): { terminals: Set<string>; nullable: boolean } {
  const terminals = new Set<string>();
  for (const s of seq) {
    if (!isNonterminal(s)) {
      terminals.add(s);
      return { terminals, nullable: false };
    }
    a.first.get(s)?.forEach((t) => terminals.add(t));
    if (!a.nullable.has(s)) return { terminals, nullable: false };
  }
  return { terminals, nullable: true };
}

export function analyse(g: Grammar): Analysis {
  const nullable = new Set<string>();
  const first = new Map<string, Set<string>>(g.nonterminals.map((n) => [n, new Set<string>()]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      if (p.rhs.every((s) => isNonterminal(s) && nullable.has(s)) && !nullable.has(p.lhs)) {
        nullable.add(p.lhs);
        changed = true;
      }
      const f = firstOfSequence(p.rhs, { first, nullable }).terminals;
      const into = first.get(p.lhs)!;
      for (const t of f) {
        if (!into.has(t)) {
          into.add(t);
          changed = true;
        }
      }
    }
  }
  const follow = new Map<string, Set<string>>(g.nonterminals.map((n) => [n, new Set<string>()]));
  follow.get(g.start)!.add(END);
  changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      p.rhs.forEach((s, i) => {
        if (!isNonterminal(s) || !follow.has(s)) return;
        const rest = firstOfSequence(p.rhs.slice(i + 1), { first, nullable });
        const into = follow.get(s)!;
        const add = (t: string) => {
          if (!into.has(t)) {
            into.add(t);
            changed = true;
          }
        };
        rest.terminals.forEach(add);
        if (rest.nullable) follow.get(p.lhs)!.forEach(add);
      });
    }
  }
  const defined = new Set(g.nonterminals);
  const undefinedNonterminals = [...new Set(g.productions.flatMap((p) => p.rhs.filter((s) => isNonterminal(s) && !defined.has(s))))];
  const reached = new Set([g.start]);
  const queue = [g.start];
  while (queue.length) {
    const n = queue.pop()!;
    for (const p of g.productions) {
      if (p.lhs !== n) continue;
      for (const s of p.rhs) {
        if (isNonterminal(s) && !reached.has(s)) {
          reached.add(s);
          queue.push(s);
        }
      }
    }
  }
  return { nullable, first, follow, undefinedNonterminals, unreachable: g.nonterminals.filter((n) => !reached.has(n)) };
}

// ── The predictive (LL(1)) table ────────────────────────────────────

export const cellKey = (row: string, col: string) => `${row}\u0000${col}`;

/** Production ids per (nonterminal, lookahead) cell; a cell with two or more is a conflict. */
export function predictiveTable(g: Grammar, a: Analysis): Map<string, number[]> {
  const table = new Map<string, number[]>();
  const put = (n: string, t: string, id: number) => {
    const k = cellKey(n, t);
    const cell = table.get(k) ?? [];
    if (!cell.includes(id)) cell.push(id);
    table.set(k, cell);
  };
  for (const p of g.productions) {
    const f = firstOfSequence(p.rhs, a);
    f.terminals.forEach((t) => put(p.lhs, t, p.id));
    if (f.nullable) a.follow.get(p.lhs)?.forEach((t) => put(p.lhs, t, p.id));
  }
  return table;
}

/** The columns of the predictive table: the grammar's terminals, then `$`. */
export const tableColumns = (g: Grammar) => [...g.terminals, END];

export const conflictCells = (table: ReadonlyMap<string, readonly number[]>) => [...table.entries()].filter(([, ids]) => ids.length > 1).map(([k]) => k);

export const isLL1 = (g: Grammar, a: Analysis) => conflictCells(predictiveTable(g, a)).length === 0;

// ── Left recursion ──────────────────────────────────────────────────

/** Nonterminals that can derive themselves as the leftmost symbol: reachable from themselves through left corners (the symbols a rule can start with, looking past nullable ones). */
export function leftRecursive(g: Grammar, a: Pick<Analysis, 'nullable'>): string[] {
  const corners = new Map<string, Set<string>>(g.nonterminals.map((n) => [n, new Set<string>()]));
  for (const p of g.productions) {
    for (const s of p.rhs) {
      if (!isNonterminal(s)) break;
      corners.get(p.lhs)!.add(s);
      if (!a.nullable.has(s)) break;
    }
  }
  return g.nonterminals.filter((n) => {
    const seen = new Set<string>();
    const stack = [...(corners.get(n) ?? [])];
    while (stack.length) {
      const m = stack.pop()!;
      if (m === n) return true;
      if (seen.has(m)) continue;
      seen.add(m);
      stack.push(...(corners.get(m) ?? []));
    }
    return false;
  });
}

export type Rewrite = { ok: true; text: string; changed: boolean } | { ok: false; error: string };

/** Textbook left-recursion removal (substitute earlier rules, then split each immediately left-recursive rule into `A -> β A'`, `A' -> α A' | eps`). */
export function removeLeftRecursion(g: Grammar): Rewrite {
  const a = analyse(g);
  if (leftRecursive(g, a).length === 0) return { ok: true, text: grammarText(g.productions), changed: false };
  const order = g.nonterminals;
  const alts = new Map<string, string[][]>(order.map((n) => [n, g.productions.filter((p) => p.lhs === n).map((p) => p.rhs)]));
  const tails = new Map<string, { name: string; alts: string[][] }>();
  const used = new Set([...order, ...g.terminals]);
  const fresh = (n: string) => {
    let name = `${n}'`;
    while (used.has(name)) name += "'";
    used.add(name);
    return name;
  };
  order.forEach((ai, i) => {
    let current = alts.get(ai)!;
    for (let j = 0; j < i; j++) {
      const aj = order[j];
      current = current.flatMap((rhs) => (rhs[0] === aj ? alts.get(aj)!.map((d) => [...d, ...rhs.slice(1)]) : [rhs]));
    }
    const recursive = current.filter((rhs) => rhs[0] === ai);
    const rest = current.filter((rhs) => rhs[0] !== ai);
    if (recursive.length === 0 || rest.length === 0) {
      alts.set(ai, current);
      return;
    }
    const tail = fresh(ai);
    alts.set(ai, rest.map((beta) => [...beta, tail]));
    tails.set(ai, { name: tail, alts: [...recursive.map((r) => [...r.slice(1), tail]), []] });
  });
  const productions: Production[] = [];
  for (const n of order) {
    for (const rhs of alts.get(n)!) productions.push({ id: productions.length, lhs: n, rhs });
    const tail = tails.get(n);
    if (tail) for (const rhs of tail.alts) productions.push({ id: productions.length, lhs: tail.name, rhs });
  }
  const text = grammarText(productions);
  const again = parseGrammar(text);
  if (!again.ok) return { ok: false, error: `The rewritten grammar does not fit the editor: ${again.error}` };
  if (leftRecursive(again.value, analyse(again.value)).length > 0) return { ok: false, error: 'This left recursion goes through an empty production or a rule with no other alternative; rewrite it by hand.' };
  return { ok: true, text, changed: true };
}
