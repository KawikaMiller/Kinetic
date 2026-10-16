import type { LessonModule } from '../../core/types';
import { plural } from './captions';
import { insertFacts, pollFacts, replayFacts, rollbackFacts, seedPins, snapshotFacts, KILL_AT } from './facts';
import { Stage } from './Stage';
import { TAIL_OPEN } from './view';

const ins = insertFacts();
const rb = rollbackFacts();
const rp = replayFacts();
const pins = seedPins();
const snap = snapshotFacts();
const poll = pollFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Change data capture reads a database\'s own log, from a saved position, and turns each committed change into an event for other systems, so a search index, a cache and a warehouse can follow the source without polling it.',
    what: 'The write-ahead log already records every change in commit order. A connector reads it from a saved position (a log sequence number), keeps only transactions that committed, and emits events with the operation, key, before and after values and the LSN. It moves the saved position forward only after the consumers acknowledge, so a restart reads from the last saved position and delivers some events again: delivery is at least once, and a consumer that applies each event by key and LSN stays correct anyway. A new consumer takes a snapshot and then streams from the log position where the snapshot began; streaming from the log\'s position at the end of the snapshot loses changes made while it ran.',
    analogy: 'A court stenographer sitting beside the clerk. The clerk keeps the real ledger, the stenographer copies every entry in order to anyone who subscribes, and keeps a bookmark of the last entry every subscriber confirmed, so after a coffee break she resumes at the bookmark and repeats a few lines.',
    useCases: [
      'Keeping a search index or cache current from the source database without a dual write',
      'Feeding a warehouse with row-level changes, deletes included',
      'Reasoning about what a restarted connector delivers twice and how consumers cope',
      'Seeing why a dead consumer can make the source database keep a lot of log',
    ],
    why: 'Two beliefs about CDC are wrong: that it is just polling with a timestamp, and that it delivers each change exactly once. Crashing the connector and the consumers over a seeded schedule shows what each broken variant loses, and which ordering of acknowledgement and apply keeps every committed change.',
    watch:
      'Tables: a green cell equals the source, a yellow cell is a consumer behind it, a dim outline is an empty row, and each consumer says in sync or behind. Log: green rows are committed changes, dim rows belong to a rolled-back transaction and are never emitted, blue is a schema change, and a violet row marks the connector\'s saved position. Orange marks a repeated delivery and red a crash or a change lost for good. In the snapshot scene yellow is a row the scan has not read or one that differs, and the poller table turns red where its copy is wrong. Chips say what is simulated, a toy, illustrative, or from memory.',
  },
  tryThis: [
    `In "The tail" press Insert row 3, then drag Time to 60 ms: ${ins.synced} of 3 consumers are in sync, the log holds ${plural(ins.records, 'record')} (the insert and its commit) and the saved position is LSN ${ins.saved}.`,
    `Press Reset, then Insert row 3, move Row id to 4 and press Insert row 4, set Status to paid and Amount to 99, move Row id back to 3 and press "Two updates, roll back", then drag Time to 60: the log holds ${plural(rb.records, 'record')}, the changes of the rolled-back transaction are dim and marked never emitted, and every consumer still holds the two inserted rows as ${TAIL_OPEN.status} ${TAIL_OPEN.amount}, never paid 99 (${rb.synced} of 3 in sync).`,
    `In "Crash and replay" drag Time to ${KILL_AT} ms and press "Kill the connector now", then drag Time to 500: the restarted connector re-reads from its saved position and ${plural(rp.idem.repeated, 'delivery', 'deliveries')} repeat. With "By key and LSN" ${rp.idem.synced} of 3 consumers are in sync; switch Apply to Blind and ${rp.blind.synced} of 3 are.`,
    `In the seeded run of the same scene (it opens on seed ${pins.blindNoisy} with idempotent apply and acknowledging after applying, and the invariants hold) set Apply to Blind: S2 breaks on seed ${pins.blindNoisy}, and the verdict says why: ${plural(pins.blindCause.reordered, 'event')} arrived after a newer one for the same consumer (message latency reorders them; set Network to Clean and seed ${pins.blind} still breaks, so loss and duplication are not the cause). Press "Load seed ${pins.ackBefore}", set Apply back to By key and LSN and the consumer to acknowledge Before applying: S1 breaks, a committed change is lost.`,
    `In "Snapshot then stream" press "Row 7, just after the scan read it" and drag Time to 500: the new consumer equals the source. Switch Start streaming to "From where the log is now" and it differs: ${snap.badMissing}. In the Poller table row ${poll.late[0].key} is missing; drag "Slow transaction commits at" to 13 ms and the copy is right.`,
  ],
  keyIdeas: [
    'In this model the connector reads the log in commit order and emits only committed changes, so a rolled-back transaction is logged but never appears in a consumer.',
    'In this model the saved position moves once all consumers have acknowledged, so a restart delivers some events again: this is at-least-once, and applying each event by key and LSN makes the repeats, and any reordering by the network, harmless.',
    'In this model a new consumer has to stream from the log position where its snapshot began, because streaming from the position at the end of the scan skips the changes made in between.',
    'Polling an updated_at column cannot see a hard delete, and in this model a transaction that commits late with an older timestamp is skipped; a reader that stops pins the log it has not read.',
  ],
  quiz: [
    {
      q: 'A row is deleted at the source. Which approach to capturing changes sees that delete?',
      options: [
        'Reading the log sees it, and so would a trigger, while polling an updated_at column cannot',
        'Polling an updated_at column sees it, because the deletion stamps the row with a time that the next poll picks up',
        'Only a nightly full copy sees it, since neither logs nor triggers record a deletion',
        'Polling sees it only when the poll interval is short enough to catch the deleted row',
      ],
      answer: 0,
      why: 'In this lesson a hard delete leaves no row behind to carry a timestamp, so the poller\'s copy keeps the row. The log records the delete as a change, which the connector emits like any other.',
    },
    {
      q: 'The connector crashes and restarts. What does it deliver to the consumers?',
      options: [
        'Events after its last saved position, some of which a consumer has already applied',
        'Nothing it sent before the crash, since consumers keep their own record of what arrived',
        'Every event since the log began, because a restart forgets the saved position',
        'Exactly the events that were still in flight, each once, with nothing repeated',
      ],
      answer: 0,
      why: 'The saved position trails the acknowledgements, so a restart reads from there and some events repeat. The lesson counts those repeated deliveries.',
    },
    {
      q: 'Does change data capture deliver each change exactly once?',
      options: [
        'No: retries and restarts repeat events, so consumers apply by key and LSN to stay correct',
        'Yes: the log has one record per change, so the connector emits each record once',
        'Yes, when the consumers acknowledge, because an acknowledged event is never sent again',
        'No: it delivers each change at most once, so a crash can lose some of them for good',
      ],
      answer: 0,
      why: `In this model delivery is at least once, and message latency can also reorder events. Repeats and reordering are what an idempotent consumer absorbs; a blind consumer breaks on seed ${pins.blindNoisy} because an older event arrived after a newer one, with no restart involved.`,
    },
    {
      q: 'Why must a new consumer stream from the log position where its snapshot began?',
      options: [
        'Rows already copied can change while the scan runs, and those changes are in the log after that position',
        'The log positions before the snapshot are needed to rebuild the rows the scan has not reached yet, so it can fill them in',
        'The consumer needs the earlier events to learn the table schema before it can store any rows',
        'Streaming from the end position is slower, since it makes the connector read the log twice',
      ],
      answer: 0,
      why: 'A scan reads rows at different times. Starting the stream where the scan ended skips changes to rows it had already read, which the lesson shows on the first seed that writes during the scan.',
    },
    {
      q: 'A consumer acknowledges an event first and applies it a moment later, then crashes in between. What happens?',
      options: [
        'The saved position has moved past the event, so that committed change is never delivered again',
        'The connector notices the crash and resends the event as soon as the consumer restarts',
        'The consumer replays the event from its own log when it restarts and applies it late',
        'Nothing is lost, because the source database still holds the change in its own table',
      ],
      answer: 0,
      why: 'The acknowledgement told the connector the event was done, so it moved the position forward. The source table still holds the row, but the consumer does not receive that change again, which breaks S1 on the seeded run.',
    },
  ],
};

export default lesson;