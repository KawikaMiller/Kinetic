/**
 * Scene 2's data: eight blaming sentences about the invented incident, each with three rewrites. Names are fictional.
 * Exactly one rewrite per sentence names a condition of the system; the other two still blame a person or name nothing.
 */
import { DETECT_MIN } from './tree';

export type RewriteFault = 'person' | 'vague';

export interface Rewrite {
  text: string;
  /** Present on the wrong rewrites: what they still get wrong. */
  fault?: RewriteFault;
}

export interface BlameSentence {
  id: string;
  blame: string;
  rewrites: readonly [Rewrite, Rewrite, Rewrite];
}

export const FAULT_REASON: Record<RewriteFault, string> = {
  person: 'It still blames a person: it says someone should have been more careful, which no process can promise.',
  vague: 'It drops the name but names no condition: it says nothing about why the failure was possible, so nothing can be fixed.',
};

const good = (text: string): Rewrite => ({ text });
const person = (text: string): Rewrite => ({ text, fault: 'person' });
const vague = (text: string): Rewrite => ({ text, fault: 'vague' });

export const SENTENCES: readonly BlameSentence[] = [
  { id: 'pushed', blame: 'Dana pushed the bad config.', rewrites: [person('Dana should have checked the number more carefully.'), good('The config tool accepted a pool size of 0.'), vague('A bad config was pushed.')] },
  { id: 'review', blame: 'The reviewer missed the problem.', rewrites: [good('The review showed a one-line diff and no preview of what it would do.'), person('The reviewer should have been more careful.'), vague('The problem was missed.')] },
  { id: 'slow', blame: 'The on-call was too slow to notice.', rewrites: [vague('Noticing took time.'), person('The on-call should have watched the dashboard.'), good(`The alert pages only after the errors have lasted a while, so it fired ${DETECT_MIN} minutes in.`)] },
  { id: 'runbook', blame: 'Priya forgot to update the runbook.', rewrites: [good('Nothing prompts a runbook update when the config tooling changes.'), vague('The runbook was not updated.'), person('Priya should be reminded to update runbooks.')] },
  { id: 'schema', blame: 'Whoever wrote the schema was careless.', rewrites: [person('The schema author should have thought about ranges.'), vague('The schema was not careful enough.'), good('The schema checks types, and nobody was asked to own value ranges.')] },
  { id: 'risk', blame: 'The team ignored the risk of one shared config file.', rewrites: [vague('The risk was ignored.'), good('All regions read one file, so no change could be tried on a few of them first.'), person('The team should have taken the risk seriously.')] },
  { id: 'panic', blame: 'An engineer panicked and made the outage worse.', rewrites: [person('The engineer should stay calm under pressure.'), vague('The outage got worse.'), good('Reverting needed the old value found and pushed by hand, with no one-step rollback.')] },
  { id: 'owner', blame: 'Nobody is accountable for config quality.', rewrites: [good('No team owns the checks on config values, so the gap sat between teams.'), person('Someone needs to be held accountable.'), vague('Config quality is poor.')] },
];

/** Which rewrite of a sentence names a condition (the index in its list). */
export const correctIndex = (s: BlameSentence): number => s.rewrites.findIndex((r) => r.fault === undefined);
