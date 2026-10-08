/**
 * Predicate logic over two finite domains: people (x, the grid's rows) and dishes
 * (y, its columns), with one predicate likes(x, y). Formulas are a tiny AST, evaluated
 * exhaustively over the domains, so every verdict on screen comes from the grid.
 */

export type Quant = 'forall' | 'exists';
export type Var = 'x' | 'y';

export type Formula =
  | { k: 'atom' }
  | { k: 'not'; body: Formula }
  | { k: 'q'; q: Quant; v: Var; body: Formula };

/** The relation: `likes[x][y]` for x < people, y < dishes. Either domain may be empty. */
export interface World {
  people: number;
  dishes: number;
  likes: readonly (readonly boolean[])[];
}

export const atom: Formula = { k: 'atom' };
export const not = (body: Formula): Formula => ({ k: 'not', body });
export const forall = (v: Var, body: Formula): Formula => ({ k: 'q', q: 'forall', v, body });
export const exists = (v: Var, body: Formula): Formula => ({ k: 'q', q: 'exists', v, body });

/** The four two-quantifier formulas the lesson compares. */
export type FormulaId = 'AE' | 'EA' | 'EE' | 'AA';
export const FORMULAS: Record<FormulaId, Formula> = {
  AE: forall('x', exists('y', atom)),
  EA: exists('y', forall('x', atom)),
  EE: exists('x', exists('y', atom)),
  AA: forall('x', forall('y', atom)),
};
export const FORMULA_IDS: readonly FormulaId[] = ['AE', 'EA', 'EE', 'AA'];
export const ENGLISH: Record<FormulaId, string> = {
  AE: 'everyone likes something (possibly different ones)',
  EA: "there's one dish everyone likes",
  EE: 'somebody likes something',
  AA: 'everyone likes everything',
};

type Env = Partial<Record<Var, number>>;

const domain = (w: World, v: Var) => (v === 'x' ? w.people : w.dishes);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Truth of `f` in world `w` under the variable assignment `env` (closed formulas need none). */
export function evaluate(f: Formula, w: World, env: Env = {}): boolean {
  switch (f.k) {
    case 'atom': {
      const { x, y } = env;
      if (x === undefined || y === undefined) throw new Error('likes(x, y) needs both x and y bound');
      return w.likes[x][y];
    }
    case 'not':
      return !evaluate(f.body, w, env);
    case 'q': {
      const values = range(domain(w, f.v));
      const at = (i: number) => evaluate(f.body, w, { ...env, [f.v]: i });
      // Over an empty domain, every() is true (vacuous) and some() is false.
      return f.q === 'forall' ? values.every(at) : values.some(at);
    }
  }
}

const SYMBOL: Record<Quant, string> = { forall: '∀', exists: '∃' };

/** The formula as text: "¬∀x ∃y likes(x, y)". */
export function show(f: Formula): string {
  switch (f.k) {
    case 'atom':
      return 'likes(x, y)';
    case 'not':
      return `¬${show(f.body)}`;
    case 'q':
      return `${SYMBOL[f.q]}${f.v} ${show(f.body)}`;
  }
}

/** Splits a formula's text at its first ¬, so the stage can make that ¬ a button. */
export function splitAtNegation(text: string): { before: string; after: string } | null {
  const at = text.indexOf('¬');
  return at < 0 ? null : { before: text.slice(0, at), after: text.slice(at + 1) };
}

export interface Rewrite {
  next: Formula;
  /** The law used, as text. */
  law: string;
}

const flip: Record<Quant, Quant> = { forall: 'exists', exists: 'forall' };

/**
 * Pushes the outermost ¬ that still sits in front of a quantifier (or another ¬) one
 * step inward: ¬∀v P ≡ ∃v ¬P, ¬∃v P ≡ ∀v ¬P, ¬¬P ≡ P. null when every ¬ already sits
 * on the atom.
 */
export function pushNegation(f: Formula): Rewrite | null {
  if (f.k === 'atom') return null;
  if (f.k === 'not') {
    const b = f.body;
    if (b.k === 'q') {
      return {
        next: { k: 'q', q: flip[b.q], v: b.v, body: not(b.body) },
        law: `¬${SYMBOL[b.q]}${b.v} P  ≡  ${SYMBOL[flip[b.q]]}${b.v} ¬P`,
      };
    }
    if (b.k === 'not') return { next: b.body, law: '¬¬P  ≡  P' };
    return null;
  }
  const inner = pushNegation(f.body);
  return inner && { next: { ...f, body: inner.next }, law: inner.law };
}

