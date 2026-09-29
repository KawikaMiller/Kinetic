import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "When the network splits, a replicated system must either refuse some requests to stay consistent, or keep answering and risk disagreeing. That's CAP; PACELC adds that even without a split, consistency costs latency.",
    what: "CAP says that during a network partition (P), a distributed system can't be both fully consistent (C: every read sees the latest write) and fully available (A: every request gets an answer). CP systems refuse requests on the side without a majority; AP systems keep serving and reconcile conflicts later. PACELC extends it: Else, when there's no partition, you still trade latency (L) against consistency (C), because keeping replicas in sync means waiting for them.",
    analogy: "Two bank branches whose phone line goes dead. They can stop serving customers until the line is back (consistent), or keep serving and sort out the double-spend later (available).",
    useCases: [
      "Choosing a database: etcd, ZooKeeper and Spanner lean CP; Cassandra, DynamoDB and Riak lean AP",
      "Deciding what happens in your app when a region or zone is cut off",
      "Designing conflict resolution for offline-capable or multi-region writes",
      "Explaining in design reviews why reads can be stale or writes can fail",
    ],
    why: "Every distributed system makes this trade, whether or not anyone chose it on purpose. Seniors are expected to know which way their datastore leans, what users will see during a partition, and to move past the misleading \"pick 2 of 3\" framing.",
    watch: "N1 is on the left with Client 1; N2 and N3 are on the right with Client 2. The red dashed wall is the partition, and links crossing it turn red. Pills are messages: yellow = write, violet = read, blue = replication, green = ok, red = error or lost. A red node is refusing requests (no quorum); a yellow node holds conflicting values. The PACELC grid highlights the trade you picked.",
  },
  tryThis: [
    'Play Partition + CP: the left side returns errors but never disagrees.',
    'Switch to AP: both sides accept writes, then conflict when the network heals.',
    'Switch the network to Healthy and compare EC (80 ms) with EL (5 ms, stale read).',
    'Watch the "Replicas agree?" stat through each run.',
  ],
  keyIdeas: [
    'Partitions are not optional, so the choice is C or A during one.',
    'CP: the minority side refuses requests; nothing ever disagrees.',
    'AP: every side answers; replicas diverge and must be reconciled.',
    'PACELC: even with no partition, stronger consistency means higher latency.',
  ],
  quiz: [
    {
      q: 'Why is "pick any 2 of C, A and P" misleading?',
      options: ['P is always free', "You can't opt out of partitions; the choice is C or A when one happens", 'All three are possible', 'A is never needed'],
      answer: 1,
      why: 'Networks do fail. A system that "gives up P" just behaves badly when they do; the real choice is what to sacrifice during the partition.',
    },
    {
      q: 'During a partition, a CP system on the minority side will…',
      options: ['Accept writes and merge later', 'Refuse requests until it can reach a majority', 'Delete its data', 'Promote itself to leader'],
      answer: 1,
      why: "Without a majority it can't be sure it has the latest data, so it chooses to be unavailable rather than wrong.",
    },
    {
      q: 'With no partition, why might a system still return stale reads?',
      options: ['It is broken', 'It chose low latency: it replies before replicas are updated (the "EL" in PACELC)', 'CAP requires it', 'Reads are cached forever'],
      answer: 1,
      why: 'Waiting for every replica before replying costs round trips. Systems that favour latency replicate asynchronously and accept brief staleness.',
    },
  ],
};

export default lesson;
