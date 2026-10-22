import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An estimate is a range with a confidence, not a promise: adding up single-number task estimates gives a date that a simulation says is often missed, and a shared cause keeps the range wide.',
    what: `You start with the cone of uncertainty, a research finding (from memory) about how wide an estimate can be at each project phase. Then you add up ${F.tasks} invented tasks, each with a log-normal duration, under three readings of "the estimate" (most likely, median, mean) and watch ${F.runs} seeded runs draw the real spread of the total, with a deadline whose chance of being met is read off the runs. A three-point estimate is compared with a log-normal fitted to the same numbers, you test your own 90% ranges on quantities that code computes exactly, and you answer an invented manager who asks when it will be done. Everything is a simulation of invented numbers.`,
    analogy: 'Planning a drive with traffic: the most likely time for each leg adds up to a time you rarely achieve, because a jam can add an hour to a leg and nothing takes an hour off. A range with a confidence ("most days 40 to 55 minutes, 90% by an hour") tells the person waiting what to plan around.',
    useCases: [
      'Answering "when will it be done?" with a range and a confidence instead of one date',
      'Seeing why a plan made of summed task estimates tends to run late',
      'Checking a plan whose tasks share a risk (an unfamiliar framework, one overloaded reviewer)',
      'Training your own sense of how wide a 90% range should be',
    ],
    why: 'Estimates become commitments the moment they are said aloud. Knowing the shape of the uncertainty (skewed, summed, shared) is what lets you say a date with its odds, push back on a single number honestly, and notice when a plan is only as safe as its most optimistic assumption.',
    watch: 'In The cone, the blue band is the estimate range at each phase, a dashed grey line marks the final outcome (1x), invented outcomes are yellow dots inside their band and red dots outside it. In Summing estimates the blue bars are the simulated project totals, bars that finish by the deadline are green, the red line is your sum of estimates, the yellow line is P50, the green lines are P80 and P90 and the dashed orange line is the deadline. In Three-point the blue bars and curve are the fitted log-normal, the violet curve and line are PERT, and the yellow line is your most likely value. In Calibration a range that held the true value is green and one that missed is red, and a refused field is orange text. In The conversation each meter is blue while it is fine and red past its edge.',
  },
  tryThis: [
    `The cone, from a fresh load: the concept band is ${F.conceptLow}x to ${F.conceptHigh}x the outcome (${F.conceptRatio} times wide) and detailed design is ${F.detailedLow}x to ${F.detailedHigh}x (${F.detailedRatio} times wide). Pick "${F.flatLabel}": ${F.flatOutside} of ${F.points} invented outcomes fall outside their band; pick "If the cone is followed" and ${F.coneOutside} do.`,
    `Summing estimates, on the defaults (${F.tasks} tasks, each estimated as its most likely value): your sum is day ${F.sumModes} and ${F.chanceAtModes}% of the runs finish by it, and the spread of the total is ${F.sdIndependent} days. Switch the estimate to Median: the sum is day ${F.sumMedians} and ${F.chanceAtMedians}% finish by it, while P50 is day ${F.p50}. Then drag the shared cause (ρ) to 0.8: the spread becomes ${F.sdCorrelated} days with the same tasks.`,
    `Three-point, on the defaults (3, 5 and 13 days): PERT gives a mean of ${F.pertMean} days and the fitted log-normal ${F.fitMean}. Change Pessimistic to 2: the page refuses, naming that most likely is larger than pessimistic.`,
    `Calibration, from a fresh load: type 1,000,000 as the low and 1,100,000 as the high for the bytes in a mebibyte, then press Score my ranges. The range held (the true value is ${F.mibValue}) and the score reads 1 of 1.`,
    `The conversation, from a fresh load: pick "Give one date", then Continue. The chance of missing the planned day reads ${F.riskDate}% and slack reads 0 days; pick "Give a range" instead and the chance reads ${F.riskRange}%.`,
  ],
  keyIdeas: [
    `An estimate is a range: in the cone the band is ${F.conceptRatio} times wide at the initial concept and ${F.detailedRatio} times wide at detailed design, a research finding from memory (one published critique reads it as a best case), and nothing in it narrows a band on its own.`,
    `Adding estimates is not estimating the total: in this model with ${F.tasks} tasks the sum of medians is day ${F.sumMedians}, yet ${F.chanceAtMedians}% of runs finish by it and the P50 of the total is day ${F.p50}. More independent tasks narrow the relative spread as 1/√n, but a shared cause keeps it wide: ${F.sdIndependent} days independently and ${F.sdCorrelated} days at ρ = 0.8.`,
    `PERT and a fitted log-normal read the same three numbers differently (${F.pertMean} against ${F.fitMean} days for the mean at 3, 5 and 13): PERT is a convention in common use, not a law. Stated 90% ranges tend to contain the truth less often than 90% of the time (a research finding, from memory), so score your own before you quote one.`,
    `Each answer to "when will it be done?" has a price in the story: the single date leaves a ${F.riskDate}% chance of missing, the range lowers that to ${F.riskRange}% and costs the manager's trust, and no answer is free.`,
  ],
  quiz: [
    {
      q: `You add up the most likely estimates of ${F.tasks} tasks and promise that date. What does the simulation say about it?`,
      options: [
        'It is the median of the total, so the team hits it about half the time',
        'It is reached in a small share of runs, because skewed tasks overrun by more than they underrun',
        'It is a safe date, because errors on single tasks cancel out when they are added',
        'It is exact, because the duration of a project is the sum of its task durations',
      ],
      answer: 1,
      why: `A task's mode sits below its median and its mean because the distribution is skewed. In this model the sum of modes is day ${F.sumModes} and ${F.chanceAtModes}% of runs finish by it; even the sum of medians, day ${F.sumMedians}, is met in ${F.chanceAtMedians}%.`,
    },
    {
      q: 'Task overruns arrive together because every task uses the same unfamiliar framework. What happens to the spread of the project total?',
      options: [
        'It shrinks as one over the square root of the number of tasks, as it does for independent tasks',
        'It disappears, because a shared cause is one risk and is easy to plan for',
        'It stays wide, because the overruns add up together instead of cancelling one another out',
        'It shrinks, because the tasks that overrun are balanced by tasks that finish early',
      ],
      answer: 2,
      why: `With the default tasks the spread of the total is ${F.sdIndependent} days when overruns are independent and ${F.sdCorrelated} days at ρ = 0.8: the shared cause is why summing independent-looking tasks understates risk.`,
    },
    {
      q: 'A plan at the "approved product definition" phase quotes the cone band of 0.5x to 2x. What does that band describe?',
      options: [
        'A published best-case range that a project has to earn by learning, not one that narrows by itself',
        'The guaranteed error of every estimate made at that phase of any software project, whatever the team or the product',
        'A measured range for your own team, taken from the last few projects that your team finished',
        'The range inside which the true cost will fall, with the same 90% confidence at every phase',
      ],
      answer: 0,
      why: 'The cone is a research finding quoted from memory about how wide estimates can be at each phase. A published critique argues it is a best case and does not narrow on its own, so it is a reason to ask what the project still has to learn.',
    },
    {
      q: 'You score 4 of 8 on your own 90% ranges. What does the lesson suggest?',
      options: [
        'Your ranges were too narrow for the confidence you claimed, so widening them is the fix to try',
        'You were unlucky, because eight ranges are too few to say anything about calibration, so the score tells you nothing',
        'Your ranges were too wide, because a calibrated person would score 8 of 8 here',
        'Your knowledge of the quantities is weak, and no change of range width could help',
      ],
      answer: 0,
      why: `If the ranges were truly 90%, about ${(0.9 * F.calibrationRows).toFixed(1)} of ${F.calibrationRows} would hold the truth. Scoring 4 or fewer of ${F.calibrationRows} would happen about 1 time in ${F.calibrationOneIn} by chance if the ranges were truly 90%, so it points to overconfidence (a research finding, from memory); eight rows is still a small sample, so repeat it.`,
    },
  ],
};

export default lesson;
