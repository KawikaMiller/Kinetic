import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Event sourcing stores every change as an immutable event and derives the current state by replaying them. CQRS pairs it with separate, read-optimised views built from those events.",
    what: "Instead of overwriting a row (balance = 680), you append facts: AccountOpened, Deposited 500, Withdrew 120… The current state is a fold over that log, so you can rebuild it as of any moment in history. With CQRS, the write side only validates commands and appends events, while projections consume the log into read models shaped for each query. When projections consume asynchronously, as they do here, those read models are eventually consistent: they lag the log slightly.",
    analogy: "A bank statement vs. just the number on your card. The balance is useful, but the statement is the truth: you can always re-add it up, and it tells you how you got there.",
    useCases: [
      "Banking, payments and ledgers, where the history is the product",
      "Audit trails and compliance (\"who changed what, when?\")",
      "Building new reports or search indexes from past data after the fact",
      "Debugging by replaying the exact events that led to a bad state",
    ],
    why: "It's a powerful pattern with real costs: eventual consistency, event schema versioning forever, and replay performance. Seniors need to recognise when an audit-heavy domain benefits from it and when a plain CRUD table is the better call.",
    watch: "The left column is the append-only log: light blue = AccountOpened, amber = Deposited, orange = Withdrew; v1/v2 tags show the event's schema version. The small dots on the log show how far each read model has read: violet for the balance view, blue for the monthly statement, orange for the big-withdrawals view once you add it. The middle card is the state computed by replaying the log; drag the time-travel slider (a yellow line marks the cursor). The right column shows the read models catching up after each write, tagged \"N behind\" while they lag. The chips say this is one invented account and that the lag is set to be visible.",
  },
  tryThis: [
    'Click Deposit and watch the read models show "1 behind" before they catch up.',
    'Drag the time-travel slider back to event #3: the balance is recomputed, not looked up.',
    'Try "Withdraw €5,000": the command is rejected and no event is written.',
    'Add a new projection and watch it replay all of history to build itself.',
  ],
  keyIdeas: [
    'Store what happened (events), derive what is (state) by replaying them.',
    'Events are immutable facts; commands are requests that can be rejected.',
    "CQRS with asynchronous projections, as here: writes append events, read models catch up a moment later, so reads are eventually consistent.",
    'Old events live forever, so plan for schema versioning (e.g. upcasting v1 → v2 on read).',
  ],
  quiz: [
    {
      q: 'In an event-sourced system, how do you get the current account balance?',
      options: [
        'Read the balance column of the accounts table',
        "Replay the account's events, often from a snapshot",
        'Take the total stored in the newest event',
        'Run an UPDATE on the balance after each deposit',
      ],
      answer: 1,
      why: 'State is derived: apply the events in order (often starting from a snapshot) to compute it.',
    },
    {
      q: 'A user deposits money and immediately refreshes a CQRS read model, which shows the old balance. Why?',
      options: [
        'The deposit event was lost before it reached the log',
        'The read model updates asynchronously and has not caught up',
        'The command was rejected, so no event was written at all',
        'Someone edited the event log and removed the new deposit',
      ],
      answer: 1,
      why: "The write is committed to the log; the projection simply hasn't consumed it yet (eventual consistency).",
    },
    {
      q: 'You add a field to the Deposited event. What do you do with the millions of old events?',
      options: [
        'Rewrite them all in place so they match the new shape',
        'Delete them and replay only the events written from now on',
        'Version the schema and upcast old events when reading them',
        'Leave them as they are, since old events are never read',
      ],
      answer: 2,
      why: 'The log is immutable history; handle old shapes on read (upcasting) or with versioned handlers. Replays do read the old events.',
    },
    {
      q: 'A deposit was recorded with the wrong amount. Why do you not fix it by editing that event?',
      options: [
        'Events are immutable facts, so you append a correction',
        "Editing an event would delete the projections' tables",
        'The log is read-only until the next snapshot is taken',
        'Corrections can only be made by the database administrator',
      ],
      answer: 0,
      why: 'An event records a fact that already happened, so history is not rewritten; a mistake is fixed by appending a new event that corrects it.',
    },
  ],
};

export default lesson;
