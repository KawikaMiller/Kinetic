/**
 * Scene 4: it depends. Five situation factors, each from 0 to 1, and a ledger of what each option
 * costs and gives in that situation. The weights are invented and the ledger is one view: it shows
 * which factors an argument turns on, not a measurement. Both options are written out in full.
 */
import type { ClaimKind } from '../../core/provenance';

export type Option = 'monorepo' | 'polyrepo';

export interface Factors {
  /** How many teams, scaled 0 (a few) to 1 (very many). */
  teams: number;
  /** How much code is shared across components. */
  shared: number;
  /** How much teams need to release on their own schedule. */
  cadence: number;
  /** How much build and CI tooling capacity there is to invest. */
  tooling: number;
  /** How much code must be hidden from most engineers. */
  access: number;
}

export const FACTOR_LABEL: Record<keyof Factors, string> = {
  teams: 'Number of teams',
  shared: 'Code shared across components',
  cadence: 'Need for independent release cadence',
  tooling: 'Tooling capacity',
  access: 'Access-control needs',
};

/** The opening situation: middling everywhere, with some tooling capacity, so the ledger opens level. */
export const OPENING_FACTORS: Factors = { teams: 0.4, shared: 0.5, cadence: 0.5, tooling: 0.6, access: 0.3 };

export interface Line {
  id: string;
  option: Option;
  side: 'benefit' | 'cost';
  text: string;
  /** Points this line is worth in the situation: 0 to 1, from the factors. */
  points: (f: Factors) => number;
  claim: ClaimKind;
}

/** The ledger's lines. Weights are invented; every line says what kind of claim it is. */
export const LINES: readonly Line[] = [
  { id: 'm-atomic', option: 'monorepo', side: 'benefit', text: 'One commit changes a library and its callers together', points: (f) => f.shared, claim: 'practice' },
  { id: 'm-version', option: 'monorepo', side: 'benefit', text: 'One version of each dependency, so no version skew', points: (f) => 0.6 * f.shared, claim: 'practice' },
  { id: 'm-tooling', option: 'monorepo', side: 'cost', text: 'Needs build and CI tooling (affected sets, caching) to stay fast', points: (f) => (1 - f.tooling) * (0.3 + 0.7 * f.teams), claim: 'practice' },
  { id: 'm-access', option: 'monorepo', side: 'cost', text: 'Access control is coarser than a repository boundary', points: (f) => f.access, claim: 'view' },
  { id: 'm-release', option: 'monorepo', side: 'cost', text: 'Teams share one trunk and release rhythm unless tooling separates them', points: (f) => f.cadence * f.teams, claim: 'view' },
  { id: 'p-release', option: 'polyrepo', side: 'benefit', text: 'Each repository releases on its own schedule', points: (f) => f.cadence, claim: 'practice' },
  { id: 'p-access', option: 'polyrepo', side: 'benefit', text: 'Access control follows the repository boundary', points: (f) => f.access, claim: 'practice' },
  { id: 'p-skew', option: 'polyrepo', side: 'cost', text: 'Version bumps and skew between repositories', points: (f) => f.shared * (0.3 + 0.7 * f.teams), claim: 'practice' },
  { id: 'p-dup', option: 'polyrepo', side: 'cost', text: 'Tooling and configuration copied across repositories', points: (f) => 0.4 * f.teams, claim: 'practice' },
  { id: 'p-refactor', option: 'polyrepo', side: 'cost', text: 'A refactor that spans repositories needs a coordinated series of changes', points: (f) => 0.5 * f.shared, claim: 'view' },
];

export interface Tally {
  benefits: number;
  costs: number;
  net: number;
}

export function tally(option: Option, f: Factors): Tally {
  const own = LINES.filter((l) => l.option === option);
  const sum = (side: Line['side']) => own.filter((l) => l.side === side).reduce((s, l) => s + l.points(f), 0);
  const benefits = sum('benefit');
  const costs = sum('cost');
  return { benefits, costs, net: benefits - costs };
}

export interface Lean {
  /** The option the ledger leans to, or null when the nets are within the tie margin. */
  option: Option | null;
  /** How far apart the nets are, in points. */
  margin: number;
}

/** Nets closer than this are called level. */
export const TIE_MARGIN = 0.05;

export function lean(f: Factors): Lean {
  const margin = tally('monorepo', f).net - tally('polyrepo', f).net;
  return { option: Math.abs(margin) < TIE_MARGIN ? null : margin > 0 ? 'monorepo' : 'polyrepo', margin: Math.abs(margin) };
}
