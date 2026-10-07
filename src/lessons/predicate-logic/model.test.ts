import { describe, expect, it } from 'vitest';
import {
  allWorlds, evaluate, exists, explain, forall, FORMULA_IDS, FORMULAS, negationChain, not, atom, pushNegation, resize, show, toggle, worldOf,
  type Formula, type FormulaId, type World,
} from './model';
import { PRESETS } from './presets';

/** The relation as a table of (person, dish) rows, the way SQL would hold it. */
const table = (w: World) => {
  const rows: { person: number; dish: number }[] = [];
  w.likes.forEach((r, x) => r.forEach((v, y) => v && rows.push({ person: x, dish: y })));
  return rows;
};
const ids = (n: number) => [...Array(n).keys()];

/**
 * Brute-force definitions, written as each formula's SQL reads (NOT EXISTS … NOT EXISTS)
 * over the table, not over the matrix the evaluator walks.
 */
const brute: Record<FormulaId, (w: World) => boolean> = {
  AE: (w) => !ids(w.people).some((p) => !table(w).some((l) => l.person === p)),
  EA: (w) => ids(w.dishes).some((d) => !ids(w.people).some((p) => !table(w).some((l) => l.person === p && l.dish === d))),
  EE: (w) => table(w).length > 0,
  AA: (w) => !ids(w.people).some((p) => ids(w.dishes).some((d) => !table(w).some((l) => l.person === p && l.dish === d))),
};

/** Every relation on every grid up to 3 × 3, empty domains included. */
const SMALL: World[] = [0, 1, 2, 3].flatMap((p) => [0, 1, 2, 3].flatMap((d) => allWorlds(p, d)));
const THREE = allWorlds(3, 3);

describe('evaluate', () => {
  it('has all 512 relations on a 3 × 3 grid', () => {
    expect(THREE).toHaveLength(512);
    expect(new Set(THREE.map((w) => JSON.stringify(w.likes))).size).toBe(512);
  });

  it('matches the brute-force (SQL-shaped) definitions on every relation up to 3 × 3', () => {
    for (const w of SMALL) for (const id of FORMULA_IDS) expect(evaluate(FORMULAS[id], w), `${id} on ${JSON.stringify(w)}`).toBe(brute[id](w));
  });

  it('∃y∀x → ∀x∃y always holds, and the converse fails on exactly 174 of the 512 3 × 3 relations', () => {
    for (const w of SMALL) if (evaluate(FORMULAS.EA, w)) expect(evaluate(FORMULAS.AE, w)).toBe(true);
    // Inclusion-exclusion by hand: 7³ = 343 relations give every row a like; 3·4³ − 3·2³ + 1 = 169 of
    // those also have a full column. 343 − 169 = 174 have the first without the second.
    const converseFails = THREE.filter((w) => evaluate(FORMULAS.AE, w) && !evaluate(FORMULAS.EA, w));
    expect(converseFails).toHaveLength(174);
  });

  it('the converse fails exactly on the "something each, no common dish" family', () => {
    for (const w of THREE) {
      const everyRow = w.likes.every((r) => r.includes(true));
      const fullColumn = ids(w.dishes).some((d) => w.likes.every((r) => r[d]));
      expect(evaluate(FORMULAS.AE, w) && !evaluate(FORMULAS.EA, w)).toBe(everyRow && !fullColumn);
    }
  });

  it('over an empty domain ∀ is vacuously true and ∃ is false', () => {
    const nobody = worldOf([], 3);
    expect(evaluate(forall('x', exists('y', atom)), nobody)).toBe(true);
    expect(evaluate(exists('x', exists('y', atom)), nobody)).toBe(false);
    expect(evaluate(exists('x', forall('y', atom)), nobody)).toBe(false);
    // An outer ∃ over dishes still finds a dish, and the inner ∀ over nobody is vacuous.
    expect(evaluate(FORMULAS.EA, nobody)).toBe(true);
    const noDishes = worldOf(['', ''], 0);
    expect(evaluate(FORMULAS.AE, noDishes)).toBe(false);
    expect(evaluate(FORMULAS.AA, noDishes)).toBe(true);
    expect(evaluate(FORMULAS.EA, worldOf([], 0))).toBe(false);
  });

  it('refuses an unbound variable instead of guessing', () => {
    expect(() => evaluate(atom, worldOf(['1']))).toThrow();
  });
});

