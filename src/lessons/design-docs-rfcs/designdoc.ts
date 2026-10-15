/**
 * Scene 1: build the doc. Nine sections with invented word counts, three simulated readers with
 * invented word budgets who read the sections in the learner's order until the budget runs out,
 * and a lint computed from the learner's own arrangement and content. Pure functions.
 */
import type { Tone } from '../../core/tone';

export type SectionId = 'context' | 'goals' | 'nongoals' | 'proposal' | 'alternatives' | 'tradeoffs' | 'rollout' | 'questions' | 'recommendation';

export interface Section {
  id: SectionId;
  name: string;
  /** Words in the section: authored for the invented sample doc, not measured from any text. */
  words: number;
  /** A plain category. */
  tone: Tone;
}

/** The sample doc, "Move session storage out of the monolith's database" (invented). */
export const SECTIONS: readonly Section[] = [
  { id: 'context', name: 'Context and problem', words: 300, tone: 'amber' },
  { id: 'goals', name: 'Goals', words: 120, tone: 'sky' },
  { id: 'nongoals', name: 'Non-goals', words: 80, tone: 'pink' },
  { id: 'proposal', name: 'Proposal', words: 900, tone: 'orange' },
  { id: 'alternatives', name: 'Alternatives considered', words: 500, tone: 'amber' },
  { id: 'tradeoffs', name: 'Trade-offs and risks', words: 350, tone: 'sky' },
  { id: 'rollout', name: 'Rollout and migration', words: 400, tone: 'pink' },
  { id: 'questions', name: 'Open questions', words: 150, tone: 'orange' },
  { id: 'recommendation', name: 'Recommendation', words: 60, tone: 'amber' },
];

export const sectionOf = (id: SectionId): Section => SECTIONS.find((s) => s.id === id)!;

/** The order the draft starts in: the ask comes last. */
export const OPENING_ORDER: readonly SectionId[] = SECTIONS.map((s) => s.id);

export type ReaderId = 'skimmer' | 'approver' | 'implementer';

export interface Reader {
  id: ReaderId;
  name: string;
  /** Words this reader gives the doc before stopping. Invented. */
  budget: number;
}

export const READERS: readonly Reader[] = [
  { id: 'skimmer', name: 'Skimmer', budget: 150 },
  { id: 'approver', name: 'Approver', budget: 600 },
  { id: 'implementer', name: 'Implementer', budget: 2500 },
];

export type Reach = 'full' | 'partly' | 'none';

export interface SectionReach {
  id: SectionId;
  /** Words the reader read of this section. */
  read: number;
  words: number;
  reach: Reach;
}

/**
 * What a reader reaches: they read the kept sections in order and stop when the budget is spent.
 * A section is read in full, partly (the budget ran out inside it) or not at all.
 */
export function readerReach(order: readonly SectionId[], budget: number, sections: readonly Section[] = SECTIONS): SectionReach[] {
  let left = budget;
  return order.map((id) => {
    const words = sections.find((s) => s.id === id)!.words;
    const read = Math.min(words, left);
    left -= read;
    return { id, read, words, reach: read === words ? 'full' : read > 0 ? 'partly' : 'none' };
  });
}

export const reachOf = (order: readonly SectionId[], budget: number, id: SectionId): SectionReach | undefined =>
  readerReach(order, budget).find((r) => r.id === id);

/** A reader who never gets to the recommendation reaches no decision. */
export const noDecision = (order: readonly SectionId[], budget: number): boolean => {
  const r = reachOf(order, budget, 'recommendation');
  return r === undefined || r.reach === 'none';
};

// ── Moving and keeping sections ──────────────────────────────────────────

