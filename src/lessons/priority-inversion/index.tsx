import type { LessonModule } from '../../core/types';
import { BASE, BROKEN_SEED, DEFAULT_SCENARIO, DEFAULT_WATCHDOG, blockingTime, inversionWindow, scenarioFromSeed, schedule, verdictOf, type Protocol, type Scenario } from './sched';
import { Stage } from './Stage';

const run = (protocol: Protocol, over: Partial<Scenario> = {}, watchdog: number | null = null) => schedule({ ...DEFAULT_SCENARIO, ...over }, { protocol, watchdog });
const D = DEFAULT_SCENARIO;
const NONE = run('none');
const INHERIT = run('inheritance');
const CEIL = run('ceiling');
const LONG_M = D.lenM * 2;
const NONE_LONG = run('none', { lenM: LONG_M });
const INHERIT_LONG = run('inheritance', { lenM: LONG_M });
const SEED = scenarioFromSeed(BROKEN_SEED);
const SEED_NONE = schedule(SEED, { protocol: 'none' });
const SEED_INHERIT = schedule(SEED, { protocol: 'inheritance' });
const PATHFINDER_NONE = run('none', {}, DEFAULT_WATCHDOG);
const PATHFINDER_FIXED = run('inheritance', {}, DEFAULT_WATCHDOG);
const NONE_V = verdictOf(NONE);
const CEIL_WAIT = blockingTime(CEIL);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Priority inversion is a high-priority task stuck waiting for a lock a low-priority task holds, made unbounded when a medium-priority task keeps the low one off the CPU; priority inheritance and priority ceiling bound the wait.',
    what: 'On one core the highest-priority runnable task runs. If high-priority H needs a lock that low-priority L holds, H waits, which is fine for a short critical section. The damage comes when a medium-priority task M becomes ready: it outranks L, so L cannot finish and release the lock, and H waits for M as well, for as long as M runs. With priority inheritance, L runs at H\'s priority while it holds the lock, so M cannot cut in, and L drops back when it unlocks. With a priority ceiling, a task that takes the lock runs at the highest priority of any task that uses it, from the moment it locks.',
    analogy: 'A surgeon (H) waits for a scalpel that a junior nurse (L) has, but the nurse keeps being pulled away by administrators (M) who outrank her; the fix is to let the nurse borrow the surgeon\'s authority just until she hands the scalpel over.',
    useCases: [
      'Real-time and embedded systems where a high-priority task has a deadline and a watchdog',
      'Choosing a mutex protocol (inheritance or ceiling) for locks shared across priorities',
      'Explaining a missed deadline or watchdog reset that traces back to a lock held by a low-priority task',
      'Reading about the 1997 Mars Pathfinder resets as an example of unbounded inversion',
    ],
    why: 'A lock between priorities turns a bounded delay into an unbounded one the moment a task in between becomes ready. Knowing the mechanism lets you find it in a trace, bound it with the right protocol, and avoid believing that inheritance fixes every locking problem.',
    watch: 'The timeline has one lane for each task in its own plain colour (H pink, M amber, L sky), a lane of red bars for the inversion window, and ticks along the bottom. A solid bar is the task running, labelled with its priority when it is raised ("L as 3"). An orange dashed bar is H blocked on the lock and an orange hatched bar is H held back while a lock holder runs at a raised priority; a dim hatched bar is M or L ready but not running. A violet ring is a task holding the lock, a cyan diamond is a raised priority, a red diamond is a watchdog reset, and the deadline line is green when H met it and red when it did not.',
  },
  tryThis: [
    `In The scheduler at the defaults (no protocol) L takes the lock, H arrives at tick ${D.arrivalH} and blocks, and M (${D.lenM} ticks) runs in between: H waits ${NONE_V.blocking} ticks against L's critical section of ${D.csL}, finishes at tick ${NONE_V.finishH} and misses its deadline of ${D.deadline} by ${-NONE_V.slack!}. ${NONE_V.window} ticks of the wait are the red inversion window.`,
    `In The scheduler drag M computes to ${LONG_M}: H's blocking time becomes ${blockingTime(NONE_LONG)}, one tick longer for each tick of M. Pick priority inheritance: ${blockingTime(INHERIT_LONG)} ticks, the same as at ${D.lenM}, and the deadline is met.`,
    `In The scheduler pick priority ceiling: L runs at 3 from the moment it locks, H is held back ${CEIL_WAIT} ticks but is never blocked on the lock, and finishes at tick ${CEIL.finish.H}.`,
    `In The scheduler press pinned broken seed (${BROKEN_SEED}): with no protocol H waits ${blockingTime(SEED_NONE)} ticks against a critical section of ${SEED.csL}, with ${inversionWindow(SEED_NONE).length} of them in the inversion window. Pick priority inheritance: ${blockingTime(SEED_INHERIT)} ticks.`,
    `In Mars Pathfinder, simplified at the defaults the watchdog resets the system at tick ${PATHFINDER_NONE.resetAt}. Turn the Mutex option to priority inheritance: no reset, and bus management finishes at tick ${PATHFINDER_FIXED.finish.H}.`,
  ],
  keyIdeas: [
    `The damage of priority inversion is a medium task running while the high one waits: in this model H waits ${NONE_V.blocking} ticks with no protocol against a critical section of ${D.csL}, and the wait grows one for one with M's compute time.`,
    `With priority inheritance L runs at H's priority while it holds the lock, so with one lock in this model H waits ${blockingTime(INHERIT)} ticks, no more than L's critical section, whatever M does.`,
    `With a priority ceiling L runs at the lock's ceiling from the moment it locks: in this model H is held back ${CEIL_WAIT} ticks once, before it can lock, and is never blocked on the lock itself.`,
    `Mars Pathfinder is the textbook case, quoted from memory and simplified here: a low-priority task held a lock, a medium one ran, and a watchdog reset the system until priority inheritance was turned on for that mutex; inheritance changes priorities, so it does not prevent a deadlock between two locks.`,
  ],
  quiz: [
    {
      q: `With no protocol, M's compute time is doubled from ${D.lenM} to ${LONG_M} ticks while H is blocked on L's lock. What happens to H's wait, and what changes under priority inheritance?`,
      options: [
        `It grows by ${LONG_M - D.lenM} ticks with no protocol and stays the same under inheritance`,
        `It stays the same with no protocol and shrinks to zero under inheritance`,
        `It doubles with no protocol and also doubles under inheritance`,
        `It grows by ${LONG_M - D.lenM} ticks in both, since M outranks the lock holder whether or not it inherits anything`,
      ],
      answer: 0,
      why: `With no protocol M outranks L, so L cannot release the lock until M is done: H's wait goes from ${NONE_V.blocking} to ${blockingTime(NONE_LONG)}. Under inheritance L runs at H's priority, M cannot cut in, and the wait stays ${blockingTime(INHERIT_LONG)}, which is L's remaining critical section, not zero. M does not outrank a lock holder that has inherited H's priority.`,
    },
    {
      q: 'Priority inversion means the low-priority task runs before the high-priority one. Is that the problem?',
      options: [
        'No: the high task waits on a lock the low one holds, and the damage is the medium task running in between',
        'Yes: any time a low-priority task runs while a high one is ready, the system has inverted its priorities',
        'Yes: the low-priority task is allowed to run first because it asked for the CPU before the high one did',
        'No: the high task is slow because it shares its time slice with the medium one in round-robin order',
      ],
      answer: 0,
      why: `The low task runs because the high one cannot: it is blocked on R, and a short wait for the holder is expected. The inversion is unbounded when M, which holds no lock, runs ahead of the holder: in this model ${NONE_V.window} ticks of H's ${NONE_V.blocking}-tick wait were M running. The scheduler here is fixed-priority, not round-robin.`,
    },
    {
      q: 'Does priority inheritance prevent deadlock?',
      options: [
        'No: two tasks that take two mutexes in opposite order still deadlock, because inheritance only changes priorities',
        'Yes: raising the holder\'s priority lets it finish and release both of the locks it holds in time',
        'Yes: a task that inherits a priority can no longer be blocked by a lock that a lower-priority task holds',
        'No: it only works with one task, so a second mutex switches the protocol off entirely',
      ],
      answer: 0,
      why: 'A deadlock is a cycle of waits: each task holds a lock the other needs. A raised priority gives the holder CPU time but does not make it release a lock it is waiting to acquire, so the cycle stays. Inheritance still works with several tasks, though blocking can chain across several locks.',
    },
    {
      q: `Under a priority ceiling, H arrives while L holds the lock (ceiling ${BASE.H}). What does H experience?`,
      options: [
        `It waits, ready but not blocked on the lock, until L unlocks (${CEIL_WAIT} ticks here), then locks at once`,
        'It preempts L at once, then blocks on the lock and lends L its priority until the unlock',
        'It is blocked on the lock the whole time, and it blocks again when it asks for the lock a second time',
        'It runs first, because a task that uses the lock outranks the holder from the moment it arrives',
      ],
      answer: 0,
      why: `L runs at the ceiling, 3, so H (3) does not preempt it: ties go to the task already running. H is delayed once, for L's remaining critical section (${CEIL_WAIT} ticks in this model), and when it runs the lock is free, so it is never blocked on it.`,
    },
  ],
};

export default lesson;
