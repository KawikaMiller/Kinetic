/**
 * Scene 1: an INVENTED outcomes tree. A request is one possible solution to a need, which serves a behaviour, which
 * moves a metric, which serves a goal. Coverage is a plain set computation over the needs the tree lists.
 */
export type LevelId = 'goal' | 'metric' | 'behaviour' | 'need' | 'solution';

export interface Level {
  id: LevelId;
  label: string;
  /** What this level says in the invented case. */
  text: string;
  /** The question that climbs to this level from the one below. */
  question: string;
}

export const LEVELS: readonly Level[] = [
  { id: 'goal', label: 'Business goal', text: 'Keep small teams subscribed', question: 'Why does that matter to the business?' },
  { id: 'metric', label: 'Metric', text: 'Weekly active teams', question: 'How would we see it moving?' },
  { id: 'behaviour', label: 'User behaviour', text: 'A team lead shares the numbers with a manager every Monday', question: 'What would people do?' },
  { id: 'need', label: 'Need', text: 'The manager wants a figure in an email or a slide', question: 'Why do they need this?' },
  { id: 'solution', label: 'The request', text: 'Add a CSV export to the reports page', question: 'What was asked for?' },
];

export const REQUEST_LEVEL = LEVELS.length - 1;

export type NeedId = 'figure' | 'fresh' | 'rows' | 'forward';

/** The needs the case identifies, in the words a person would use. */
export const NEEDS: readonly { id: NeedId; label: string }[] = [
  { id: 'figure', label: 'a figure to paste into an email or slide' },
  { id: 'fresh', label: 'numbers that are current on Monday' },
  { id: 'rows', label: 'raw rows to filter in a spreadsheet' },
  { id: 'forward', label: 'something to forward without a login' },
];

/** The needs that together make up the behaviour: sharing current numbers with a manager. */
export const BEHAVIOUR_NEEDS: readonly NeedId[] = ['figure', 'fresh', 'forward'];

export interface Solution {
  id: string;
  label: string;
  /** Invented effort in days. */
  effort: number;
  covers: readonly NeedId[];
}

export const SOLUTIONS: readonly Solution[] = [
  { id: 'csv', label: 'CSV export', effort: 3, covers: ['rows', 'forward'] },
  { id: 'email', label: 'Scheduled email of the report', effort: 5, covers: ['figure', 'fresh', 'forward'] },
  { id: 'link', label: 'Shareable link', effort: 2, covers: ['figure', 'fresh', 'forward'] },
];

export type Coverage = 'full' | 'part' | 'none';

/** Share of the listed needs a solution covers. */
export const needShare = (s: Solution): number => s.covers.length / NEEDS.length;

/** How much of the behaviour a solution covers: all of its needs, some, or none. */
export function behaviourCoverage(s: Solution): Coverage {
  const hit = BEHAVIOUR_NEEDS.filter((n) => s.covers.includes(n)).length;
  return hit === BEHAVIOUR_NEEDS.length ? 'full' : hit > 0 ? 'part' : 'none';
}

/** The solutions worth looking at from a level: those that serve what that level says. */
export function optionsAt(level: LevelId): readonly Solution[] {
  if (level === 'solution') return SOLUTIONS.filter((s) => s.id === 'csv');
  if (level === 'need') return SOLUTIONS.filter((s) => s.covers.includes('figure'));
  if (level === 'behaviour') return SOLUTIONS.filter((s) => behaviourCoverage(s) !== 'none');
  return SOLUTIONS;
}

/** The cheapest solution that covers the behaviour in full. */
export const cheapestFull = (): Solution => [...SOLUTIONS].filter((s) => behaviourCoverage(s) === 'full').sort((a, b) => a.effort - b.effort)[0];

/** Tree shape for TreeSvg: the chain of levels, then the solutions under the need. */
export const TREE_ROOT = 'goal';
export const chainIds: readonly string[] = ['goal', 'metric', 'behaviour', 'need'];
export function treeChildren(id: string): (string | null)[] {
  if (id === 'need') return SOLUTIONS.map((s) => s.id);
  const i = chainIds.indexOf(id);
  return i >= 0 && i < chainIds.length - 1 ? [chainIds[i + 1]] : [];
}
