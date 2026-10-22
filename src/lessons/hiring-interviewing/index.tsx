import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: `A hiring loop is a measuring instrument with noise, and a toy computes how much: in this model three interviewers at an error of ${F.sigma} each find about ${F.recallDefault}% of the true top ${F.hire}%, one finds fewer than half, and errors that move together are worth fewer interviewers than the panel has. The constants are invented, so the numbers are arithmetic and not evidence about any real process.`,
    what: `Candidates have a hidden skill, and each interviewer scores it plus an error. A scatter shows a panel hiring the top slice, who is missed and who is a false hire, with the correlation and recall from the formula beside the seeded pool's measurement. A funnel of three stages shows where a loop loses the people it was built to find, and what a stage with no signal does. A third scene gives eight interviewers their own leniency and treats an anchored rubric as an input you set. A last scene is a debrief with one strong no, with the price of each option visible.`,
    analogy: 'Weighing flour with a kitchen scale that wobbles: one reading of a bag can be off by a lot, the average of several independent readings settles near the truth, and three readings taken while leaning on the same shelf wobble together and tell you little more than one.',
    useCases: [
      'Judging how many interviewers a panel needs before another adds little',
      'Seeing why interviewers who agree before scoring are worth fewer opinions',
      'Finding where a hiring loop loses the people it was built to find',
      'Pricing a debrief choice, such as deciding on the average, against the days and goodwill it costs',
    ],
    why: 'In this toy, a hiring decision is a measurement with error. Writing the noise per interview, the number of independent opinions and the size of the cut as inputs shows how much of the answer is the instrument and how much is the candidate.',
    watch: 'On One panel, one decision each dot is a candidate: green for one hired from the true top group, red for one in the true top group who was missed, orange for a false hire (hired, outside the true top group) and grey for the rest, with a grey dashed hire line. On Design the loop each card has a grey bar for the share of the pool alive and a blue bar for the share of the true top group alive. On Calibrate the interviewers a blue bar is an interviewer\'s mean score, with a grey dashed line at the average of the eight. On the debrief a meter is blue while fine and red past its edge.',
  },
  tryThis: [
    `From a fresh load (seed ${F.seed}, ${F.k} interviewers, error ${F.sigma}, hire ${F.hire}%), read the stats: r is ${F.rDefault} and the formula puts recall at ${F.recallDefault}% (${F.recallDefaultPool}% in this pool): even three interviewers miss ${F.missDefault}% of the true top ${F.hire}%.`,
    `Set interviewers k to 1: r falls to ${F.rK1} and recall to ${F.recallK1}%; set k to 9 and r reads ${F.rK9} and recall ${F.recallK9}%.`,
    `Set k back to 3, then raise the agreement control to 0.5: r falls to ${F.rRho}, recall to ${F.recallRho}%, and the independent interviewers read ${F.effectiveRho}.`,
    `Open Design the loop and switch on No signal at the phone screen: the true top 10% found at the end falls from ${F.funnelRecall} to ${F.funnelNoPhoneRecall}, and the mean skill hired from ${F.funnelMean} to ${F.funnelNoPhoneMean} (seed ${F.seed}, a pool of 20,000).`,
    `Open Calibrate the interviewers and switch on the anchored rubric: the spread of the eight means falls from ${F.spreadLoose} to ${F.spreadTight}; then read the one-candidate table, ${F.lenientChance}% with a lenient interviewer against ${F.strictChance}% with a strict one.`,
  ],
  keyIdeas: [
    `One interview misses more than half in this model: at an error of 1 the formula finds ${F.oneRecall}% of the true top ${F.hire}%, three interviewers at ${F.sigma} find ${F.recallDefault}% and nine find ${F.recallK9}% (averaging independent noisy scores raises their correlation with the truth; the constants are invented).`,
    `Quadrupling the panel halves the noise, and agreement costs: four interviewers at an error of 1 correlate ${F.fourR} with skill, but with errors that move together at 0.5 they correlate ${F.fourAgreeingR} and are worth ${F.fourAgreeingEffective} independent interviewers (scoring before discussing is common practice).`,
    `A loop loses its best where a stage has no signal: in this loop, switching the phone screen to pure noise takes the true top group found from ${F.funnelRecall} to ${F.funnelNoPhoneRecall} and the mean skill hired from ${F.funnelMean} to ${F.funnelNoPhoneMean}.`,
    `The same candidate clears the bar ${F.lenientChance}% of the time with a lenient interviewer and ${F.strictChance}% with a strict one, and a rubric is an input in this model, a smaller leniency spread you set, so the toy shows what it would do and cannot show that it works (reports that structured interviews predict job performance better are research findings the toy cannot test).`,
  ],
  quiz: [
    {
      q: 'In the toy, with an error of 1 per interview, one interview picks out what share of the true top 10%?',
      options: [
        'About 95%, since a good interviewer sees skill clearly',
        `About ${F.oneRecall}%, which is fewer than half of the true top group`,
        'About 10%, which is the same as picking people at random from the pool',
        `About ${Math.round(Number(F.oneR) * 100)}%, which is the same number as the correlation r`,
      ],
      answer: 1,
      why: `The exact recall at r = ${F.oneR} is ${F.oneRecall}%. A correlation of ${F.oneR} is not a recall of ${Math.round(Number(F.oneR) * 100)}%, 10% is the recall of a score with no signal, and the toy has no interviewer who sees skill without error.`,
    },
    {
      q: 'When does a fifth interviewer add the most information in the toy?',
      options: [
        'It depends on whether their errors are independent of the rest of the panel',
        'When the other four have small errors, since precise scores gain the most from a fifth',
        'Never: the correlation with skill stops improving once a panel has four people in it',
        'When the fifth is more senior than the other four, because rank sharpens a score',
      ],
      answer: 0,
      why: `Independence is what makes an extra score count: four interviewers at an error of 1 correlate ${F.fourR} with skill, but with errors correlated at 0.5 they are worth ${F.fourAgreeingEffective} independent interviewers. The correlation keeps rising past four (${F.rK9} at nine at an error of 1.2 against ${F.rDefault} at three), noisier scores gain more correlation from a fifth than precise ones (a statement about r: the gain in recall is not steady in the error), and rank is not in the model.`,
    },
    {
      q: 'Why does the lesson say it shows the arithmetic, not evidence that rubrics work?',
      options: [
        'Rubrics are known not to work in practice, and the toy shows this in its numbers',
        'A rubric lowers the leniency spread by assumption, so the toy cannot test it',
        'The numbers were measured on a small pool of real candidates only',
        'Rubrics matter for senior roles, which the toy leaves out of its pool',
      ],
      answer: 1,
      why: 'The anchored rubric is a smaller leniency spread that you set, so a result that rubrics help would follow from the input and prove nothing. The pool and the constants are invented, not measured, and the toy says nothing against rubrics or about seniority.',
    },
    {
      q: 'With k = 4, sigma = 1 and the interviewers\' errors correlated at 0.5, how many independent interviewers is the panel worth?',
      options: [
        '4, because four people sat on the panel in the room',
        '2, which is half of them, since the correlation is one half',
        `${F.fourAgreeingEffective}, which is 4 divided by the factor (1 + 3 x 0.5)`,
        '0.5, because errors that move together cancel one another out',
      ],
      answer: 2,
      why: `The panel is worth k / (1 + (k − 1) rho) = 4 / 2.5 = ${F.fourAgreeingEffective} independent interviewers, and its correlation with skill is ${F.fourAgreeingR}, between one interview (${F.oneR}) and four independent ones (${F.fourR}). Shared errors do not cancel and a correlation of one half is not a halving.`,
    },
    {
      q: 'In the debrief, deciding by the average now is chosen. When is that defensible in the scenario?',
      options: [
        'When the scores are independent of one another and the bar for hiring is clear to all',
        'When the dissenter is the most junior person, because a junior no counts for less',
        'When the average is high, since a high average means no concern is hiding in it',
        'When the panel has argued for a long time, since more talk adds no information',
      ],
      answer: 0,
      why: 'An average is a fair summary of independent scores against a clear bar, which is the condition the scenario states for it; the scenario has no meter for how cheap a call is to undo. With one strong dissent the average hides the reason, so a high average does not rule out a concern. Rank and the length of the argument are not what makes the average fair.',
    },
  ],
};

export default lesson;
