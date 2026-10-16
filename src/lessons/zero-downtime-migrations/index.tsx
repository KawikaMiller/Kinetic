import { humanDuration } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { DEFAULT_BATCH, MAX_BATCH } from './lock';
import { ALL_ORDERS, PANEL_SIZE } from './model';
import { CLOCKS_OPEN } from './view';
import { cleanAtOpen, cleanStarts, clocksFacts, lockFacts, presetFacts } from './facts';
import { Stage } from './Stage';

const correct = presetFacts('correct');
const skip = presetFacts('skipDual');
const early = presetFacts('contractEarly');
const clocks = clocksFacts();
const lock = lockFacts();
const total = ALL_ORDERS.length;
const firstCleanStart = cleanStarts()[0];
const secs = (n: number) => `${n.toFixed(1)} s`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'To change a column without stopping the app, add the new column, write to both, copy the old data across, move the readers, stop writing the old one and only then drop it: while a rolling deploy runs, two app versions use the same table.',
    what: 'The deployment-strategies lesson rolls out a new binary; this one changes the database underneath it. A rename looks like one step, but during a rolling deploy some instances still send the old column name and some the new one. Expand and contract splits it into six steps, each safe on its own: add the nullable new column, make v2 write both, backfill the old rows in batches, switch reads to the new column, stop writing the old one, drop it. Each step is only safe once the fleet has caught up with it, and a DDL statement on a big table can wait for a lock and make every later query queue behind it.',
    analogy: 'Moving a shop to a new building without closing. You set up the new shelves, stock both for a while, move the old stock across in trolley loads, point the customers to the new door and only then take down the old shelves, because some customers are still walking in the old door.',
    useCases: [
      'Renaming or splitting a column on a live table with several app instances',
      'Choosing when it is safe to drop a column that older app versions still read',
      'Backfilling a big table in batches without long locks or replication lag',
      'Explaining why a migration that passed in staging stalled production',
    ],
    why: 'Two beliefs are wrong: that a quiet hour is enough, and that a rename is one atomic and so safe step. The table is real SQL checked against SQLite, so you can run the steps in any order, skip any of them, and see which requests fail, which reads go stale and which rows end up wrong.',
    watch:
      'Fleet: blue chips are instances on v1 (old column), violet chips are v2. Table: the old column is blue until it is dropped and then a dim empty outline, the new column is a dim outline before it exists, green once it holds the last value written and orange where it holds an older one; a rail beside a row says copied or stale. Requests: red rows failed on a missing column, orange rows read an older value. In the lock chart blue is the long-running query, yellow the waiting ALTER and the requests queued behind it, red a DDL that gave up or requests past the client timeout. Chips say what is a toy, illustrative, real SQLite, or from memory.',
  },
  tryThis: [
    `In "The six steps" press the preset "Correct order", then drag the timeline to the far right: ${correct.errors} failed requests, ${correct.stale} stale reads and ${correct.lost} rows wrong. Only ${cleanAtOpen()} of the ${total} orderings is clean at this setting (clean on all ${PANEL_SIZE} request mixes, seeds 0 to ${PANEL_SIZE - 1}, not just the shown seed).`,
    `Press the preset "Skip dual-write" and go to the end: ${skip.errors} failed requests but ${skip.stale} stale reads and ${skip.lost} rows that end without the last value written. Nothing threw an error and data was still lost.`,
    `Press the preset "Contract too early" and go to the end: ${early.errors} requests failed on a missing column.`,
    `In "Two clocks" (the fleet already ${CLOCKS_OPEN.deploy}% on v2) the textbook order is ${clocks.open.textbookClean ? 'clean' : 'not clean'} and ${clocks.open.clean} of ${total} orderings run clean on all ${PANEL_SIZE} request mixes. Drag the slider to 0%: the textbook order is ${clocks.none.textbookClean ? 'clean' : 'not clean'} and ${clocks.none.clean} of ${total} are.`,
    `In "Locks and batches" (a big table, no lock timeout): the ALTER blocks new requests for ${secs(lock.wait.longestBlockS)}, ${lock.wait.peakQueue} queue up and ${lock.wait.timedOut} wait past the client timeout. Turn Lock timeout on: the longest block drops to ${secs(lock.short.longestBlockS)} over ${lock.short.attempts.length} attempts. A backfill batch of ${DEFAULT_BATCH} rows takes ${humanDuration(lock.batch100.totalS)} in total and ${MAX_BATCH} rows takes ${humanDuration(lock.batch1000.totalS)}; type 0 and it is refused.`,
  ],
  keyIdeas: [
    'During a rolling deploy two app versions run at once, so in this model a rename done as one step breaks whichever version has not updated yet, and expand and contract keeps both working.',
    `In this model exactly one of the ${total} orderings of the six steps is clean on all ${PANEL_SIZE} request mixes the lesson tries, and only when at least ${firstCleanStart}% of the fleet has already upgraded: a step run ahead of the fleet fails requests or serves stale reads. A single request mix can miss a hazard, which is why the count uses ${PANEL_SIZE}.`,
    'Skipping dual-write throws no error: v2 still sends only the old column, so writes made after the backfill never reach the new column and the table quietly ends up wrong, which is why the data check matters as much as the error count. A v1 instance still running during the backfill is a separate hazard, and the reason a start at 0% or 20% on v2 is never clean.',
    'In this lesson\'s PostgreSQL-flavoured model an ALTER that waits for a lock makes later queries queue behind it, so a lock timeout with a retry and a backfill in batches keep each lock short.',
  ],
  quiz: [
    {
      q: 'You drop the old column while some v1 instances still run. What happens to them?',
      options: [
        'Their statements fail with a missing-column error, because the contract step ran before the last v1 instance upgraded',
        'They keep working from a cached copy of the column until the next restart of the database or the connection pool',
        'The drop waits by itself until the last v1 instance stops using the column, then proceeds',
        'They fall back to the new column automatically, since the database maps the old name across',
      ],
      answer: 0,
      why: 'A database does not know which app versions still name a column. In the lesson the contract step before the fleet finished upgrading makes statements fail on a column that is gone, and SQLite words the error the same way.',
    },
    {
      q: 'Why is renaming a column in one ALTER, because it is a single atomic statement, not safe on a live fleet?',
      options: [
        'The statement is atomic, but whichever app version has not updated starts failing the moment it lands',
        'A rename is not atomic in a database, so readers can see the column half renamed for a moment',
        'The rename copies the whole table, and that copy is what makes every request in flight fail',
        'Renames are refused by the database while any other session holds an open connection',
      ],
      answer: 0,
      why: 'Atomic means the rename lands as a single step. The app versions on either side of it still name different columns, which is why the lesson splits it into steps that each keep both versions working.',
    },
    {
      q: 'The dual-write step is skipped but everything else runs in order. What does the lesson show?',
      options: [
        'No request errors, yet rows end up without the last value written, since v2 keeps writing only the old column',
        'A burst of failed requests, because the new column is read before any app version has written to it',
        'Nothing wrong, because the backfill copies every row once and so covers all later writes as well',
        'A failed backfill, since it cannot copy into a column that the app versions are not writing yet',
      ],
      answer: 0,
      why: 'In the toy the skipped step fails nothing; it silently loses data. That is why the lesson counts stale reads and wrong rows next to failed requests.',
    },
    {
      q: 'An ALTER TABLE on a big table waits behind a long-running query. What happens to new queries?',
      options: [
        'They queue behind the waiting ALTER, so one slow query can stall every request on the table',
        'They run as normal, because a waiting ALTER does not hold anything back from other sessions',
        'They are rejected at once with an error until the ALTER has finished and released its lock',
        'They jump the queue, since readers are always served before a statement that changes the schema',
      ],
      answer: 0,
      why: 'In the PostgreSQL-flavoured model the waiting ALTER sits in the lock queue and later requests line up behind it. A lock timeout with a retry limits how long that block can last.',
    },
    {
      q: 'You backfill 2 million rows in batches of 1 row, then of 1,000 rows. What is the trade-off?',
      options: [
        'Small batches hold each lock for less time but take far longer in total than large ones',
        'Large batches finish sooner and also hold each lock for less time than small ones do, since they commit once',
        'Batch size changes nothing, since the total number of rows copied stays the same',
        'Small batches finish sooner, because each one commits quickly and so skips the pause',
      ],
      answer: 0,
      why: 'Each batch costs a fixed overhead plus a time per row, so fewer, larger batches finish sooner and lock for longer. The lesson computes both from named, illustrative constants.',
    },
  ],
};

export default lesson;
