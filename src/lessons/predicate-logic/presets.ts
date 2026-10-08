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
 * SQL has no "for all": ∀x P is written ¬∃x ¬P, a NOT EXISTS around a NOT, "there's no
 * counterexample". Each comment names exactly the piece of logic its line writes.
 */
export const SQL: Record<FormulaId, readonly string[]> = {
  AE: [
    'SELECT NOT EXISTS (              -- ¬∃x: no person p',
    '  SELECT 1 FROM people p',
    '  WHERE NOT EXISTS (             -- ¬∃y: who likes no dish',
    '    SELECT 1 FROM likes l',
    '    WHERE l.person = p.id));',
  ],
  EA: [
    'SELECT EXISTS (                  -- ∃y: some dish d',
    '  SELECT 1 FROM dishes d',
    '  WHERE NOT EXISTS (             -- ¬∃x: with no person p',
    '    SELECT 1 FROM people p',
    '    WHERE NOT EXISTS (           -- ¬likes: who does not like d',
    '      SELECT 1 FROM likes l',
    '      WHERE l.person = p.id AND l.dish = d.id)));',
  ],
  EE: ['SELECT EXISTS (                  -- ∃x ∃y: some like at all', '  SELECT 1 FROM likes l);'],
  AA: [
    'SELECT NOT EXISTS (              -- ¬∃x ∃y: no (person, dish) pair',
    '  SELECT 1 FROM people p, dishes d',
    '  WHERE NOT EXISTS (             -- ¬likes: that is not liked',
    '    SELECT 1 FROM likes l',
    '    WHERE l.person = p.id AND l.dish = d.id));',
  ],
};

/**
 * What a proof of the formula hands over, read as a value of a type. A bare value is only the
 * witness; the proof also carries evidence that `likes` holds for it, which is why each gloss
 * says so.
 */
export const TYPE_READING: Record<FormulaId, { type: string; gloss: string }> = {
  AE: { type: 'pick: (x: Person) => Dish', gloss: 'for each person, a dish, paired with proof that they like it; the dish may depend on the person' },
  EA: { type: 'dish: Dish', gloss: 'one dish chosen before anyone is asked, paired with proof that everyone likes it' },
  EE: { type: 'pair: [Person, Dish]', gloss: 'one person and one dish, paired with proof that the person likes it' },
  AA: { type: 'check: (x: Person, y: Dish) => true', gloss: 'no witness to pick: every pair must pass' },
};
