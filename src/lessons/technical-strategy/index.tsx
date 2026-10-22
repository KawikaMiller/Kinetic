import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In one view a strategy is a diagnosis, a guiding policy that rules some actions out, and actions that follow from it; remove a policy and the page shows which actions lose their reason and which problems go unanswered.',
    what: `You work on an invented strategy canvas: ${F.diagnoses} diagnoses, ${F.policies} guiding policies and ${F.actions} roadmap actions, with two conflicts. Removing a policy or an action shows the actions it orphans, the diagnoses left uncovered and the conflicts that stay active. Then you choose a storage policy and how to enforce it in a two-decision story with invented effects. Acme Platform and the figures are invented. A single decision such as the one in \`build-vs-buy\` is an action; this lesson is about the policy that gives it a reason.`,
    analogy: 'A road trip: the diagnosis is that you are lost, the policy is to follow the coast and avoid the motorways, and the turns you take are the actions. A list of turns without the policy is just a list, and two policies that point in opposite directions leave the driver arguing at each junction.',
    useCases: [
      'Checking that each roadmap item traces to a policy and each policy to a problem',
      'Finding which items lose their reason when a policy changes',
      'Spotting two policies, or two items, that cannot both hold',
      'Explaining why a roadmap, a goal or a mission is not a strategy',
    ],
    why: 'A roadmap tells teams what to do and a strategy tells them why and what to leave out. Tracing each action to a policy and each policy to a diagnosis makes gaps and contradictions visible before they become arguments between teams.',
    watch: 'On The canvas the blue boxes are diagnoses, the violet boxes guiding policies and the grey boxes actions, read left to right; a red box is an orphaned action (no policy supports it), an orange box is an uncovered diagnosis, a faded box is removed, and a dashed red line joins two items that conflict. The lists under the canvas hold the Remove and Restore buttons. On the storage story a meter is blue while fine and red past its edge.',
  },
  tryThis: [
    `The canvas, from a fresh load: the counters read ${F.startOrphans} orphaned actions, ${F.startUncovered} uncovered diagnoses and ${F.startConflicts} active conflicts (P2 against P4, A4 against A7).`,
    `Press Remove on P1: ${F.p1Orphans} turn orphaned.`,
    `Press Restore on P1, then Remove on P4: ${F.p4Orphans} are orphaned, the policy conflict clears and ${F.p4Conflicts} action conflict (A4 against A7) remains.`,
    `Press Restore on P4, then Remove on P3: ${F.p3Uncovered} is uncovered and ${F.p3Orphans} is orphaned.`,
    `Open the storage story and choose hybrid, then exception: the stats read autonomy ${F.hybridAutonomy}, migration effort ${F.hybridEffort}, delivery drag ${F.hybridDrag}.`,
  ],
  keyIdeas: [
    `A roadmap alone is a list of actions: in this model removing the policy P1 leaves ${F.p1Orphans} with no policy behind them, and an orphan is an item that needs a new reason or should go (one view of strategy, from one author).`,
    `A diagnosis with no policy is an unanswered problem: removing P3 leaves ${F.p3Uncovered} uncovered and ${F.p3Orphans} orphaned, while removing a policy that shares its diagnosis with others, such as P4, leaves the diagnosis covered.`,
    `Conflicts are part of the picture and not an error to hide: P2 and P4 cannot both hold, and after P4 is removed ${F.p4Conflicts} conflict remains because an orphaned action is still on the roadmap until it is removed too.`,
    `No path through the storage story wins on each of the three meters at once: hybrid then exception ends at autonomy ${F.hybridAutonomy}, effort ${F.hybridEffort}, drag ${F.hybridDrag}, consolidate then a hard rule at ${F.consolidateAutonomy}, ${F.consolidateEffort}, ${F.consolidateDrag} and team choice then advice at ${F.teamChoiceAutonomy}, ${F.teamChoiceEffort}, ${F.teamChoiceDrag}; which is right depends on who pays the coordination cost.`,
  ],
  quiz: [
    {
      q: 'In the diagnosis, guiding policy and coherent action model, what is a guiding policy?',
      options: [
        'A goal such as reducing the time to deploy by thirty percent this year',
        'An approach to the diagnosed problem that rules some actions in and others out',
        'A list of the projects that have been scheduled for the coming quarter',
        'A company-wide rule that every team must follow without any exception allowed',
      ],
      answer: 1,
      why: `In this one author's framework a policy is an approach that rules some actions out: a goal says where to get to, a list of projects is the actions, and the canvas has ${F.supportEdges} support links from diagnoses to policies to actions.`,
    },
    {
      q: 'A manager says: our roadmap is our strategy. What does the lesson say is missing?',
      options: [
        'A diagnosis and policies that explain why these items made the list',
        'A longer roadmap that covers more quarters into the future than this one',
        'A budget that is attached to each one of the items on the roadmap',
        'A slide with the company mission written at the very top of the page',
      ],
      answer: 0,
      why: `A roadmap is the actions: with P1 removed, ${F.p1Orphans} stay on it with nothing to justify them. Length, budgets and a mission do not supply a reason for any one item.`,
    },
    {
      q: `You remove the guiding policy P1 and ${F.p1OrphanCount} roadmap items turn orphaned. What does that tell you?`,
      options: [
        'Those items are now complete, so they can be marked as done on the roadmap',
        'The diagnosis has changed, so it must be rewritten from the beginning again',
        'Nothing at all, since orphans appear whenever a policy is edited in any way',
        'Nothing justifies those items now, so each needs a new reason or should go',
      ],
      answer: 3,
      why: `Orphaned means unjustified, not finished: ${F.p1Orphans} lose their sole policy, and the diagnosis is untouched. A policy that is removed, and not merely edited, is what orphans an action.`,
    },
    {
      q: 'Should an organisation consolidate on one datastore family or let teams choose?',
      options: [
        'Consolidate, because having fewer technologies is the cheaper way to run in all cases',
        'Let teams choose, because autonomy beats standardisation in the long run in all cases',
        'It depends on who pays the coordination cost and how teams\' data needs differ',
        'Whichever option the biggest team in the organisation happens to prefer the most',
      ],
      answer: 2,
      why: `It depends on who pays the coordination cost: in this story consolidating costs autonomy and effort, team choice raises drag, and the paths end at ${F.consolidateAutonomy}/${F.consolidateEffort}/${F.consolidateDrag} and ${F.teamChoiceAutonomy}/${F.teamChoiceEffort}/${F.teamChoiceDrag} on autonomy, effort and drag.`,
    },
    {
      q: 'Two policies conflict: consolidate storage and let each team choose storage. What are the defensible moves?',
      options: [
        'Keep both unchanged, since a strategy should never exclude any possibility at all',
        'Pick one, or scope each (core data standardised, experiments free) and say which applies',
        'Remove the diagnosis, so that neither of the two policies needs to apply anywhere',
        'Let the roadmap decide case by case, with no written policy to guide anyone',
      ],
      answer: 1,
      why: `The canvas keeps P2 against P4 active until one goes, and the hybrid choice scopes both: it ends at autonomy ${F.hybridAutonomy}, effort ${F.hybridEffort}, drag ${F.hybridDrag} with an owner needed for its sunset rule (one view).`,
    },
  ],
};

export default lesson;
