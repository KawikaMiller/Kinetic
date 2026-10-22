import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Privacy is engineered by keeping less: a record fans out into copies that a deletion request does not reach, removing names does not anonymise a table, a hash of a guessable value is only a pseudonym, and noise protects a count at the price of a budget.',
    what: `One invented person's record lives in ${F.copies} places. Deleting the primary row leaves ${F.primaryDay90Readable} copies still readable at day 90; a fan-out queue, crypto-shredding, retention limits and not making the copies in the first place each reach different ones. A synthetic table of ${F.people} people shows that generalising ZIP and birth year takes k from ${F.openingK} to ${F.generalisedK} while a group that shares one condition still leaks it; a noisy count shows what a privacy budget buys; and a hashed email is reproduced by trying five guesses. This is engineering education, not legal advice.`,
    analogy: 'It is a photocopier problem: you can shred the original, but the answer to "who has copies?" decides whether the page is gone, and a name blacked out on every copy can still be read from the address and birth date left on it.',
    useCases: [
      'Designing the deletion path for a user-data store that feeds search, analytics, backups and partners',
      'Choosing what to log, mask, hash or drop in a service that handles personal data',
      'Releasing an aggregate or a dataset without exposing the people in it',
      'Reviewing a claim that data is "anonymised" because names or identifiers were removed',
    ],
    why: 'Privacy failures are rarely a breach of one database: they are the forgotten copy, the log line, the join with a public list. Knowing where data goes and what a protective step really changes lets you design for less data and read an "anonymised" claim with the right doubt.',
    watch: 'On the record cards a copy that still holds the data is red (--bad), a deleted copy green (--ok), a copy made unreadable by destroying its key violet (--violet) and a copy kept under a legal hold orange (--orange). In the table the groups wear plain amber, pink and sky tones and a unique, re-identifiable row is marked red. The noise histogram is blue (--info) with the true count and the mean as lines, and the budget bar is yellow (--hi) until it is spent, then red. In the log scene a field that identifies or can be guessed is red, a partly masked one orange, a linkable pseudonym violet and a dropped field green.',
  },
  tryThis: [
    `Where a record lives, on the defaults (delete from the primary only, day 0): ${F.primaryDay0Readable} of ${F.copies} copies still hold the data. Move the day to 90: ${F.primaryDay90Readable} still do (${F.primaryDay90Names.join(' and ')}). Pick Fan-out deletion queue and set the day to ${F.queueDoneDay - 1}: ${F.queueBeforeDone} copy remains; set it to ${F.queueDoneDay}: none. Then pick Crypto-shredding at day 0: ${F.shredUnreadable} copies are unreadable and ${F.shredReadable} still readable.`,
    `k-anonymity, on the defaults (nothing generalised): k is ${F.openingK}, ${F.openingUnique} rows are unique and ${F.openingLinked} link to a name on the public list. Set ZIP to 3 digits and birth year to a 25-year range: k is ${F.generalisedK}, ${F.generalisedUnique} rows are unique and ${F.generalisedLinked} link, at an information loss of ${F.generalisedLoss}%, but l is ${F.generalisedL}: one group of ${F.leakSize} all have condition ${F.leakCondition}.`,
    `A noisy count, on the defaults (epsilon 1, true count ${F.trueCount}): press Ask 10 times. The ${F.tenAnswers} answers have noise of scale ${F.tenScale}, their mean is ${F.tenMean} and the budget of ${F.budget} is spent. Press Reset, set epsilon to 0.1 and press Ask 100 times: noise of scale ${F.hundredScale}, mean ${F.hundredMean}, the same budget spent.`,
    `Pseudonymous is not anonymous, on the defaults (every field kept): ${F.openingIdentifying} of ${F.personalFields} personal fields identify. Set user email to Hash: trying the five addresses reproduces the logged value and recovers mara@example.test. Set it to Keyed hash (HMAC): it is not recovered, though the value still links the same person's lines. Set it to Drop: it is gone.`,
  ],
  keyIdeas: [
    `Deleting the row is not deleting the data: in this model the primary-only strategy leaves ${F.primaryDay90Readable} of ${F.copies} copies readable at day 90, and a fan-out queue finishes by day ${F.queueDoneDay} because backups keep their ${F.backupDays}-day retention.`,
    `Removing names does not anonymise: with nothing generalised ${F.openingLinked} of ${F.people} rows link to one named person; generalising takes k to ${F.generalisedK}, yet a group of ${F.leakSize} that share condition ${F.leakCondition} still leaks it (l = ${F.generalisedL}).`,
    `Noise buys protection with a budget: at epsilon 0.1 each answer is off by about ${F.hundredScale}, but ${F.hundredAnswers} answers average to ${F.hundredMean} against a true ${F.trueCount}, which is why each answer spends epsilon.`,
    `Hashing a guessable value merely pseudonymises it: five guesses reproduce a hashed email, and even a keyed hash that guessing cannot reproduce still links one person's lines together.`,
  ],
  quiz: [
    {
      q: 'A user asks for their data to be deleted and the primary row is removed. What else must be checked?',
      options: [
        'Nothing more, because the primary database is the source of truth and the rest follows',
        'Only the backups, since every other copy is rebuilt from the primary overnight anyway',
        `The other copies: here the ${F.primaryDay90Labels.join(' and ')} stay readable at day 90`,
        'The cache alone, because it is the only store that keeps data once the row is gone',
      ],
      answer: 2,
      why: `At day 90, when the strategy deleted from the primary alone, ${F.primaryDay90Readable} of ${F.copies} copies are still readable (${F.primaryDay90Names.join(', ')}). Nothing was ever told to delete them, so deleting the row did not delete the data.`,
    },
    {
      q: 'A table has had its names removed. Is it anonymous?',
      options: [
        'Yes, because a table with no name column cannot point at any particular person',
        'Not necessarily: ZIP, birth year and sex can still tie a row to one person in a public list',
        'Yes, as long as the rows are shuffled, since order is the only remaining identifier',
        'Only if the table is encrypted, because anonymity is a property of storage',
      ],
      answer: 1,
      why: `With nothing generalised, ${F.openingLinked} of ${F.people} rows link to exactly one named person in the invented public list. Generalising to 3 digits and a 25-year range takes that to ${F.generalisedLinked}, at ${F.generalisedLoss}% information loss.`,
    },
    {
      q: 'A service logs the SHA-256 of each user email instead of the email. Is that anonymous?',
      options: [
        'Yes, because a hash cannot be reversed, so no one can learn the address from it',
        'Yes, because the hash is shorter than the address and so carries less information',
        'No, because a hash is stored in plain text and plain text is never allowed in logs',
        'No: a short guess list reproduces the hash, so it is only a pseudonym',
      ],
      answer: 3,
      why: 'Five invented addresses were enough to reproduce the logged value for the plain hash. A keyed hash resists that guess, but it still gives one person one stable value, so lines can still be linked.',
    },
    {
      q: `A table is ${F.generalisedK}-anonymous but one group of ${F.leakSize} people all have the same condition. What leaks?`,
      options: [
        'That condition, for anyone known to be in that group: k is 4 but l-diversity is 1',
        'Nothing, because 4-anonymity means no group can reveal anything about its members',
        'Only the people who are alone in their group, since the others cannot be told apart',
        'Their names, because a group of equal values can only come from the name column',
      ],
      answer: 0,
      why: `At 3 digits and a 25-year range, k is ${F.generalisedK} and l is ${F.generalisedL}: a group of ${F.leakSize} share condition ${F.leakCondition}. k-anonymity hides which row is yours, not what the group has in common.`,
    },
  ],
};

export default lesson;
