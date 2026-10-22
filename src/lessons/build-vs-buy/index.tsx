import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Build what sets you apart and buy what does not is one view; the model prices it: a build wins when it captures a benefit and not otherwise, the ranking depends on the horizon, and the page prints the benefit at which the ranking flips.',
    what: `You place three invented components on an evolution axis, which decides whether a yearly benefit counts, then compare building, self-hosting open source and buying over a horizon you set: cumulative cost by year, net cost, months to first value, cost to reverse and control points. Sliders set licence growth, maintenance, the horizon and the benefit, and the page prints the crossover year and the break-even benefit. A last scene asks what to do when a vendor raises its price. No real product, price or salary appears; the figures are invented.`,
    analogy: 'Renting or buying a van for a delivery business: renting is cheap to start and dearer each year the rates climb, buying costs a lot up front and a little each year, and the answer turns on how long you will keep the van and whether the van itself is what customers pay you for.',
    useCases: [
      'Deciding whether a commodity capability should be bought or built',
      'Showing which assumption, such as the horizon or the benefit, flips a build or buy ranking',
      'Pricing a vendor price rise against self-hosting or building',
      'Explaining why lock-in is a cost on every option and not only on a vendor',
    ],
    why: 'A build or buy argument is usually a clash of unstated assumptions. Writing the horizon, the growth in licence cost and the benefit as inputs shows which one the answer hangs on, and the break-even tells you how wrong it can be before the choice changes.',
    watch: 'On Place the components each service sits on one of four stages; Genesis and Custom-built count a benefit and the other two do not. On Three-year cost the orange line is build, the blue line open source and the pink line buy, each a step per year, with a vertical rule where buying first costs more than building; in the table the lowest net cost is green. On the vendor story a meter is blue while fine and red past its edge.',
  },
  tryThis: [
    `Three-year cost, from a fresh load (email delivery, horizon ${F.horizon} years): net cost reads buy ${F.emailBuy}, open source ${F.emailOss} and build ${F.emailBuild}, because its benefit is 0.`,
    `Set the horizon to ${F.longHorizon} years: build reads ${F.email9Build} against buy ${F.email9Buy}, so buying is now the dearer path (crossover year ${F.crossover}).`,
    `Open Place the components and move the scheduling engine to Custom-built, then in Three-year cost pick the engine and set the horizon back to ${F.horizon}: net cost reads build ${F.engineBuildNet} and buy ${F.engineBuyNet}.`,
    `Lower the yearly benefit B to ${F.lowBenefit}: build reads ${F.lowBuildNet} net against buy ${F.engineBuyNet}, so buy now beats build (break-even ${F.breakEven} a year), and open source, at ${F.lowOssNet}, is the lowest of the three.`,
    `Open the vendor story and choose open source, then plan: the stats read extra cost ${F.extra}, weeks diverted ${F.weeks}, lock-in exposure ${F.lockin}.`,
  ],
  keyIdeas: [
    `The horizon is an assumption that can flip the answer: in this model buying email delivery costs ${F.emailBuy} against ${F.emailBuild} to build over ${F.horizon} years, and building is the cheaper path from year ${F.crossover}.`,
    `A build pays off when it captures a benefit: the engine placed as Custom-built nets ${F.engineBuildNet} to build against ${F.engineBuyNet} to buy, and the two swap places at a yearly benefit of ${F.breakEven} (the benefit is yours to set, and one view of what to build).`,
    `Lock-in is a cost on each option and not a vendor myth: building has a reversal cost of its own, ${F.engineReverseBuild} for the engine against ${F.engineReverseBuy} to leave a bought one, and a total that leaves out upkeep, integration and exit is an incomplete total (common practice).`,
    `No option is best on all four of net cost, months to value, cost to reverse and control points, for any of the ${F.components} components in this model, so the choice depends on which column you are paying attention to and for how many years.`,
  ],
  quiz: [
    {
      q: `In the lesson's model, buying email delivery is cheaper than building it over ${F.horizon} years. What would flip that?`,
      options: [
        'Nothing could flip it, because buying is always cheaper than building anything',
        `A horizon near ${F.crossover} years, or a benefit only a build captures`,
        'A larger vendor, whatever the price schedule that the vendor chooses to charge',
        'Any growth in the licence price, however small it is in any one year',
      ],
      answer: 1,
      why: `It depends on the horizon and on whether a build captures a benefit: at ${F.longHorizon} years build costs ${F.email9Build} against ${F.email9Buy} to buy in this model, and the crossover year is ${F.crossover} at ${F.growth}% growth.`,
    },
    {
      q: `The scheduling engine costs ${F.engineBuildCost} to build over ${F.horizon} years and ${F.engineBuyCost} to buy. At what yearly benefit does building break even?`,
      options: [
        `About ${F.breakEven} a year: (${F.engineBuildCost} - ${F.engineBuyCost}) / ${F.horizon}, invented numbers`,
        `About ${F.engineBenefit} a year, which is the benefit that the lesson assumes for the engine`,
        `About ${F.costGap} a year, which is the whole cost gap taken in a single year`,
        'Zero a year, since buying has no benefit of its own to be compared with',
      ],
      answer: 0,
      why: `A build captures the whole benefit and a bought engine none, so the two net costs are equal where the benefit over ${F.horizon} years equals the cost gap: ${F.costGap} / ${F.horizon} = ${F.breakEven} a year.`,
    },
    {
      q: 'Which statement about vendor lock-in is accurate?',
      options: [
        'Building removes lock-in entirely, because you own all of the code you wrote',
        'Lock-in is a vendor myth that has no real cost in practice for a team',
        'Open source has no lock-in because the source code is public to everybody',
        'Building has a reversal cost of its own, so neither side is free of lock-in',
      ],
      answer: 3,
      why: `In this model reversing a build costs ${F.engineReverseBuild} for the engine and leaving a bought one ${F.engineReverseBuy}: a cost shows up on every option, and the page can include it in net cost.`,
    },
    {
      q: 'Which component most plausibly deserves an in-house build?',
      options: [
        'The one that is the most expensive to buy, so that the licence is saved',
        'The one that the engineering team finds most interesting and fun to build',
        'One that sets the product apart and is worth the extra cost of owning it',
        'The one that has the largest number of vendors competing for the business',
      ],
      answer: 2,
      why: 'One view: build what sets you apart, and the benefit has to be worth the cost. Price alone, interest or a crowded vendor market say nothing about a benefit; many vendors suggests a commodity.',
    },
    {
      q: 'What does a three-year total cost of ownership leave out if you only compare licence and salary lines?',
      options: [
        'Nothing at all, because licence and salaries are the whole cost of either path',
        'Integration, upkeep, operations and the cost of reversing the choice later on',
        'Only the interest on the money that is tied up while the work goes on',
        'The marketing value of having the vendor\'s logo on the product web page',
      ],
      answer: 1,
      why: `In this model the cost columns carry maintenance (${F.maintenance}% of a build a year), integration and operations, and a toggle adds the reversal cost; a comparison of licence and salary alone would miss all of them (common practice).`,
    },
  ],
};

export default lesson;
