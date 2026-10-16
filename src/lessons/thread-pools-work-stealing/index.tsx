import type { LessonModule } from '../../core/types';
import { pctText, sig } from '../../core/format';
import { BROKEN_SEED, SLOW_STEAL_TICKS, TOTAL_WORK, brentBound, runForkJoin, sweepGrain } from './forkjoin';
import { FORK_COST, forkOpening, grainOpening, mixRatio, poolOpening, starveOpening } from './openings';
import { simulatePool, ruleOfThumb } from './pool';
import { runStarve } from './starve';
import { Stage } from './Stage';

const POOL = poolOpening();
const RATIO = mixRatio(POOL);
const POOL_DEFAULT = simulatePool({ cores: POOL.cores, ratio: RATIO, pool: POOL.pool });
const RULE = ruleOfThumb(POOL.cores, RATIO);
const POOL_RULE = simulatePool({ cores: POOL.cores, ratio: RATIO, pool: RULE });
const CPU_BOUND_AT_CORES = simulatePool({ cores: POOL.cores, ratio: 0, pool: POOL.cores });
const CPU_BOUND_AT_64 = simulatePool({ cores: POOL.cores, ratio: 0, pool: 64 });

const FORK = forkOpening().params;
const FORK_DEFAULT = runForkJoin(FORK);
const FORK_NO_STEAL = runForkJoin({ ...FORK, steal: false });
const FORK_BROKEN = runForkJoin({ ...FORK, stealLatency: SLOW_STEAL_TICKS, seed: BROKEN_SEED });
const FORK_BROKEN_BRENT = brentBound(FORK_BROKEN, FORK.workers);

const GRAIN = grainOpening();
const GRAIN_BASE = { n: TOTAL_WORK, ratioPct: 50, forkCost: FORK_COST, workers: GRAIN.workers, steal: true, stealLatency: 0, seed: GRAIN.seed };
const GRAIN_CURVE = sweepGrain(GRAIN_BASE);
const GRAIN_BEST = GRAIN_CURVE.reduce((a, b) => (b.makespan < a.makespan ? b : a));
const GRAIN_FINE = GRAIN_CURVE[0];
const GRAIN_HERE = GRAIN_CURVE[GRAIN.grain - 1];

