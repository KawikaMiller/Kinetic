import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { FACTOR_IDS, LEAF_IDS, OUTAGE_MIN } from './tree';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A blameless postmortem asks what made a failure possible, finds several contributing factors rather than one culprit, and ends in action items someone owns and can check.',
    what: `You explore one invented outage (a config change took checkout down for ${OUTAGE_MIN} minutes) as a tree of factors, each tagged trigger, contributing factor or latent condition. You rewrite eight blaming sentences so that they name a condition of the system instead of a person, then build action items from slots (what, owner role, done-when, tag) and watch a checklist computed from them. Last, the same facts are walked as a chain of five whys and as the whole tree, with a count of how many factors each found. The incident, names and numbers are invented, and each claim says whether it is common practice or one view.`,
    analogy: 'Like investigating a house fire by asking what let it spread, not who dropped the match: the missing smoke alarm and the blocked exit are fixable, and a promise to be careful is not.',
    useCases: [
      'Reviewing an outage in a way that makes people willing to describe what really happened',
      'Turning a vague lesson like “be careful” into an action with an owner role and a check',
      'Spotting that a review found only prevention and nothing to detect or shorten the next one',
      'Asking why more than once without stopping at the first convenient cause',
    ],
    why: 'The same incident repeats when the review ends at a person. Reviews that find the conditions, and turn them into owned and checkable actions, are how a team gets better after the pager stops.',
    watch: 'In the tree, the node you asked about is solid yellow, a revealed node you have not asked about is pale blue, and once asked a node takes its tag colour: orange for a trigger, violet for a contributing factor, amber for a latent condition. Green marks a rewrite that names a condition or an action that passes, red a rewrite that still blames or an action that fails, and a leaf factor with no action has a red ring. Action tags are the letters P, D and M. In the last scene, blue nodes were asked by the chain and the rest are faded. Dashed chips say what is invented; solid-bordered labels say whether a claim is common practice or one view.',
  },
  tryThis: [
    `On The factors tree, press Ask about everything: the tree shows ${FACTOR_IDS.length} factors and ${LEAF_IDS.length} leaves, and none of them is the single root cause.`,
    'On Blame to system, pick the first rewrite of the first sentence: it still blames a person. Pick the second: it names the config tool’s condition.',
    'On Action items, load “Be more careful”: no check passes. Then load “A good postmortem”: all five do, and every leaf has an action.',
    `On Five whys vs a tree, the default chain stops at a person and surfaces 1 of ${FACTOR_IDS.length} factors. Pick Follows the config checks: it reaches 3 factors and one leaf.`,
  ],
  keyIdeas: [
    'A blameless postmortem asks what made the failure possible; in this tree there are several contributing factors and no single root cause.',
    'Tags help: a trigger sets it off, a contributing factor makes it bigger or longer, and a latent condition sat in the system before.',
    'A real action item has an owner role, a done-when someone can check, and points at a factor; “be more careful” has none of the three.',
    'A chain of whys follows one branch and stops where the asker is satisfied; the tree keeps the other branches.',
  ],
  quiz: [
    {
      q: 'After an outage a manager asks who caused it. What does a blameless postmortem do with that question?',
      options: [
        'Names the person closest to the change, then explains at length that it was not really their fault',
        'Asks what made the failure possible, which turns up several conditions, not one person',
        'Skips the question and records only a timeline of the events in order',
        'Passes the question to the engineer’s manager to settle in a separate process',
      ],
      answer: 1,
      why: `In this lesson’s tree there are ${FACTOR_IDS.length} factors and ${LEAF_IDS.length} leaves. Asking what made the failure possible finds conditions a team can change, which a name cannot give you. Blameless review is common practice and one view of how to learn from failure.`,
    },
    {
      q: 'Which of these action items is a real fix?',
      options: [
        'Remind everyone to double-check config values before they push',
        'A CI test rejects values outside the valid range; owner: config platform team',
        'Retrain the engineer who pushed the change, done when they say they feel confident again',
        'Be more careful with config changes, to be raised at the next team meeting',
      ],
      answer: 1,
      why: 'It points at a factor (no range check), names an owner role and has a done-when anyone can check. The others depend on people remembering, or have no check to run.',
    },
    {
      q: 'A chain of whys ends at “the engineer typed the wrong value”. What did it leave out?',
      options: [
        'The engineer’s name, which a complete record has to include for later accountability',
        'Nothing, because a human error is where a chain of whys is meant to come to rest',
        'The conditions that let one typo through: no range check, no preview, no staged rollout',
        'A sixth why about how much experience the engineer had at the time of the change',
      ],
      answer: 2,
      why: `The person chain in the lesson surfaces 1 of the tree’s ${FACTOR_IDS.length} factors. A chain follows one branch and stops where the asker is satisfied, so it can end before the conditions that let the typo through.`,
    },
    {
      q: 'In the tree, what is a latent condition?',
      options: [
        'The single event that set the outage off, at the moment the change was pushed',
        'Something that made the incident longer once it was already under way in production',
        'A step in the incident timeline that the on-call engineer took later than needed',
        'A condition that sat in the system beforehand, unnoticed until something triggered it',
      ],
      answer: 3,
      why: 'The missing range check and the one shared config file were there long before the change that triggered the outage. Tagging them as latent shows what was waiting.',
    },
  ],
};

export default lesson;
