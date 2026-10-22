import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'How much rigour a decision deserves is one view, and the model prices it: the cost to undo it against the chance of being wrong. In this model there is a crossover cost below which deciding now beats any review, and the page prints that crossover, the best hours of rigour and the assumptions that move them, never a bare verdict.',
    what: `You place ten invented decisions by how costly they are to undo and how sure you are, then the page reveals the model's numbers for each. A curve shows the expected cost of a decision against hours of rigour, with the crossover below which deliberating costs more than it saves. A third scene shows a two-way door closing as adoption raises the cost to undo, and five techniques that make a door wider, each with its set-up cost and whether it pays. A last scene is a queue-service choice with the price of each option visible. The figures are invented.`,
    analogy: 'Choosing a paint colour for a bedroom or a load-bearing wall for an extension: the paint can be redone on a weekend, so you try a swatch and decide, while the wall costs months to undo, so you get the survey first; how long you spend should follow how hard it is to take back.',
    useCases: [
      'Deciding how long to review a choice before making it',
      'Seeing which assumption moves the point at which more review stops paying',
      'Pricing a technique that makes a decision cheaper to undo against its set-up cost',
      'Noticing the month a decision stops being easy to take back',
    ],
    why: 'In this model, the same review time has very different value for a function name and a database engine. Writing the cost to undo, the chance of being wrong and the price of an hour of review as inputs shows which of them the answer hangs on, and where the crossover sits.',
    watch: 'On Place ten decisions the learner puts each in one of four cells and, once all are placed, a table gives the model numbers. On The rigour curve the blue line is the expected cost against hours of rigour, with a red dot at no rigour, a green dot at the best rigour and a highlighted dot at your hours; a second plot shows the best rigour against the cost to undo with a grey dashed line at the crossover. On Doors that close the blue line is the cost to undo over the months and the grey line the crossover; in the table a technique that pays is green and one that does not is orange. On the queue service a meter is blue while fine and red past its edge.',
  },
  tryThis: [
    `From a fresh load, place all ${F.decisions} decisions in any cells, then read the table: rigour pays for ${F.deliberate} of them, and for the database engine the crossover is ${F.dbCrossover} hours, the best rigour ${F.dbBest} hours and the expected cost ${F.dbBestTotal} against ${F.dbNone} with none. Press the reference button for one view of the cells.`,
    `Open The rigour curve (it opens on the database engine, ${F.dbUndo} hours to undo, ${F.dbChance}% chance wrong, tau ${F.tau} h, w ${F.w}): move your rigour r to 33 hours and the expected cost falls from ${F.dbNone} to ${F.dbAt33}; move it to 80 and it rises again to ${F.dbAt80}.`,
    `Switch the decision picker to Rename (your rigour is still at 80): it reads decide now, with a crossover of ${F.renameCrossover} hours against 1 to undo, and your 80 hours cost ${F.renameAt80} against ${F.renameNone}.`,
    `Raise the chance wrong p0 on the rename from 30% to 90%: it is still decide now, because the crossover is ${F.renameSureCrossover} hours and the cost to undo is 1.`,
    `Open Doors that close (cost to undo today 20, growth 10% a month, from a fresh scene): the door closes at month ${F.doorMonth}, so at month 3 it costs ${F.doorCostAt3} hours against a crossover of ${F.doorCrossover}; then pick Adapter layer on the database engine and read that it saves ${F.adapterSaving} hours against ${F.adapterSetup} to set up, so it does not pay.`,
  ],
  keyIdeas: [
    `Rigour has a price and so does a mistake: in this model the database engine (${F.dbUndo} hours to undo, ${F.dbChance}% chance wrong) is best decided after ${F.dbBest} hours of rigour, at ${F.dbBestTotal} expected hours against ${F.dbNone} with none, while a ${F.week}-hour review of the one-hour rename costs ${F.weekCost} against ${F.renameNone} to decide now (matching rigour to how hard a decision is to undo is common practice).`,
    `It depends on the cost to undo against a crossover of tau times w over p0: the database engine's crossover is ${F.dbCrossover} hours, and a rename stays decide-now even at a 90% chance of being wrong (crossover ${F.renameSureCrossover} hours against 1 to undo), so in this model doubt alone does not buy review (the one-way and two-way door framing is one view).`,
    `A door can close: with ${F.doorCrossover} hours as the crossover and a cost to undo of 20 growing 10% a month, a two-way door turns one-way at month ${F.doorMonth} (one view: reversibility can change over time).`,
    `A technique can cost more than it saves: in this model its saving is tau times w times ln(1 / factor), ${F.adapterClosed} hours for a factor of 0.5, whatever the size of the decision, as long as the cost to undo after the technique is still above the crossover, so the adapter layer's ${F.adapterSetup} set-up hours lose and the pilot's ${F.pilotSetup} win by a narrow margin (the figures are invented).`,
  ],
  quiz: [
    {
      q: `A decision takes 1 hour to undo and has a 30% chance of being wrong. What does the model say about a week (${F.week} hours) of review?`,
      options: [
        'Worth it, because a 30% chance of being wrong is too high to leave unchecked',
        `Not worth it: being wrong costs ${F.renameNone} hours on average, far less than ${F.week} hours of review`,
        'Worth it, because review also makes the next decision of this kind cheaper to undo',
        'Worth it once the chance of being wrong passes 50%, whatever the cost to undo is',
      ],
      answer: 1,
      why: `The expected cost of deciding now is 0.3 x 1 = ${F.renameNone} hours, so ${F.week} hours of review cost ${F.weekCost}. Even at a 90% chance of being wrong the crossover is ${F.renameSureCrossover} hours, above the 1 hour to undo, so doubt alone does not buy review here.`,
    },
    {
      q: 'When is deliberating before choosing the database engine worth it in the lesson\'s model?',
      options: [
        'It depends on the cost to undo against the crossover, tau times w over p0',
        'When many products rest on the engine, since impact alone sets how much rigour it deserves',
        'When the chance of being wrong is above 50%, because doubt alone justifies the hours',
        'When the team has already agreed a shortlist, because agreement lowers the price of rigour',
      ],
      answer: 0,
      why: `The condition is that p0 x C is greater than tau x w, which is the cost to undo against the crossover (${F.dbCrossover} hours for the database engine at ${F.dbChance}% chance wrong). Impact enters through the cost to undo, doubt alone does not decide it, and agreement is not an input of the model.`,
    },
    {
      q: 'With the chance of being wrong held at 40%, a door that is two-way today becomes one-way in month 3. What changed?',
      options: [
        'The price of an hour of rigour rose each month, so deliberating got dearer',
        'Rigour got slower to work, so more hours were needed to cut the risk',
        'Adoption raised the cost to undo past the crossover, tau times w over p0',
        'The chance of being wrong rose month by month, which lowered the crossover',
      ],
      answer: 2,
      why: `A dearer hour or slower rigour raises the crossover, which would keep the door two-way for longer, and the chance of being wrong was held at 40%. What moved is the cost to undo: from 20 growing 10% a month it reaches ${F.doorCrossover} hours at month ${F.doorMonth}.`,
    },
    {
      q: 'With p0 = 0.4, tau = 10, w = 1 and C = 200, how many hours of rigour minimise the expected cost?',
      options: [
        `About ${F.quizBest} hours, which is tau times the natural log of the ratio ${F.quizRatio}`,
        `${F.quizNone} hours, which is p0 times C, the expected cost of deciding now`,
        `${F.quizRatio} hours, which is the ratio inside the logarithm and nothing more`,
        '200 hours, which is the whole cost of undoing the decision itself',
      ],
      answer: 0,
      why: `The best rigour is r* = tau x ln(p0 x C / (tau x w)) = 10 x ln ${F.quizRatio} = ${F.quizBest} hours, at an expected cost of ${F.quizBestTotal}. ${F.quizNone} is the cost with no rigour, ${F.quizRatio} is the number inside the logarithm, and 200 is the cost to undo, which is not hours of rigour.`,
    },
    {
      q: 'With p0 = 0.35, tau = 10 h and w = 1, a technique cuts the cost to undo from 800 to 400 hours and takes 12 hours to set up. Does it pay?',
      options: [
        'Yes: halving the cost to undo cuts the cost of deciding now from 280 to 140 hours',
        `No: at the best rigour on each side it saves ${F.adapterSaving} expected hours and costs 12`,
        'Yes, because 12 hours is far less than half of the 800 hours it takes to undo',
        'It depends on how much slack the team has, which the model counts as an input',
      ],
      answer: 1,
      why: `The 140-hour drop is the saving at no rigour, but you would not decide at no rigour. At the best rigour the saving is tau x w x ln 2 = ${F.adapterClosed} hours (${F.dbBestTotal} before, ${F.adapterAfter} after), below the 12 it costs, and 12 against 800 compares the wrong quantities. Slack is not an input of the model.`,
    },
  ],
};

export default lesson;