/** Move the section at `from` to index `to`, shifting the rest. Out-of-range moves leave the order alone. */
export function moveSection<T>(order: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return [...order];
  const out = [...order];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

// ── Content the lint reads ───────────────────────────────────────────────

export type AlternativeId = 'nothing' | 'cache' | 'replica' | 'denormalise';

export interface AlternativeDef {
  id: AlternativeId;
  name: string;
}

export const ALTERNATIVES: readonly AlternativeDef[] = [
  { id: 'nothing', name: 'Do nothing' },
  { id: 'cache', name: 'Cache sessions in memory' },
  { id: 'replica', name: 'Add a read replica' },
  { id: 'denormalise', name: 'Denormalise the profile tables' },
];

/** The longest cost text a learner may type for an alternative. */
export const COST_MAX = 60;

export interface Alternative {
  id: AlternativeId;
  /** The cost the learner states for it; empty means none stated. */
  cost: string;
}

export type Decision = 'none' | 'approve' | 'choose';
export type Deadline = 'none' | 'friday' | 'sprint';

export const DECISION_LABEL: Record<Decision, string> = { none: 'no decision named', approve: 'approve the proposal', choose: 'choose between the options' };
export const DEADLINE_LABEL: Record<Deadline, string> = { none: 'no date', friday: 'by Friday', sprint: 'by the end of the sprint' };

export interface DocContent {
  order: readonly SectionId[];
  /** Sections the learner has left out. */
  dropped: readonly SectionId[];
  alternatives: readonly Alternative[];
  decision: Decision;
  deadline: Deadline;
}

export const OPENING_CONTENT: DocContent = {
  order: OPENING_ORDER,
  dropped: [],
  alternatives: [{ id: 'cache', cost: '' }],
  decision: 'none',
  deadline: 'none',
};

/** The sections that are in the doc, in the learner's order. */
export const keptOrder = (c: DocContent): SectionId[] => c.order.filter((id) => !c.dropped.includes(id));

export type LintId = 'nongoals' | 'alternatives' | 'costs' | 'ask' | 'questions';

export interface LintResult {
  id: LintId;
  label: string;
  pass: boolean;
  /** What the check found, read off the content. */
  found: string;
}

const trimmed = (s: string) => s.trim();

/** Every check, computed from the arrangement and the alternatives table, never scripted. */
export function lintDoc(c: DocContent): LintResult[] {
  const kept = keptOrder(c);
  const names = c.alternatives.map((a) => a.id);
  const unpriced = c.alternatives.filter((a) => trimmed(a.cost) === '');
  const questionsAt = kept.indexOf('questions');
  const proposalAt = kept.indexOf('proposal');
  const buried = questionsAt >= 0 && proposalAt >= 0 && questionsAt < proposalAt;
  return [
    { id: 'nongoals', label: 'Says what it will not do', pass: kept.includes('nongoals'), found: kept.includes('nongoals') ? 'a Non-goals section is in the doc' : 'no Non-goals section' },
    {
      id: 'alternatives',
      label: 'Lists at least two alternatives, including doing nothing',
      pass: c.alternatives.length >= 2 && names.includes('nothing'),
      found: `${c.alternatives.length} listed${names.includes('nothing') ? ', including do nothing' : ', without do nothing'}`,
    },
    {
      id: 'costs',
      label: 'States a cost for each alternative',
      pass: c.alternatives.length > 0 && unpriced.length === 0,
      found: c.alternatives.length === 0 ? 'no alternatives to price' : unpriced.length === 0 ? 'every listed alternative has a cost' : `${unpriced.length} without a stated cost`,
    },
    {
      id: 'ask',
      label: 'The recommendation names the decision wanted and by when',
      pass: kept.includes('recommendation') && c.decision !== 'none' && c.deadline !== 'none',
      found: !kept.includes('recommendation') ? 'no Recommendation section' : `${DECISION_LABEL[c.decision]}, ${DEADLINE_LABEL[c.deadline]}`,
    },
    {
      id: 'questions',
      label: 'Open questions are not buried before the proposal',
      pass: !buried,
      found: questionsAt < 0 ? 'no Open questions section' : buried ? 'Open questions come before the Proposal' : 'Open questions come after the Proposal',
    },
  ];
}
