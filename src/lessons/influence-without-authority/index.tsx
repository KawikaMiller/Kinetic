import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: `Talking to people before a meeting is one view of how decisions get made, and a toy shows the arithmetic: in this model a plan with no conversations scores ${F.none} and fails, the order of three conversations changes the score from ${F.natural} to ${F.gusPlan}, and a pitch that does not match what someone cares about moves nobody. The rules and numbers are invented, and the page says so.`,
    what: `You propose retiring a legacy deploy tool, and six invented people stand between you and a yes: each has an influence, a position from −2 to +2, a concern and someone they listen to. You spend three conversations before the meeting, each on one person and one angle, then run the meeting under four printed rules, and the page shows the ledger of who moved and why. A table compares plans, including a search of the ${F.total} three-slot plans. A second scene has Dana object live and shows what each reply costs. A last scene lists what the toy leaves out.`,
    analogy: 'Passing a motion at a village hall: if you read the motion out cold, the people who hear it for the first time tend to dig in, while a word beforehand with the two neighbours that others listen to can settle the room; and a word aimed at the wrong worry settles nothing.',
    useCases: [
      'Planning who to talk to before a decision meeting, and in what order',
      'Seeing why one conversation with a trusted peer can reach further than one with the most senior person',
      'Noticing that a pitch has to match what a person cares about to move them',
      'Pricing the moment an objection lands live, with every reply showing what it costs',
    ],
    why: 'A good idea that arrives cold at a meeting meets people who feel surprised, and surprise is expensive. Writing the order of conversations, who listens to whom and what each person cares about as inputs shows where a plan gains support and where it spends a conversation for nothing.',
    watch: 'On Pre-wire the meeting each box is a person with an influence number and a position; a box is green at +1 or +2, grey at 0 and red at −1 or −2, a person who stands against the proposal after the meeting is filled solid, and a violet arrow runs from a person to those who listen to them. On Dana objects live a meter is blue while fine and red past its edge. On What the toy leaves out each line carries a label saying how much weight it can bear.',
  },
  tryThis: [
    `From a fresh load, press Run the meeting with no conversations: the weighted support is ${F.none} and the meeting fails, with Dana and Eli named as against.`,
    `Fill the three conversations with Dana, Eli and Fay, each on their own concern (workload, risk, cost; the Load button on the comparison table does it too), then Run: the score is ${F.natural} and it still fails.`,
    `Replace them with Gus on credibility, Dana on workload and Eli on risk, then Run: the score is ${F.gusPlan} and the meeting passes, and the ledger shows each spillover.`,
    `Put Dana on cost in all three conversations and Run: nothing moves for her, the ledger says no match three times, and the score is ${F.mismatched}.`,
    `Open Dana objects live and choose push, then hold: it ends with support ${F.lostSupport}, in the red; undo twice and choose ask, then pilot, and compare the meters, including the ${F.scopeGivenUp}% of scope given up.`,
  ],
  keyIdeas: [
    `A proposal that arrives cold fails in this model: with no conversations the weighted support is ${F.none}, because the people you skipped who stand at 0 or below drop a step when surprised, and Dana and Eli end up against it (the rules are invented, and talking to people first is common practice).`,
    `Order matters, and it depends on who listens to whom: Gus, Dana and Eli each on their own concern score ${F.gusPlan} and pass, while Dana, Eli and Fay score ${F.natural} and fail, and swapping Fay for Ivo reaches ${F.naturalIvo}, a bare pass; of the ${F.passing} passing plans out of ${F.total}, ${F.gusOpenShare}% open with Gus (in this toy and this map).`,
    `A pitch that does not match what someone cares about moves nobody: Dana on cost three times scores ${F.mismatched}, and the three conversations are spent.`,
    `The toy cannot tell informing from manipulating and its numbers are made up: real positions do not move by +1, so read it as the arithmetic of ordering, not as evidence about people (one view).`,
  ],
  quiz: [
    {
      q: 'In the toy, why does a proposal with no prior conversations fail?',
      options: [
        'The people you skipped who stand at 0 or below drop a step on being surprised, leaving Dana and Eli against it',
        'A proposal needs three people on record in support before the meeting can pass it, and nobody has yet spoken up',
        'Gus, the one supporter, drops to 0 once the meeting starts, which leaves nobody on the side of the proposal',
        'Anyone who hears a proposal for the first time votes against it, whatever their view was beforehand',
      ],
      answer: 0,
      why: `Rule R3 drops each unmet person at 0 or below by one, which takes the score to ${F.none}, and Dana and Eli, of influence 5 and 4, end at −2 and −1. Gus is unmet but at +1 and stays there, and nothing in the rules asks for three supporters, so neither of those explains the failure.`,
    },
    {
      q: 'Which conversation should come first in the toy?',
      options: [
        'It depends on who listens to whom; here it is Gus, whom Dana and Eli listen to',
        `Dana, as the most influential person; a plan that opens with her scores at most ${F.danaOpenBest}`,
        `Hana, as the person furthest from agreeing; a plan that opens with her scores at most ${F.hanaOpenBest}`,
        `Ivo, as the one person nobody listens to; a plan that opens with him scores at most ${F.ivoOpenBest}`,
      ],
      answer: 0,
      why: `The best score is ${F.best}, reached by ${F.bestPlans} plans, three orderings of Gus, Dana and Eli on their own concerns, and ${F.gusOpenPassing} of the ${F.passing} passing plans open with Gus. Opening with Dana, Hana or Ivo tops out at ${F.danaOpenBest}, ${F.hanaOpenBest} and ${F.ivoOpenBest} in this map.`,
    },
    {
      q: 'You pitch Dana on cost, but her concern is workload. What happens in the toy?',
      options: [
        'Her position rises half as much as a matched pitch would raise it, and the slot is half spent',
        'Her position stays where it was and the slot is spent, with no spillover to anyone',
        'Her position falls, because she feels that you have not understood what she cares about',
        'Her position rises, because any attention at all makes a person a little warmer',
      ],
      answer: 1,
      why: `Rule R1 moves a person when the angle equals their concern and not otherwise, so a mismatched pitch moves nobody, and spillover needs the person to be at +1 or more. Dana on cost three times scores ${F.mismatched}. The partial credit, the fall and the warmth are not in the rules.`,
    },
    {
      q: 'After Gus, Dana and Eli, each on their own concern, what is the weighted score?',
      options: [
        `${F.none}, the score with no conversations at all`,
        `${F.natural}, the score of Dana, Eli and Fay each on their own concern`,
        `${F.six}, the score when all six people are talked to`,
        `${F.gusPlan}, which is enough for the meeting to pass at ${F.pass} or more`,
      ],
      answer: 3,
      why: `Gus lifts Dana and Eli by spillover, Dana lifts Hana, Eli lifts Fay, and Hana and Ivo, unmet, drop a step: the final positions are +1, +2, +1, +2, −1 and −1, so the score is 5 + 8 + 3 + 4 − 2 − 3 = ${F.gusPlan}. The other three are the scores of other plans.`,
    },
    {
      q: 'What does the model not tell you?',
      options: [
        'Whether real positions move by the amounts the rules give for a conversation',
        `Which plan scores best among all ${F.total} three-slot plans in the toy`,
        'How the weighted support is added up from influence and positions',
        'Who stands against the proposal at the end of the meeting, and why',
      ],
      answer: 0,
      why: 'The rules, the search and the ledger are computed, so the model does say which plan scores best, how support is added and who stands against it. What it cannot say is whether real people move by +1 on a matched pitch: those numbers are invented.',
    },
  ],
};

export default lesson;
