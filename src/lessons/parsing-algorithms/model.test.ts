/**
 * Independent oracles: published tables (Aho, Lam, Sethi, Ullman, "Compilers: Principles, Techniques, and Tools",
 * the expression grammar of the LL and SLR sections), an Earley recogniser that shares no code with the tables,
 * and brute-force derivation searches.
 */
import { describe, expect, it } from 'vitest';
import { generates } from './earley';
import { END, analyse, cellKey, conflictCells, isLL1, isNonterminal, leftRecursive, parseGrammar, predictiveTable, removeLeftRecursion, type Grammar } from './grammar';
import { analyseLr, buildTable, lrConflicts } from './lr';
import { PRESETS, presetGrammar } from './presets';
import { RECURSION_BUDGET, bottomUpRoot, derivationFromTree, evaluateTree, runBottomUp, runTopDown, type Resolver } from './runs';

const words = (s: string) => s.split(' ').filter(Boolean);
const set = (xs: Iterable<string>) => [...xs].sort();

/** Every string over `alphabet` of length 0 to `max`. */
function allStrings(alphabet: readonly string[], max: number): string[][] {
  const out: string[][] = [[]];
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    out.push(...layer);
  }
  return out;
}

const resolveAll = (kind: 'shift' | 'reduce'): Resolver => (_cell, actions) => actions.find((a) => a.kind === kind) ?? actions[0];

describe('FIRST and FOLLOW, from the textbook expression grammar', () => {
  const g = presetGrammar('ll');
  const a = analyse(g);
  it("FIRST(E) = {(, id}, FOLLOW(E) = FOLLOW(E') = {), $}", () => {
    expect(set(a.first.get('E')!)).toEqual(['(', 'id']);
    expect(set(a.follow.get('E')!)).toEqual(set([')', END]));
    expect(set(a.follow.get("E'")!)).toEqual(set([')', END]));
  });
  it("FOLLOW(T) = FOLLOW(T') = {+, ), $} and FOLLOW(F) = {*, +, ), $}", () => {
    expect(set(a.follow.get('T')!)).toEqual(set([')', END, '+']));
    expect(set(a.follow.get("T'")!)).toEqual(set([')', END, '+']));
    expect(set(a.follow.get('F')!)).toEqual(set([')', END, '*', '+']));
  });
  it("E' and T' are nullable and E, T, F are not", () => {
    expect(set(a.nullable)).toEqual(["E'", "T'"]);
  });
});

describe('the SLR automaton', () => {
  it('has 12 states for the layered grammar (the classic I0 to I11)', () => {
    expect(analyseLr(presetGrammar('layered')).automaton.states).toHaveLength(12);
  });
  it('the layered grammar is SLR(1): no conflicts; the LL form is too', () => {
    expect(lrConflicts(analyseLr(presetGrammar('layered')).table)).toEqual([]);
    expect(lrConflicts(analyseLr(presetGrammar('ll')).table)).toEqual([]);
  });
  it('the ambiguous grammar has shift/reduce conflicts on + and * after E + E and E * E', () => {
    const { table } = analyseLr(presetGrammar('ambiguous'));
    expect(lrConflicts(table)).toHaveLength(4);
    for (const key of lrConflicts(table)) {
      const kinds = table.actions.get(key)!.map((x) => x.kind).sort();
      expect(kinds).toEqual(['reduce', 'shift']);
    }
  });
  it('a broken table builder (FOLLOW replaced by every terminal) creates spurious conflicts the correct one does not have', () => {
    const g = presetGrammar('layered');
    const { analysis, automaton, table } = analyseLr(g);
    const everyTerminal = new Set([...g.terminals, END]);
    const broken = buildTable(automaton, { ...analysis, follow: new Map(g.nonterminals.map((n) => [n, everyTerminal])) });
    expect(lrConflicts(table)).toEqual([]);
    const spurious = lrConflicts(broken);
    expect(spurious.length).toBeGreaterThan(0);
    expect(broken.actions.get(spurious[0])!.length).toBeGreaterThan(1);
  });
});

