import { decimal, plural } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { BROKEN_SEED, combinerFacts, counterFacts, flowFacts, killDemo, stragglerFacts } from './facts';
import { Stage } from './Stage';

const flow = flowFacts();
const comb = combinerFacts();
const strag = stragglerFacts();
const demo = killDemo();
const broken = counterFacts(BROKEN_SEED);
const next = counterFacts(BROKEN_SEED + 1);
const failedWorker = broken.kills.map((k) => `worker ${k.worker + 1} at tick ${k.tick}`).join(' and ');
const nextWorkers = next.kills.map((k) => `worker ${k.worker + 1} at tick ${k.tick}`).join(' and ');
const heaviest = Math.max(...flow.loads);
const reducerWithMost = flow.loads.indexOf(heaviest) + 1;
const [topWord, topCount] = flow.top;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'MapReduce splits a big input into independent map tasks, shuffles each key to one reducer, and reduces. Because tasks are independent and repeatable, a slow or dead worker is handled by running its task again, as long as the task has no side effects.',
    what: 'A word count is run by hand: the text is split, each map task turns words into pairs, the shuffle sends each word to one reducer by hash, and each reducer adds up what it got. A combiner then merges pairs on the mapper to shrink the shuffle, and a toy cluster of three workers shows a skewed key and a slow machine (and what a backup task can and cannot fix), a worker dying mid-job, and a map function with a side effect that leaks when a task runs twice.',
    analogy: 'A pile of exam scripts marked by three markers. Each marker takes a stack and scores it (map); the scores are sorted by question into folders (shuffle); one person per folder adds up that question (reduce). If a marker falls ill, someone else re-marks the stack; but if marking also stamped a log book, the stamps are duplicated.',
    useCases: [
      'Counting, summing or grouping over data too big for one machine, split into blocks',
      'Rebuilding a search index or a set of reports from scratch every night',
      'Judging whether a pipeline step can be retried safely after a worker fails',
      'Explaining why one hot key makes a batch job wait on a single task',
    ],
    why: 'Batch jobs on many machines fail and stall all the time, so the design that matters is the one that survives it: independent, repeatable tasks. Knowing what makes a retry safe, and why skew defeats extra machines, is what lets you read any batch system, including the ones that replaced MapReduce.',
    watch:
      'Map tasks and their splits are blue, reduce tasks violet, and a hatched violet strip is a reducer waiting for the maps; a pair is tinted by the reducer it goes to. In the Gantt chart a bar is one attempt of a task on a worker: the straggler is yellow, a lost attempt is red with a cross, a task run again has a red outline and an arrow, and a copy cancelled because the other finished first is dim. Green marks records the combiner saved, an equal answer, and a matching counter; red marks a wrong answer or a leaked counter. Chips say what is simulated, a toy, real or from memory.',
  },
  tryThis: [
    `In "Word count, by hand" the ${flow.words} words become ${flow.pairs} pairs and reducer ${reducerWithMost} gets the most, ${plural(heaviest, 'pair')}; the table starts with ${topWord} ${topCount}. Move Reducers R to 1: that one reducer gets all ${flow.oneLoad} pairs and the table is ${flow.sameTable ? 'the same' : 'different'}.`,
    `In "The combiner" ${comb.off} records cross the shuffle with no combiner. Pick Add the counts: ${comb.sum}. Then pick the Average word length job and Average on the mapper: "${comb.firstWrong}" comes out ${decimal(comb.naive, 3)} instead of ${decimal(comb.truth, 3)}.`,
    `In "Skew and stragglers" the skewed input makes the job take ${strag.skew.off} ticks. Turn Backup tasks On: it takes ${strag.skew.on}. Then pick A slow machine: it takes ${strag.slow.on} ticks with backups and ${strag.slow.off} without.`,
    `In "A worker dies" set Time to tick ${demo.kill.tick}, one before the last map finishes, and press Kill worker ${demo.kill.worker + 1}: it held a finished map task, so ${plural(demo.reruns, 'task')} run again and the job ends at tick ${demo.afterEnd} instead of ${demo.cleanEnd}, with the table still equal.`,
    `In "Tasks that are not safe to re-run" seed ${BROKEN_SEED} fails ${failedWorker}: the counter ends at ${broken.counter} for ${broken.records} records while the word counts stay right. Switch the Map function to Pure and the counter is not used. Press New seed (seed ${BROKEN_SEED + 1}, ${nextWorkers}): the counter reaches ${next.counter}.`,
  ],
  keyIdeas: [
    'MapReduce is a programming model: independent map tasks over splits, a shuffle that sends each key to one reducer, and reduce tasks, and that independence is what lets a task be retried or backed up.',
    'A combiner is a local reduce before the shuffle; in this model it saves shuffled records only when the reduce is associative and commutative, so an average needs (sum, count) carried along.',
    'In this model a finished map task on a dead worker runs again because its output sat on that worker\'s disk, while finished reduce output is not redone, and the table stays equal to a plain count.',
    'In this model a retry is safe for tasks that are deterministic and free of side effects (or idempotent), and a backup task helps with a slow machine but not with a skewed key.',
  ],
  quiz: [
    {
      q: 'Someone says MapReduce is slow because it is old. What is the idea that mattered, apart from speed?',
      options: [
        'Independent tasks over split data, so a failed or slow task can just be run again on another machine',
        'A faster sorting step than a single machine can manage, which is why the shuffle sorts everything by key',
        'Keeping every intermediate result in memory, so that nothing is ever written to disk during a whole job',
        'A promise that no worker will fail during a job, so the scheduler never needs any rule for retrying',
      ],
      answer: 0,
      why: 'The programming model makes tasks independent and repeatable, and that is what a scheduler needs to survive failures and stragglers. Speed depends on the implementation, which is why later systems kept the idea and changed the engine.',
    },
    {
      q: 'In the toy cluster a worker fails partway through a job. What happens to the job?',
      options: [
        'Its running task and its finished map tasks run again elsewhere, and the final table comes out unchanged',
        'The job is lost and must start again from the first map task on whichever workers are still running',
        'Only its running task is repeated, because finished tasks have always saved their output to safe storage',
        'Nothing is repeated, since the other workers already hold a copy of everything that it was working on',
      ],
      answer: 0,
      why: "Map output sits on the mapper's local disk, so a finished map task on a dead worker has to run again, while finished reduce output is already in the shared file system. Because tasks are deterministic the table comes out the same, though later.",
    },
    {
      q: 'Why can a mapper not send the average of its values as a combiner when the job computes a mean?',
      options: [
        'The reducer would weight the average from each mapper equally, whatever number of values it averaged',
        'An average takes too long to compute on the mapper, so the shuffle would end up getting slower overall',
        'Averages cannot be sent across the network, so only whole values can be shuffled to a reducer at all',
        'The mapper would lose the keys, because an average has no key to be sent to a reducer along with it',
      ],
      answer: 0,
      why: 'The mean of means equals the mean when the mappers averaged equal numbers of values, and not otherwise. Carrying (sum, count) pairs and adding them is associative and commutative, so the combiner stays exact.',
    },
    {
      q: 'One reducer runs far longer than the rest because one key is most of the input. Does a backup copy of it on an idle worker finish the job sooner?',
      options: [
        'No: the copy gets the same pairs and is as slow; a backup helps only when the machine itself is the slow part',
        'Yes: a second worker splits the key between the two copies, so each of them does about half of the work',
        'Yes: any backup finishes first, since an idle worker is always faster than a busy one running a long task',
        'No: backups are only ever started for map tasks, so a reducer is never copied onto another worker at all',
      ],
      answer: 0,
      why: 'The slowness is in the data: a key goes to one reducer, and its copy has the same number of pairs to process. A backup shortens the job when the machine, not the data, made the task slow.',
    },
    {
      q: 'A map function bumps an external counter for every record. A worker fails and one finished map task runs again. What does the counter end up as?',
      options: [
        "More than the records, because the first attempt's records were counted too; the word counts are right",
        'Exactly the number of records, because the scheduler remembers which records it has already counted before',
        'Fewer than the number of records, because a lost attempt rolls back everything it had counted so far',
        'Wrong, together with the word counts, because the repeated task adds its words to the table a second time',
      ],
      answer: 0,
      why: 'The reducers use one winning attempt per task, so the word counts are unchanged; the outside effect fired once per attempt. In this model a retry is safe for a deterministic task or an idempotent effect, like writing the same record to the same key.',
    },
  ],
};

export default lesson;
