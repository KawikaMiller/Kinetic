import type { LessonModule } from '../../core/types';
import { QUEUE_BROKEN_SEED } from './queue';
import { SCHED_BROKEN_SEED } from './sched';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Work that runs later raises three questions: when it fires, how many times, and on which replica. Queues and cron give "at least once"; "once" takes an idempotency key or a unique-key insert.',
    what: 'A delay queue fires a job after a wait, and a timing wheel does it cheaply by putting each job in a slot and counting laps. A queue with a visibility timeout hands a job to a worker and hides it; if no ack comes in time (a dead worker, or just a long job) it comes back and runs again, so the job runs at least once. Retries use a growing delay, with jitter so a crowd of failures does not retry in lockstep, and give up into a dead-letter queue. Run the same cron job on three replicas and it runs three times unless a leader lease, fenced against a paused ex-leader, or a unique key on the (job, scheduled time) row picks one winner.',
    analogy: 'A pharmacy that hands a prescription to one of two clerks and puts a timer on it. If a clerk goes quiet the timer runs out and the slip goes to the other clerk, so the order may get filled twice, which is harmless only if the pharmacy checks a prescription number before it dispenses.',
    useCases: [
      'Sending an email or charging a card in a background job that can be retried',
      'A nightly report scheduled with cron on a service that runs several replicas',
      'Delayed work such as "remind the user in 15 minutes" or an expiring hold',
      'Retrying calls to a flaky dependency without making its recovery worse',
    ],
    why: 'Duplicate emails, double charges and the nightly job that quietly did not run are the usual symptoms. Each has a different cause, a repeat after a timeout, a replica that fired as well, or a leader that died at the wrong minute, and a different fix.',
    watch:
      'In the timing wheel the yellow slot and line are the pointer, the blue dot and number after a job are the laps it still has to go, green is a job that fires, and orange marks a pair the sorted queue would order differently. On the worker timeline green is a job that finished, yellow one running now, red a run whose effect was applied twice, orange a failed run and its retry, violet the dead-letter queue and the idempotency key, grey a no-op repeat or a dead worker (dashed), and blue a job visible again. In the cron scene a blue bar is the lease holder, a hatched orange bar a paused replica, a dashed grey one a killed replica, violet an attempt turned away by the unique key, and red a fire that ran again or a missed fire (hatched). The chips say what is simulated, illustrative, scripted or from memory.',
  },
  tryThis: [
    'At the defaults in "Delay queue and timing wheel" press play: jobs 3 (4.5 s) and 2 (5 s) are both due in tick 5, so the wheel fires job 2 first and the sorted queue would fire job 3. "Pairs out of due order" reads 1. Press "+ 20 s": the new job sits in slot 4 with 2 laps to go.',
    `At the defaults in "At-least-once and retries" (a 4 s window, job 2 takes 6 s, no key, seed ${QUEUE_BROKEN_SEED}) press play: job 2 is handed out again at 4 s and its second run applies the effect twice, so "Effects applied twice" reads 1. Switch the key to "One per job" and the repeat runs and does nothing. Raise the window to 10 s and the repeat disappears, until you drag "Job 2 takes" past it.`,
    'In the same scene turn Jitter to "Off": the note under the retry plot says all 30 failing jobs retry in the same quarter second, and with "Full jitter" it names a smaller number for the busiest quarter second.',
    `In "Distributed cron" the default fires every replica: each hour the job takes effect three times. Pick "Leader by lease" and the fault "Pause replica r1" (seed ${SCHED_BROKEN_SEED}): r1 freezes at 02:55, r2 takes the lease and runs 03:00, and r1 wakes at 03:10 and runs it again. Pick "Leader by lease, with fencing" and r1's late run is rejected.`,
    'In "Cron expressions" press "13th or Friday: 0 0 13 * 5": the calendar tints every Friday and the 13th of March, and the next five fires start with Friday 6 March. Press "Odd days and Friday": a stepped star counts as a star in the Vixie rule, so only the 13th and 27th remain.',
  ],
  keyIdeas: [
    'In this model a queue with a visibility timeout runs a job at least once: a job that outruns the window, or whose worker dies, is handed out again and can take effect twice.',
    'An idempotency key makes a repeat harmless, while a bigger timeout just moves the point where a long job outruns the window; full jitter spreads the retries of jobs that failed together.',
    'Three replicas with one cron schedule run the job three times unless something picks one: a lease holder (fenced against a paused ex-leader, and a gap when the leader dies) or a unique key on the (job, scheduled time) row, which needs no leader.',
    'A timing wheel inserts in one step and fires within a tick of the due time, in insertion order inside a tick; in the Vixie cron rule (from memory, verify), a restricted day-of-month and day-of-week run on either match.',
  ],
  quiz: [
    {
      q: 'The same cron job, `0 * * * *`, is installed on three servers. What happens at the top of the hour?',
      options: [
        'Each server runs it, so it runs three times unless one winner is picked',
        'The servers elect the oldest one by themselves, so it runs once with no extra setup',
        'It runs once, because the three identical schedules cancel each other out that minute',
        'It runs on the least busy server, which the scheduler finds on its own',
      ],
      answer: 0,
      why: 'Nothing in a crontab line coordinates machines, so each replica fires on its own timer. A lease holder or a unique (job, time) row has to be added to pick one.',
    },
    {
      q: 'A worker takes a long job and the visibility timeout ends before it finishes. What happens, and what is the real fix?',
      options: [
        'The job is lost for good, and the fix is a bigger timeout on the queue',
        'The job is handed out again, and the fix is an idempotency key',
        'The job is handed out again, and the fix is a bigger timeout',
        'The job is cancelled, and the fix is to retry it with jitter',
      ],
      answer: 1,
      why: 'The queue cannot tell a slow worker from a dead one, so it hands the job out again. A bigger timeout just moves the point where a long job outruns the window, while a key makes the second run harmless.',
    },
    {
      q: 'Why add jitter to a retry delay?',
      options: [
        'So that each retry waits exactly twice as long as the last',
        'So that a retry is never scheduled later than the first attempt was',
        'So that jobs that failed together do not all retry together',
        'So that a failed job reaches the dead-letter queue sooner',
      ],
      answer: 2,
      why: 'Backoff alone gives the failed jobs the same delays, so they come back as one crowd. Randomising each delay inside the ceiling spreads the crowd out.',
    },
    {
      q: 'In the Vixie cron rule as the lesson states it, what does `0 0 13 * 5` run on?',
      options: [
        'Only on a Friday that happens to fall on the 13th of the month',
        'On the 13th of the month and on Fridays',
        'On the 13th, shifted to the next Friday',
        'On Fridays, with the 13th ignored',
      ],
      answer: 1,
      why: 'When both day fields are restricted, a match on either is enough, x. That surprises people who expect the two to be combined.',
    },
    {
      q: 'A timing wheel inserts a delayed job in one step. What does it give up?',
      options: [
        'The ability to fire a job after more than one lap',
        'Firing a job before the end of its delay, even by a little',
        'Any fixed limit on the number of jobs the wheel can hold',
        'Exact due-time order for jobs due inside the same tick',
      ],
      answer: 3,
      why: 'Each slot keeps its jobs in insertion order and fires them together at the tick, so two jobs due inside one tick can fire in the wrong order. A sorted queue keeps exact order and pays a log factor per insert.',
    },
  ],
};

export default lesson;
