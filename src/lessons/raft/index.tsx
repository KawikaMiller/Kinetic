import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Raft is a consensus algorithm: it lets a group of servers agree on one ordered log of commands, even while some of them crash or get cut off.",
    what: "The servers elect a single leader. Clients send commands to it; it appends each one to its log and copies it to the followers, and an entry is committed once a majority has stored it. If the leader goes quiet, a follower's election timer runs out, it becomes a candidate and asks for votes, and whoever wins a majority leads the next term.",
    analogy: "A committee that only counts a decision once more than half its members have written it down. Losing a couple of members can never lose a decision.",
    useCases: [
      "etcd, the store behind Kubernetes",
      "Consul, CockroachDB, TiKV and many other distributed databases",
      "Leader election and distributed locks",
      "Replicated configuration and metadata stores",
    ],
    why: "Consensus is the foundation of every strongly consistent distributed system. Staff-level engineers need to reason about quorums and split brain, and explain why a 5-node cluster survives 2 failures but not 3. Raft was designed specifically to be understandable.",
    watch: "Blue nodes are followers, yellow are candidates, green is the leader. The ring around each node is its election timer draining. Violet dots are vote requests; blue dots are heartbeats and log replication. In the log table, dashed entries are pending and solid ones are committed. Crash the leader, or partition the network.",
  },
  tryThis: [
    'Watch the first election: rings drain, one server times out and asks for votes.',
    'Send a few commands and watch entries go from dashed (pending) to solid (committed).',
    'Crash the leader and time how long the cluster goes without one.',
    'Partition the network, then send commands. Only the side with 3 servers commits. Heal it and watch the stale leader\'s entries get overwritten.',
  ],
  keyIdeas: [
    'Randomised election timeouts mean one server usually times out first and wins cleanly.',
    'A leader needs a majority (3 of 5) of votes to win and of replicas to commit.',
    'Terms work like a logical clock: seeing a higher term makes any node step down.',
    'A minority partition can\'t commit anything, so no split-brain writes survive.',
  ],
  quiz: [
    {
      q: 'In a 5-node Raft cluster, how many nodes can fail while it still makes progress?',
      options: ['1', '2', '3', '4'],
      answer: 1,
      why: '3 of 5 is still a majority, so up to 2 can be down.',
    },
    {
      q: 'Why are election timeouts randomised?',
      options: [
        'To save CPU',
        'So nodes rarely start elections at the same moment and split the vote',
        'To encrypt the votes',
        'Because clocks are unreliable',
      ],
      answer: 1,
      why: 'Staggered timeouts let one candidate collect votes before anyone else even starts.',
    },
    {
      q: 'An old leader in a 2-node partition accepts a write. What happens to it?',
      options: [
        'It commits, since the leader accepted it',
        'It never commits and is overwritten when the partition heals',
        'Both sides merge their logs',
        'The cluster crashes',
      ],
      answer: 1,
      why: 'It can\'t reach a majority, so it never commits; the new leader\'s log wins after the heal.',
    },
  ],
};

export default lesson;
