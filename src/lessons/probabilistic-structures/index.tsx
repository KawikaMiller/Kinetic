import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Probabilistic data structures answer questions like "have I seen this?" or "how many distinct things?" using a tiny, fixed amount of memory, in exchange for a small, controllable chance of being wrong.',
    what: 'A Bloom filter is an array of bits. Inserting an item sets k bits chosen by k hash functions; a query checks those k bits. Any 0 means "definitely not present", while all 1s means "probably present", because other items may have set those bits (a false positive, never a false negative). HyperLogLog counts distinct items: it hashes each one, uses a few bits to pick a register, and records the longest run of leading zeros seen there. Long runs are exponentially rare, so combining the registers estimates the count to within about 1.04/√m, whether there are thousands of items or billions.',
    analogy: 'Bloom filter: a bouncer who remembers only a few features of each guest. "Nobody with that jacket came in" is certain; "someone like that came in" might be a lookalike. HyperLogLog: if you have flipped a coin until it came up heads and once saw ten tails in a row, you have probably done about a thousand tries.',
    useCases: [
      'LSM databases (Cassandra, RocksDB) skipping files that can\'t hold a key',
      'Caches and CDNs avoiding lookups for things never stored; "is this URL malicious?" checks',
      'Counting unique visitors, searches or IPs: Redis PFCOUNT, BigQuery APPROX_COUNT_DISTINCT',
      'Stream processing and monitoring where exact sets would be enormous',
    ],
    why: 'At scale, exact answers can cost gigabytes of RAM and a network hop per check. Staff-level engineers recognise when "approximately right, in 12 KB" beats "exactly right, in 8 GB", can size the error rate on purpose, and know which mistakes are safe (a Bloom false positive costs one extra lookup; a false negative never happens).',
    watch: 'Bloom filter: each square is one bit (violet = 1). Inserting a word draws k yellow arrows to the bits it sets; querying draws arrows that land green on a 1 or red on a 0. The verdict badge says "definitely not", "probably", or FALSE POSITIVE. HyperLogLog: the item\'s 32-bit hash is split into violet register-index bits, a yellow run of leading zeros and the green first 1; the blue bars are the registers, and yellow flashes when one grows. Compare the estimate and memory with the exact numbers.',
  },
  tryThis: [
    'Insert words until most bits are violet, then query unseen words until you hit a false positive.',
    'Keep the words, drag m from 16 to 64: the false-positive rate collapses.',
    'Try k = 1 and k = 6 with a nearly full filter. The best k is about (m/n)·ln 2.',
    'HyperLogLog: add 1,000,000 items with 256 registers. It stays within a few percent using 192 bytes.',
  ],
  keyIdeas: [
    'Bloom filter: "no" is always right, "yes" might be a false positive. No false negatives.',
    'More bits per item means fewer false positives; there\'s an optimal number of hashes k.',
    'HyperLogLog estimates distinct counts from the rarest hash patterns seen; duplicates can\'t inflate it.',
    'Memory is fixed and tiny; you trade a known error rate for orders-of-magnitude savings.',
  ],
  quiz: [
    {
      q: 'A Bloom filter query returns "not present". How sure can you be?',
      options: ['Not very: it might be a false negative', 'Completely sure', 'About 1 − the false-positive rate', 'It depends on k'],
      answer: 1,
      why: 'If the item had been inserted, all its bits would be 1. A single 0 proves it never was.',
    },
    {
      q: 'Why can\'t you delete from a plain Bloom filter?',
      options: ['Bits are read-only', 'Clearing a bit might also "delete" other items that share it', 'Deletes are too slow', 'Hashes change after insert'],
      answer: 1,
      why: 'Bits are shared between items. Counting Bloom filters or cuckoo filters exist when you need deletes.',
    },
    {
      q: 'You add the same 1,000 user ids to a HyperLogLog a million times each. The estimate is about…',
      options: ['1,000', '1,000,000', '1,000,000,000', 'It overflows'],
      answer: 0,
      why: 'Same item → same hash → same register and rank. HyperLogLog counts distinct items, so duplicates change nothing.',
    },
  ],
};

export default lesson;
