import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Delegating is handing over a task together with the context to do it, and in this invented model doing it yourself wins this week and loses after a pay-back point, while a lack of context sends work back to you.',
    what: `You are a senior engineer with 40 hours a week and four teammates of different skill. Each week six tasks arrive; you assign them, pick one of seven delegation levels and how much context to give, and watch ${F.weeks} seeded weeks: your queue, the team's throughput, each person's skill, and the pay-back point where delegating beats doing it yourself. A second scene is a feedback conversation with an invented teammate, and a third places work on an importance against unique-contribution grid. The people, tasks and every rule are made up to show a trade-off, never measurements of real people.`,
    analogy: 'Handing someone a recipe card with no notes on the oven: sometimes it works, often the dish comes back to you half done. A short note on what good looks like costs a minute and saves the redo, and the first few times you cook together it takes longer than doing it alone.',
    useCases: [
      'Deciding what to hand to whom when your own queue is overflowing',
      'Judging how much context a task needs before it leaves your hands',
      'Choosing between a quick fix yourself and a slower one that grows a teammate',
      'Preparing a feedback conversation with a specific, changeable behaviour',
    ],
    why: 'A senior engineer\'s output is the team\'s output, and the hours you spend are the scarcest input. Seeing the trade-off as numbers (briefing, review, coaching, redo) makes it easier to argue for the slower option that pays back, and to notice when you are the bottleneck.',
    watch: 'On The board, a finished task is green, a bounced task is red, and your queue is yellow, turning red points past the dashed overflow line. A task card says in violet when the assignee is at a stretch (the one band where skill grows), in red when it is far above them, in grey when it is matched, and in dim grey when it is well within reach. The four people are plain tones: Ana amber, Ben pink, Cy sky, Di orange. In the feedback conversation each meter is blue while it is fine and red past its edge. On What to delegate, work you keep is amber, work that moves to others is sky, and the grey lines split the grid at 5 and 5.',
  },
  tryThis: [
    `The board, on the defaults (delegate with context and review): ${F.defaultDone} tasks finish in ${F.weeks} weeks, ${F.defaultBounced} bounce back and your queue ends at ${F.defaultQueue}. Press "Do everything myself": your queue climbs to ${F.myselfQueue} by week ${F.weeks} while the team finishes ${F.myselfMinPerWeek} to ${F.myselfMaxPerWeek} tasks a week.`,
    `The board, on the defaults: change Context given to "No context". The same assignment, level and seed now bounce ${F.noContextBounced} tasks instead of ${F.defaultBounced}.`,
    `The board, on the defaults: the pay-back table says "Fix a flaky checkout test" with Cy pays back after ${F.flakyReps} repetitions, because it is a stretch for Cy and coaching costs hours at first.`,
    `The feedback conversation, from a fresh load: pick "Take the task back and do it yourself" and Continue. Your hours read ${F.solveHours} h, in the red, and delivery reads ${F.solveDelivery}.`,
    `What to delegate, on the defaults: ${F.moved} hours a week move to others and ${F.returned} return to you. Press "Everything is mine" and 0 hours move.`,
  ],
  keyIdeas: [
    `Delegation is the task plus the context: with the same assignment, level and seed, giving no context bounces ${F.noContextBounced} tasks back in this model against ${F.defaultBounced} with a brief, and a bounced task is rework for you.`,
    `Doing it yourself is fastest this week and slowest later: in this model the queue reaches ${F.myselfQueue} by week ${F.weeks} when you keep everything while throughput stays flat, and delegation pays back after some repetitions (${F.flakyReps} for the flaky-test task with Cy, who is stretched by it).`,
    'In this model skill grows only on a stretch task: a task well within reach teaches nothing and one far above a person causes failure, so more help is not more growth. The seven delegation levels are one view, from memory.',
    'The numbers are invented to show a trade-off, not measured from people. A feedback model such as Situation-Behaviour-Impact is common practice, credited to the Center for Creative Leadership (from memory, check the source), and each option in the conversation shows its price.',
  ],
  quiz: [
    {
      q: 'You hand a task to a teammate with no context at all. In this lesson\'s model, what happens compared with giving a short brief?',
      options: [
        'More tasks bounce back to you, because the missing context is rework you pay for later',
        'Nothing changes, because a skilled teammate fills any gap in the instructions alone',
        'Fewer tasks bounce back, because less instruction leaves the teammate more room to decide',
        'The same number bounce back, but they bounce a week later than they would with a brief',
      ],
      answer: 0,
      why: `With the same assignment, level and seed, no context bounces ${F.noContextBounced} tasks and a brief bounces ${F.defaultBounced}: briefing costs an hour and saves a redo.`,
    },
    {
      q: 'Doing a task yourself is the quickest way to finish it this week. What does the board say about doing that every week?',
      options: [
        'It stays the best choice, because the task always takes you less time than explaining it',
        'It is right until your hours are full, after which the queue grows while team throughput stays flat',
        'It stops working only when the tasks become more complex than your own skill allows',
        'It becomes cheaper each week as you get faster, so it eventually beats delegating',
      ],
      answer: 1,
      why: `Keeping everything fills your ${F.capacity} hours: the queue ends at ${F.myselfQueue} by week ${F.weeks} and the team finishes ${F.myselfMinPerWeek} to ${F.myselfMaxPerWeek} tasks a week. Delegation costs hours up front and pays back after some repetitions.`,
    },
    {
      q: 'A teammate is given a task far above their skill, with full context and daily coaching. What does this model say about their growth?',
      options: [
        'They grow fastest here, because the hardest task teaches the most when you coach closely',
        'They grow, but more slowly than on an easy task, since coaching hours spread out the learning',
        'They do not grow, because skill rises on a stretch task and a task far above them mostly fails',
        'They grow once the task is finished, whatever the outcome was, because finishing counts as practice',
      ],
      answer: 2,
      why: 'In this model skill grows only on a stretch task that comes back done. Far above a person the chance of success is low and no growth is recorded, so more help does not buy more growth; the numbers are invented.',
    },
    {
      q: 'The lesson lists seven delegation levels, from tell to delegate. What status does it give them?',
      options: [
        'One view, from memory: a vocabulary for how much control you keep, not a measured result',
        'A research finding: teams that use all seven levels are shown to deliver more than other teams',
        'A standard: the seven levels are defined by an industry body that every manager has to follow',
        'A law of management: the right level for a task can be computed from the skill of the person',
      ],
      answer: 0,
      why: 'The levels are credited to Management 3.0 from memory and labelled one view. In the board they change just your hours and the chance a task comes back right, with invented constants.',
    },
  ],
};

export default lesson;