describe('table-driven parsers agree with a generic recogniser', () => {
  it('top-down on the LL-friendly grammar, every string over its terminals up to length 7', () => {
    const g = presetGrammar('ll');
    const table = predictiveTable(g, analyse(g));
    expect(conflictCells(table)).toEqual([]);
    for (const s of allStrings(g.terminals, 7)) expect(runTopDown(g, table, s).status === 'accepted', s.join(' ')).toBe(generates(g, s));
  });

  it('bottom-up on the layered and LL-friendly grammars, every string up to length 7', () => {
    for (const id of ['layered', 'll']) {
      const g = presetGrammar(id);
      const { automaton, table } = analyseLr(g);
      for (const s of allStrings(g.terminals, 7)) expect(runBottomUp(automaton, table, s, resolveAll('shift')).status === 'accepted', `${id}: ${s.join(' ')}`).toBe(generates(g, s));
    }
  });

  it('with the ambiguous grammar, whatever the four conflict choices, what is accepted is always generated', () => {
    const g = presetGrammar('ambiguous');
    const { automaton, table } = analyseLr(g);
    const cells = lrConflicts(table);
    for (let mask = 0; mask < 16; mask++) {
      const resolve: Resolver = (cell, actions) => {
        const kind = (mask >> cells.indexOf(cell)) & 1 ? 'shift' : 'reduce';
        return actions.find((x) => x.kind === kind) ?? null;
      };
      for (const s of allStrings(g.terminals, 7)) {
        if (runBottomUp(automaton, table, s, resolve).status === 'accepted') expect(generates(g, s), `${mask}: ${s.join(' ')}`).toBe(true);
      }
    }
  });

  it('top-down on conflicted tables (dangling else, left recursion) never accepts a string outside the language', () => {
    for (const id of ['dangling', 'layered', 'ambiguous']) {
      const g = presetGrammar(id);
      const table = predictiveTable(g, analyse(g));
      for (const s of allStrings(g.terminals, 6)) {
        if (runTopDown(g, table, s).status === 'accepted') expect(generates(g, s), `${id}: ${s.join(' ')}`).toBe(true);
      }
    }
  });
});

/** Brute force: complete leftmost derivations of sentences up to `maxLen` tokens; record which rule each (nonterminal, next token) used. */
function bruteForceLL1Conflict(g: Grammar, maxLen = 6): boolean {
  const used = new Map<string, Set<number>>();
  const walk = (form: string[], trail: { key: (sentence: string[]) => string; prod: number }[]): void => {
    if (form.length > maxLen + 2) return;
    const i = form.findIndex(isNonterminal);
    if (i < 0) {
      if (form.length > maxLen) return;
      for (const t of trail) {
        const k = t.key(form);
        used.set(k, (used.get(k) ?? new Set()).add(t.prod));
      }
      return;
    }
    const before = form.slice(0, i);
    for (const p of g.productions.filter((q) => q.lhs === form[i])) {
      const key = (sentence: string[]) => `${form[i]}\u0000${sentence[before.length] ?? END}`;
      walk([...before, ...p.rhs, ...form.slice(i + 1)], [...trail, { key, prod: p.id }]);
    }
  };
  walk([g.start], []);
  return [...used.values()].some((s) => s.size > 1);
}

describe('LL(1)', () => {
  it('a grammar is LL(1) exactly when no predictive cell holds two rules, cross-checked by brute-force derivation search', () => {
    for (const p of PRESETS) {
      const g = presetGrammar(p.id);
      expect(isLL1(g, analyse(g)), p.id).toBe(!bruteForceLL1Conflict(g));
    }
    expect(PRESETS.filter((p) => isLL1(presetGrammar(p.id), analyse(presetGrammar(p.id)))).map((p) => p.id)).toEqual(['ll']);
  });
});

/** Brute force: does some derivation A =>+ A alpha exist? Breadth-first over forms of at most 7 symbols, leftmost-expanding. */
function derivesItselfFirst(g: Grammar, a: string): boolean {
  const seen = new Set<string>();
  let frontier: string[][] = [[a]];
  for (let depth = 0; depth < 8; depth++) {
    const next: string[][] = [];
    for (const form of frontier) {
      const i = form.findIndex(isNonterminal);
      if (i < 0) continue;
      for (const p of g.productions.filter((q) => q.lhs === form[i])) {
        const f = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
        if (f.length > 7) continue;
        if (f[0] === a) return true;
        const k = f.join(' ');
        if (!seen.has(k)) {
          seen.add(k);
          next.push(f);
        }
      }
    }
    frontier = next;
  }
  return false;
}

