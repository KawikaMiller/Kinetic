import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A transaction groups several writes so they all happen or none do, and a write-ahead log is how the database keeps that promise through a crash.",
    what: "ACID names four guarantees. Atomicity: all of a transaction's changes apply, or none do. Consistency: rules like \"money is never created or destroyed\" hold before and after. Isolation: concurrent transactions don't see each other's half-finished work. Durability: once COMMIT returns, the change survives crashes. Databases get atomicity and durability by writing every change to a log on disk before applying it, then undoing or redoing from that log when they restart.",
    analogy: "A notary's ledger. Before touching any money, the clerk writes \"moving $100 from Alice to Bob\". If the lights go out, the ledger says exactly what to finish or reverse.",
    useCases: [
      "Payments, transfers and anything involving balances",
      "Creating an order and reserving its stock together",
      "Signing up a user and creating their default settings in one go",
      "Crash recovery in Postgres, MySQL and SQLite (all use write-ahead logs)",
    ],
    why: "Without transactions, any crash, timeout or deploy mid-request can leave data half-written, and those bugs are silent until an angry customer finds them. Mid-level engineers are expected to know which operations must be atomic and to wrap them correctly.",
    watch: "The four ACID tiles light green as the visual proves each guarantee (red when it's broken, dashed violet for Isolation, which is the next lesson). The yellow line is the step running now. Blue rows are log records, green is COMMIT. Watch the Total bar: it must stay at $800. Press Crash at any step to cut the power.",
  },
  tryThis: [
    'In "No transaction", pause after step 2 and crash. Watch $100 disappear.',
    'Switch to "Transaction + log" and crash before COMMIT: the log undoes Alice.',
    'Crash after COMMIT, before Bob\'s page is written: the log redoes it.',
    'Notice the client only hears "done" after COMMIT is safely on disk.',
  ],
  keyIdeas: [
    'Atomicity: all of a transaction\'s writes happen, or none do.',
    'Write-ahead logging: log the change on disk before touching the data.',
    'On restart, committed transactions are redone; uncommitted ones are undone.',
    'COMMIT is the promise point: after it returns, the change is durable.',
  ],
  quiz: [
    {
      q: 'The server crashes after debiting Alice but before COMMIT. After recovery…',
      options: ['Alice stays debited', 'Alice\'s debit is rolled back', 'Bob is credited anyway', 'The database refuses to start'],
      answer: 1,
      why: 'No COMMIT record means the transaction never happened, so recovery undoes its changes using the logged old values.',
    },
    {
      q: 'Why is the log written before the table ("write-ahead")?',
      options: [
        'Logs are compressed',
        'So recovery always knows how to undo or redo a change',
        'Tables are read-only',
        'It makes reads faster',
      ],
      answer: 1,
      why: 'If the table changed first and then the machine crashed, nothing would record what the old value was or whether it was committed.',
    },
    {
      q: 'COMMIT has returned "ok", then the power fails before Bob\'s page reaches disk. Bob\'s money…',
      options: ['Is lost', 'Is restored by replaying the log', 'Goes back to Alice', 'Depends on luck'],
      answer: 1,
      why: 'Durability: the COMMIT record is on disk, so recovery redoes every logged change of that transaction.',
    },
  ],
};

export default lesson;
