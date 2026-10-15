import type { LessonModule } from '../../core/types';
import { writeLatencyMs } from './model';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "When the network splits, a replicated system must either refuse some requests to stay consistent, or keep answering and risk disagreeing. That's CAP; PACELC adds that even without a split, consistency costs latency.",
    what: "CAP says that during a network partition (P), a distributed system can't be both consistent (C: a read returns the latest acknowledged write) and available (A: every request to a working node gets an answer). CP systems refuse requests on the side without a majority; AP systems keep serving and reconcile conflicts later. PACELC extends it: Else, when there's no partition, you still trade latency (L) against consistency (C), because keeping replicas in sync means waiting for them.",
    analogy: "Two bank branches whose phone line goes dead. They can stop serving customers until the line is back (consistent), or keep serving and sort out the double-spend later (available).",
    useCases: [
      "Choosing a database: tutorials often put etcd and ZooKeeper on the CP side and Cassandra and Riak on the AP side, but real products are tunable, so check the docs",
      "Deciding what happens in your app when a region or zone is cut off",
      "Designing conflict resolution for offline-capable or multi-region writes",
      "Explaining in design reviews why reads can be stale or writes can fail",
    ],
    why: "Distributed systems make this trade whether or not anyone chose it on purpose. Seniors are expected to know which way their datastore leans, what users will see during a partition, and to move past the misleading \"pick 2 of 3\" framing.",
    watch: "N1 is on the left with Client 1; N2 and N3 are on the right with Client 2. The red dashed wall is the partition, and links crossing it fade red. Pills are messages: yellow = write, violet = read, blue = replication, green = ok, red = error or lost. A node with a red outline is refusing requests (it can't reach a majority). Each node box shows the value that replica holds. A client box turns green when its request was answered correctly, and red when it was refused, got a stale answer or had its write dropped. The stats row is computed from the run: whether the replicas hold the same value, how many stale reads were served, who is unavailable and how long the write took. The PACELC grid highlights the trade you picked, and the chips say what is simulated and what is scripted.",
  },
  tryThis: [
    'Play Partition + CP (the default): N1 refuses the write and then the read, and "Stale reads served" stays 0.',
    'Switch to AP and play: both sides accept writes, the two reads disagree ("Stale reads served" becomes 1), and after the heal only one value is left.',
    `Switch the network to Healthy: EC (the default there) shows a ${writeLatencyMs('ec')} ms write; pick EL and the write takes ${writeLatencyMs('el')} ms but a read returns a stale value.`,
    'Watch "Replicas identical?" through the default CP run: it says "no" while N1 is cut off and out of date, even though no client was given a wrong answer.',
  ],
  keyIdeas: [
    'Partitions are not optional, so during one the choice is C or A.',
    'CP: in this model the minority side refuses requests, so no client is given a stale or conflicting answer.',
    'AP: in this model both sides answer, the replicas diverge, and a merge rule such as last-write-wins decides what survives.',
    'PACELC: even with no partition, waiting for replicas costs latency, and answering early can return stale reads.',
  ],
  quiz: [
    {
      q: 'A team says: "Our database is CA. We just skip partition tolerance." What is wrong with that?',
      options: [
        'Nothing: networks inside one data centre do not split, so CA is a real option',
        'You cannot opt out of partitions; the real choice is C or A during one',
        'Nothing: CA only fails when a node crashes, which is a different problem',
        'CA is fine, but it needs more than three replicas to stay available',
      ],
      answer: 1,
      why: 'Networks fail inside a data centre too. A system that "gives up P" does not avoid partitions, it just behaves badly when one happens; the real choice is what to sacrifice during it.',
    },
    {
      q: 'During a partition, a CP system on the minority side will…',
      options: [
        'Accept writes locally and merge them after the heal',
        'Refuse requests until it can reach a majority again',
        'Delete its local copy so it cannot diverge',
        'Promote itself to leader so clients keep working',
      ],
      answer: 1,
      why: "Without a majority it can't be sure it has the latest data, so it chooses to be unavailable rather than wrong. In the lesson, N1 waits for its timeout and refuses.",
    },
    {
      q: 'With no partition at all, why might a read still return a stale value?',
      options: [
        'A healthy replica set cannot return stale data, so it must be broken',
        'It replied before replicating, trading consistency for latency',
        'CAP requires stale reads whenever there is more than one replica',
        'Reads are cached by the client and never revalidated at all',
      ],
      answer: 1,
      why: 'Waiting for the other replicas before replying costs round trips. Systems that favour latency acknowledge first and replicate in the background (the "EL" in PACELC), so a read in between sees the old value.',
    },
    {
      q: 'In the AP run both writes were acknowledged, yet only x=3 survives the heal. What decided that?',
      options: [
        'The partition itself erased the older of the two writes',
        'A merge rule, here last-write-wins by timestamp, picked one',
        'The CP side vetoed the older write once the network healed',
        'Client 1 retried its write and it was overwritten by x=3',
      ],
      answer: 1,
      why: "Both sides said ok because neither could ask the other. When they met again a rule had to choose; last-write-wins by timestamp keeps one value and drops the other without telling the client.",
    },
  ],
};

export default lesson;
