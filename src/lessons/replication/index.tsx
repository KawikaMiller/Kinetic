import type { LessonModule } from '../../core/types';
import { writeMs } from './model';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Replication keeps copies of your data on several machines, so you can survive a crash and spread reads, at the cost of copies that can lag behind.",
    what: "In leader-follower replication, writes go to one leader, which streams its changes to followers. With synchronous replication the leader waits for followers to confirm before telling the client \"ok\": safe, but every write pays the slowest follower's latency. With asynchronous replication it replies immediately: fast, but followers lag, so reads from them can be stale, and a leader crash can lose writes the followers never received.",
    analogy: "A teacher dictating notes to a class. If the teacher waits for everyone to finish writing (sync), it's slow but nobody misses a line. If the teacher just keeps going (async), it's fast, but the slow writers are always a sentence behind.",
    useCases: [
      "Postgres and MySQL read replicas to scale read traffic",
      "Automatic failover when the primary database dies",
      "Keeping a copy in another region for disaster recovery",
      "Serving reads close to users in other regions",
    ],
    why: "Many production databases are replicated, and replication lag causes some of the most confusing bugs: \"I saved it and it disappeared\", and writes lost during failover. Seniors are expected to choose sync vs async deliberately and design around lag with read-your-writes strategies.",
    watch: "The leader (green border) takes writes; followers copy its log. F2 sits in another region behind a slow, dotted link. Pills are messages: yellow = write, blue = replication, green = ack or reply, violet = read, red = lost, or a copy the leader had not sent yet (labelled not sent yet). Log entries glow yellow when they have just arrived. A crashed node is dimmed with a red border, and the follower that takes over gets a thicker green border and the label \"new leader\". Client text turns green when the client was told something correct, red when it was told something wrong. The stats are computed from the run: write latency (red for the slow figure, green for the fast one), how many entries each follower is behind the longest live log, stale reads answered, and acknowledged writes that no live node holds. The chips say what is simulated and what is scripted.",
  },
  tryThis: [
    'Play "Stale read" with Asynchronous (the default): after you save Ada, the reload on F2 returns Ana and "Stale reads" becomes 1.',
    `Switch to Synchronous and play: the reload returns Ada, but the write takes ${writeMs('sync')} ms instead of ${writeMs('async')} ms.`,
    'Pick "Leader crash" (still Asynchronous) and play: order #4 is confirmed to the customer, the leader crashes, and "Acked writes lost" becomes 1.',
    'Compare the F2 lag stat when the client is told "saved": it is still 1 with Asynchronous and already 0 with Synchronous.',
  ],
  keyIdeas: [
    'In single-leader replication, writes go through the leader and followers replay its log in order.',
    'Async: fast writes, stale follower reads, and a failover can lose writes that had not been shipped yet.',
    'Sync: in this model no acknowledged write is lost on failover and replicas are fresh, but each write waits for the slowest follower.',
    "Read-your-writes: send a user's reads to the leader (or an up-to-date replica) right after they write.",
  ],
  quiz: [
    {
      q: 'The leader tells a client "ok" under async replication. What does that ok promise?',
      options: [
        'Only that the leader stored it; followers may not have it yet',
        'That every follower already holds a copy of the write',
        'That the write will survive the leader crashing right after',
        'That a read from any follower will now return the new value',
      ],
      answer: 0,
      why: 'Async acknowledges before replicating, so ok says nothing about the followers. That gap is where stale reads and lost writes come from.',
    },
    {
      q: 'With async replication, a user saves a change and immediately sees the old value. Why?',
      options: [
        'The write failed and the app hid the error',
        'The read hit a follower that had not caught up yet',
        'The cache was full, so it served an older page',
        'The leader rejected the change after replying ok',
      ],
      answer: 1,
      why: 'Replication lag: the follower serving the read has not received the change yet, even though the leader has it.',
    },
    {
      q: 'The leader crashes right after acknowledging a write, using async replication. What can happen?',
      options: [
        'The followers refuse to take over until the leader returns',
        'The acknowledged write can be missing on the new leader',
        'The new leader fetches the missing write from the dead leader',
        'All followers roll back to their last snapshot automatically',
      ],
      answer: 1,
      why: "If the write had not reached a follower yet, the promoted follower simply does not have it. In the lesson's run, order #4 is confirmed and then gone.",
    },
    {
      q: "Why don't all systems use fully synchronous replication?",
      options: [
        'Synchronous replication loses acknowledged writes on failover',
        'Writes wait for the slowest follower; a down one can stall them',
        'A follower cannot be promoted after a synchronous leader dies',
        'It only works for read traffic and cannot carry any writes at all',
      ],
      answer: 1,
      why: 'Sync trades latency and availability for durability: a write is not acknowledged until the slowest follower confirms. Many systems compromise by waiting for just one follower (semi-sync).',
    },
  ],
};

export default lesson;
