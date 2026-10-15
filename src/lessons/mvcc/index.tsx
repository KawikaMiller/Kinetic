import type { LessonModule } from '../../core/types';
import { IDLE_UPDATES } from './presets';
import { BROKEN_SEED, counterexample } from './schedule';
import { Stage } from './Stage';

const brokenViolation = counterexample().steps.at(-1)!.violation!;
const idleVersionsOfA = IDLE_UPDATES + 1;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Instead of overwriting a row, the database keeps versions of it. Each transaction reads the versions its snapshot can see, so readers do not block writers, and old versions pile up until VACUUM removes the ones nobody can see.',
    what: 'In a PostgreSQL-style table every row version carries the id of the transaction that created it (xmin) and the one that deleted or replaced it (xmax). An UPDATE marks the old version and appends a new one. A snapshot records which transactions had committed when it was taken, and a version is visible to a transaction when its creator is that transaction or one the snapshot counts as committed, and its deleter is not. Two readers can see two different answers from one table without waiting for each other. The price is dead versions: VACUUM can only remove a version that no open snapshot can still see, so one forgotten open transaction stops cleanup. Which anomalies each isolation level allows is the job of `isolation-levels`; this lesson is the machinery under it.',
    analogy: 'A shared document with a full revision history. Every editor opens the page as it stood when they started, so they never see each other half-way through a change. The cost is the history: old revisions can be thrown away only once nobody who might still be looking at them is left.',
    useCases: [
      'Understanding why a long-running report or an idle transaction makes a table bloat',
      'Explaining why reads do not block writes in PostgreSQL, Oracle and MySQL InnoDB',
      'Diagnosing "could not serialize access" errors and deciding when to retry',
      'Sizing autovacuum and finding the one session that is holding the horizon back',
    ],
    why: 'MVCC is why a busy database stays fast for readers, and also why "the table keeps growing" and "this transaction was cancelled" are real incidents. Seniors are expected to know what an open transaction costs the whole database, how to find it, and what the engine does when two writers meet.',
    watch:
      'The table has one row per row version, with the key, value, xmin and xmax. The rail beside each row is what the viewer you pick can see: green is visible, grey is not visible (created after its snapshot, not committed yet, or replaced but still needed by an older snapshot) and red is dead, which VACUUM may remove. A yellow ring marks what the last write created or stamped, a violet outline an xmax kept because an open snapshot may still need it, and a violet line names that snapshot, the vacuum horizon. The blue text is the viewer\'s snapshot. A refused action is orange. The size bar counts versions against the table\'s 200. The chips say what is a toy, what is from memory and what is a seeded simulation.',
  },
  tryThis: [
    'Press BEGIN, then SELECT (T1 takes its snapshot). Pick "autocommit" and press UPDATE (A becomes 40), then pick T1 and press SELECT: T1 still reads A = 10 while an autocommit SELECT reads A = 40, and nothing waited.',
    'Press "Writer meets writer": T2 is refused with "T2 would wait for T1 (row locked): finish T1 first". Pick T1 and press COMMIT, pick T2 and press UPDATE: "could not serialize access due to concurrent update", and T2 is rolled back.',
    'Set Snapshot to "per statement" with nothing open, press "Writer meets writer", pick T1 and COMMIT, pick T2 and UPDATE: this time it updates the newest version and T2 reads A = 40.',
    `In "Vacuum and the long transaction" press "Idle in transaction": row A has ${idleVersionsOfA} versions and VACUUM removes none. Pick T1, press COMMIT, then VACUUM: it removes ${IDLE_UPDATES}.`,
    `In the same scene switch VACUUM to "broken (replay)" and step to the end: seed ${BROKEN_SEED} ends with "${brokenViolation}".`,
  ],
  keyIdeas: [
    'In this model a version is visible to a transaction when its creator committed before the snapshot, or is the transaction itself, and its deleter did not.',
    'Readers and writers do not wait for each other; two writers on one row do, and under per-transaction snapshots the second is aborted once the first commits.',
    'An UPDATE appends a version instead of overwriting, so a deleted or replaced row keeps its space until VACUUM removes it.',
    'VACUUM may remove a version only once the oldest open snapshot cannot see it, so one idle open transaction stops cleanup in this model.',
  ],
  quiz: [
    {
      q: 'T1 began with a per-transaction snapshot and read A = 10. Another transaction then commits A = 40. What does T1\'s next SELECT return?',
      options: [
        'A = 10 again, because T1 keeps reading the snapshot it took at its first statement',
        'A = 40, because each SELECT reads the newest committed version of the row',
        'An error, because the row has changed since the transaction started reading',
        'A = 40, once it has waited for the other transaction\'s commit to finish',
      ],
      answer: 0,
      why: 'A snapshot fixes which transactions count as committed. The new version was created after it, so it is not visible to T1, and the old version is still there for T1 to read. Readers see a snapshot, not the latest data.',
    },
    {
      q: 'A transaction has been open and idle for an hour, and a table that is only ever updated keeps growing. Why?',
      options: [
        'VACUUM cannot remove old versions while the open snapshot may still need them',
        'Each UPDATE appends a version, and nothing in the database ever removes one',
        'The open transaction holds a lock on every row it has read, so rows cannot shrink',
        'An UPDATE writes the new value in place, and pages split as values get longer',
      ],
      answer: 0,
      why: 'Cleanup is limited by the oldest open snapshot. Each version replaced since that snapshot was taken may be one it still reads, so VACUUM keeps them until the transaction ends.',
    },
    {
      q: 'Why does an UPDATE append a new version instead of changing the row in place?',
      options: [
        'A transaction with an older snapshot must still be able to read the old value',
        'Appending to a table is quicker than overwriting a value that is already there',
        'It lets a deleted row be brought back later with a single undo command',
        'The engine needs a second copy of each row in case the power fails mid-write',
      ],
      answer: 0,
      why: 'Readers with older snapshots keep reading the old version while newer transactions read the new one. Surviving a crash is the job of the write-ahead log, not of versions.',
    },
    {
      q: 'T1 has updated row A and has not committed. T2 tries to UPDATE A. What happens in this model?',
      options: [
        'T2 has to wait for T1: two writers on one row do not run side by side',
        'T2 reads the old value of A and updates it, so both updates are applied',
        'T2 is rolled back at once with a serialization error, before T1 finishes',
        'T2 updates a private copy of the row and the engine merges the two later',
      ],
      answer: 0,
      why: 'A reader does not need to wait, but a second writer on the same row does, until the first commits or rolls back. After that, a per-transaction snapshot makes it fail with a serialization error.',
    },
    {
      q: 'Which version is VACUUM allowed to remove in this model?',
      options: [
        'One whose deleter committed before the oldest open snapshot was taken',
        'Any version with a committed deleter, even if an open snapshot still reads it',
        'Any version older than a fixed number of minutes, set when the table is made',
        'The newest version of each row, once a reader has fetched it for the first time',
      ],
      answer: 0,
      why: 'Removing a version that an open snapshot can see would change what that transaction reads inside one transaction. The broken VACUUM in the replay does exactly that, and the safety check catches it.',
    },
  ],
};

export default lesson;
