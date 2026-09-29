import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Sharding splits one big dataset across several databases, and the shard key you choose decides which writes spread out and which queries stay cheap.",
    what: "When one machine can't hold the data or handle the writes, you partition rows across shards using a shard key. Range sharding keeps nearby keys together, so range queries are cheap, but sequential keys like timestamps pile onto one hot shard. Hash sharding spreads keys evenly, but any query not on the exact key must ask every shard (scatter-gather). Adding shards means moving data, and naive hash % N moves almost all of it.",
    analogy: "A library that outgrows one building. Split by author surname and finding one author is easy, but every new book by \"Smith\" crowds the same building. Split by a hash of the title and the buildings fill evenly, but \"all books from 1990\" means visiting every building.",
    useCases: [
      "Scaling write-heavy databases past one machine (Vitess for MySQL, Citus for Postgres, MongoDB)",
      "Multi-tenant SaaS: shard by customer so each tenant's data stays together",
      "Time-series and logs, where a time-only key creates hot spots",
      "DynamoDB and Cassandra partition keys",
    ],
    why: "Sharding is one of the hardest decisions to reverse: the shard key is baked into every query and every row. Seniors are expected to pick a key that matches the dominant access pattern, avoid hot partitions, and plan how data moves when the cluster grows.",
    watch: "Each column is a shard, with its key range or hash bucket at the top. The yellow chip in the router is the order being written; it flies to its shard. The bar shows each shard's share of writes, and a red glowing shard is hot. During queries, yellow shards are the ones asked. After \"Add a shard\", violet chips are orders that had to move.",
  },
  tryThis: [
    'Play Range + created_at: watch every new order pile onto S4.',
    'Switch to Hash: writes spread evenly, but "last hour" asks all 4 shards.',
    'Try user_id as the shard key and compare the two queries.',
    'Press "Add a shard" with Hash, then with Range, and compare orders moved.',
  ],
  keyIdeas: [
    'The shard key decides which queries hit one shard and which hit all of them.',
    'Sequential keys (timestamps, auto-increment ids) with range sharding create a hot shard.',
    'Hash sharding spreads load but turns range queries into scatter-gather.',
    'hash % N reshuffles most data when N changes; consistent hashing fixes that.',
  ],
  quiz: [
    {
      q: 'You range-shard an events table by timestamp. What goes wrong?',
      options: ['Reads get slower', 'All new writes hit the newest shard', 'Data gets lost', 'Nothing'],
      answer: 1,
      why: 'Every new event has a recent timestamp, so they all fall into the latest range, creating one hot shard.',
    },
    {
      q: 'With hash sharding on user_id, the query "all orders from last week" must…',
      options: ['Hit one shard', 'Hit every shard and merge results', 'Fail', 'Use the newest shard'],
      answer: 1,
      why: 'Time isn\'t the shard key, so matching rows can be on any shard: scatter-gather, limited by the slowest one.',
    },
    {
      q: 'Why is shard = hash(key) % N painful when you add a shard?',
      options: ['Hashes change', 'Most keys map to a different shard, so most data must move', 'It needs a restart', 'Old shards get deleted'],
      answer: 1,
      why: 'Changing N changes the result of % N for most keys. Consistent hashing or fixed virtual partitions keep moves small.',
    },
  ],
};

export default lesson;
