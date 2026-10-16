import type { LessonModule } from '../../core/types';
import { plural } from './captions';
import { checkpointFacts, costFacts, lowestFailing, presetCrash, seedFacts } from './facts';
import { Stage } from './Stage';

const winner = presetCrash('winner');
const loser = presetCrash('loser');
const walOff = presetCrash('walOff');
const early = presetCrash('ackEarly');
const seeded = seedFacts();
const cost = costFacts();
const cp = checkpointFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A database writes each change to a log and makes that log durable before the data pages follow, so after a crash it can redo committed work that never reached the pages and undo uncommitted work that did.',
    what: 'The earlier transactions lesson showed that a change is logged before the data is touched, and that restart redoes committed work and undoes the rest. This lesson is the mechanism: every log record gets a log sequence number (LSN), every page remembers the LSN of the last record applied to it, and a page may reach disk only once the log is durable up to that LSN. A commit is acknowledged only after its commit record is fsynced. After a crash, recovery redoes from the last checkpoint every record whose page is behind it, then undoes the transactions with no commit record, writing undo records as it goes, so a second crash in the middle is repaired by the same code.',
    analogy: 'A ship\'s logbook kept in ink beside a chalkboard of the cargo. The captain writes what he is about to change in the logbook first, and only then wipes the chalkboard. After a storm the logbook says which chalk marks to redo and which to rub out, even if the chalkboard is a smear.',
    useCases: [
      'Understanding why a database commit costs one sequential fsync and not many random page writes',
      'Reasoning about what is lost when a disk or a controller lies about fsync',
      'Reading a recovery log: why redo skips some records and why undo writes records of its own',
      'Choosing a checkpoint interval: recovery time against write overhead',
    ],
    why: 'Two beliefs about commits are wrong: that a commit means the data pages are on disk, and that the log is only for undo. The toy lets you crash it anywhere, break one rule at a time and watch recovery produce a state that does or does not match a replay of the committed transactions.',
    watch:
      'Pages: a yellow cell is a dirty pool page whose newest change is not on disk, a green one is clean, and an orange page LSN is past the durable log. Log: green rows belong to a committed transaction, red rows to a loser, grey rows are undone or still only in memory, blue is a checkpoint, an orange row is a torn record that is ignored, and a violet rule marks the durable boundary of the log. In recovery the yellow ring is the page the step touches, and a red page after the last step disagrees with the replay. Chips say what is simulated, a toy, or from memory.',
  },
  tryThis: [
    `In "The machine", press the preset "Committed, never flushed", then "Crash now": page 3 is ${winner.disk3Before} on disk before the crash and ${winner.disk3After} after, because redo applied ${plural(winner.redone, 'record')}. The verdict says nothing acknowledged was lost.`,
    `Press Reset, then the preset "A loser's page flushed", then "Crash now": the dirty page of a transaction that never committed reached the disk (page 3 is ${loser.disk3Before}), redo skipped ${plural(loser.skipped, 'record')} and undo put page 3 back to ${loser.disk3After}.`,
    `Press the preset "WAL rule off", then "Crash now": the page reached disk with no durable log record, so undo has nothing to restore from, and the verdict names atomicity (page 3 holds ${walOff.disk3After} for a transaction that never committed). Press Reset, then the preset "Acknowledge before fsync", then "Crash now": the client was told the commit succeeded (${early.acked.length} acknowledged) but the commit record was still in memory, and the verdict names durability.`,
    `In "Crash anywhere, then recover" (opens on seed ${seeded.seed}, WAL rule enforced, acknowledged after fsync): step to the end of recovery and the invariants hold. Switch "WAL rule" to Off: ${plural(seeded.walOff.length, 'violation')}, ${seeded.walOff[0].rule === 'A' ? 'atomicity' : 'durability'}. Seed ${seeded.ackSeed} with "Acknowledge commit" on Before fsync breaks durability instead.`,
    `In "Cost: group commit and checkpoints" (an SSD-speed fsync, 8 committers): one fsync per commit gives about ${cost.plain.toLocaleString('en-US')} commits a second and sharing the fsync about ${cost.grouped.toLocaleString('en-US')}. Move Checkpoint from never to every 12 records: the worst-case recovery scan drops from ${cp.none.worstScanned} records to ${cp.every12.worstScanned}, for ${plural(cp.every12.pageWrites, 'page write')}.`,
  ],
  keyIdeas: [
    'The write-ahead rule: in this model a page reaches disk only after the log is durable up to its page LSN, which is what lets undo find the before-image of a flushed uncommitted write.',
    'A commit is acknowledged after the commit record is fsynced, not after the data pages are written: with steal and no-force the pages can follow at any time and redo repairs them.',
    'In this model redo applies a record when the page LSN is behind it and skips it otherwise, so running recovery twice, or crashing in the middle of it, gives the same pages.',
    'Group commit lets committers that wait at the same moment share one fsync, so in this toy the commit rate rises with the number of waiting committers; a checkpoint moves the redo point forward and costs page writes now.',
  ],
  quiz: [
    {
      q: 'A transaction commits and the client is told. The data pages have not been written when the power fails. What brings the change back?',
      options: [
        'The redo pass, which reapplies the committed transaction\'s log records to pages that are behind',
        'The undo pass, which restores the before-images saved in the log for that transaction',
        'Nothing, because a commit acknowledged to the client means its pages were written already',
        'The checkpoint, which copies every dirty page of the buffer pool back after the restart',
      ],
      answer: 0,
      why: 'In this model a commit needs the log durable, not the pages. The commit record is on disk, so redo finds the update records and applies them wherever the page LSN is lower than the record.',
    },
    {
      q: 'A page of an uncommitted transaction is flushed to disk, then the machine crashes. Why does recovery need the log\'s before-image?',
      options: [
        'The disk now holds a value that must not survive, and only the log still records what to put back',
        'The buffer pool survived the crash and needs the old value to repair its own copy of the page, which recovery cannot rebuild',
        'The commit record names the old value, and recovery copies it from there into the page',
        'Redo has to know the before-image to decide whether the page LSN is behind the record',
      ],
      answer: 0,
      why: 'Steal lets a dirty page of a loser reach disk. In this model undo can restore it from the before-image in a durable log record, which is why the write-ahead rule makes the log durable first.',
    },
    {
      q: 'With the WAL rule off, which failure can the toy show that it cannot show with the rule on?',
      options: [
        'A page holds a write of a transaction that never committed, with no log record left to undo it',
        'A transaction that committed loses its writes because the commit record was never appended',
        'Two transactions end up holding the same page at once after the restart',
        'Recovery runs forever because the page LSN is behind the log\'s last record',
      ],
      answer: 0,
      why: `The page reaches disk while its log record is still in memory, so after the crash the disk holds a write the log has no record of. The lesson's seed panel finds such a run on seed ${lowestFailing({ enforceWal: false })} of 0 to 199.`,
    },
    {
      q: 'The machine crashes in the middle of recovery and recovery runs again. What keeps the second run correct?',
      options: [
        'The page LSNs make redo skip what is done, and logged undo records show which writes are undone',
        'Recovery keeps its progress in memory, so the second run continues from the exact step it reached before power failed again',
        'The second run deletes the log and rebuilds the pages from the last checkpoint alone',
        'Recovery takes a snapshot of the disk first and rolls back to it when it is interrupted',
      ],
      answer: 0,
      why: 'Pages written by the first run carry their LSN, so redo skips them, and each undo is itself a log record, so undo does not repeat it. In the toy, running recovery again changes nothing.',
    },
    {
      q: 'One fsync takes 10 ms and many clients commit at once. Why can group commit exceed 100 commits a second?',
      options: [
        'Committers waiting at the same moment share one fsync, so one 10 ms wait makes several commits durable',
        'The fsync gets faster when more clients wait, because the disk controller reorders and merges the writes it receives',
        'Commits after the first skip the fsync and are acknowledged from the in-memory log tail',
        'The log is split across several disks, and each client fsyncs a different one in parallel',
      ],
      answer: 0,
      why: 'With one commit per fsync the ceiling is about 1 / latency, 100 a second at 10 ms. Sharing one fsync among g waiting committers lifts it to about g / latency in the toy\'s closed loop.',
    },
  ],
};

export default lesson;