const STARVE = starveOpening();
const STARVE_RUN = runStarve(STARVE);
const STARVE_HELPED = runStarve({ ...STARVE, helping: true });

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A pool should be sized to its tasks (about the cores for CPU-bound work, more for blocking work), and fork-join keeps the cores busy by letting idle workers steal the oldest, largest task from a busy one.',
    what: 'A thread pool runs tasks on a fixed set of threads. CPU-bound tasks stop gaining once every core is busy, while tasks that wait keep gaining until the waiting is covered. In fork-join, a big job splits into smaller pieces until a piece is below the grain size; each worker owns a deque, works from its newest end, and an idle worker steals from the oldest end of another, which tends to be the biggest piece. Too fine a grain pays more in splitting than it saves, too coarse leaves workers idle, and a parent that blocks waiting for children can stall a small pool.',
    analogy: 'A kitchen crew: when one cook has a pile of orders and another is free, the free cook takes the oldest order from the bottom of the pile (probably the biggest) so the cooks do not trip over the top of it.',
    useCases: [
      'Sizing the thread pool of a service that mixes computation with blocking calls',
      'Understanding why a parallel loop or stream splits its work into chunks, and why chunk size matters',
      'Debugging a pool whose workers are all blocked while work sits in the queue',
      'Reading why a fork-join or work-stealing scheduler keeps cores busy on uneven work',
    ],
    why: 'Parallel code often runs slower than the sequential version for reasons that have names: too many threads, pieces too small, an unbalanced split, a pool that can starve itself. Knowing the work-span bounds tells you what the best possible time is, and a seeded model shows which of these you are hitting.',
    watch: 'Pool sizing: the blue curve is throughput as the pool grows, the gold line is your pool size and the grey dashed line is the rule of thumb. Fork-join: each worker is one of four plain hues (orange, amber, pink, sky, then they repeat) in the timeline, the deque cards and the leaf strip; a cyan diamond is a steal, a cyan dashed bar is a worker walking to a slow steal, and a dim hatched bar is an idle worker; in the leaf strip a dashed outline is not spawned yet, a grey box waits in a deque, a solid box is running and a tinted one is finished. Grain size: the blue curve is makespan by grain, the green dot the best grain and a red dot a grain slower than one worker. Starvation: a cyan card is a running leaf, a violet card a parent blocked in its join, a green box a finished task and a red outline a stalled pool.',
  },
  tryThis: [
    `In Pool sizing at the defaults (${POOL.cores} cores, w/c = ${RATIO}, a pool of ${POOL.pool}) the pool finishes ${sig(POOL_DEFAULT.throughput)} tasks per 100 ticks with the cores ${pctText(POOL_DEFAULT.coreUse, 0)} busy. Press pool = the rule of thumb (${RULE}): ${sig(POOL_RULE.throughput)} tasks per 100 ticks.`,
    `In Fork-join and stealing at the defaults (4 workers, 50/50 split, grain 8, seed ${FORK.seed}) the ${TOTAL_WORK}-unit job takes ${FORK_DEFAULT.makespan} ticks with ${FORK_DEFAULT.steals} steals. Switch Stealing off: ${FORK_NO_STEAL.makespan} ticks, the whole work on worker 0.`,
    `In Grain size at the defaults (grain ${GRAIN.grain}, 4 workers) the job takes ${GRAIN_HERE.makespan} ticks. Drag Grain down to 1: ${GRAIN_FINE.makespan} ticks, slower than the ${TOTAL_WORK} one worker needs.`,
    `In Starvation at the defaults (${STARVE.workers} workers, a tree of depth ${STARVE.depth}) the pool stalls after ${STARVE_RUN.ticks} ticks with ${STARVE_RUN.finished} of ${STARVE_RUN.total} tasks finished. Set Join to by helping: all ${STARVE_HELPED.total} finish in ${STARVE_HELPED.ticks} ticks.`,
    `In Fork-join and stealing pick the steal model that takes ${SLOW_STEAL_TICKS} ticks. The seed becomes ${BROKEN_SEED}, the run takes ${FORK_BROKEN.makespan} ticks, and Brent's bound (${sig(FORK_BROKEN_BRENT)}) is broken.`,
  ],
  keyIdeas: [
    `CPU-bound work stops gaining at about one thread per core: in this model ${POOL.cores} threads give ${sig(CPU_BOUND_AT_CORES.throughput)} tasks per 100 ticks and 64 give ${sig(CPU_BOUND_AT_64.throughput)}, while tasks that wait keep gaining toward cores × (1 + w/c).`,
    `A thief takes the oldest task from the front of a deque, which tends to be the biggest, while the owner works the newest end: in this model stealing takes the ${TOTAL_WORK}-unit job from ${FORK_NO_STEAL.makespan} ticks to ${FORK_DEFAULT.makespan}.`,
    `No schedule beats max(T1 / P, T∞), and a greedy one stays within T1 / P + T∞ (Brent): in this model a steal that costs ticks is not greedy and can break the bound.`,
    `Grain size is a trade: in this model grain 1 takes ${GRAIN_FINE.makespan} ticks against ${TOTAL_WORK} for one worker, grain ${GRAIN_BEST.grain} takes ${GRAIN_BEST.makespan}, and a parent that blocks with no helping can stall a small pool.`,
  ],
  quiz: [
    {
      q: 'In work stealing, which end of a victim worker\'s deque does a thief take from, and why?',
      options: [
        'The old end: the oldest task is often the largest, so one steal brings plenty of work',
        'The new end: the newest task is the smallest, so it is cheapest for the thief to move',
        'A random spot: every task in a deque is as good as any other for a thief to take',
        'Whichever end is shorter, so the victim is left with the same number of tasks as the thief',
      ],
      answer: 0,
      why: `Pieces split into smaller ones, so the oldest in a deque (the first right-hand half pushed) is often the biggest, and one steal can feed the thief for a long time; the owner pushes and pops at the other end, so the two rarely touch the same task. In this model the thief takes the front: its first steal is the root's second half, ${TOTAL_WORK / 2} units at the default split.`,
    },
    {
      q: `A pool runs CPU-bound tasks on ${POOL.cores} cores. In this model, what does raising the pool from ${POOL.cores} threads to 64 do to throughput?`,
      options: [
        'It falls a little, since the cores were already busy and every burst pays for more threads',
        'It rises about sixteen times, since sixty-four threads can start sixteen times as many tasks',
        'It rises a little, since extra threads fill the gaps that the cores leave between tasks',
        'It stays exactly the same, since a pool beyond the core count has no cost of any kind',
      ],
      answer: 0,
      why: `Four threads already keep the ${POOL.cores} cores ${pctText(CPU_BOUND_AT_CORES.coreUse, 0)} busy at ${sig(CPU_BOUND_AT_CORES.throughput)} tasks per 100 ticks; with 64, the toy contention cost lengthens each burst and throughput eases to ${sig(CPU_BOUND_AT_64.throughput)}. Extra threads cannot start work the cores have no room for, and in this model they cost something.`,
    },
    {
      q: `Splitting a ${TOTAL_WORK}-unit job down to grain 1 costs ${FORK_COST} ticks per fork on 4 workers. How does it compare with one worker?`,
      options: [
        `Slower: the ${TOTAL_WORK - 1} forks cost more than the parallelism saves`,
        'Faster: more pieces give the four workers more parallel work to share out',
        'The same: the pieces add up to the same units of work however fine the grain',
        'Faster, but only slightly, since the four workers must wait for the last piece',
      ],
      answer: 0,
      why: `At grain 1 the job has ${TOTAL_WORK - 1} forks of ${FORK_COST} ticks on top of ${TOTAL_WORK} units of work, so ${GRAIN_FINE.makespan} ticks on 4 workers, against ${TOTAL_WORK} on one. The pieces add up to the same units but the forks are extra work, and more pieces help until the spawn cost outweighs them.`,
    },
    {
      q: `A fixed pool of ${STARVE.workers} workers runs a tree where each parent blocks until its two children finish. Why does it stall?`,
      options: [
        'Every worker holds a blocked parent while the children wait in the queue with no free worker',
        'The queue is empty, so the workers wait for new tasks that nobody has submitted yet',
        'A leaf takes too long, so the parents give up waiting and the pool stops the run early',
        'The workers steal from each other in a loop and never settle on a task to run',
      ],
      answer: 0,
      why: `A parent keeps its worker while it waits, so ${STARVE.workers} workers hold ${STARVE.workers} parents while their children sit in the queue: nothing is left to run them. The queue is not empty, nothing times out, and this pool has no stealing. With helping on, a waiting worker runs a queued task and the same tree finishes in ${STARVE_HELPED.ticks} ticks.`,
    },
  ],
};

export default lesson;
