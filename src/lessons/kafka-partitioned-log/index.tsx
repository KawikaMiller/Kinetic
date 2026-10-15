import type { LessonModule } from '../../core/types';
import { RAISED_CONSUMERS, acksFacts, raiseFacts, repartitionFacts, retentionFacts } from './facts';
import { Stage } from './Stage';

const repartition = repartitionFacts();
const raise = raiseFacts();
const acks = acksFacts();
const retention = retentionFacts();
const listOffsets = (offsets: readonly number[]) => `${offsets.slice(0, -1).join(', ')} and ${offsets.at(-1)}`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A Kafka topic is a set of append-only logs called partitions: a record\'s key picks its partition, offsets order records inside one partition only, and consumers, replicas and cleanup all work per partition.',
    what: 'Producers append records to a partition, chosen by hashing the key (or by turning, with no key). A consumer group splits the partitions among its consumers, each partition read by one consumer at a time, and remembers a committed offset per partition; committing after the work repeats a record on a crash, committing before skips one. Each partition is copied to follower brokers, and the leader answers a write when the producer\'s acks setting says so; the high watermark is the highest offset every in-sync replica holds, and a leader election that picks a replica without a record loses it. A partition keeps a window of its log (retention) or the newest record per key (compaction).',
    analogy: 'A row of numbered pigeonholes, one row per partition: the label on a letter picks the row, the numbers count only along that row, and each reader in a book club takes whole rows, never half of one.',
    useCases: [
      'Picking a partition key so one customer\'s or device\'s events stay in order',
      'Sizing a consumer group: how many consumers can usefully read a topic',
      'Choosing acks, min.insync.replicas and unclean election for data that cannot be lost',
      'Keeping a changelog topic small with compaction while the state can still be rebuilt',
    ],
    why: 'Three false assumptions cause many surprises with a log-based system: that order is global, that more consumers are always faster, and that a write the producer was told about is safe. Knowing where each one breaks lets you choose keys, group sizes and replication settings on purpose.',
    watch:
      'Partitions: records are tinted by key in four hues (two keys can share a hue, so the letters name the key; grey is no key), a violet rail marks the partition\'s leader broker, and the strip underneath is arrival order. Consumer groups: a green bar is the committed offset, a blue tick the consumer\'s position, violet the lag, a dark dim box an idle consumer, a yellow outline the risky window and a yellow bar the rebalance pause, red a record repeated or skipped. Replication: green cells are committed (left of the dashed yellow high watermark), yellow outlines are in flight, red is an acknowledged record the leader lacks, a dim outline a copy the leader does not hold, and a violet rail the leader. Retention: tinted cells are records in key hues, a hollow cell with a null sign is a tombstone, a dim outline an offset no longer on disk, a blue ring the consumer, a yellow rail the open segment. Chips say what is simulated, scripted, a toy, illustrative or from memory.',
  },
  tryThis: [
    `In "Partitions and keys", press "Burst of 40" with the 5 user ids, then raise Partitions from ${repartition.from} to ${repartition.to}: ${repartition.moved} of the ${repartition.keys} keys would now go to a different partition than their latest record.`,
    `In "Consumer groups", raise Consumers from 2 to ${RAISED_CONSUMERS} and press "Step one tick" once: the rebalance runs, ${raise.busy} consumers get a partition (the log says "assign P2 to c3") and the other ${raise.idle} sit idle.`,
    'In "Consumer groups", press "Crash c1 at the worst moment" and then Run: with Commit after processing, "Processed twice" reaches 1. Switch Commit to "before processing" and do the same: "Skipped" reaches 1 instead.',
    `In "Replication", replay to the end: record r4 was acknowledged at offset 3 and then lost when the leader crashed (the check fails at ${acks.at} ms). Set acks to all and min.insync.replicas to 2: the same crash loses nothing, because r4 is never acknowledged.`,
    `In "Retention and compaction", press "Run retention": the log start moves to ${retention.logStart} and the consumer at offset ${retention.position} gets "offset out of range". Switch to Compaction and press "Run the cleaner": ${retention.kept.length} of the ${retention.sent} records stay, at offsets ${listOffsets(retention.kept)}.`,
  ],
  keyIdeas: [
    'In this model a key always hashes to one partition, so its records keep their order, while records of different keys interleave freely and no order exists across partitions.',
    'A group gives each partition to one consumer, so in this model consumers beyond the partition count sit idle, and adding partitions changes which one a key hashes to.',
    'The commit decides the failure: in this model committing after the work repeats a record on a crash (at-least-once), and committing before skips one (at-most-once).',
    'The high watermark is what every in-sync replica holds; in this model acks=all with a clean election never loses an acknowledged record while a broker holding it survives, min.insync.replicas sets how many brokers must hold a record before it is answered, and acks=1 and unclean election are how acknowledged records are lost.',
  ],
  quiz: [
    {
      q: 'Two records with the same key and one with a different key are sent in turn to a topic of several partitions. What is promised about their order?',
      options: [
        'The two same-key records stay in order, since they share a partition; across partitions no order is promised',
        'All three arrive in the order sent, since the broker numbers every record in one global sequence for the topic',
        'The same-key records keep their order only while the topic has one partition, and interleave once it has more',
        'Order across partitions holds too, provided the consumers in the group commit their offsets in order',
      ],
      answer: 0,
      why: 'A key hashes to one partition and offsets number the records inside a partition. Different partitions are separate logs, so nothing orders a record in one against a record in another.',
    },
    {
      q: 'A topic has 4 partitions and a consumer group has 6 consumers. How many consumers read from it?',
      options: [
        'Four: each partition is read by one consumer of the group, so two consumers sit idle',
        'Six: a busy partition is split between two consumers so that the extra ones share the load',
        'Six: the extra two take turns reading a partition together with the consumer that owns it',
        'Two: a group can use only as many consumers as it has partitions beyond its first four',
      ],
      answer: 0,
      why: 'Within a group a partition has one owner at a time, so the partition count caps the busy consumers. Extra consumers are standbys that take over after a crash or a rebalance.',
    },
    {
      q: 'A consumer commits its offset before processing each record and crashes in the middle of one. What happens to that record once the replacement starts?',
      options: [
        'It is skipped: the committed offset says it was done, but the work never finished',
        'It is processed twice: the replacement restarts from the offset before it and repeats the work',
        'It is processed once, because the broker re-delivers anything the consumer never confirmed',
        'It is kept in the crashed consumer\'s memory, and the replacement picks it up from there',
      ],
      answer: 0,
      why: 'The replacement resumes at the committed offset, which already points past the record. In this model committing first gives at-most-once: a crash can cost the record in flight, and no record is repeated.',
    },
    {
      q: 'Which setting can lose a write that the broker told the producer had succeeded?',
      options: [
        'acks=1 with a clean election: the leader answers before any follower has copied the record',
        'acks=all with min.insync.replicas=2 and a clean election, when the leader crashes right after answering',
        'acks=0, because the leader never confirms the write and so the producer cannot know it landed',
        'acks=all, because waiting for the in-sync replicas makes the producer time out and give up',
      ],
      answer: 0,
      why: 'With acks=1 the leader answers on its own copy, so a follower elected afterwards may lack the record. With acks=all and min.insync.replicas=2 in this model an answer means two replicas hold it, and acks=0 never answers at all: it loses records too, but none of them was ever reported as stored, so the Replication scene counts them as sent and missing instead.',
    },
    {
      q: 'A log is compacted and a consumer then asks for offset 3, which the cleaner removed. What does it get?',
      options: [
        'The next record that survived, with its original offset, since compaction renumbers nothing',
        'An "offset out of range" error, as after retention, because that offset is no longer on disk',
        'A record renumbered to offset 3, so that the compacted log stays free of gaps for readers',
        'The newest value of that record\'s key, written again at the end of the log as a fresh record',
      ],
      answer: 0,
      why: 'Compaction drops older records of a key and leaves the rest where they were, so offsets have holes but the log start does not move. Retention is what moves the start and makes an old offset an error.',
    },
  ],
};

export default lesson;
