import type { LessonModule } from '../../core/types';
import { BROKEN_RULE, BROKEN_SEED, SCHEDULE_SEEDS } from './check';
import { DEFAULT_SEED } from './live';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Raft is a consensus algorithm: it lets a group of servers agree on one ordered log of commands, even while some of them crash or get cut off.',
    what: "The servers elect a single leader for a term. Clients send commands to it; it appends each one to its log and copies it to the followers. A leader counts replicas to commit an entry written in its own term, and once a majority stores that entry it is safe; older entries commit along with it. If the leader goes quiet, a follower's election timer runs out, it becomes a candidate and asks for votes, and a candidate needs a majority to lead the next term. A server votes for a candidate whose log is at least as up to date as its own.",
    analogy: 'A committee that counts a decision once more than half its members have written it down. In this model, losing a minority of the members cannot lose a decision that was already counted.',
    useCases: [
      'etcd, the store behind Kubernetes',
      'Consul, CockroachDB, TiKV and other distributed databases',
      'Leader election and distributed locks',
      'Replicated configuration and metadata stores',
    ],
    why: 'Consensus underlies the strongly consistent distributed systems built on it. Engineers who work with them need to reason about quorums and split brain, and to explain why a 5-node cluster survives 2 failures but not 3. Raft was designed to be understandable.',
    watch:
      'Blue nodes are followers, yellow are candidates, green is the leader, and a red dashed circle with a cross is a crashed server. The ring around a node is its election timer draining; a leader shows a green pulse at each heartbeat. Violet dots are vote requests, small blue dots are heartbeats, larger yellow dots carry log entries, and small green and red dots are replies (green accepted or voted yes, red refused). A dot that meets the dashed red partition line flies halfway, turns red and fades. In the log table the number in a box is the term the entry was written in, drawn in that term\'s colour; dashed boxes are pending and solid ones are committed. The safety panel turns red when a rule breaks. The chips say what is simulated and what is from memory.',
  },
  tryThis: [
    `From a fresh load (seed ${DEFAULT_SEED}, real rules) watch the first election: the rings drain, the server whose timer runs out first becomes a candidate and asks for votes, and a majority of votes makes it leader.`,
    'Once there is a leader, press Send command a few times. Each entry is dashed (pending) until a majority of servers stores it, then solid (committed).',
    "Crash the leader (click it, or focus it and press Enter) and read the times in the event log: the cluster has no leader from the crash line until the next 'leader' line.",
    'Press Partition network, wait a few seconds for the other three to elect a leader, then press Send command. The new leader commits it; the cut-off leader appends it too but it stays dashed. Heal the network and watch the stale entries get overwritten while the safety monitor stays green.',
    `Pick "Commit without a majority", wait for a leader, press Partition network and then Send command: the cut-off leader commits on 2 of 5 servers and the monitor turns red with ${BROKEN_RULE['commit-without-majority']}. Then press Check ${SCHEDULE_SEEDS} schedules: this bug breaks a property on many seeds, and the lowest failing seed is ${BROKEN_SEED['commit-without-majority']}.`,
  ],
  keyIdeas: [
    'Randomised election timeouts make it likely that one server times out first and wins cleanly; when two time out together the vote can split and a new term retries.',
    'A leader needs a majority (3 of 5) of votes to win and of replicas to commit, and a voter also checks that the candidate\'s log is at least as up to date as its own.',
    'Terms work like a logical clock: seeing a higher term makes any server step down to follower.',
    "A minority partition can't commit anything under the real rules, so what it accepted is overwritten after the heal; the monitor checks this over 200 seeded schedules, which is a sample and not a proof.",
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
        'To spread the CPU load of timers evenly across the servers',
        'So servers rarely time out together and split the vote',
        'To encrypt the vote messages that servers send each other',
        'Because the clocks of different servers drift by random amounts',
      ],
      answer: 1,
      why: 'Staggered timeouts make it likely, not certain, that one candidate collects its votes first. When two time out together the vote can split, and the cluster tries again in a new term.',
    },
    {
      q: 'An old leader in a 2-server partition accepts a write. What happens to it under the real rules?',
      options: [
        'It commits, because the leader that accepted it counts as a majority',
        'It stays uncommitted and is overwritten after the heal',
        'Both sides merge their logs together once the partition heals',
        'The whole cluster stops until an operator picks a new leader',
      ],
      answer: 1,
      why: "In this model it can't reach a majority, so it stays uncommitted; the new leader's log wins after the heal.",
    },
    {
      q: 'A new leader finds an entry from an earlier term stored on 3 of 5 servers. Is it committed by counting those 3?',
      options: [
        'Yes, because 3 of 5 is a majority, so the entry is already safe',
        'No, it commits only along with a newer entry of its own term',
        'Yes, but only once one more election timeout has gone by',
        'No, the entry is discarded and the client has to resend the command',
      ],
      answer: 1,
      why: 'A server missing that old entry can still win a later election and overwrite it. Once an entry of the current term is on a majority, any later winner holds that entry and the older ones below it.',
    },
    {
      q: 'Why does a server refuse a vote when the candidate\'s log is behind its own?',
      options: [
        'The candidate could win without a committed entry and overwrite it',
        'A candidate with a short log probably has a clock that is wrong',
        'Servers with short logs are slower at counting the votes they get',
        'The candidate would then need more than a majority of the votes to win',
      ],
      answer: 0,
      why: "The vote check is what keeps a committed entry on the next leader. The variant that skips it breaks leader-completeness on seed " + BROKEN_SEED['vote-without-log-check'] + '.',
    },
  ],
};

export default lesson;
