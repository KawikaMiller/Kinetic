import type { LessonModule } from '../../core/types';
import { pctText } from '../distributions/fmt';
import { hours, minutes, perWeek } from './frames';
import {
  DEFINITIONS_DEFAULT, LOG_SEED, PIPELINE_DEFAULT, QA_GATE_HOURS, SCENE1_SEED, SPLIT_FACTOR, logMetrics, makeLog, reportedMetrics, runDelivery, type Definitions,
} from './model';
import { Stage } from './Stage';

const DEFAULT_RUN = runDelivery(PIPELINE_DEFAULT, SCENE1_SEED);
const SINGLE_RUN = runDelivery({ ...PIPELINE_DEFAULT, batch: 1 }, SCENE1_SEED);
const SPLIT = reportedMetrics(DEFAULT_RUN, 'split');
const LOG = makeLog(LOG_SEED);
const logAt = (over: Partial<Definitions>) => logMetrics(LOG, { ...DEFINITIONS_DEFAULT, ...over });
const MERGE_LEAD = logAt({});
const COMMIT_LEAD = logAt({ leadStart: 'commit' });
const ROLLBACKS = logAt({});
const INCIDENTS = logAt({ failure: 'incident' });

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Four measures describe how well a team ships: how often it deploys, how long a change takes to reach production, how often a release fails and how fast it recovers; they are useful for a team\'s own trend and misleading as a target or a league table.',
    what: `The DORA research programme (Forsgren, Humble and Kim, Accelerate, 2018) reported four measures that travel together: deployment frequency and lead time for changes, which describe throughput, and change failure rate and time to restore, which describe stability. In a simulated team here, a smaller batch moves all four the good way, but that is built into the model, not proved by it. On a log of deployments the numbers also depend on definitions you choose, such as where lead time starts or what counts as a failure, and a team can move a number without improving anything.`,
    analogy: 'A fitness tracker: steps, heart rate and sleep tell you a lot about your own week against last month, and almost nothing about whether you are fitter than a stranger, or about the day you strap it to the dog to hit a step target.',
    useCases: [
      'Spotting whether smaller batches and faster pipelines are paying off for one team over time',
      'Agreeing what counts as a failure or a start of lead time before reading a dashboard',
      'Recognising a gamed metric: splitting deploys, redefining failure, or counting only rollbacks',
      'Reading a median beside a mean to see how much a few slow changes skew a number',
    ],
    why: 'Delivery metrics shape what teams do, so a number with a vague definition or a ranking attached gets optimised instead of understood. Knowing what each measure counts, how a definition choice moves it and how it can be gamed lets you use it for a team\'s own improvement, which is what it is good for.',
    watch: 'A simulated pipeline: each gauge is green in its good band, yellow between and red in its poor band (the bands are illustrative, never DORA\'s own). When a team games a number, the reported value is orange and the real measure beside it is blue. Measure it from data: a green tick on the timeline is a deploy that did not fail under your definition, a red tick a failed deploy and an orange tick a rollback; a bar under it is the time to restore. Rows tinted red in the table are failures, and the column headers sort.',
  },
  tryThis: [
    `In A simulated pipeline at the defaults, ${PIPELINE_DEFAULT.batch} changes to a release gives ${perWeek(DEFAULT_RUN.deploymentsPerWeek)}, a median ${hours(DEFAULT_RUN.leadHoursMedian!)} from merge to live, ${pctText(DEFAULT_RUN.failureRate!, 0)} of releases failing and ${DEFAULT_RUN.restoreMedianMin === null ? 'no restore time' : minutes(DEFAULT_RUN.restoreMedianMin)} to restore.`,
    `Drag Batch size down to 1: all four move the good way, to ${perWeek(SINGLE_RUN.deploymentsPerWeek)}, ${hours(SINGLE_RUN.leadHoursMedian!)}, ${pctText(SINGLE_RUN.failureRate!, 0)} and ${SINGLE_RUN.restoreMedianMin === null ? 'no failures to restore' : minutes(SINGLE_RUN.restoreMedianMin)}, because the model is built that way.`,
    `Turn the Manual QA gate off: every change gets ${QA_GATE_HOURS} working hours faster, and the median lead time falls from ${hours(DEFAULT_RUN.leadHoursMedian!)} by exactly that.`,
    `Pick "split into five deploys": deployment frequency reads ${perWeek(SPLIT.deploymentsPerWeek)} (${SPLIT_FACTOR}×) and the merge-to-live time stays ${hours(DEFAULT_RUN.leadHoursMedian!)}.`,
    `In Measure it from data, switch "Lead time starts at" to first commit: the median goes from ${hours(MERGE_LEAD.leadMedian)} to ${hours(COMMIT_LEAD.leadMedian)}. Then set "A failure is" to linked to an incident: ${ROLLBACKS.failures} failures become ${INCIDENTS.failures}.`,
  ],
  keyIdeas: [
    'Two measures describe throughput (deployment frequency, lead time) and two stability (change failure rate, time to restore); in this model a smaller batch improves all four by construction.',
    'Definitions are choices: lead time from the first commit, the pull request or the merge, and a failure as a rollback, a hotfix or an incident, give different numbers from the same log.',
    `In this model splitting each change into ${SPLIT_FACTOR} deploys multiplies deployment frequency by ${SPLIT_FACTOR} while merge-to-live time does not move, and counting only rollbacks lowers the failure rate with nothing improved.`,
    'These measure a team\'s own delivery over time, not people, and are no basis for ranking teams; a median beside the mean shows how far a few slow changes skew a number.',
  ],
  quiz: [
    {
      q: 'A manager ranks four teams in a league table by their DORA numbers. What is wrong with that?',
      options: [
        'The numbers depend on definitions and context, so they fit a team\'s own trend, not a ranking',
        'Nothing, since the four measures are defined the same way in every team',
        'Deployment frequency by itself would be a fairer basis for the ranking',
        'The numbers are valid only for teams that deploy more than once a week',
      ],
      answer: 0,
      why: 'Where lead time starts or what counts as a failure varies from team to team, and so do the product and the risk. A team\'s own numbers over time show whether it is improving; one team\'s numbers beside another\'s mostly show the definitions.',
    },
    {
      q: 'A team raises its deployment frequency fivefold by splitting each change into five deploys, and the five pieces still ship together, as one change. What improved?',
      options: [
        'Nothing real: the count rose, while the time from merge to live did not move',
        'Delivery speed, since five deploys are five times as fast as one',
        'Stability, since each of the five deploys is now a smaller risk',
        'Lead time, since each piece now ships on its own, ahead of the rest',
      ],
      answer: 0,
      why: 'Deployment frequency counts deploys, so splitting inflates it. The five pieces go out together, so the merge-to-live time, the failure rate and the restore time are untouched; real batch size is what the metric is meant to reflect.',
    },
    {
      q: 'A team is told to cut its change failure rate and starts counting only rollbacks as failures. What happens?',
      options: [
        'The rate falls, and delivery is no more stable than before',
        'The rate falls, because fewer defects now reach production',
        'The rate is unchanged, since fixes made forward were counted already',
        'The rate rises, since a rollback is the most visible failure',
      ],
      answer: 0,
      why: 'A failure fixed by a hotfix no longer counts, so the number drops with the same defects shipping. When a number becomes a target the definition bends to it, which is why it is read with its definition beside it.',
    },
    {
      q: 'On one log of deployments, lead time from the first commit is longer than from the merge. Why?',
      options: [
        'It includes the time spent coding and in review before the merge',
        'The log is wrong, since one deployment has just one lead time',
        'The first commit is made later than the merge in the usual flow',
        'Merging is slower than deploying, so the merge adds to the total',
      ],
      answer: 0,
      why: 'Each start point is a different moment on the same timeline, so the commit comes before the pull request, which comes before the merge. Both numbers are right for their definitions, and the label has to say which one it is.',
    },
  ],
};

export default lesson;

