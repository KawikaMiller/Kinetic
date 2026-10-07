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
      "Crash recovery in PostgreSQL, MySQL (InnoDB) and SQLite in WAL mode, which all use write-ahead logs",
    ],
    why: "Without transactions, any crash, timeout or deploy mid-request can leave data half-written, and those bugs are silent until an angry customer finds them. Mid-level engineers are expected to know which operations must be atomic and to wrap them correctly.",
    watch: "The four ACID tiles light green as the visual proves each guarantee, red when it's broken, and dashed violet for Isolation, which the `isolation-levels` lesson covers. The yellow line is the program step running now, and a yellow outline marks the account being written. In the log, blue rows are changes, green is COMMIT and REDO, and orange is UNDO; BEGIN is grey. The client box turns green when it's told \"done\" and red when the connection is lost. Watch the Total bar: green while it's $800, red when money is missing. Press Crash at any step to cut the power, and the step that never ran is outlined in red.",
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
      options: ['Alice stays debited by $100', "Alice's debit is rolled back", 'Bob is credited the $100 anyway', 'The database refuses to start'],
      answer: 1,
      why: 'No COMMIT record means the transaction never happened, so recovery undoes its changes using the logged old values. Leaving Alice debited is exactly the half-done state a transaction exists to prevent.',
    },
    {
      q: 'Why is the log written before the table ("write-ahead")?',
      options: [
        'Log records compress better than pages',
        'So recovery knows how to undo or redo',
        'The table is read-only until COMMIT',
        'It makes later reads of the table faster',
      ],
      answer: 1,
      why: "If the table changed first and then the machine crashed, nothing would record the old value or whether it was committed. The table is writable all along: Alice's page changes before COMMIT.",
    },
    {
      q: "COMMIT has returned 'ok', then the power fails before Bob's page reaches disk. Bob's money…",
      options: [
        'Is lost: his page never reached disk',
        'Is restored by replaying the log',
        'Goes back to Alice on restart',
        'Survives only if the cache had flushed',
      ],
      answer: 1,
      why: 'Durability comes from the log, not the table: the COMMIT record is on disk, so recovery redoes every logged change of that transaction. The page reaching disk is not what makes it safe.',
    },
    {
      q: 'The crash hits after COMMIT is on disk but before the client hears "done". What should the client assume?',
      options: [
        'The transfer failed, so retry it',
        'It may have happened: check first',
        'The database will undo it on restart',
        "Bob's credit is lost but Alice's stays",
      ],
      answer: 1,
      why: 'The transaction committed, so recovery keeps it, but the client cannot know that from a dropped connection. Retrying blindly would move the money twice; check the outcome (or use an idempotency key) first.',
    },
  ],
};

export default lesson;