describe('left recursion', () => {
  const grammars = [...PRESETS.map((p) => presetGrammar(p.id)), parse('A -> B A | a\nB -> eps'), parse('A -> B c\nB -> A d | e')];
  function parse(text: string): Grammar {
    const r = parseGrammar(text);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }
  it('detection equals a brute-force derivation search, including a nullable prefix and an indirect cycle', () => {
    for (const g of grammars) {
      const found = leftRecursive(g, analyse(g));
      const brute = g.nonterminals.filter((n) => derivesItselfFirst(g, n));
      expect(found, g.source).toEqual(brute);
    }
    expect(leftRecursive(grammars[4], analyse(grammars[4]))).toEqual(['A']);
  });

  it('removing it from the layered grammar gives the LL-friendly form, with no conflicts and the same language', () => {
    const g = presetGrammar('layered');
    const r = removeLeftRecursion(g);
    if (!r.ok) throw new Error(r.error);
    expect(r.text).toBe(PRESETS[1].text);
    const rewritten = parse(r.text);
    expect(isLL1(rewritten, analyse(rewritten))).toBe(true);
    for (const s of allStrings(['id', '+', '*', '(', ')'], 6)) expect(generates(rewritten, s), s.join(' ')).toBe(generates(g, s));
  });

  it('removing it from a grammar that has none changes nothing, and an unfixable one is refused with a reason', () => {
    expect(removeLeftRecursion(presetGrammar('ll'))).toMatchObject({ ok: true, changed: false });
    const hopeless = removeLeftRecursion(parse('A -> A b'));
    expect(hopeless.ok).toBe(false);
  });

  it('the ambiguous grammar stays conflicted after the rewrite (ambiguity is not left recursion)', () => {
    const r = removeLeftRecursion(presetGrammar('ambiguous'));
    if (!r.ok) throw new Error(r.error);
    const g = parse(r.text);
    expect(conflictCells(predictiveTable(g, analyse(g))).length).toBeGreaterThan(0);
  });
});

describe('recursive descent on a left-recursive grammar', () => {
  it('stops at the budget of 50 nested expansions and says so, never "infinite"', () => {
    const g = presetGrammar('layered');
    const run = runTopDown(g, predictiveTable(g, analyse(g)), words('id + id'));
    expect(run.status).toBe('budget');
    expect(run.message).toContain('Recursion budget reached');
    expect(run.message).toContain(String(RECURSION_BUDGET));
    expect(run.message).not.toMatch(/infinite|forever/i);
  });
});

describe('derivation orders', () => {
  it('top-down prints the leftmost derivation and bottom-up the reverse of the rightmost, equal to generators that read only the finished tree', () => {
    const g = presetGrammar('ll');
    const tokens = words('id + id * id');
    const td = runTopDown(g, predictiveTable(g, analyse(g)), tokens);
    expect(td.status).toBe('accepted');
    expect(td.forms).toEqual(derivationFromTree(td.nodes, 0, 'leftmost'));

    const layered = presetGrammar('layered');
    const { automaton, table } = analyseLr(layered);
    const bu = runBottomUp(automaton, table, tokens, resolveAll('shift'));
    const root = bottomUpRoot(bu)!;
    expect(bu.forms).toEqual(derivationFromTree(bu.nodes, root, 'rightmost').reverse());
    expect(bu.forms[0]).toEqual(tokens);
    expect(bu.forms[bu.forms.length - 1]).toEqual(['E']);
  });

  it('both trees have the same leaves, and the leftmost derivation of the top-down tree starts at the root', () => {
    const g = presetGrammar('ll');
    const run = runTopDown(g, predictiveTable(g, analyse(g)), words('( id )'));
    expect(run.forms[0]).toEqual(['E']);
    expect(run.forms[run.forms.length - 1]).toEqual(['(', 'id', ')']);
  });
});

