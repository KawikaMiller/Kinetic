import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Isolation levels decide how much concurrent transactions can see of each other's work, trading correctness against speed and aborts.",
    what: "When transactions run at the same time, their reads and writes interleave, which can produce anomalies: dirty reads, non-repeatable reads, phantoms, lost updates and write skew. Each isolation level rules out more of them. Many databases implement the stronger levels with MVCC: they keep several versions of each row so every transaction can read a consistent snapshot, and they abort a transaction when letting it commit would be unsafe.",
    analogy: "Several editors working on the same document. At the weakest level they see each other's unsaved typing. At the strongest, it's as if they took turns, one after another, even though they worked at the same time.",
    useCases: [
      "Bank balances, inventory counts and seat bookings under concurrent traffic",
      "Enforcing rules across rows, like \"at least one doctor on call\"",
      "Consistent reports and exports while writes keep arriving",
      "Choosing a level per transaction, and knowing when to retry on serialization errors",
    ],
    why: "Most databases default to Read Committed, which quietly allows lost updates and write skew. These bugs only show up under load, can't be reproduced locally, and corrupt money or inventory. Seniors are expected to recognise the anomaly, pick the right level or locking strategy, and handle retries.",
    watch: "T1 (blue) and T2 (violet) run on two lanes; time flows left to right and the yellow tick is the current step. The table shows every row version: green = committed, dashed yellow = pending, red strike-through = rolled back. A blue or violet ring shows which version each transaction read. The matrix shows what each level allows; click a cell to play it.",
  },
  tryThis: [
    'Play "Dirty read" at Read Uncommitted, then at Read Committed.',
    'Play "Non-repeatable read" at Snapshot and watch T1 read the older version.',
    'Play "Lost update" at Snapshot: T2 gets aborted and has to retry.',
    'Play "Write skew" at Snapshot, then at Serializable.',
  ],
  keyIdeas: [
    'Higher isolation prevents more anomalies but causes more blocking or aborts.',
    'MVCC keeps old row versions so readers see a consistent snapshot without blocking writers.',
    'Snapshot isolation still allows write skew; only Serializable prevents it.',
    'Level names mean different things in different databases, so check yours.',
  ],
  quiz: [
    {
      q: 'Two transactions each read a counter of 10, add 1 and write 11. Final value 11. This is…',
      options: ['A dirty read', 'A lost update', 'A phantom read', 'Write skew'],
      answer: 1,
      why: 'Both did read-modify-write from the same starting value, so one increment was overwritten and lost.',
    },
    {
      q: 'Which anomaly can snapshot isolation still allow?',
      options: ['Dirty read', 'Non-repeatable read', 'Write skew', 'Phantom read'],
      answer: 2,
      why: 'Each transaction writes a different row based on the same snapshot, so there is no write conflict to detect. Only Serializable catches it.',
    },
    {
      q: 'At Serializable, what does the database do when an interleaving would be unsafe?',
      options: ['Silently merges the writes', 'Aborts one transaction so the app can retry', 'Drops the table lock', 'Switches to Read Committed'],
      answer: 1,
      why: "Serializable guarantees a result equal to some one-at-a-time order; when it can't, it aborts a transaction with a serialization error.",
    },
  ],
};

export default lesson;
