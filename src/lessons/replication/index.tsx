import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Replication keeps copies of your data on several machines, so you can survive a crash and spread reads, at the cost of copies that can lag behind.",
    what: "In leader-follower replication, every write goes to one leader, which streams its changes to followers. With synchronous replication the leader waits for followers to confirm before telling the client \"ok\": safe, but every write pays the slowest follower's latency. With asynchronous replication it replies immediately: fast, but followers lag, so reads from them can be stale, and a leader crash can lose writes the followers never received.",
    analogy: "A teacher dictating notes to a class. If the teacher waits for everyone to finish writing (sync), it's slow but nobody misses a line. If the teacher just keeps going (async), it's fast, but the slow writers are always a sentence behind.",
    useCases: [
      "Postgres and MySQL read replicas to scale read traffic",
      "Automatic failover when the primary database dies",
      "Keeping a copy in another region for disaster recovery",
      "Serving reads close to users in other regions",
    ],
    why: "Almost every production database is replicated, and replication lag causes some of the most confusing bugs: \"I saved it and it disappeared\", and writes lost during failover. Seniors are expected to choose sync vs async deliberately and design around lag with read-your-writes strategies.",
    watch: "The leader (green border) takes writes; followers copy it. F2 sits in another region behind a slow, dotted link. Pills are messages: yellow = write, blue = replication, green = ack or reply, violet = read, red = lost. Yellow-highlighted log entries just arrived. The stats show write latency and how many entries each follower is behind.",
  },
  tryThis: [
    'Play "Stale read" with async, and watch the reload return the old name.',
    'Switch to sync: the read is correct, but the write latency jumps.',
    'Play "Leader crash" with async: a confirmed order disappears.',
    'Compare the F2 lag counter in async vs sync.',
  ],
  keyIdeas: [
    'All writes go through the leader; followers replay its log.',
    'Async: fast writes, stale follower reads, and possible data loss on failover.',
    'Sync: no loss and fresh replicas, but writes wait for the slowest follower.',
    'Read-your-writes: send a user\'s reads to the leader (or an up-to-date replica) right after they write.',
  ],
  quiz: [
    {
      q: 'With async replication, a user saves a change and immediately sees the old value. Why?',
      options: ['The write failed', 'The read hit a follower that hadn\'t caught up yet', 'The cache was full', 'The leader rejected it'],
      answer: 1,
      why: 'Replication lag: the follower serving the read hasn\'t received the change yet, even though the leader has.',
    },
    {
      q: 'The leader crashes right after acknowledging a write, using async replication. What can happen?',
      options: ['Nothing, writes are always safe', 'The acknowledged write can be lost after failover', 'All data is lost', 'The followers refuse to start'],
      answer: 1,
      why: 'If the write never reached a follower, the promoted follower simply doesn\'t have it.',
    },
    {
      q: 'Why don\'t all systems use fully synchronous replication?',
      options: ['It loses data', 'Every write waits for the slowest follower, and a down follower can stall writes', 'It can\'t do failover', 'It only works for reads'],
      answer: 1,
      why: 'Sync trades latency and availability for durability. Many systems compromise by waiting for just one follower (semi-sync).',
    },
  ],
};

export default lesson;
