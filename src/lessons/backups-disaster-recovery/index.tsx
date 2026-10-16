import type { LessonModule } from '../../core/types';
import { drillFacts, planFacts, timelineFacts } from './facts';
import { Stage } from './Stage';
import { minutesText } from './view';

const tl = timelineFacts();
const plan = planFacts();
const drill = drillFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A backup plan is a schedule of copies plus a log you can replay, and its worth is measured by two numbers: how much data you lose (RPO) and how long you are down (RTO), and by whether you have ever restored it.',
    what: 'Replication keeps a second copy that follows every change, so it carries a bad change too and implies some data is lost at a failover. Backups are different: a weekly full, incrementals, and a continuous archive of the log that lets you replay to any minute, restoring to a point just before a table was dropped. Restore time is the size of the backup divided by the throughput plus the time to replay the log since it. The copies must also sit in other failure domains, an object lock or a separate account protects them from a stolen credential, and a restore test is the only way to learn that a backup works: a missing log segment is a gap that replay cannot cross.',
    analogy: 'A fire drill and a spare key. A key hidden in the same house burns with it, a key on a hook the burglar can reach is gone with everything else, and a spare key nobody has ever tried in the lock is a rumour about a key.',
    useCases: [
      'Choosing a backup interval and a log archive interval from how much data you can afford to lose',
      'Estimating how long a restore takes and what dominates it',
      'Seeing why a replica, or a copy in the same account, is not a backup',
      'Deciding how often to run a restore test, and what it can find',
    ],
    why: 'Two beliefs are wrong: that replication means you are backed up, and that a successful backup means a successful restore. A toy database, a week of writes and seeded faults let you drag the disaster, restore to the minute before a dropped table, and watch an untested backup fail at the worst moment.',
    watch:
      'Timeline: blue bars are backups and shipped log stretches, green is the range a restore can reach and the target, red is data lost, a log gap or the bad deployment, orange is downtime while restoring and the yellow diamond is the disaster. Plan builder: green rows are scenarios the plan survives, red rows are ones it does not. Restore drill: a dim set is unverified, a green set was restored in a drill and has a tick, a red set carries a fault. Violet marks copies in other failure domains. Chips say what is simulated, a toy, illustrative, or from memory.',
  },
  tryThis: [
    `In "The timeline" (disaster at Thu 14:37, a backup every 24 hours, a log segment every 15 minutes): data lost is ${minutesText(tl.on.lost)} (recoverable to ${tl.on.recoverable}), and restoring to the target Thu 14:06 reaches ${tl.on.reached} in about ${minutesText(tl.on.seconds / 60)} and matches the never-failed database. Turn the Log archive off: data lost is ${minutesText(tl.off.lost)} and the nearest point is ${tl.off.reached}.`,
    `In the same scene type 14:50 as the target: it is refused, "${tl.afterDisaster.ok ? '' : tl.afterDisaster.error}". Turn "A log segment is lost" on (seed 4) and put the target back to 14:06: it is refused again, "${tl.gap.ok ? '' : tl.gap.error}"`,
    `In "The plan builder" the sound plan survives ${plan.sound} of ${plan.total} scenarios. Press "A weak plan": it survives ${plan.weak}. Choose "A bad migration drops a table" with Protection set to "A replica only": ${plan.replicaMigration.ok ? '' : plan.replicaMigration.why}.`,
    `In "The restore drill" (seed ${drill.seed}, nothing tested): press "Disaster now" and the restore fails because ${drill.fault === null ? '' : drill.struck.why}. Press Reset, then "Restore test", "Fix what the test found" and "Disaster now": it restores to the same point a sound plan reaches.`,
  ],
  keyIdeas: [
    'RPO is the data you lose and RTO the time you are down: in this model the first is set by how often backups and log segments reach the archive, the second by backup size over throughput plus the log replay.',
    'A replica follows every change, a dropped table included, so in this lesson it fails the bad-migration scenario, while a snapshot and the log archive restore to the minute before the drop.',
    'A point-in-time restore replays the archived log segment by segment and stops at the first missing one: it does not skip a gap, so a lost segment caps how far you can go.',
    'Copies in the same account fail the stolen-credential scenario unless an object lock holds them, and a backup that was never restored can fail at the disaster for a reason a drill would have found.',
  ],
  quiz: [
    {
      q: 'A deployment drops a table at 14:07 and a replica applies the drop at 14:07:01. What restores the table?',
      options: [
        'A backup from before 14:07, with the archived log replayed up to 14:06 if there is one',
        'The replica, because it holds a second copy of everything that was in the database',
        'Nothing can: replication already copied the drop to every copy the database has',
        'Promoting the replica, since a promoted replica rebuilds the dropped table by itself',
      ],
      answer: 0,
      why: 'In the model a replica is a copy that follows every change, the drop included, so it cannot undo it. A copy from before the drop, plus the log up to the minute before, is what can.',
    },
    {
      q: 'The backup job reports success every night, and no one has restored from it. What does that tell you?',
      options: [
        'Only that the files were written: whether they restore is unknown until someone tries',
        'That a restore would succeed, because the job checked the files as it wrote them',
        'That a restore would succeed, unless the database has grown since the backup began',
        'That the backup is safe from ransomware as well, since a job that succeeds is verified',
      ],
      answer: 0,
      why: 'In this lesson a hidden fault on a backup set (a corrupt file, a lost key, a stale restore script, a missing log segment) is invisible until a restore runs, which the drill shows.',
    },
    {
      q: 'You keep every backup copy in the same cloud account as the database, with no object lock. An attacker steals an account credential. What happens?',
      options: [
        'The copies are reachable with the same credential, so they can be deleted along with the database',
        'The copies survive, because a deleted database cannot delete a backup that lives elsewhere',
        'The copies survive in another region, since a credential only works within the region it names',
        'The copies are encrypted at rest, which means that nobody holding a credential can remove them',
      ],
      answer: 0,
      why: 'In the model a copy in the same account fails the ransomware scenario unless an object lock has held it for the days it takes to notice, or the copy sits in another account.',
    },
    {
      q: 'The log archive loses one segment from this morning. You restore to the afternoon. What does the restore do?',
      options: [
        'It stops at the missing segment and says so, since replay cannot cross a gap',
        'It skips the missing segment and carries on, then marks the rows that it could not rebuild',
        'It restores the afternoon exactly, because the full backup already holds the missing changes',
        'It restores the afternoon and then re-fetches the missing segment from the replica later',
      ],
      answer: 0,
      why: 'Skipping a segment would apply later changes to a state that lacks earlier ones. The toy stops at the first gap and reports it, and the lesson refuses a target that lies beyond one.',
    },
    {
      q: `A restore takes about ${minutesText(tl.on.seconds / 60)}. Which change shortens it most in this model?`,
      options: [
        'A faster restore throughput, since the same data moves in proportionally less time',
        'More copies of the backup in other regions, since each copy restores part of the data',
        'A shorter log archive interval, since smaller segments replay faster than large ones',
        'More frequent backups, since a more recent backup leaves less log to be replayed',
      ],
      answer: 0,
      why: 'Restore time is the backup chain over the throughput plus the replay of the log since the base, so doubling the throughput halves it. A more recent backup does not reliably help: in this toy every incremental is 20 GB and the whole chain is restored, so more frequent backups lengthen the restore. The segment interval changes data lost, not the restore time.',
    },
  ],
};

export default lesson;
