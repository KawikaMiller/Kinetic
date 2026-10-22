import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A request is one possible solution to a need: walk up to the behaviour and the need first, watch the metrics that show the outcome and the cost, and check that a test can measure what you hope to learn.',
    what: `You start from an invented request, "Add a CSV export", and walk up an outcomes tree (goal, metric, behaviour, need) to compare cheaper options that serve the behaviour. Then one release is watched week by week: a vanity metric rises while outcome metrics stay flat, and pushing one number hard degrades the guardrails. A calculator gives the visitors per arm a test needs, the days that takes at your traffic, and a simulation that checks it. The last scene takes a popular claim about unused features and has you design the measurement that would settle it. The product, numbers and team are invented.`,
    analogy: 'A customer asks a builder for a bigger door. Asking why finds that the real problem is moving a sofa, which a window or a ramp may solve for less. Counting how many people walk through the new door does not say whether the house got easier to live in.',
    useCases: [
      'Responding to a feature request with the need behind it',
      'Choosing which metrics a release is judged on, and which it must not hurt',
      'Checking before an experiment whether your traffic can detect the lift you care about',
      'Questioning a statistic that everyone repeats and nobody can source',
    ],
    why: 'Engineers are asked for solutions all the time. Asking what need a request serves, and how you would know it worked, often finds a cheaper answer, and it protects the team from shipping something that moves a number without moving the outcome.',
    watch: 'On The outcomes tree, the level you are at is yellow, levels on the path you walked are blue, and each solution card has a green border when it covers the whole behaviour, violet when it covers part of it and grey when it misses it. On Which number to watch the orange line is a vanity metric (a labelled category, not a verdict), blue lines are outcome or guardrail metrics, a week past a guardrail is a red dot, and grey marks the release week and the guardrail. On Can we measure it? the blue curve is power as visitors grow, the yellow line is the size you need and the green line the power you asked for. On Folklore check, a green line says a choice counts what the feature is for and an orange one says it changes what is counted.',
  },
  tryThis: [
    `The outcomes tree, from a fresh load (at the request): press "Why do they need this?". At the need, two options cover the whole behaviour and the cheapest is the ${F.bestName} at ${F.bestEffort} days, while the request, CSV export, takes ${F.requestEffort} days and covers ${F.requestParts} of ${F.behaviourParts} parts of it.`,
    `Which number to watch, from a fresh load (signups): signups are ${F.signupsChange >= 0 ? '+' : ''}${F.signupsChange}% after the release while weekly active teams are ${F.activeChange}% and retention ${F.retentionChange}%. Switch Release to "Push signups hard": signups reach +${F.pushedSignups}%, support tickets +${F.pushedTickets}%, and the release is flagged in week ${F.breachWeek} when tickets cross ${F.ticketsGuardrail}.`,
    `Can we measure it?, from a fresh load (10% baseline, 2-point lift, 2,000 visitors a day): ${F.n.toLocaleString('en-US')} visitors per arm and ${F.days} days, and the simulation finds the lift in ${F.simulatedPower}% of tests. Drag the smallest lift to 0.5 points: ${F.tinyN.toLocaleString('en-US')} per arm and about ${F.tinyDays} days.`,
    `Folklore check, from a fresh load: the default design reports ${F.badShare}% of accounts using the feature. Set Log to "Report generated and downloaded", Window to 30 days and Users to "Teams active in the last 30 days": it reports ${F.fairShare}% and no choice is flagged.`,
  ],
  keyIdeas: [
    `A request is one possible solution to a need: climbing to the need finds that the ${F.bestName} covers the whole behaviour in ${F.bestEffort} days, while the requested CSV export takes ${F.requestEffort} and covers ${F.requestParts} of ${F.behaviourParts} parts of it, and an outcomes tree is a common way to plan (common practice).`,
    `A vanity metric can rise while the outcome stays flat: signups are +${F.signupsChange}% and weekly active teams ${F.activeChange}%. Pushing one number hard degrades guardrails (tickets +${F.pushedTickets}%), as Goodhart's law (common practice) describes.`,
    `Whether a test can detect a lift is arithmetic: ${F.n.toLocaleString('en-US')} visitors per arm for a 2-point lift from 10% (a standard formula), about four times that for a 1-point lift, so small user bases cannot detect small lifts and need a bigger bet or other evidence.`,
    `A statistic that is repeated widely is not evidence until you can trace it, and its measurement decides the answer: here ${F.badShare}% or ${F.fairShare}% depending on what is logged, over what window, for which accounts. The unused-features claim itself is folklore from memory.`,
  ],
  quiz: [
    {
      q: 'A requester asks for "a CSV export on the reports page". What is the most useful way to treat the request?',
      options: [
        'As one possible solution to a need, so ask why they need it and what they will do with the result',
        'As a specification, because the requester knows their own workflow best and the team should build exactly what was asked',
        'As a ranking input only, because the number of people who ask for a feature decides its value to the product',
        'As a sign the reports page is wrong, because a request for an export means the page should be removed and rebuilt',
      ],
      answer: 0,
      why: `Asking why leads to the need (a figure to share, current on Monday). In this invented case the ${F.bestName} covers that behaviour in ${F.bestEffort} days, while CSV export takes ${F.requestEffort} and covers ${F.requestParts} of ${F.behaviourParts} parts of it.`,
    },
    {
      q: `After a release, signups are +${F.signupsChange}% while weekly active teams and retention have not moved. What is the sensible reading?`,
      options: [
        'The release is a success, because signups are the number the business asked for and the number went up as hoped',
        'Signups may be a vanity metric here: the outcome metrics did not move, so the release has not shown value yet',
        'The data is wrong, because a rise in signups has to bring a rise in active teams with it',
        'The release is a failure, because any number that does not move retention was a waste to build',
      ],
      answer: 1,
      why: `Signups are +${F.signupsChange}% and weekly active teams ${F.activeChange}%: a vanity metric rises while the outcome does not. Whether the release failed or just has not shown value yet is a judgement the numbers cannot make alone.`,
    },
    {
      q: 'A team with 100 visitors a day wants to detect a 0.5-point lift from a 10% baseline in an A/B test. What does the arithmetic say?',
      options: [
        `About ${Math.round(F.tinyN / F.n)} times the visitors of a 2-point lift: at 100 a day that takes years, so look for a bigger bet`,
        'It is fine, because an A/B test can detect any lift if it runs long enough and the code is correct, so the team should just start',
        'It needs the same visitors as a 2-point lift, because the baseline fixes the sample size, not the lift',
        'It needs about 100 visitors per arm, because the sample size depends only on the daily traffic',
      ],
      answer: 0,
      why: `At 2,000 a day the 0.5-point lift needs ${F.tinyN.toLocaleString('en-US')} visitors per arm, about ${F.tinyDays} days. At 100 a day that is ${Math.round((2 * F.tinyN) / 100).toLocaleString('en-US')} days. Small user bases cannot detect small lifts.`,
    },
    {
      q: 'Someone counts page views of a monthly report for one week across everyone who ever signed up, and reports that the feature is hardly used. What is the problem?',
      options: [
        'The measurement design decides the answer: page views, a short window and accounts that never returned each change the count',
        'There is no problem, because a number that comes from real logs is evidence whatever was counted, over whatever window',
        'The feature must be popular, because page views are the best sign of use and any count is a good sign',
        'The only problem is the sample, which is too small to say anything about any feature at all',
      ],
      answer: 0,
      why: `The default design reports ${F.badShare}% and the fair one ${F.fairShare}% for the same invented product. A number needs a definition of "used", a window that covers the feature's cycle and the right accounts.`,
    },
  ],
};

export default lesson;
