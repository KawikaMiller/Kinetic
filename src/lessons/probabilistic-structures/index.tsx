import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Probabilistic data structures answer questions like "have I seen this?" or "how many distinct things?" using a tiny, fixed amount of memory, in exchange for a small, controllable chance of being wrong.',
    what: 'A Bloom filter is an array of bits. Inserting an item sets k bits chosen by k hash functions; a query checks those k bits. Any 0 means "definitely not present", while a row of 1s means "probably present", because other items may have set those bits (a false positive; a filter with inserts and no deletes gives no false negatives). HyperLogLog counts distinct items: it hashes each one, uses a few bits to pick a register, and records the longest run of leading zeros seen there. Long runs are exponentially rare, so combining the registers estimates the count with a relative standard error of about 1.04/√m: a usual miss, not a bound, so a single run can be off by twice that. This demo uses a 32-bit hash and just the small-range correction, so it covers thousands to millions of items; real sketches use 64-bit hashes to count far higher.',
    analogy: 'Bloom filter: a bouncer who remembers a few features of each guest. "Nobody with that jacket came in" is certain; "someone like that came in" might be a lookalike. HyperLogLog: if you have flipped a coin until it came up heads and once saw ten tails in a row, you have probably done about a thousand tries.',
    useCases: [
      'LSM databases (Cassandra, RocksDB) skipping files that can\'t hold a key',
      'Caches and CDNs avoiding lookups for things never stored; "is this URL malicious?" checks',
      'Counting unique visitors, searches or IPs: Redis PFCOUNT, BigQuery APPROX_COUNT_DISTINCT',
      'Stream processing and monitoring where exact sets would be enormous',
    ],
    why: 'At scale, exact answers can cost gigabytes of RAM and a network hop per check. Staff-level engineers recognise when "approximately right, in 12 KB" beats "exactly right, in 8 GB", can size the error rate on purpose, and know which mistakes are safe (a Bloom false positive costs one extra lookup, and a plain filter has no false negatives to fear).',
    watch: 'Bloom filter: each square is one bit (violet = 1). Inserting a word draws k yellow arrows to the bits it sets (the bits flash yellow); querying draws arrows that land green on a 1 or red on a 0. The verdict badge says "definitely not" (blue), "probably" (green) or FALSE POSITIVE (red). HyperLogLog: the item\'s 32-bit hash is split into violet register-index bits, yellow leading zeros and the green first 1; the blue bars are the registers, the violet bar is the register the last item hit, and a bar flashes yellow when it grows. Two bars at the bottom compare memory: green for the sketch, red for an exact set.',
  },
  tryThis: [
    'Press Insert next word until most bits are violet, then press Query an unseen word until you hit a false positive.',
    'Keep the words, drag m from 16 to 64: the false-positive rate collapses.',
    'With about a dozen words in 32 bits, try k = 1, k = 2 and k = 6. The best k is about (m/n)·ln 2.',
    'HyperLogLog: press +1,000,000 with 256 registers (192 bytes). The error stat shows how far this run lands from the 6.5% standard error; one run can miss by twice that.',
  ],
  keyIdeas: [
    'Bloom filter: a "no" is certain for a filter that has had inserts and no deletes; a "yes" might be a false positive.',
    'More bits per item means fewer false positives; there\'s an optimal number of hashes k, and going past it raises the rate again.',
    'HyperLogLog estimates distinct counts from the rarest hash patterns seen; duplicates can\'t inflate it. Its error is a standard error, 1.04/√m, not a bound.',
    'Memory is fixed and tiny; you trade a known error rate for orders-of-magnitude savings.',
  ],
  quiz: [
    {
      q: 'A Bloom filter with inserts and no deletes answers "not present". How sure can you be?',
      options: [
        'Not very: that answer might be a false negative',
        'Sure: one 0 bit proves it was never inserted',
        'About 1 minus the false-positive rate',
        'It depends on how many hashes k you chose',
      ],
      answer: 1,
      why: 'If the item had been inserted, each of its bits would be 1. A single 0 proves it was not.',
    },
    {
      q: 'Why can\'t you delete from a plain Bloom filter?',
      options: [
        'Bits are read-only once the first item has been inserted',
        'Deletes are too slow to be worth supporting in a hot path',
        'Clearing a bit might also "delete" other items that share it',
        'The hash positions change after each new insert, so lookups drift',
      ],
      answer: 2,
      why: 'Bits are shared between items. Counting Bloom filters or cuckoo filters exist when you need deletes.',
    },
    {
      q: 'You add the same 1,000 user ids to a HyperLogLog a million times each. The estimate is about…',
      options: ['1,000', '1,000,000', '1,000,000,000', 'It overflows'],
      answer: 0,
      why: 'Same item → same hash → same register and rank. HyperLogLog counts distinct items, so duplicates change nothing.',
    },
    {
      q: 'A HyperLogLog with 256 registers estimates a million distinct items. What error should you expect?',
      options: [
        'Exactly zero, since every register is counted directly',
        'Under 1%, because a million items average the noise out',
        'The error grows steadily with every extra item added',
        'About 6.5% typically; one run can miss by twice that',
      ],
      answer: 3,
      why: 'The standard error is 1.04/√256, about 6.5%, and it depends on the register count, not on how many items were added. A single run can land two standard errors away.',
    },
    {
      q: 'Why does adding more hash functions k stop helping a Bloom filter past some point?',
      options: [
        'The extra hashes run out of distinct bit positions to use in the array',
        'Queries get slower until they start timing out under normal load',
        'The filter starts returning false negatives for the oldest items',
        'More bits get set per item, so the array fills and false positives rise',
      ],
      answer: 3,
      why: 'More hashes make each query check more bits, which helps, but each insert also sets more bits. Past about (m/n)·ln 2 the filling wins and the false-positive rate climbs.',
    },
  ],
};

export default lesson;
