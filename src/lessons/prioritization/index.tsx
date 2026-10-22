import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A 2 by 2 sorts a backlog into groups but gives no order; the order that costs least delay for one worker is cost of delay over duration, and every "yes" has a price you can show for the items left out.',
    what: `You place ten invented backlog items on an impact against effort plane and see how three ordering rules rank them and how much value each delivers by a chosen week. Then you order the items yourself against the order that minimises total cost of delay (cost of delay times finish week, summed), with a dependency that breaks the simple rule. Next the numbers become ranges and a seeded simulation shows how often each item ranks first, a capacity line puts a price on the items cut, and an invented stakeholder asks for an urgent item mid-quarter. Items, numbers and the stakeholder are invented.`,
    analogy: 'A single checkout lane: if a customer buying one cheap item waits behind a full trolley, the cost of waiting is paid by everyone in the line. Serving the people with the most to lose per minute of service first makes the total wait cheapest, and a long queue is only fair if you say aloud who is at the back.',
    useCases: [
      'Ordering a backlog when every item looks worth doing',
      'Answering an urgent request with the trade-off written down',
      'Explaining why "highest impact first" or "quick wins first" can both be worse than a ratio',
      'Showing what a "not this quarter" actually costs',
    ],
    why: 'Prioritisation is where a team spends its only fixed resource, time. A ranking without prices hides what is lost; cost of delay gives a unit for the price of waiting, and a range shows when two items are too close to argue about.',
    watch: 'On The 2 by 2, each backlog item is a sky-blue dot, the grey lines split the plane at 5 and 5, and the three value curves are violet (highest impact first), orange (lowest effort first) and green (impact over effort), with a yellow line for the week you picked. On Cost of delay the yellow figure is your order, the green figure the best order and the red figure the extra you pay; an item tied by a dependency is violet. On Ranges the blue bars are the chance of ranking first and an orange gap is a close call (under 10 points). On The capacity line a chosen item is green and one left out is grey and dashed, and red marks work over capacity or the price of what is cut. In the urgent request, a meter is blue while fine and red past its edge.',
  },
  tryThis: [
    `The 2 by 2, from a fresh load: by week ${F.week} highest impact first has delivered ${F.valueImpact}, lowest effort first ${F.valueEffort} and impact over effort ${F.valueRatio}. Drag "Value delivered by week" to ${F.lateWeek}: the three are ${F.lateImpact}, ${F.lateEffort} and ${F.lateRatio}, and impact over effort leads.`,
    `Cost of delay, from a fresh load (highest impact first): your order costs ${F.yourCost} and the best costs ${F.bestCost}, so you pay ${F.extraCost} extra and ${F.swaps} neighbour swaps remove it. Press "Sort by cost of delay over duration", then turn Dependency on: ${F.dependencyAfter} needs ${F.dependencyBefore} first, the sorted order is refused, and the best allowed order costs ${F.boundCost}.`,
    `Ranges, from a fresh load: ${F.topName} ranks first in ${F.topPct}% of runs and ${F.secondName} in ${F.secondPct}%, a gap of ${F.gapPts} points. Drag the spread to 0.6 and the gap falls to ${F.wideGapPts} points, a close call by this lesson's ${F.closePts}-point threshold.`,
    `The capacity line, from a fresh load (${F.capacity} weeks): ${F.lineItems} items fit, worth ${F.lineValue} a week, and the rest cost ${F.lineCut} a week in delay. Drag the capacity to 20: ${F.wideItems} items fit and ${F.wideCut} a week is cut.`,
    `An urgent request, from a fresh load: pick "Swap it for ${F.swapOut}" and Continue. Value delivered reads ${F.swapValue} against ${F.baseValue} at the start, and trust reads ${F.swapTrust}.`,
  ],
  keyIdeas: [
    `A 2 by 2 groups items; it does not order them, and neither highest impact nor lowest effort first wins at both horizons: by week ${F.week} lowest effort leads at ${F.valueEffort} against ${F.valueRatio}, while by week ${F.lateWeek} impact over effort leads.`,
    `For one worker and independent items, ordering by cost of delay over duration gives the lowest total delay cost (a standard result, from memory): ${F.bestCost} against ${F.yourCost} for highest impact first. A dependency changes that, and the best allowed order, ${F.boundCost}, has to be searched for.`,
    `Estimates are ranges, so rankings are too: at a spread of 0.6 the top two items are ${F.wideGapPts} points apart, under this lesson's ${F.closePts}-point threshold for a close call, which is a reason to stop debating that pair (one view).`,
    `A visible capacity line makes "no" concrete: at ${F.capacity} weeks ${F.lineItems} items fit and leaving out the rest costs ${F.lineCut} a week, and each way of answering an urgent request shows what it gives up.`,
  ],
  quiz: [
    {
      q: 'A team draws impact against effort and calls the top-left group "quick wins". What does the 2 by 2 give them?',
      options: [
        'A way to sort items into groups, with no order inside a group and none between groups',
        'The best order to do the items, because the top-left corner always goes first and the rest follow by distance',
        'An exact ranking, because impact and effort together decide where every item falls',
        'A guarantee that the quick wins deliver more value than any big bet over the quarter',
      ],
      answer: 0,
      why: 'The grid is a common grouping, not a method that yields an order. In this lesson its groups sit beside three rules that rank the same items differently.',
    },
    {
      q: 'Item A earns 10 a week and takes 1 week; item B earns 30 a week and takes 3 weeks. One worker does them in turn. What does the delay cost say?',
      options: [
        'B should go first, because its cost of delay a week is three times larger than A\'s',
        'A should go first, because the shorter item is finished sooner and so costs less',
        'Both orders cost the same, because the two items have the same cost of delay per week of work',
        'It depends on the day, because the cost of an order changes while the work is under way',
      ],
      answer: 2,
      why: 'Cost of delay over duration is 10 for both. A then B costs 10 x 1 + 30 x 4 = 130, and B then A costs 30 x 3 + 10 x 4 = 130: an exact tie.',
    },
    {
      q: 'Your hand-made order costs more delay than the ratio order. What does the swap list show?',
      options: [
        'The swaps show which items are least important to the business, so those are the ones to remove from the list first',
        'Each neighbour swap that moves a higher ratio ahead removes some cost, and the savings add up to your extra cost',
        'Each swap trades one item\'s cost for another\'s, so the total cost stays the same after all of them',
        'The swaps are chosen at random, so they only illustrate that order matters somewhat',
      ],
      answer: 1,
      why: `Here highest impact first costs ${F.yourCost} against ${F.bestCost}: ${F.swaps} adjacent swaps remove the ${F.extraCost} difference, each by a positive amount.`,
    },
    {
      q: `Two items rank first in ${F.wideTopPct}% and ${F.wideSecondPct}% of simulated runs. What is a sensible reading?`,
      options: [
        'The first is clearly better, because a higher percentage always means a better item and so should simply be done first',
        'The simulation is broken, because two items cannot both rank first so often',
        'The two are a close call, so the order between them is not worth much debate',
        'Both items should be dropped, because uncertain items cost more than they deliver',
      ],
      answer: 2,
      why: `This lesson calls a gap under ${F.closePts} points a close call (a chosen threshold, not a statistical test): at a spread of 0.6 the top two are ${F.wideGapPts} points apart. Shares of first place sum to 100%, so two shares can be this size. "Do not agonise over close calls" is one view, and a larger gap would say more.`,
    },
  ],
};

export default lesson;
