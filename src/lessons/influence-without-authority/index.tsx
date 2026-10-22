import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: `Talking to people before a meeting is one view of how decisions get made, and a toy shows the arithmetic: in this model a plan with no conversations scores ${F.none} and fails, who you talk to does most of the work (swapping Fay for Gus takes a plan from ${F.natural} to ${F.gusPlan}, while the six orders of Gus, Dana and Eli score ${F.orderMin} to ${F.orderMax} and all pass), and a pitch on the wrong angle does not move that person, though the conversation still spares them a surprise. The rules and numbers are invented, and the page says so.`,
    what: `You propose retiring a legacy deploy tool, and six invented people stand between you and a yes: each has an influence, a position from −2 to +2, a concern and someone they listen to. You spend three conversations before the meeting, each on one person and one angle, then run the meeting under four printed rules, and the page shows the ledger of who moved and why. A table compares plans, including a search of the ${F.total} three-slot plans. A second scene has Dana object live and shows what each reply costs. A last scene lists what the toy leaves out.`,
    analogy: 'Passing a motion at a village hall: if you read the motion out cold, the people who hear it for the first time tend to dig in, while a word beforehand with the two neighbours that others listen to can settle the room; and a word aimed at the wrong worry settles little of that worry.',
    useCases: [
      'Planning who to talk to before a decision meeting, and whom to see first',
      'Seeing why one conversation with a trusted peer can reach further than one with the most senior person',
      'Noticing that a pitch has to match what a person cares about to move that person directly',
      'Pricing the moment an objection lands live, with every reply showing what it costs',
    ],
    why: 'In this toy, a proposal that arrives cold is hit by a surprise rule and a plan with conversations is not. Writing who you talk to, who listens to whom and what each person cares about as inputs shows where a plan gains support and where a conversation moves nobody directly.',
    watch: 'On Pre-wire the meeting each box is a person with an influence number and a position; a box is green at +1 or +2, grey at 0 and red at −1 or −2, a person who stands against the proposal after the meeting is filled solid, and a violet arrow runs from a person to those who listen to them. On Dana objects live a meter is blue while fine and red past its edge. On What the toy leaves out each line carries a label saying how much weight it can bear.',
  },
  tryThis: [
    `From a fresh load, press Run the meeting with no conversations: the weighted support is ${F.none} and the meeting fails, with Dana and Eli named as against.`,
    `Fill the three conversations with Dana, Eli and Fay, each on their own concern (workload, risk, cost; the Load button on the comparison table does it too), then Run: the score is ${F.natural} and it still fails.`,
    `Replace them with Gus on credibility, Dana on workload and Eli on risk, then Run: the score is ${F.gusPlan} and the meeting passes, and the ledger shows each spillover.`,
    `Put Dana on cost in all three conversations and Run: she does not move, the ledger says no match three times, and the score is ${F.mismatched}, above the ${F.none} of no conversations because anyone you spoke with is spared the surprise drop.`,
    `Open Dana objects live and choose push, then hold: it ends with support ${F.lostSupport}, in the red; undo twice and choose ask, then pilot, and compare the meters, including the ${F.scopeGivenUp}% of scope given up.`,
  ],
  keyIdeas: [
    `A proposal that arrives cold fails in this model: with no conversations the weighted support is ${F.none}, because the people you skipped who stand at 0 or below drop a step when surprised, and Dana and Eli end up against it (the rules are invented, and talking to people first is common practice).`,
    `Who you talk to matters more than the order: Gus, Dana and Eli each on their own concern score ${F.orderMin} to ${F.orderMax} across the six orders, with six passes out of six, while Dana, Eli and Fay score ${F.natural} and fail, and ${F.withGus} of the ${F.passing} passing plans out of ${F.total} include Gus. Order is worth ${F.orderMax - F.orderMin} points here: Gus before Dana reaches ${F.orderMax}, because Dana can pass support to Hana only once she stands at +1 when you speak to her (in this toy and this map).`,
    `A pitch on the wrong angle does not move that person (R1): Dana on cost three times leaves her at −1. It is not nothing, though: anyone you spoke with escapes the surprise drop (${F.mismatched} against ${F.none}), and Gus on any angle still lifts Dana and Eli, because he is already at +1 (Gus, Dana and Eli on cost score ${F.gusDanaEliAllCost}).`,
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
      q: "In the toy, which conversation has to come before Dana's to reach the best score?",
      options: [
        "Dana's own, before anyone else's: once she is lifted first, she can pass support on to Hana from then on",
        "Fay's, because she listens to Eli and a conversation with her also lifts him, which saves a slot for someone else",
        `Gus's, because Dana listens to him and he lifts her to 0, so that she stands at +1 when you speak to her and can pass support to Hana`,
        'None in particular: each conversation moves one person by +1 whatever came before it, so the order cannot change the score',
      ],
      answer: 2,
      why: `The best score is ${F.best}, reached by ${F.bestPlans} plans, and the ones with Gus before Dana are exactly the six orderings of Gus, Dana and Eli that reach it (${F.orderMax} against ${F.orderMin} for the rest, and the six orderings pass). Spillover needs the person you speak with to be at +1 or more: spoken to first, Dana is at 0 after her match and lifts nobody, so Hana stays low. Spillover runs from the person listened to, so Fay cannot lift Eli. The order is worth ${F.orderMax - F.orderMin} points, and the choice of people more.`,
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
      why: `Rule R1 moves a person when the angle equals their concern and not otherwise, so a mismatched pitch does not move that person, and spillover needs the person to be at +1 or more. Dana on cost three times scores ${F.mismatched}. The partial credit, the fall and the warmth are not in the rules.`,
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
