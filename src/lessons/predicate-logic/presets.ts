import { worldOf, type FormulaId, type World } from './model';

export const PEOPLE = ['Ana', 'Ben', 'Cy', 'Dee', 'Eve'] as const;
export const DISHES = ['pizza', 'sushi', 'tacos', 'curry', 'salad'] as const;

export interface Preset {
  id: string;
  label: string;
  world: World;
}

export const PRESETS: readonly Preset[] = [
  { id: 'own', label: 'Something each, no common dish', world: worldOf(['110', '010', '001']) },
  { id: 'pizza', label: 'Pizza for all', world: worldOf(['110', '101', '100']) },
  { id: 'picky', label: 'One picky eater', world: worldOf(['100', '000', '011']) },
  { id: 'nobody', label: 'Nobody here (empty domain)', world: worldOf([], 3) },
];

/**
 * Each formula written as SQL over people(id), dishes(id) and likes(person, dish).
 * SQL has no "for all": ∀ is written as NOT EXISTS (… NOT …), "there's no counterexample".
 */
export const SQL: Record<FormulaId, readonly string[]> = {
  AE: [
    'SELECT NOT EXISTS (              -- ∀x',
    '  SELECT 1 FROM people p',
    '  WHERE NOT EXISTS (             -- ∃y',
    '    SELECT 1 FROM likes l',
    '    WHERE l.person = p.id));',
  ],
  EA: [
    'SELECT EXISTS (                  -- ∃y',
    '  SELECT 1 FROM dishes d',
    '  WHERE NOT EXISTS (             -- ∀x',
    '    SELECT 1 FROM people p',
    '    WHERE NOT EXISTS (',
    '      SELECT 1 FROM likes l',
    '      WHERE l.person = p.id AND l.dish = d.id)));',
  ],
  EE: ['SELECT EXISTS (                  -- ∃x ∃y', '  SELECT 1 FROM likes l);'],
  AA: [
    'SELECT NOT EXISTS (              -- ∀x ∀y',
    '  SELECT 1 FROM people p, dishes d',
    '  WHERE NOT EXISTS (',
    '    SELECT 1 FROM likes l',
    '    WHERE l.person = p.id AND l.dish = d.id));',
  ],
};

/** What a proof of the formula is, read as a value of a type: the witness it has to hand over. */
export const TYPE_READING: Record<FormulaId, { type: string; gloss: string }> = {
  AE: { type: 'pick: (x: Person) => Dish', gloss: 'a function: the dish may depend on the person' },
  EA: { type: 'dish: Dish', gloss: 'one value, chosen before anyone is asked' },
  EE: { type: 'pair: [Person, Dish]', gloss: 'one person and one dish' },
  AA: { type: 'check: (x: Person, y: Dish) => true', gloss: 'no witness to pick: every pair must pass' },
};
