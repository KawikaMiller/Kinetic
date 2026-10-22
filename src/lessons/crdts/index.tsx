import type { LessonModule } from '../../core/types';
import { NAIVE_LOWEST_SEED, SCHEDULE_SEEDS } from './schedule';
import { Stage } from './Stage';
import { DEFAULT_SEED, TRY_INCREMENTS } from './world';

const TRY_TOTAL = TRY_INCREMENTS.a + TRY_INCREMENTS.b;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A CRDT (conflict-free replicated data type) is a data structure that replicas can edit independently, even offline, and merge into the same result without coordination.',
    what: 'Normally, two replicas that change the same data while disconnected leave you with a conflict to resolve. A CRDT designs the data and its merge function so the conflict is resolved by construction: the merge is commutative, associative and idempotent, so replicas that have seen the same updates reach the same state in any order, even with duplicate messages. A G-Counter gives each replica its own slot and merges by taking the maximum per slot. An OR-Set tags each add uniquely, so a remove cancels the adds it saw and not a concurrent one. An LWW-Register keeps the write with the highest timestamp and discards the other.',
    analogy: "Several people keep tally marks on their own copy of a sheet, each in their own column. To combine sheets you take the larger tally in each column, so no one's marks are double-counted or lost.",
    useCases: [
      'Collaborative editors and local-first apps (Automerge and Yjs are CRDT libraries)',
      'Offline-capable mobile apps that sync later',
      'Multi-region databases with active-active writes (Riak and Redis Enterprise offer CRDT-based types)',
      'Distributed counters, presence and shopping carts',
    ],
    why: 'Once writes are accepted in several places at once, whether regions, devices or offline clients, you have to decide what happens when they collide. Engineers need to know when CRDTs give you availability without coordination, what they cost (metadata growth, tombstones), and when semantics like "last writer wins" silently throw data away.',
    watch:
      "Three replica boxes sit side by side, each with its own copy of the data. A green online pill means connected; a red dashed outline and a red offline pill mean partitioned. Blue pills flying across the top are full-state messages; each one is merged when it lands. For the G-Counter, the small A, B and C cells are each replica's slot (a violet outline marks its own slot). OR-Set items show their unique violet tags. In the stats, a green yes means the replicas agree and a red no means they do not; Lost increments is red. Switch Merge to Naive overwrite to watch the same edits diverge or lose updates. The sentence under the replicas reports the seeded check, and the chips say what is simulated.",
  },
  tryThis: [
    `G-Counter: take B offline, press +1 ${TRY_INCREMENTS.a} times on A and ${TRY_INCREMENTS.b} times on B, then Reconnect & sync. Every replica reads ${TRY_TOTAL}.`,
    `Same edits with Naive overwrite: each replica keeps whichever state landed last, so Lost increments reads at least ${TRY_TOTAL - TRY_INCREMENTS.a} (the best any replica can keep is A's ${TRY_INCREMENTS.a} of ${TRY_TOTAL}).`,
    'OR-Set: add 🍎 on A, take B offline, remove 🍎 on B while A adds 🍎 again, then Reconnect & sync. The add wins: every replica holds 🍎.',
    `After any sync, press "Replay sync, new order" a few times (seed ${DEFAULT_SEED}): the CRDT lands on the same answer each time, whatever order the six messages take.`,
    `Press "Check ${SCHEDULE_SEEDS} seeds": with CRDT merge no seed fails and the merge laws hold. Switch to Naive overwrite and press it again: it breaks on many seeds, the lowest failing seed is ${NAIVE_LOWEST_SEED.counter}, and "Random edits for this seed" loads that run.`,
  ],
  keyIdeas: [
    'CRDT merges are commutative, associative and idempotent, so the order of messages and duplicates do not change the result; the check tests the three laws on 200 seeded schedules.',
    'G-Counter: one slot per replica, merge = max per slot, value = sum.',
    'OR-Set: unique tags per add; a remove cancels the tags it saw, so a concurrent add survives.',
    "LWW converges, but it converges by discarding the losing write: convergence is not the same as keeping everyone's intent.",
  ],
  quiz: [
    {
      q: 'Why does a G-Counter merge with max per replica slot instead of adding the counts?',
      options: [
        'Taking the maximum is faster than adding up the slots',
        'Adding would double-count a state that is merged twice',
        'A G-Counter value can only ever go down over time',
        'The maximum needs less memory than keeping the sum',
      ],
      answer: 1,
      why: 'A merge needs to be idempotent: receiving the same state twice should not change the result. Max is idempotent; addition is not.',
    },
    {
      q: 'In an OR-Set, replica A adds "x" while replica B concurrently removes "x". After merging, what happens?',
      options: [
        '"x" is gone, because a remove always beats an add',
        '"x" is present: B\'s remove never saw A\'s new tag',
        'The merge fails until someone resolves the conflict',
        'It depends on which message arrives first',
      ],
      answer: 1,
      why: "A remove cancels the tags it observed. A's concurrent add has a fresh tag, so it survives: add-wins.",
    },
    {
      q: 'What does a last-writer-wins register guarantee?',
      options: [
        'That no write is ever lost, even a concurrent one',
        'That the replicas converge to the same value',
        'That writes are applied in true real-time order',
        'That a transaction can span several keys at once',
      ],
      answer: 1,
      why: 'LWW converges deterministically, but concurrent writes with lower timestamps are silently dropped.',
    },
    {
      q: 'A CRDT is called conflict-free. What does that mean for two replicas that set the same register at once?',
      options: [
        'A fixed rule picks one write, so the replicas agree and one write is lost',
        'Both writes are kept and shown side by side on each replica after the merge',
        'The two edits cannot happen at the same time on two replicas',
        'One replica is asked to decide which write counts as the correct one',
      ],
      answer: 0,
      why: 'A CRDT resolves the conflict by construction. For a register the rule picks a winner by timestamp (ties by replica id), so the other write is lost: convergence is not the same as keeping both.',
    },
    {
      q: 'Why can a replica safely receive the same state message twice?',
      options: [
        'Because the merge is idempotent, so a repeat changes nothing',
        'Because replicas ignore any message that they have already seen',
        'Because every message carries a unique number the receiver logs',
        'Because the network guarantees to deliver each message once',
      ],
      answer: 0,
      why: 'A state-based merge takes a maximum or a union, so merging the same state again changes nothing. That is idempotence, and it is why duplicate messages are harmless.',
    },
  ],
};

export default lesson;
