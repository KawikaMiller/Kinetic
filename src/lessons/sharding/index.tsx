import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Sharding splits one big dataset across several databases, and the shard key you choose decides which writes spread out and which queries stay cheap.",
    what: "When one machine can't hold the data or handle the writes, you partition rows across shards using a shard key. Range sharding keeps nearby keys together, so range queries are cheap, but sequential keys like timestamps pile onto one hot shard. Hash sharding spreads keys, but any query not on the exact key must ask every shard (scatter-gather). Adding shards means moving data, and naive hash % N moves about N/(N+1) of it.",
    analogy: "A library that outgrows one building. Split by author surname and finding one author is easy, but every new book by \"Smith\" crowds the same building. Split by a hash of the title and the buildings fill evenly, but \"all books from 1990\" means visiting every building.",
    useCases: [
      "Scaling write-heavy databases past one machine (Vitess for MySQL, Citus for Postgres, MongoDB: from memory, check their docs)",
      "Multi-tenant SaaS: shard by customer so each tenant's data stays together",
      "Time-series and logs, where a time-only key creates hot spots",
      "Partition keys in Dynamo-style stores (DynamoDB, Cassandra: from memory)",
    ],
    why: "A shard key is hard to reverse: it is baked into every query and every row. Teams are expected to pick a key that matches the dominant access pattern, avoid hot partitions, and plan how data moves when the cluster grows.",
    watch: "Each column is a shard with its key range or hash bucket at the top, and each shard has its own colour along the top edge (sky blue, teal, lime, magenta, indigo). The yellow chip in the router is the order being written, and it flies to its shard. The bar in each shard shows its share of the orders, and a shard with a red glow and a red hot tag is hot. During a query the router shows a yellow SELECT label and the shards it asks get a yellow outline and a queried tag. After \"Add a shard\", violet chips are orders that had to move, and the new shard has a dashed violet outline. The chips say the orders are made up and the query times are illustrative.",
  },
  tryThis: [
    'Play Range + created_at, the way it loads: every new order piles onto S4 and the busiest-shard number climbs to 4×.',
    'Switch to Hash and play again: the writes spread across the shards and none is hot, but "last hour" asks all 4 shards.',
    'Pick Range with the user_id key and compare the two queries: one asks all 4 shards, the other asks 1.',
    'Press "Add a shard" on Range + created_at (splitting does not cool the hot shard), then on Hash (most orders move), then on Range + user_id (just the split range moves).',
  ],
  keyIdeas: [
    'The shard key decides which queries go to one shard and which fan out to the whole cluster.',
    'A sequential key (a timestamp, an auto-increment id) under range sharding sends new writes to one hot shard.',
    'Hash sharding spreads the load but turns range queries into scatter-gather.',
    'hash % N reshuffles about N/(N+1) of the keys when N grows by one; consistent hashing or many small fixed partitions keep the moves small.',
  ],
  quiz: [
    {
      q: 'You range-shard an events table by timestamp. What goes wrong?',
      options: [
        'Reads of old events get slower, because the old data is spread across many shards',
        'Every new write lands in the newest range, so one shard takes the load',
        'Events are lost whenever the shard for a range is full',
        'Nothing, since ranges split the writes evenly by design',
      ],
      answer: 1,
      why: 'Each new event has a recent timestamp, so it falls into the latest range and that shard takes the write load while the older ones sit idle.',
    },
    {
      q: 'With hash sharding on user_id, the query "all orders from last week" must…',
      options: [
        'Go to the newest shard, which holds the latest rows',
        'Ask one shard, picked by hashing the date range',
        'Ask every shard and merge the answers, since time is not the key',
        'Fail, because a database can only run a query that names the shard key in its filter',
      ],
      answer: 2,
      why: "Time isn't the shard key, so matching rows can be on any shard: scatter-gather, which waits for the slowest shard.",
    },
    {
      q: 'Why is shard = hash(key) % N painful when you add a shard?',
      options: [
        'The old shards must restart, which drops their data until it reloads',
        'Changing N changes the result for most keys, so most rows move',
        'Each shard can hold only the keys it was first given',
        'The new shard takes rows from the busiest shard, which stalls it',
      ],
      answer: 1,
      why: 'Changing N changes hash % N for about N/(N+1) of the keys. Consistent hashing or fixed virtual partitions keep the moves small.',
    },
    {
      q: 'A team range-shards by an auto-increment id and splits the newest shard when it runs hot. What happens next?',
      options: [
        'The writes spread over both halves, since each half now holds half the range',
        'The old half stays hot, because after a split the router copies each new write to both halves of the range',
        'The new newest shard runs hot, because new ids keep landing at the top of the range',
        'Both halves cool down, because the split halves the data on each',
      ],
      answer: 2,
      why: 'New ids keep growing, so they fall into the topmost range, and splitting just creates a new topmost range that takes the same writes. A sequential key needs a different shard key or hashing.',
    },
  ],
};

export default lesson;
