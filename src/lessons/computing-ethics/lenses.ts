import type { PrincipleId } from './acm';
import type { Impact, ImpactTone } from './cases';

/**
 * The reasoning exercise: a fictional dilemma, the people it touches, the options, and four lenses to look
 * at each option through. Everything here is authored. The exercise has no score and no total on purpose:
 * a lens is a set of questions to reason with, not a formula that outputs the right answer.
 */

export type StakeholderId = 'users' | 'analysts' | 'company' | 'later' | 'public';
export type OptionId = 'all' | 'minimise' | 'ask';
export type LensId = 'consequences' | 'duties' | 'virtue' | 'code';

export const SCENARIO = {
  title: 'Location "just in case"',
  text: 'Fictional, and the same situation as the Location case, laid out as a reasoning table instead of a branching story. A "nearby help" feature needs only a rough area, but the analytics team would like precise location from every user, kept indefinitely, in case it is useful later. Reason it through before you decide.',
};

export const STAKEHOLDERS: readonly { id: StakeholderId; label: string; stake: string }[] = [
  { id: 'users', label: 'Users', stake: 'The people whose movements would be recorded.' },
  { id: 'analysts', label: 'Analytics team', stake: 'They want data to answer questions later.' },
  { id: 'company', label: 'The company', stake: 'It carries the cost, the legal duties and the reputation.' },
  { id: 'later', label: 'Anyone who could gain access later', stake: 'Staff, contractors or attackers who might see data that exists.' },
  { id: 'public', label: 'Regulators and the wider public', stake: 'They rely on norms about what is collected and how it is protected.' },
];

export const OPTIONS: readonly { id: OptionId; label: string; summary: string }[] = [
  { id: 'all', label: 'Collect precise location from everyone, always', summary: 'Maximum flexibility for analytics.' },
  { id: 'minimise', label: 'Collect only a coarse area, on the device', summary: 'Enough for the feature and no more.' },
  { id: 'ask', label: 'Ask users to opt in to precise location', summary: 'Precise data only from people who agree, for a stated purpose.' },
];

const impact = (tone: ImpactTone, text: string): Impact => ({ tone, text });

export const EFFECTS: Record<OptionId, Record<StakeholderId, Impact>> = {
  all: {
    users: impact('harm', 'A detailed record of where they go exists, and they had little say in it.'),
    analysts: impact('benefit', 'Full flexibility to ask questions later.'),
    company: impact('open', 'More insight, and more data to protect, store and answer for.'),
    later: impact('harm', 'Everything that is kept can be seen or misused by whoever gets access.'),
    public: impact('open', 'Broad collection "just in case" is the kind of practice norms and rules often question.'),
  },
  minimise: {
    users: impact('handled', 'The feature works and there is little precise data about them to leak.'),
    analysts: impact('open', 'Some questions can no longer be answered.'),
    company: impact('open', 'Less to store and defend and a simple story to tell, but less insight and fewer analytics features to build on.'),
    later: impact('handled', 'There is little precise data to see or misuse.'),
    public: impact('handled', 'Collection matches the stated purpose.'),
  },
  ask: {
    users: impact('handled', 'Those who share precise location do so knowingly, and for something they want.'),
    analysts: impact('open', 'A smaller dataset, and one that may differ from the user base.'),
    company: impact('open', 'More design work, and consent that has to be recorded and honoured.'),
    later: impact('open', 'Less data than collecting all, but what is collected is precise.'),
    public: impact('handled', 'Choice is visible, as long as it is a real one.'),
  },
};

export const LENSES: readonly { id: LensId; label: string; what: string; questions: readonly string[] }[] = [
  {
    id: 'consequences', label: 'Consequences',
    what: 'The consequentialist lens judges options by their effects on everyone affected.',
    questions: ['Who is affected, and how much?', 'How likely is each effect, and could it be undone?', 'Which effects land on people who had no say?'],
  },
  {
    id: 'duties', label: 'Duties and rights',
    what: 'The deontological lens asks what is owed to people whatever the outcome.',
    questions: ['What did people agree to, or what would they agree to if they understood?', 'Does any option treat people only as a means to an end?', 'Which promises, rules or rights apply?'],
  },
  {
    id: 'virtue', label: 'Character',
    what: 'The virtue lens asks what a person of good character would do, and what habit each option builds.',
    questions: ['What would honesty, care and prudence look like here?', 'Would you be comfortable explaining it to the people affected?', 'What habit does this build in the team?'],
  },
  {
    id: 'code', label: 'Professional code',
    what: 'A professional code, here the ACM Code of Ethics (2018), names responsibilities that come with the role.',
    questions: ['Which principles apply to this decision?', 'Have the risks been evaluated thoroughly?', 'Does the responsibility stop at the spec?'],
  },
];

export const NOTICED: Record<OptionId, Record<LensId, string>> = {
  all: {
    consequences: 'The analytics benefit is real but speculative ("in case it is useful"); the harms are concrete and grow with how long and how widely the data is kept.',
    duties: 'Collecting far beyond what the feature needs may be hard to square with what people would agree to if asked; the scenario does not say what they were told.',
    virtue: 'Hoarding "just in case" can build a habit of taking more than you need.',
    code: 'Raises questions under 1.6 (respect privacy) and 2.5 (evaluate risks).',
  },
  minimise: {
    consequences: 'Lower harm and lower benefit; the trade is a few unanswered questions against much less risk.',
    duties: 'Collection stays within the purpose people were given.',
    virtue: 'Restraint and prudence: taking what is needed.',
    code: 'Consistent with 1.6 (respect privacy) and 1.2 (avoid harm); 2.5 asks that the lost insight be weighed too.',
  },
  ask: {
    consequences: 'Harm is limited to those who opt in, but the dataset may be small or skewed.',
    duties: 'Respect for choice, if the choice is informed and not nudged.',
    virtue: 'Honesty and respect: asking, and meaning it.',
    code: 'Speaks to 1.3 (be honest and trustworthy) and 1.6; a pre-ticked box would weaken both.',
  },
};

/** Where the lenses tend to pull apart, per option: a prompt to discuss, not a ruling. */
export const TENSION: Record<OptionId, string> = {
  all: 'The consequences lens might count the possible benefits; the duties and professional-code lenses ask whether people agreed to this at all.',
  minimise: 'The lenses may lean the same way here, but the consequences lens still asks what insight is lost and who bears that cost, and the others ask whether the coarse area really is all the feature needs.',
  ask: 'The lenses agree on asking; they differ on whether a low opt-in rate is a cost to accept or a sign the question should be reworded.',
};

export const CODE_PRINCIPLES: readonly PrincipleId[] = ['1.2', '1.6', '2.5', '3.1'];
