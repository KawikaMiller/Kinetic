import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Hash sharding spreads keys evenly, not requests: when a few keys are far more popular than the rest, the shard that holds the hottest key saturates while the cluster as a whole is half idle.',
    what: 'A hash of the key picks the shard, so 1,000 keys land about 125 to a shard. But request popularity is uneven: under a Zipf law the hottest key carries 1 / H of all traffic, about 13% here, and its shard has to serve all of it plus its ordinary share. Fixes move work off the hot key. Salting splits a hot key into m sub-keys for writes, at the price that every read must gather all m. A cache takes only reads, replication spreads reads and multiplies writes, and splitting a shard only moves the neighbours. A count-min sketch can find the hot keys, and a sketch that is too small misses them. Hot keys can also move in time, which leaves a fixed fix aimed at yesterday.',
    analogy: 'A food court with eight counters where the customers are sent to a counter by the first letter of their name. The counters are equally fair, but one famous dish is ordered by a third of the crowd, and whichever counter sells it has the queue while the others stand idle.',
    useCases: [
      'A celebrity, a viral post or a flash-sale item that suddenly dominates the requests',
      'A counter or a rate limit keyed by one tenant, user or page that gets most of the writes',
      'Reading a dashboard where one partition is hot and the average load looks fine',
      'Choosing between salting, caching and replicating for a key that is hot for reads or for writes',
    ],
    why: 'Capacity planning by the average hides the shard that falls over first. Knowing that skew is about requests per key, which mitigation fixes reads and which fixes writes, and that the hot key can move, is what turns a mystery of one slow shard into a design choice.',
    watch:
      'Each bar is one shard\'s load as a share of its own capacity: green below the dashed mark, red past it, and the hottest shard is outlined in yellow. Orange is the hot key, violet the salted sub-keys and the extra work a mitigation adds, and blue the requests a cache absorbed. In the sketch scene a green key was flagged, a grey struck-through key is a hot key the sketch missed, and an orange key was flagged although it is not hot. The chips say what is simulated, illustrative or scripted.',
  },
  tryThis: [
    'At the defaults in "The melt" press play: the hottest key carries about 13% of the requests, and "First shard saturates at" reads below 60% of total utilisation, so by the end the hottest shard sits past its dashed capacity mark while the cluster is 70% used. Drag the exponent to 0 (uniform keys) and the saturation point moves above 80%.',
    'In "Mitigations" the default is salting with 4 suffixes at 20% reads: the busiest shard falls, and "Extra shard requests" counts the gather work each read of a salted key adds. Set "Reads in the mix" to 0% and the extra work is 0. Set it to 90% and salting leaves the busiest shard worse than no mitigation.',
    'In the same scene pick "Cache in front" and set "Reads in the mix" to 0%: "Hottest shard / mean" is exactly the "no mitigation" figure, because a cache absorbs only reads. Set reads to 100% and it falls.',
    'In "Find the hot keys" the 32-counter sketch misses the hot key user:4 and flags 3 keys that are not hot. Drag "Sketch width" to its end, 512: all four hot keys are flagged and none is missed.',
    'In "Hot in time" the salting is made for the first half\'s hot keys and the hot keys move halfway: the second half is more unbalanced than the first. Set Salting to "Follows the hot keys" and it falls back.',
  ],
  keyIdeas: [
    'Hashing spreads keys, not requests: in this model the hottest key carries 1 / H of the traffic, and its shard saturates at a total utilisation well below 100%.',
    'Salting spreads a hot key\'s writes over m sub-keys and makes each read gather the m sub-keys; a cache absorbs reads and does nothing for writes, so the read-to-write mix decides which one helps.',
    'A sketch with too little memory flags cold keys and misses hot ones, so salting just the flagged keys leaves the real hot key melting its shard.',
    'Hot keys can move in time: a split or salting made for yesterday\'s hot key does nothing for today\'s, so the fix has to follow the detection.',
  ],
  quiz: [
    {
      q: 'Total load is half of the cluster\'s capacity, yet one shard is dropping requests. What is the likeliest cause, and what does salting cost the readers?',
      options: [
        'One hot key piles its traffic on a single shard; every read of it must gather all its sub-keys',
        'The hash function is broken and sends most keys to one shard; reads need a second hash lookup',
        'The cluster is too small for the load; reads of salted keys have to be retried after a timeout',
        'The cache is too large and evicts hot keys; salting makes reads wait for the cache to refill',
      ],
      answer: 0,
      why: 'Hashing spreads the keys, but one key can carry a large share of the requests, and its whole share goes to its shard. Salting splits its writes over m sub-keys, so a read has to ask each of them.',
    },
    {
      q: 'Why does hash sharding not spread the load evenly?',
      options: [
        'It places keys evenly, and a few keys receive far more requests than the others',
        'It places requests evenly, and a few shards are given more capacity than the others',
        'It spreads reads evenly and leaves writes on one shard, so reads are cheap there',
        'It is even for keys that are written and uneven for keys that are only read',
      ],
      answer: 0,
      why: 'Placement is about where a key lives. The load is about how many requests each key gets, and under a skewed popularity one key can account for a large part of the total.',
    },
    {
      q: 'A cache in front of the shards absorbs hot reads. What does it do for a hot key that is mostly written?',
      options: [
        'It halves the load, because a cache copy is kept for each shard',
        'It helps a little, because the hot writes warm the cache on the way past',
        'It removes the load, because a cached key is no longer sent to a shard',
        'It does nothing for the writes, which still reach the shard in full',
      ],
      answer: 3,
      why: 'A cache can answer a read from memory but a write has to be applied at the shard. A hot key that is written a lot keeps its shard just as busy with a cache in front.',
    },
    {
      q: 'The sketch that finds hot keys is made much smaller. What goes wrong?',
      options: [
        'Collisions make cold keys look hot and can push a real hot key out of the candidates',
        'The sketch undercounts every key, so none of them is flagged as hot any more',
        'The sketch forgets the oldest requests, so a hot key from early on is dropped',
        'The sketch needs one more hash row for every key it fails to flag as hot',
      ],
      answer: 0,
      why: 'A count-min estimate is too high or exact, not too low, and a small sketch inflates cold keys with the counts of hot ones. The candidate list then fills with the wrong keys.',
    },
    {
      q: 'The hot key changes halfway through the day. What happens to a fix that was set up on the first half\'s hot key?',
      options: [
        'It keeps balancing the load, because the sub-keys are spread over every shard',
        'It stops helping, because the keys that are hot now were never salted',
        'It makes things worse for the new hot key, because its shard is now double loaded',
        'It rebalances itself, because salting follows whichever key is read most',
      ],
      answer: 1,
      why: 'Salting applies to the keys it was given. When another key becomes hot, its shard melts again until detection flags the new key and the salting is applied to it.',
    },
  ],
};

export default lesson;
