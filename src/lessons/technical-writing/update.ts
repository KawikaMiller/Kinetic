import { firstWordOf, skimWords, textStats, type TextStats } from './textStats';

/** The five edits a learner can apply to the incident update (all fictional: the incident is made up for the lesson). */
export type EditId = 'bluf' | 'hedges' | 'voice' | 'ask' | 'bullets';
export type Edits = Readonly<Record<EditId, boolean>>;

export const NO_EDITS: Edits = { bluf: false, hedges: false, voice: false, ask: false, bullets: false };
export const ALL_EDITS: Edits = { bluf: true, hedges: true, voice: true, ask: true, bullets: true };
export const EDIT_IDS = Object.keys(NO_EDITS) as EditId[];

/** Every ask sentence, before and after the ask edit, mentions this and no other sentence does. */
export const ASK_CUE = /replay job/;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The text for a set of edits. Each edit owns one decision (order, hedge wording, voice, the ask, list
 * layout) and no two edits touch the same decision, so the edits commute: applying them in any order
 * ends on the same text, which update.test.ts proves over all 120 orders.
 */
export function renderUpdate(e: Edits): string {
  const greeting = e.hedges
    ? 'Hi all, I wanted to give an update on what happened with checkout earlier today.'
    : 'Hi all, I just wanted to give a quick update on what happened with checkout earlier today.';

  const conclusion = e.hedges
    ? "Checkout has been healthy again since 10:20 UTC, and last night's database migration most likely caused the outage."
    : 'So overall, checkout seems to be working again now, and I think maybe it was kind of the database migration from last night that caused it.';

  const ran = e.voice
    ? 'The platform team ran the migration at 23:10 UTC last night to add an index.'
    : 'The migration was run at 23:10 UTC last night to add an index.';
  const rolledBack = e.voice ? 'The on-call engineer rolled the migration back at 10:12 UTC.' : 'The migration was rolled back at 10:12 UTC.';
  const timeline = [
    e.hedges ? ran : `Basically, ${lowerFirst(ran)}`,
    e.hedges ? 'It locked the orders table for much longer than expected.' : 'I believe it just locked the orders table for much longer than expected.',
    'Our on-call engineer was paged at 09:41 UTC.',
    rolledBack,
    e.hedges
      ? 'Error rates were back to normal by about 10:20 UTC, and roughly 4% of checkout attempts failed in that window.'
      : 'Error rates were sort of back to normal by about 10:20 UTC, and I think roughly 4% of checkout attempts failed in that window.',
    'We are still looking into why the lock lasted so long.',
  ].join(' ');

  const nextSteps = e.bullets
    ? [
        e.hedges ? 'Next steps:' : 'I think the next steps are probably these:',
        '- Replay the failed orders.',
        '- Add a lock-time check to the migration runbook.',
        '- Lower the alert threshold on checkout errors.',
      ]
    : [
        `${e.hedges ? 'Three things need' : 'I think maybe a few things need'} to happen next: the failed orders need to be replayed, the migration runbook needs a lock-time check, and the alert threshold on checkout errors needs lowering.`,
      ];

  const ask = e.ask
    ? 'Ask: please approve the replay job for the failed orders by Thursday 17:00 UTC.'
    : 'It would be great if someone could look at the replay job at some point.';
  const closing = e.hedges ? 'Thanks!' : 'Sorry for the long message, and thanks!';

  const lines = e.bluf ? [conclusion, ask, timeline, ...nextSteps, closing] : [greeting, timeline, ...nextSteps, ask, conclusion, closing];
  return lines.join('\n');
}

export interface EditDef {
  id: EditId;
  label: string;
  /** What the edit changes and why, in one sentence. */
  why: string;
}

export const EDITS: readonly EditDef[] = [
  { id: 'bluf', label: 'Conclusion first', why: 'Bottom line up front: the conclusion and the ask lead, and the greeting that said nothing goes.' },
  { id: 'hedges', label: 'Cut the hedges', why: 'Filler like "just", "basically" and "I think maybe" goes; the real uncertainty ("most likely", "still looking into why") stays.' },
  { id: 'voice', label: 'Name who acted', why: 'Passive voice hides the owner where it matters (who ran the migration, who rolled it back); "was paged" stays passive because the actor is the alert system.' },
  { id: 'ask', label: 'State the ask', why: 'A vague "it would be great if someone" becomes a request with an object and a deadline.' },
  { id: 'bullets', label: 'List as bullets', why: 'Three parallel next steps buried in one sentence become a list a skimmer can count.' },
];

/** `edits` with one edit turned on (or back off). */
export const toggleEdit = (edits: Edits, id: EditId): Edits => ({ ...edits, [id]: !edits[id] });

export interface UpdateView {
  text: string;
  stats: TextStats;
  /** 1-based word where the ask starts, computed from the text. */
  askAt: number | null;
  /** Words a skimming reader is assumed to read (an illustrative model). */
  skimWords: number;
  /** True when the ask starts inside the skimmed words. */
  askSkimmed: boolean;
}

export function viewOf(edits: Edits): UpdateView {
  const text = renderUpdate(edits);
  const askAt = firstWordOf(text, ASK_CUE);
  const skim = skimWords(text);
  return { text, stats: textStats(text), askAt, skimWords: skim, askSkimmed: askAt !== null && askAt <= skim };
}
