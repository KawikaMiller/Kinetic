import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Fairness criteria are measurable gaps between groups; on data where the groups differ they conflict, a model with no group column can still treat groups differently, and which gap to close is a values and legal choice, not a maths result.',
    what: `You start with a synthetic lending data set of 2,000 applicants in two neutral groups, A and B, scored by a simple model. One threshold produces a confusion matrix per group and every standard criterion (demographic parity, equal opportunity, equalised odds, predictive parity, calibration within groups) is computed live. A search over group thresholds shows that on this data no worthwhile pair makes the rates equal together, five responses (one threshold, two kinds of group thresholds, reweighing, dropping the group column) are shown with who gains and who pays, three toys show where bias comes from, and an invented product team picks a criterion to report. The data, the groups and the team are invented, and the lesson recommends no default.`,
    analogy: 'Two classes sit the same exam and one class scores lower on average. You can curve each class to the same pass rate, to the same pass rate among students who studied, or to the same meaning of a pass; each curve helps some students and costs others, and which is fair depends on what you value.',
    useCases: [
      'Reading the metrics in a model audit and asking which groups each one compares',
      'Explaining why removing a sensitive column does not settle a fairness question',
      'Choosing which gap to report, and being clear about what that choice gives up',
      'Spotting representation, label and feedback problems before blaming the algorithm',
    ],
    why: 'Fairness arguments often fail because people use one word for several measurements. Computing each criterion on the same rows shows what each one asks, why they conflict, and what a mitigation costs, so the decision is made openly, with the people and the law that have a say.',
    watch: 'Group A is amber and group B is sky blue, plain tones that never mean good or bad. In the confusion matrices right answers are green, false alarms red and misses orange. In the criteria table a criterion that holds is green and one that does not is red. On You cannot have all of them the grey dots are worthwhile pairs of group cut-offs, the yellow dot is your pair and the green ringed dot at the origin is where everything would be equal. In the reliability plot the grey dashed line is perfect calibration. On Where bias comes from, group A and B keep their tones. In the choosing story each meter is blue while fine and red past its edge.',
  },
  tryThis: [
    `One threshold, from a fresh load (0.50): group A is approved at ${F.selectionA} and group B at ${F.selectionB}, the true-positive rates are ${F.tprGap} points apart, and ${F.holding} of ${F.criteria} criteria hold. Drag the threshold to 0.80 and ${F.holdingHigh} of ${F.criteria} hold.`,
    `You cannot have all of them, from a fresh load (different base rates, imperfect scorer, equalising the true-positive rate): press "Find group B's cut-off": the true-positive gap falls to ${F.foundTprGap} points while the precision gap is ${F.foundPrecisionGap}. The closest any pair gets to equal on three criteria is ${F.worstDefault} points; switch the scorer to Perfect and it is ${F.worstPerfect}.`,
    `Options and trade-offs, from a fresh load: pick "Equal approval rate". The approval gap goes from ${F.plainApprovalGap} to ${F.selectionGapAfter} points, while the false-positive gap is ${F.selectionFprGap}, the precision gap ${F.selectionPrecisionGap} and accuracy falls from ${F.plainAccuracy} to ${F.selectionAccuracy}. Then pick "Drop the group column": its approval gap is ${F.unawareApprovalGap} points, and with the proxy dragged to 3.0 it is ${F.unawareProxyGap}.`,
    `Where bias comes from, from a fresh load: with group B at ${F.repShare}% of the training data its error is ${F.repSmallB}; drag the share to 50% and it falls to ${F.repLargeB}. With ${F.labelNoise}% label noise for B, it looks ${F.apparentB} accurate against the biased labels and ${F.actualB} against what really happened.`,
    `Choosing a metric, from a fresh load: pick "Report demographic parity" and Continue. Group B approved reads ${F.parityApprovedB}% (it was ${F.startApprovedB}%), creditworthy denied reads ${F.parityDenied} (it was ${F.startDenied}), and defaulters approved reads ${F.parityDefaulters}. No ending is marked correct.`,
  ],
  keyIdeas: [
    `Each criterion is a measurable gap: at a cut-off of 0.50 group A is approved at ${F.selectionA} and group B at ${F.selectionB}, and ${F.holding} of ${F.criteria} criteria hold (rates within 3 points, a chosen tolerance; calibration within its sampling noise). They are standard definitions, and which one matters is a values and legal question.`,
    `In this model with different base rates and an imperfect scorer, the criteria conflict: no worthwhile pair of cut-offs gets closer than ${F.worstDefault} points on true-positive rate, false-positive rate and precision together, against ${F.worstEqual} with equal base rates and ${F.worstPerfect} with a perfect scorer (a result from the research literature, from memory).`,
    `Dropping the group column does not remove a gap when another feature reveals the group: the approval gap is ${F.unawareApprovalGap} points with no proxy and ${F.unawareProxyGap} with a strong one, against ${F.plainApprovalGap} for the plain scorer. Equalising approval rates costs accuracy (${F.plainAccuracy} to ${F.selectionAccuracy}) and moves other gaps.`,
    `Bias can enter before any threshold: a group that is ${F.repShare}% of the training data has a ${F.repSmallB} error in the toy, noisier labels make a group look ${F.apparentB} accurate when it is ${F.actualB}, and a feedback loop took its training share from ${F.loopStart} to ${F.loopEnd}. These are toys that show mechanisms.`,
  ],
  quiz: [
    {
      q: 'A team removes the sensitive column from its model and says the model is now fair. What does the lesson show?',
      options: [
        'A second feature can reveal the group, so the model can still treat the groups differently',
        'Nothing changes, because a model can always recover the group from its other features',
        'The model is fair, because a model that never sees the group cannot treat the groups differently in any way',
        'The model is fair for the criteria that compare error rates, and unfair only for approval rates',
      ],
      answer: 0,
      why: `With a strong proxy the model without the group column has an approval gap of ${F.unawareProxyGap} points, almost the ${F.plainApprovalGap} of the model that sees the group. With no proxy it is ${F.unawareApprovalGap}: removing a column changes the gap but does not settle the question.`,
    },
    {
      q: `A scorer is ${F.plainAccuracy} accurate overall. What does that say about fairness between the groups?`,
      options: [
        'It says the scorer is fair, because a high accuracy means the errors are spread evenly across the groups and no group is hurt more',
        'It says nothing by itself, because the error rates can differ by group while the overall accuracy stays high',
        'It says the scorer is unfair, because accuracy over a mixed population always hides the smaller group',
        'It says the groups are treated alike on average, which is the same as equal treatment of each applicant',
      ],
      answer: 1,
      why: `At the same cut-off the true-positive rates are ${F.tprGap} points apart between the groups. Accuracy is one number over everyone, and criteria compare groups separately.`,
    },
    {
      q: 'Equal true-positive rates, equal false-positive rates and equal precision are all attractive. Can a scorer have all three, with different base rates and an imperfect model?',
      options: [
        'Yes, if the team tunes the cut-offs carefully enough, because each criterion has its own dial to adjust and the dials do not interact',
        'No, it is a bug in the data, because a well-built model satisfies every criterion at once',
        `Not in general: the criteria conflict, and the closest any worthwhile pair of cut-offs gets here is about ${F.worstDefault} points`,
        'Only if the scorer is retrained on more data, because the conflict goes away as the training set grows',
      ],
      answer: 2,
      why: `With different base rates and an imperfect scorer the closest any worthwhile pair of cut-offs comes to equal true-positive rate, false-positive rate and precision is ${F.worstDefault} points; with a perfect scorer it is ${F.worstPerfect}. This is a research result quoted from memory.`,
    },
    {
      q: 'The invented product team asks which fairness criterion to report. What does the lesson say?',
      options: [
        'It marks no ending as correct: each choice improves some numbers and gives up others, and the choice is a values and legal question',
        'Demographic parity, because equal approval rates are the clearest to explain to a regulator or the public, which settles it',
        'Equalised odds, because it compares both kinds of error and so covers every other criterion at once',
        'Predictive parity, because an approval then means the same thing for both groups and nothing else matters',
      ],
      answer: 0,
      why: `Reporting demographic parity raises group B's approvals from ${F.startApprovedB}% to ${F.parityApprovedB}% and lowers creditworthy denials from ${F.startDenied} to ${F.parityDenied}, and defaulters approved rise to ${F.parityDefaulters}. Each other choice trades differently.`,
    },
  ],
};

export default lesson;
