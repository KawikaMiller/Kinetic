import type { LessonModule } from '../../core/types';
import { sig } from '../distributions/fmt';
import { missingPairs, waitByQuorum } from './quorum';
import { Stage } from './Stage';

const missing = missingPairs({ n: 5, w: 3, r: 2 });
const waits = waitByQuorum(5);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'If every write reaches W replicas and every read asks R of them, and R + W is more than N, a read set and a write set must share a replica. That overlap covers acknowledged writes only, and it is not the same as linearizability.',
    what: "In a leaderless replicated store a write is sent to the N replicas that hold a key and counts as done when W of them answer. A read asks R replicas and returns the newest version it sees. When R + W > N the two sets cannot miss each other (the pigeonhole principle), so a read that starts after a write was acknowledged sees it. A bigger W or R costs availability, because the operation needs that many replicas up, and latency, because it waits for the W-th or R-th fastest reply. A sloppy quorum lets stand-in nodes count toward W when home replicas are unreachable: the write succeeds, and the overlap guarantee over the home replicas is gone until the hint is handed off.",
    analogy: 'A committee votes on a motion. If the motion needs W votes to pass and a later check asks R members, any W voters and any R checkers share a member when R + W exceeds the committee size, so the checker hears the result. A motion still being voted on may be heard by some checkers and missed by others.',
    useCases: [
      'Choosing consistency settings for a Dynamo-style or Cassandra-style database',
      'Explaining why "R + W > N" is not the same as "strongly consistent"',
      'Sizing a replica set so it survives the failures you expect',
      'Reasoning about what a hinted handoff or sloppy quorum gives up during a partition',
    ],
    why: 'Quorum settings look like a simple dial, and teams read "R + W > N" as "no stale reads". Knowing what the overlap does and does not promise, and what each setting costs in availability and latency, is how you avoid designing around a guarantee that is not there.',
    watch:
      "Replicas are plain boxes with their version as text. The newest version is green and a stale replica orange (stale is a state, not a broken box). In the set picker the write set is violet, the read set blue and a replica in both is yellow; a red note means the two sets share nothing. A crashed or cut-off replica is the dark dead-node box and a stand-in node has a dashed amber outline. In the plots the blue line is the median wait and the violet line the 99th percentile. The chips say what is simulated, a toy, illustrative or from memory.",
  },
  tryThis: [
    `Set R to 2 (N = 5, W = 3): R + W = 5 is no longer more than N, ${missing.missing} of the ${missing.total} pairs of sets miss each other, and "Pick sets that miss", then Write, then Read returns a stale version.`,
    'In "Failures and latency" set W to 5 and crash replica A: the simulated write ends "no quorum" at 150 ms. At W = 3 it survives two crashes.',
    `On the same plot raise W from 1 to 5: the 99th percentile of the wait rises from ${sig(waits[0].p99, 3)} ms to ${sig(waits[4].p99, 3)} ms.`,
    'In "Not the same as linearizable" the default is a write in flight with W = 2 and R = 2: the acknowledged-write invariant holds, yet the linearizable checker rejects the history.',
    'Pick the "A partition" schedule: strict refuses the write ("no quorum"); switch to Sloppy and the write is acknowledged through a stand-in, a read on the other side returns version 0, and the invariant breaks.',
  ],
  keyIdeas: [
    'In this model R + W > N makes every read set share a replica with every write set, so a read that starts after an acknowledged write sees it or a newer one.',
    'The overlap covers acknowledged writes: while a write is in flight two reads can disagree, so the history need not be linearizable.',
    'A write survives N − W failures and a read N − R; bigger quorums cost availability, and the wait is the W-th or R-th fastest reply.',
    'A sloppy quorum trades consistency for availability: stand-ins make the write succeed, and a read of the home replicas can miss it until the hint is handed off.',
  ],
  quiz: [
    {
      q: 'With N = 5, W = 3 and R = 3 the sets always overlap. Does a read that runs while a write is in flight get a consistent answer?',
      options: [
        'No: the overlap covers acknowledged writes, so two reads during the write can disagree',
        'Yes: any two quorums overlap, so a read always sees a write that has begun',
        'Yes, provided read repair is switched on for every read the store serves',
        'No, because a write quorum of 3 is smaller than the 5 replicas holding the key',
      ],
      answer: 0,
      why: 'Overlap guarantees a shared replica with a write that was acknowledged. A write still in flight may have reached one replica and not the others, so one read can see it and a later read miss it.',
    },
    {
      q: 'Which setting guarantees that every read set overlaps every write set?',
      options: [
        'N = 5, W = 2, R = 4',
        'N = 5, W = 2, R = 3',
        'N = 6, W = 3, R = 3',
        'N = 5, W = 1, R = 4',
      ],
      answer: 0,
      why: 'The sets are forced to overlap when R + W is more than N. 2 + 4 = 6 is more than 5, while 5 against 5 and 6 against 6 are not, so those can pick sets that miss each other.',
    },
    {
      q: 'N = 5 and W = 5. A single replica crashes. What happens to writes?',
      options: [
        'They cannot gather five replies, so they end with no quorum until it returns',
        'They carry on, because four replicas are still more than half of five',
        'They carry on and the crashed replica copies the missing writes when it returns',
        'They slow down but still finish, since the other four reply quickly enough',
      ],
      answer: 0,
      why: 'A write needs W distinct replies and just four replicas can answer. A bigger W buys overlap and costs availability: with W = N, one crash blocks writes.',
    },
    {
      q: 'What does a sloppy quorum trade away?',
      options: [
        'Consistency for availability: stand-ins let a write succeed, but a read can miss it',
        'Availability for consistency: it refuses writes until every home replica is back',
        'Latency for durability: it waits for stand-ins before it acknowledges anything',
        'Nothing at all, because a hint is handed off before any later read begins',
      ],
      answer: 0,
      why: 'During a partition the write is counted on stand-in nodes, so it succeeds, but a read that asks the home replicas alone may touch none of them. The guarantee over the home replicas returns after the hint is handed off.',
    },
    {
      q: 'Why does the wait for an operation grow as W grows?',
      options: [
        'It waits for the W-th fastest reply, so slower replicas set the wait',
        'Each extra replica adds the same delay in front of the one before it',
        'The coordinator sends to the W replicas one after another, in turn',
        'Replies are checked by the leader first, and a bigger W takes longer',
      ],
      answer: 0,
      why: 'The replicas are asked at once and the operation finishes at the W-th reply, which is a later and later order statistic as W grows. The tail is shaped by the slowest replicas it has to wait for.',
    },
  ],
};

export default lesson;
