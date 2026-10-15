import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Isolation levels decide how much concurrent transactions can see of each other's work, trading correctness against speed and aborts.",
    what: "When transactions run at the same time, their reads and writes interleave, which can produce anomalies: dirty reads, non-repeatable reads, phantoms, lost updates and write skew. Each isolation level rules out more of them. Many databases implement the stronger levels with MVCC: they keep several versions of each row so every transaction can read a consistent snapshot, and they abort a transaction when letting it commit would be unsafe. This lesson runs a toy engine with one stated rule per level; real engines differ in the details.",
    analogy: "Several editors working on the same document. At the weakest level they see each other's unsaved typing. At the strongest, it's as if they took turns, one after another, even though they worked at the same time.",
    useCases: [
      "Bank balances, inventory counts and seat bookings under concurrent traffic",
      "Enforcing rules across rows, like \"at least one doctor on call\"",
      "Consistent reports and exports while writes keep arriving",
      "Choosing a level per transaction, and knowing when to retry on serialization errors",
    ],
    why: "Postgres, Oracle and SQL Server default to Read Committed (from memory; MySQL's InnoDB defaults to Repeatable Read, so check your database), and Read Committed allows lost updates and write skew. These bugs show up under load, can't be reproduced easily on a laptop, and corrupt money or inventory. Seniors are expected to recognise the anomaly, pick the right level or locking strategy, and handle retries.",
    watch: "T1 (blue) and T2 (violet) run on two lanes; time flows left to right and the yellow tick is the current step. The table shows every row version: green = committed, dashed yellow = pending, red strike-through = rolled back. A blue or violet ring shows which version each transaction read, and a dashed blue tag says a row is not in T1's snapshot. A green or red banner gives the verdict for the run. The matrix shows what each level allows in the toy engine: red x = the anomaly happens in some interleaving, green tick = prevented, yellow arrow = prevented by aborting a transaction. Click a cell to play it; the chips say what is a toy, what is scripted and what is from memory.",
  },
  tryThis: [
    'Play "Dirty read" at Read Uncommitted (the default): T2 reads the uncommitted $200 and approves a loan on it. Then pick Read Committed and play it again.',
    'Pick "Non-repeatable read" and Repeatable Read / Snapshot, then play: T1 reads the older version both times.',
    'Pick "Lost update" and Repeatable Read / Snapshot, then play: T2 is aborted and the app has to retry.',
    'Pick "Write skew" and Repeatable Read / Snapshot, then play: nobody is left on call. Switch the level to Serializable and T2 is aborted instead.',
  ],
  keyIdeas: [
    'Higher isolation prevents more anomalies but causes more blocking or aborts.',
    'MVCC keeps old row versions so readers see a consistent snapshot without blocking writers.',
    'In this model snapshot isolation still allows write skew, and Serializable is the level that aborts it.',
    'Level names mean different things in different databases, so check yours.',
  ],
  quiz: [
    {
      q: 'A team moves to snapshot isolation and says "now no concurrency anomalies can happen". What is wrong?',
      options: [
        'Snapshot isolation still allows write skew across different rows',
        'Snapshot isolation brings back dirty reads under heavy load',
        'Snapshot isolation only works for tables with a single row',
        'Snapshot isolation turns every read into a blocking lock',
      ],
      answer: 0,
      why: 'Each transaction writes a different row based on the same snapshot, so there is no write conflict to detect. In this model Serializable is the level that notices the dependency and aborts one of them.',
    },
    {
      q: 'Two transactions each read a counter of 10, add 1 and write 11. Final value 11. This is…',
      options: ['A dirty read', 'A lost update', 'A phantom read', 'Write skew'],
      answer: 1,
      why: 'Both did read-modify-write from the same starting value, so one increment was overwritten and lost.',
    },
    {
      q: 'At Serializable, what does the database do when an interleaving would be unsafe?',
      options: [
        'It merges both writes silently so neither one is lost',
        'It aborts one transaction so the app can retry it',
        'It drops the table lock and lets both commit anyway',
        'It switches the transaction down to Read Committed',
      ],
      answer: 1,
      why: "Serializable guarantees a result equal to some one-at-a-time order; when it can't, it aborts a transaction with a serialization error.",
    },
    {
      q: 'T1 counts 2 doctors on call, T2 inserts a third and commits, T1 counts again and still gets 2. What explains it?',
      options: [
        'T1 reads from a snapshot taken before T2 committed',
        "T2's insert was rolled back before T1 counted again",
        "The database delays T2's insert until T1 has finished",
        'T1 locked the whole table for its entire transaction',
      ],
      answer: 0,
      why: "Carol's row exists but was committed after T1's snapshot, so T1 does not see it. Nothing was blocked and nothing was rolled back.",
    },
  ],
};

export default lesson;
