export interface StrategyTerm {
  id: string;
  label: string;
  text: string;
  note: string;
}

export const STRATEGY_TERMS: readonly StrategyTerm[] = [
  { id: 'const', label: '(λx.λy.y) Ω', text: '(λx.λy.y) ((λx.x x) (λx.x x))', note: 'The argument is Ω, which never reaches a value; the function throws its argument away.' },
  { id: 'omega', label: 'Ω', text: '(λx.x x) (λx.x x)', note: 'Ω reduces to itself in one step.' },
  { id: 'y', label: 'Y f', text: '(λf.(λx.f (x x)) (λx.f (x x))) f', note: 'Y f unrolls into f (f (f …)) and grows.' },
  { id: 'grow', label: 'Copier', note: 'A function that makes eight copies of its argument, applied to itself: each step adds seven more copies, so the size guard stops it.', text: '(λx.x x x x x x x x) (λx.x x x x x x x x)' },
];