/** Every step from `f` to the form with ¬ only on the atom, `f` first. */
export function negationChain(f: Formula): { formula: Formula; law: string | null }[] {
  const out: { formula: Formula; law: string | null }[] = [{ formula: f, law: null }];
  for (let r = pushNegation(f); r; r = pushNegation(r.next)) out.push({ formula: r.next, law: r.law });
  return out;
}

/** Reads a formula aloud, mechanically and exactly. */
export function read(f: Formula): string {
  switch (f.k) {
    case 'atom':
      return 'x likes y';
    case 'not':
      return f.body.k === 'atom' ? "x doesn't like y" : `it is not the case that ${read(f.body)}`;
    case 'q': {
      const noun = f.v === 'x' ? 'person' : 'dish';
      return f.q === 'forall' ? `for every ${noun} ${f.v}, ${read(f.body)}` : `there is a ${noun} ${f.v} such that ${read(f.body)}`;
    }
  }
}

/* ---------- witnesses and counterexamples for the four formulas ---------- */

export type Explanation =
  /** ∀x∃y: each person's first liked dish (null = none, and the first such person fails it). */
  | { id: 'AE'; value: boolean; picks: (number | null)[]; failRow: number | null }
  /** ∃y∀x: the first dish everyone likes, and for every dish the first person who doesn't. */
  | { id: 'EA'; value: boolean; column: number | null; missedBy: (number | null)[] }
  /** ∃x∃y: the first liked cell in reading order. */
  | { id: 'EE'; value: boolean; cell: readonly [number, number] | null }
  /** ∀x∀y: the first (x, y) in reading order where x doesn't like y. */
  | { id: 'AA'; value: boolean; cell: readonly [number, number] | null };

const firstIndex = (n: number, p: (i: number) => boolean) => {
  for (let i = 0; i < n; i++) if (p(i)) return i;
  return null;
};

function firstCell(w: World, p: (x: number, y: number) => boolean): readonly [number, number] | null {
  for (let x = 0; x < w.people; x++) for (let y = 0; y < w.dishes; y++) if (p(x, y)) return [x, y];
  return null;
}

export function explain(id: FormulaId, w: World): Explanation {
  const L = (x: number, y: number) => w.likes[x][y];
  switch (id) {
    case 'AE': {
      const picks = range(w.people).map((x) => firstIndex(w.dishes, (y) => L(x, y)));
      const failRow = firstIndex(w.people, (x) => picks[x] === null);
      return { id, value: failRow === null, picks, failRow };
    }
    case 'EA': {
      const missedBy = range(w.dishes).map((y) => firstIndex(w.people, (x) => !L(x, y)));
      const column = firstIndex(w.dishes, (y) => missedBy[y] === null);
      return { id, value: column !== null, column, missedBy };
    }
    case 'EE': {
      const cell = firstCell(w, L);
      return { id, value: cell !== null, cell };
    }
    case 'AA': {
      const cell = firstCell(w, (x, y) => !L(x, y));
      return { id, value: cell === null, cell };
    }
  }
}

/* ---------- worlds ---------- */

export const MAX_SIDE = 5;

export function emptyWorld(people: number, dishes: number): World {
  return { people, dishes, likes: range(people).map(() => range(dishes).map(() => false)) };
}

/** A world from rows of 0/1 strings: ['100', '010']. `dishes` is needed when there are no rows. */
export function worldOf(rows: readonly string[], dishes = rows[0]?.length ?? 0): World {
  return { people: rows.length, dishes, likes: rows.map((r) => [...r].map((ch) => ch === '1')) };
}

export function toggle(w: World, x: number, y: number): World {
  return { ...w, likes: w.likes.map((row, i) => (i === x ? row.map((v, j) => (j === y ? !v : v)) : row)) };
}

/** The same relation on a resized grid: cells that survive keep their value, new ones start empty. */
export function resize(w: World, people: number, dishes: number): World {
  return { people, dishes, likes: range(people).map((x) => range(dishes).map((y) => w.likes[x]?.[y] ?? false)) };
}

/** Every relation on a people × dishes grid (2^(people·dishes) of them), for exhaustive checks. */
export function allWorlds(people: number, dishes: number): World[] {
  const cells = people * dishes;
  return range(2 ** cells).map((mask) => ({
    people,
    dishes,
    likes: range(people).map((x) => range(dishes).map((y) => ((mask >> (x * dishes + y)) & 1) === 1)),
  }));
}
