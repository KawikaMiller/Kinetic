import type { LessonModule } from '../../core/types';
import { RENEW_PAUSE_MS, RENEW_TTL_MS } from './init';
import { DEFAULT_SETUP, FIRST_TOKEN, HEARTBEAT_DEFAULT_MS, LEASE_BROKEN_SEED, PINNED_SEED, TTL_DEFAULT_MS } from './model';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A lock that expires cannot protect data by itself: a client can be frozen past its lease and still write. A fencing token, checked by the storage server, is what makes the stale write fail.',
    what: 'A lease is a lock with a time limit, so a crashed holder does not block everyone for ever. But a holder that is paused (a garbage-collection stall, a frozen VM) cannot notice that the limit passed: it wakes up believing it still holds the lock and writes. Checking the clock before the write only narrows the window, and a longer TTL only moves it. The fix is a fencing token: the lock service hands out a number that grows by one at every grant, the client sends it with each write, and the storage server refuses a write whose token is lower than one it has already applied.',
    analogy: 'A hotel key card that stops working at checkout time. A guest who dozes past checkout still walks to the room with the old card in hand; the housekeeping log, which records the newest card number for the room, is what turns the old card away at the door.',
    useCases: [
      'Leader election and "only one worker runs this" locks built on a lease with a timeout',
      'A lock service in front of a shared file, a database row or an object store',
      'Reading a design that says "we take a distributed lock" and asking what happens after a long pause',
      'Choosing between a lock, a conditional write and an idempotent operation to guard a write',
    ],
    why: 'A lock that mostly works looks fine in testing and fails under a stall in production, corrupting data without an error. Knowing where the safety has to live, in the storage layer and not in the client, is what separates a lock that saves effort from a lock that protects data.',
    watch:
      "On the timeline a green bar is a lease the lock service honours, a grey bar is a holder that still believes it holds a lapsed lease, and the hatched orange bar is a paused client (a pause is not an error). A violet diamond is a grant with its fencing token, a small blue tick is a renewal, and on the storage lane a diamond is a write: green when it was applied in order or rejected as stale, red when a stale write was applied. In the stats the highest token storage applied is yellow, a skewed clock is blue, and a red \"F1 broken\" or \"F2 broken\" is an invariant that failed at that moment of the replay. The chips say what is simulated, illustrative, scripted or from memory.",
  },
  tryThis: [
    `At the defaults (no fencing, a ${TTL_DEFAULT_MS / 1000} s lease, client A paused ${DEFAULT_SETUP.pauseMs / 1000} s, seed ${LEASE_BROKEN_SEED}) press play: A is granted token ${FIRST_TOKEN}, its lease lapses, B is granted token ${FIRST_TOKEN + 1} and writes, then A wakes and writes with ${FIRST_TOKEN}. Storage applies it: "Stale writes applied" reads 1 and the invariants stat reads "F1 broken".`,
    'From the defaults pick "Check the lease first": A wakes, reads its own clock, sees that the lease has run out and stops, so the stale count is 0. Now set "Pause lands" to "just before the write": the check passed before the freeze, and the stale write is back.',
    `From the defaults pick "Fencing tokens": storage answers A's write with "rejected: stale token ${FIRST_TOKEN} < ${FIRST_TOKEN + 1}" and the stale count stays 0. Then pick "Fencing, random tokens" and press "Load the lowest failing seed (${PINNED_SEED['fence-random']})": the first lease drew a higher random token than the second, so storage accepts the stale write.`,
    `In "Renewals and TTL" (TTL ${RENEW_TTL_MS / 1000} s, heartbeat ${HEARTBEAT_DEFAULT_MS / 1000} s, A paused ${RENEW_PAUSE_MS / 1000} s) the lease lapses and a stale write lands. Drag the pause down to 3 s: the heartbeat catches up on waking and B gets the lock only after A releases it. Drag the TTL below the heartbeat and the slider is refused: "The lease would lapse between renewals".`,
    'In "What fencing needs" storage checks tokens and rejects the stale write. Flip Storage to "Cannot check (an outside API)": the token still travels with the write, nothing looks at it, and the stale write is applied. For a lock that protects data, fencing needs storage to take part.',
  ],
  keyIdeas: [
    'In this model a lease can lapse while its holder is frozen and the holder cannot know it: a check of its own clock before the write can be overtaken by a pause that lands right after the check.',
    'A longer TTL shrinks the window and does not close it: a pause longer than the TTL lapses the lease whatever the TTL is.',
    'A fencing token, a number that grows by one at each grant, lets storage refuse a write from an older lease, because the comparison happens at storage and not in the client; it needs storage to take part and the tokens to keep growing, restarts included.',
    'A lock for efficiency pays for a lapse with repeated work; a lock that protects data needs the storage-side check, or a conditional or idempotent write instead.',
  ],
  quiz: [
    {
      q: 'A client checks that it still holds its lease, is then paused for 15 s, and writes. Which control stops the bad write?',
      options: [
        'A second check of the lease placed just before the write leaves',
        'A longer TTL, so that the lease is unlikely to lapse during a pause',
        'A faster heartbeat, so that the lease is renewed more often',
        'A fencing token that storage compares with the highest it has applied',
      ],
      answer: 3,
      why: 'A pause can land after any check, and a longer TTL or a faster heartbeat does not help once the pause outlasts the lease. Storage sees the token on the write itself, so a stale holder is refused whatever it believes.',
    },
    {
      q: 'The TTL is raised from 10 s to 60 s, and a client is later paused for 70 s. What happens to its lease?',
      options: [
        'It survives, because a TTL of 60 s covers the pause',
        'It lapses anyway, so another client can be granted the lock',
        'It is renewed by the lock service on the frozen client\'s behalf',
        'It survives, because the lock service stops the clock of a frozen client',
      ],
      answer: 1,
      why: 'A longer TTL only moves the point at which a pause starts to matter. Once the pause is longer than the TTL the lease lapses, and nothing in the lock service knows the client is frozen rather than slow.',
    },
    {
      q: 'The lock service restarts and forgets its counter, so the next grant is token 1 again. What does that break?',
      options: [
        'Nothing, because storage looks at the lease expiry and not at the token',
        'The TTL, which now counts from the restart instead of from the grant',
        'Tokens stop growing, so storage cannot tell a new holder from an old one',
        'The heartbeat, which has to start again from the first interval',
      ],
      answer: 2,
      why: 'Fencing works because a later lease carries a higher number. A counter that restarts, or random tokens, make "lower" mean nothing, and storage then accepts a stale write or refuses the real holder.',
    },
    {
      q: 'What does a fencing token need from the resource being written?',
      options: [
        'That it compares each write\'s token with the highest it has seen',
        'That its clock is kept in step with the lock service',
        'That it keeps its own copy of the lock service\'s lease table',
        'That it has a TTL longer than the client\'s job takes to run',
      ],
      answer: 1,
      why: 'The token is just a number until something acts on it. An outside API that cannot look at it cannot be fenced this way, which is why conditional writes and idempotent operations are the other guards to know.',
    },
    {
      q: 'A lock exists only to avoid doing a job twice, and repeating the job is safe. What does a lapsed lease cost?',
      options: [
        'Corrupted data, so fencing tokens become necessary at once',
        'A deadlock, because both clients end up waiting on each other',
        'One repeated run of the job: wasted work and no harm to the data',
        'Nothing at all, because a lapsed lease cannot let a second client in',
      ],
      answer: 2,
      why: 'For an efficiency lock the lapse is a performance problem. The same lapse under a lock that protects data is a correctness problem, which is where the token earns its keep.',
    },
  ],
};

export default lesson;
