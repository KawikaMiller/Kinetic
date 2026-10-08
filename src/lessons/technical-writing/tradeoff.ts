import { firstWordOf, wordsOf } from './textStats';

/** The scenario is fictional: a made-up team choosing where to store a made-up feature's data. */
export const DECISION = {
  title: 'Where do saved searches live?',
  question: 'The product team wants saved searches before the March release. Each user defines their own filters, so the fields differ from record to record. Where should we store them?',
};

export type FactId = 'varying' | 'joins' | 'skills' | 'ops';

export interface Fact {
  id: FactId;
  label: string;
  text: string;
}

/** The four facts on the cards. Every strong sentence below is built from some of them. */
export const FACTS: readonly Fact[] = [
  { id: 'varying', label: 'Shape of the data', text: 'Saved searches have user-defined filters, so the fields vary per record.' },
  { id: 'joins', label: 'Where related data lives', text: 'Reports join saved searches to users, teams and billing data, which already live in Postgres.' },
  { id: 'skills', label: 'What the team knows', text: 'The team has run Postgres for years and has no document-store experience or on-call cover.' },
  { id: 'ops', label: 'Cost of a new system', text: 'A document store would need new backups, monitoring and access control before launch.' },
];

export type SlotId = 'context' | 'options' | 'recommendation' | 'giveUp' | 'revisit';

export interface Slot {
  id: SlotId;
  label: string;
  /** What this part of a trade-off summary is for. */
  job: string;
}

/** The structure of a trade-off summary: five slots, in the order a reader needs them. */
export const SLOTS: readonly Slot[] = [
  { id: 'context', label: 'Context', job: 'What are we deciding, and by when?' },
  { id: 'options', label: 'Options', job: 'The realistic choices, side by side.' },
  { id: 'recommendation', label: 'Recommendation', job: 'The one you would pick.' },
  { id: 'giveUp', label: 'What we give up', job: 'The cost of that pick, stated plainly.' },
  { id: 'revisit', label: 'When we would revisit', job: 'The evidence that would change the decision.' },
];

export interface SentenceChip {
  id: string;
  slot: SlotId;
  text: string;
  /** A strong sentence does its slot's job from the facts; a weak one is true but does not. */
  strong: boolean;
  /** Which facts a strong sentence rests on. */
  uses: readonly FactId[];
  /** Why a weak one is weak, shown once it is placed. */
  flaw?: string;
}

export const CHIPS: readonly SentenceChip[] = [
  {
    id: 'ctx-good', slot: 'context', strong: true, uses: ['varying'],
    text: 'We have to choose, before the March release, where saved searches are stored; each user defines their own filters, so the fields vary from record to record.',
  },
  {
    id: 'ctx-vague', slot: 'context', strong: false, uses: [],
    text: 'Databases are an important part of any application.',
    flaw: 'True, and it tells the reader nothing about this decision or its deadline.',
  },
  {
    id: 'ctx-tech', slot: 'context', strong: false, uses: [],
    text: 'Postgres is a relational database and a document store keeps JSON documents.',
    flaw: 'A definition, not a context: the reader still does not know what is being decided.',
  },
  {
    id: 'opt-good', slot: 'options', strong: true, uses: ['varying', 'joins'],
    text: 'We compared keeping them in our existing Postgres, with the varying fields in a JSONB column, against adding a separate document store.',
  },
  {
    id: 'opt-vague', slot: 'options', strong: false, uses: [],
    text: 'There are many databases and each has its own strengths.',
    flaw: 'It names no options, so nothing can be compared.',
  },
  {
    id: 'opt-features', slot: 'options', strong: false, uses: [],
    text: 'Postgres has transactions, indexes and joins, and a document store has flexible schemas and horizontal scaling.',
    flaw: 'A feature list for each side: it is not tied to our data or our team, so it does not lead to a choice.',
  },
  {
    id: 'rec-good', slot: 'recommendation', strong: true, uses: ['joins', 'skills', 'ops'],
    text: 'We recommend Postgres with a JSONB column: our reports already join against data that lives there, the team knows how to run it, and it avoids standing up a new system before launch.',
  },
  {
    id: 'rec-vague', slot: 'recommendation', strong: false, uses: [],
    text: 'Either could work, and the best choice depends on many factors.',
    flaw: 'No recommendation: the reader has to make the decision you were asked to prepare.',
  },
  {
    id: 'rec-bare', slot: 'recommendation', strong: false, uses: [],
    text: 'Postgres is a mature, well-loved database that many companies choose.',
    flaw: 'It praises the option without tying the pick to our facts, so it cannot be checked or argued with.',
  },
  {
    id: 'give-good', slot: 'giveUp', strong: true, uses: ['varying'],
    text: 'What we give up: the database does not enforce a schema on those fields by default, so the application must validate filters, and very large per-user field sets may force a redesign.',
  },
  {
    id: 'give-none', slot: 'giveUp', strong: false, uses: [],
    text: 'There are no real downsides to this choice.',
    flaw: 'Every option costs something; a summary without a cost reads as unexamined.',
  },
  {
    id: 'give-shrug', slot: 'giveUp', strong: false, uses: [],
    text: 'Nothing is perfect, so some trade-offs are to be expected.',
    flaw: 'It admits a cost exists without naming it.',
  },
  {
    id: 'rev-good', slot: 'revisit', strong: true, uses: ['varying'],
    text: 'We would revisit if saved searches pass ten million rows, or if filter queries miss their latency target (200 ms at the 95th percentile) after indexing.',
  },
  {
    id: 'rev-someday', slot: 'revisit', strong: false, uses: [],
    text: 'We can look at this again someday.',
    flaw: 'No trigger: nobody can tell when "someday" has arrived.',
  },
  {
    id: 'rev-complaint', slot: 'revisit', strong: false, uses: [],
    text: 'We will revisit if anyone is unhappy with it.',
    flaw: 'Unhappiness is not a measurement, so the decision can never be settled or reopened on evidence.',
  },
];