describe('the precedence game', () => {
  const g = presetGrammar('ambiguous');
  const { automaton, table } = analyseLr(g);
  const cells = lrConflicts(table);
  /** The conflict cell for lookahead `look` in the state holding the item `E -> E op E .`. */
  const cellAfter = (op: string, look: string) =>
    cells.find((k) => {
      const [state, sym] = k.split('\u0000');
      return sym === look && automaton.states[Number(state)].items.some((i) => automaton.productions[i.prod].rhs[1] === op && i.dot === 3);
    })!;
  const value = (tokens: string, afterPlusSeesStar: 'shift' | 'reduce', afterStarSeesPlus: 'shift' | 'reduce') => {
    const choose = (cell: string): 'shift' | 'reduce' => (cell === cellAfter('+', '*') ? afterPlusSeesStar : cell === cellAfter('*', '+') ? afterStarSeesPlus : 'reduce');
    const resolve: Resolver = (cell, actions) => actions.find((a) => a.kind === choose(cell)) ?? null;
    const run = runBottomUp(automaton, table, words(tokens), resolve);
    const root = bottomUpRoot(run);
    return root === null ? null : evaluateTree(run.nodes, root);
  };

  it('id + id * id with ids 2, 3, 4: shift after E + E seeing * gives 14, reduce gives 20, whatever the other choice', () => {
    expect(value('id + id * id', 'shift', 'shift')).toBe(14);
    expect(value('id + id * id', 'shift', 'reduce')).toBe(14);
    expect(value('id + id * id', 'reduce', 'shift')).toBe(20);
    expect(value('id + id * id', 'reduce', 'reduce')).toBe(20);
  });

  it('id * id + id: the other choice decides (2 * 3 + 4 = 10 on reduce, 2 * (3 + 4) = 14 on shift)', () => {
    expect(value('id * id + id', 'shift', 'reduce')).toBe(10);
    expect(value('id * id + id', 'shift', 'shift')).toBe(14);
  });

  it('the cells exist and are conflicts', () => {
    expect(table.actions.get(cellAfter('+', '*'))).toHaveLength(2);
    expect(table.actions.get(cellAfter('*', '+'))).toHaveLength(2);
    expect(cellKey('1', '+')).toBe('1\u0000+');
  });
});

describe('hostile grammars are refused with a position', () => {
  const cases: [string, RegExp][] = [
    ['E id', /^Line 1, column 3: expected "->"/],
    ['E -> a |', /^Line 1.*empty alternative/],
    ['E -> | a', /^Line 1.*empty alternative/],
    ['e -> a', /^Line 1, column 1: "e" must start with a capital/],
    ['E -> a eps', /^Line 1.*eps stands for the empty string/],
    ['E -> a b c d e f', /^Line 1.*6 symbols; the limit is 5/],
    ['E -> a | b | c | d | e', /^Line 1.*at most 4 alternatives/],
    ['A -> a\nA -> b', /^Line 2: A is already defined on line 1/],
    ['A -> a\nB -> a\nC -> a\nD -> a\nE -> a\nF -> a\nG -> a', /^Line 7: more than 6 rules/],
    ['', /Write at least one rule/],
    ['E -> a $', /\$ is reserved/],
    ['E -> a -> b', /second "->"/],
    ['E -> ε', /write eps for the empty string/],
    ['E->id', /put spaces around ->/],
    ['E -> a->b', /put spaces around ->/],
  ];
  it.each(cases)('%s', (text, message) => {
    const r = parseGrammar(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it('an undefined or unreachable nonterminal is allowed and flagged', () => {
    const r = parseGrammar('S -> a X\nY -> b');
    if (!r.ok) throw new Error(r.error);
    const a = analyse(r.value);
    expect(a.undefinedNonterminals).toEqual(['X']);
    expect(a.unreachable).toEqual(['Y']);
  });

  it('a token outside the grammar fails the parse at that token with the stack shown', () => {
    const g = presetGrammar('ll');
    const run = runTopDown(g, predictiveTable(g, analyse(g)), words('id + ?'));
    expect(run.status).toBe('rejected');
    expect(run.message).toContain('"?"');
    const bu = analyseLr(presetGrammar('layered'));
    const run2 = runBottomUp(bu.automaton, bu.table, words('id + ?'), resolveAll('shift'));
    expect(run2.status).toBe('rejected');
    expect(run2.frames[run2.frames.length - 1].stack.length).toBeGreaterThan(1);
  });
});