describe('negation pushing', () => {
  const negated: Formula[] = FORMULA_IDS.map((id) => not(FORMULAS[id]));

  it('every rewrite step agrees with the original formula on every relation up to 3 × 3', () => {
    for (const f of negated) {
      const chain = negationChain(f);
      expect(chain.length).toBe(3);
      for (const { formula } of chain) for (const w of SMALL) expect(evaluate(formula, w)).toBe(evaluate(f, w));
    }
  });

  it('ends with ¬ only on the atom, quantifiers flipped', () => {
    expect(show(negationChain(not(FORMULAS.AE)).at(-1)!.formula)).toBe('∃x ∀y ¬likes(x, y)');
    expect(show(negationChain(not(FORMULAS.EA)).at(-1)!.formula)).toBe('∀y ∃x ¬likes(x, y)');
    expect(show(negationChain(not(FORMULAS.EE)).at(-1)!.formula)).toBe('∀x ∀y ¬likes(x, y)');
    expect(show(negationChain(not(FORMULAS.AA)).at(-1)!.formula)).toBe('∃x ∃y ¬likes(x, y)');
    expect(pushNegation(exists('x', forall('y', not(atom))))).toBeNull();
  });

  it('names the law it used, and removes a double negation', () => {
    expect(pushNegation(not(FORMULAS.AE))!.law).toBe('¬∀x P  ≡  ∃x ¬P');
    expect(pushNegation(not(not(atom)))).toEqual({ next: atom, law: '¬¬P  ≡  P' });
  });
});

describe('explain', () => {
  it('agrees with evaluate, and every witness or counterexample is real', () => {
    for (const w of SMALL) {
      for (const id of FORMULA_IDS) {
        const e = explain(id, w);
        expect(e.value).toBe(evaluate(FORMULAS[id], w));
        if (e.id === 'AE') {
          e.picks.forEach((y, x) => (y === null ? expect(w.likes[x].includes(true)).toBe(false) : expect(w.likes[x][y]).toBe(true)));
          if (!e.value) expect(e.picks[e.failRow!]).toBeNull();
        }
        if (e.id === 'EA') {
          if (e.column !== null) expect(w.likes.every((r) => r[e.column!])).toBe(true);
          e.missedBy.forEach((x, y) => x !== null && expect(w.likes[x][y]).toBe(false));
        }
        if (e.id === 'EE' && e.cell) expect(w.likes[e.cell[0]][e.cell[1]]).toBe(true);
        if (e.id === 'AA' && e.cell) expect(w.likes[e.cell[0]][e.cell[1]]).toBe(false);
      }
    }
  });
});

describe('presets', () => {
  const at = (id: string) => PRESETS.find((p) => p.id === id)!.world;
  it('show the orders disagreeing, both true, a counterexample and the empty domain', () => {
    expect([evaluate(FORMULAS.AE, at('own')), evaluate(FORMULAS.EA, at('own'))]).toEqual([true, false]);
    expect([evaluate(FORMULAS.AE, at('pizza')), evaluate(FORMULAS.EA, at('pizza'))]).toEqual([true, true]);
    expect(explain('AE', at('picky'))).toMatchObject({ value: false, failRow: 1 });
    const nobody = at('nobody');
    expect(nobody.people).toBe(0);
    expect(FORMULA_IDS.map((id) => evaluate(FORMULAS[id], nobody))).toEqual([true, true, false, true]);
  });
});

describe('editing', () => {
  it('toggles one cell and resizes without losing surviving cells', () => {
    const w = worldOf(['10', '01']);
    expect(toggle(w, 0, 1).likes).toEqual([[true, true], [false, true]]);
    expect(resize(w, 3, 1).likes).toEqual([[true], [false], [false]]);
    expect(resize(w, 0, 2)).toEqual({ people: 0, dishes: 2, likes: [] });
  });
});

describe('SQL comments', () => {
  /** Build a formula from the logic written in each line's comment, outermost first. */
  const fromComments = (lines: readonly string[]): Formula => {
    const tokens = lines.flatMap((l) => {
      const m = l.match(/--\s*([^:]+):/);
      return m ? m[1].trim().split(/\s+/) : [];
    });
    const build = (ts: string[]): Formula => {
      if (!ts.length) return atom;
      const [t, ...rest] = ts;
      if (t === 'likes') return atom;
      if (t === '¬likes') return not(atom);
      const neg = t.startsWith('¬');
      const core = neg ? t.slice(1) : t;
      const inner = exists(core.slice(1) as 'x' | 'y', build(rest));
      return neg ? not(inner) : inner;
    };
    return build(tokens);
  };

  it('compose, line by line, into a formula equivalent to the one the panel names', async () => {
    const { SQL } = await import('./presets');
    for (const id of FORMULA_IDS) {
      const f = fromComments(SQL[id]);
      for (const w of SMALL) expect(evaluate(f, w), id).toBe(evaluate(FORMULAS[id], w));
    }
  });
});