export const chipsFor = (slot: SlotId): SentenceChip[] => CHIPS.filter((c) => c.slot === slot);

/** One chosen chip per slot. A slot with no entry is missing. */
export type Assembly = Partial<Record<SlotId, string>>;

export const chipById = (id: string): SentenceChip => {
  const c = CHIPS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown sentence chip ${id}`);
  return c;
};

export const missingSlots = (a: Assembly): SlotId[] => SLOTS.filter((s) => !a[s.id]).map((s) => s.id);

/** Selecting the placed chip again takes it back out. */
export function place(a: Assembly, chipId: string): Assembly {
  const c = chipById(chipId);
  const next = { ...a };
  if (a[c.slot] === chipId) delete next[c.slot];
  else next[c.slot] = chipId;
  return next;
}

/** The slots in order, joined: only the slots that are filled. */
export function paragraphOf(a: Assembly): string {
  return SLOTS.flatMap((s) => (a[s.id] ? [chipById(a[s.id]!).text] : [])).join(' ');
}

export type Verdict = 'empty' | 'incomplete' | 'weak' | 'strong';

/** Strong when every slot holds a strong sentence; weak when all are filled but some are weak. */
export function verdictOf(a: Assembly): Verdict {
  const placed = SLOTS.flatMap((s) => (a[s.id] ? [chipById(a[s.id]!)] : []));
  if (placed.length === 0) return 'empty';
  if (placed.length < SLOTS.length) return 'incomplete';
  return placed.every((c) => c.strong) ? 'strong' : 'weak';
}

/** Facts a placed strong sentence rests on, so the cards can show which ones the paragraph has used. */
export function factsUsed(a: Assembly): Set<FactId> {
  const out = new Set<FactId>();
  for (const s of SLOTS) if (a[s.id]) for (const f of chipById(a[s.id]!).uses) out.add(f);
  return out;
}

/** The weak version to compare against: every fact, no pick, no cost, no trigger. */
export const WEAK_VERSION =
  'Saved searches have user-defined filters, so the fields vary per record. Reports join them to users, teams and billing data, which live in Postgres. The team has run Postgres for years and has no document-store experience. A document store would need new backups, monitoring and access control. Postgres has transactions and joins, and a document store has flexible schemas.';

/** The recommendation's cue: a sentence that picks something. */
export const RECOMMENDS = /\brecommend\b/i;

/** The 1-based word where the recommendation starts, or null when no sentence recommends. */
export const recommendationAt = (text: string): number | null => firstWordOf(text, RECOMMENDS);

export const wordsIn = (text: string): number => wordsOf(text).length;
