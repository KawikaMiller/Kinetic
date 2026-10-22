import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The same feature can come out different from a batch pipeline and a streaming pipeline even when the code looks alike, because window edges, late events, day boundaries and nulls are event-time decisions; and a training table that joins a label to a future value reports an offline score that, on the datasets on this page, does not survive deployment.',
    what: 'A feature such as orders in the last 7 days is a function of an event log and an as-of time. A batch (offline) pipeline and a streaming (online) pipeline each answer it, and they can disagree on whether the window includes its start, whether events that arrived late count, where a day begins and what a missing user returns. A point-in-time-correct join gives each training row the feature value known at its label time and nothing later; a leaky join pulls in the future, so the offline metric can look better than anything that can be served, as it does on the datasets on this page. A shared feature definition removes the disagreement. This page uses a made-up event stream and two plain functions, not a real streaming system.',
    analogy: 'Two accountants close the books for the same week: one counts a sale stamped at midnight on Monday and the other does not, and one waits for late receipts while the other has already filed. Same ledger, different totals. A leaky join is marking an exam with the answer key open.',
    useCases: [
      'Debugging a model that scores well offline and badly in production when no code changed',
      'Reviewing how a training set was built from timestamped feature tables',
      'Deciding whether a feature should be defined once and served to both training and serving',
      'Writing a test that compares a batch and a streaming computation of one feature on one event log',
    ],
    why: 'A data path is a common place for production ML to go wrong, alongside the model: two pipelines that quietly disagree, or a training table built with information from the future. The toy here turns each cause into a counted fraction of rows and a measured AUC gap, so you can name the cause instead of suspecting the model.',
    watch: 'Green marks a row where the pipelines agree and red a row where they differ; the batch (offline) column is sky blue and the streaming (online) column amber, two plain categories rather than verdicts. On the event timeline a violet dot is a late event, a yellow dot is an event exactly on the window start, ordinary events are sky blue and the blue band is the window. In the join table a red value is stamped after its label time, a green one equals the point-in-time value and an uncoloured one is neither; the AUC bars are red for the leaky feature, green for the honest feature and blue for what is served, which is the same number as the green one.',
  },
  tryThis: [
    'In Two pipelines, one number (all four skew sources off, seed 4) the diff meter reads 0 of 920 rows.',
    'Turn on window boundary: 8 of 920 rows differ, and the first is user 1 at day 7 12:00, where an event at day 0 12:00 sits exactly on the window start. Turn on late events as well: 18 of 920 rows differ.',
    'Turn on all four sources, then choose one shared definition: the meter returns to 0 of 920, whatever the toggles say.',
    'In Point-in-time join the correct join gives 2, 5, 9. Choose "latest in the log": 9, 9, 9. Then read the three AUC numbers on seed 4, which come from a separate dataset and do not follow the Join buttons: 0.927 for the leaky feature, 0.736 for the honest feature and 0.736 online, the same number because a positive-weight model keeps the ranking.',
  ],
  keyIdeas: [
    'Two pipelines can use the same function and still disagree, because window edges, late arrivals, day boundaries and null handling are event-time rules: on the page\'s seeded data each source alone makes 8, 10, 46 and 115 of 920 rows differ.',
    'A shared definition (a half-open window, events counted once they had arrived by the as-of time, UTC days, null as 0) makes both pipelines one function, and the tests check that they agree on 920 of 920 rows on 200 seeded datasets.',
    'A point-in-time join gives a label at time t the latest feature value stamped at or before t; the leaky joins use a value stamped later, which no serving system has at time t.',
    'On these datasets a leaky feature scores AUC 0.927 offline against 0.736 for the honest one, and a served model sees the honest feature alone, so the offline score was not going to be reproduced; this is measured on a made-up stream, not a general rule.',
  ],
  quiz: [
    {
      q: 'Two pipelines compute orders_7d from one event log with the same function, yet the numbers differ. What is a likely cause?',
      options: [
        'They differ in event-time details, such as window edges or events that arrived late',
        'The code is the same, so the data in the world must have changed between the runs',
        'The online pipeline uses another programming language, so it counts events differently',
        'The offline numbers are rounded to whole numbers before they are compared with online ones',
      ],
      answer: 0,
      why: 'Window edges, late arrivals, day boundaries and null handling are rules about time, not about code text. On the page each source alone makes between 8 and 115 of 920 rows differ with the same function and one rule changed.',
    },
    {
      q: 'A label is at time 25. The feature log has values at times 10, 20 and 30. What does a point-in-time-correct join use?',
      options: [
        'The value from time 20, the latest at or before the label',
        'The value from time 30, the latest in the log, since it is the freshest one',
        'The value from time 10, the first in the log, since it was recorded earliest',
        'The average of the three logged values, since that smooths out the changes',
      ],
      answer: 0,
      why: 'Time 30 is after the label, so using it leaks the future into the row. The log\'s values are 2, 5 and 9, so a label at time 25 gets 5.',
    },
    {
      q: 'A model scores a high AUC offline with a leaky join and falls apart after deployment. What does that show?',
      options: [
        'The offline metric used information not available when serving, so it never measured the deployed model',
        'The model forgot some of what it had learned during the time it spent deployed',
        'The serving hardware is slower than the training hardware, which lowers the quality of its predictions',
        'The AUC formula does not apply once a model is online, so another formula is needed',
      ],
      answer: 0,
      why: 'In the page\'s seeded set the leaky feature scores 0.927 and the honest one 0.736. A served model sees the honest feature alone, so it scores the same 0.736 as that feature alone.',
    },
    {
      q: 'What does a shared feature definition buy?',
      options: [
        'One definition of window, lateness and nulls for both, so training and serving cannot drift apart',
        'It removes late events from the data, so the pipelines have nothing left to disagree on',
        'It makes the model more accurate by itself, whatever the data looks like at training or serving time',
        'It removes the need to test the pipelines, since they now run the same code',
      ],
      answer: 0,
      why: 'Both pipelines call one function: the page shows 0 of 920 rows differing with the four skew sources switched on. It does not remove late events or improve the model; it removes one way for two pipelines to disagree.',
    },
  ],
};

export default lesson;
