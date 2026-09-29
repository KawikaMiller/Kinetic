import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A hash table stores key-value pairs so you can find any key in about O(1) time, by turning the key itself into an array index.",
    what: "A hash function turns the key into a number, and that number modulo the bucket count picks a bucket. When two keys land in the same bucket (a collision) they're chained together in a list. When the table gets too full it doubles in size and redistributes every key, which keeps the chains short.",
    analogy: "A coat check: your ticket number tells the attendant exactly which hook your coat is on. Nobody searches the whole rack.",
    useCases: [
      "Dictionaries and maps in every language: dict, Map, HashMap, plain JS objects",
      "Caches, de-duplication and \"have I seen this before?\" checks",
      "Database hash indexes and hash joins",
      "Counting things: word frequencies, requests per user for rate limits",
    ],
    why: "It's the most-used data structure in real code and the default answer to \"make this lookup faster\". Understanding collisions, load factor and resizing explains why it's usually O(1), and when it isn't: a bad hash function, or an attacker choosing your keys.",
    watch: "Type a key and watch it get hashed letter by letter; then hash % buckets picks its bucket. A red flash means a collision and the key joins that bucket's chain. The load-factor meter fills as you insert, and crossing 0.75 doubles the buckets so every key flies to its new home. Try the bad hash to see keys pile up.",
  },
  tryThis: [
    'Type a key and Insert. Watch letters fold into a number, then % buckets picks the slot.',
    'Hit "Insert 5 random" until the load meter crosses 0.75 and the table doubles.',
    'Look up a key that shares a bucket with others. Count the probes as it walks the chain.',
    'Switch to the bad hash (length). Everything piles into a few buckets. That’s O(n) again.',
  ],
  keyIdeas: [
    'hash(key) % buckets → which slot. Same key, same slot, every time.',
    'Collisions are normal. Separate chaining hangs a small list off each bucket.',
    'Keep the load factor (keys / buckets) low by doubling and rehashing, so chains stay short: O(1) average.',
    'A bad hash function clusters keys and quietly turns O(1) into O(n).',
  ],
  quiz: [
    {
      q: 'Two different keys land in the same bucket. What is that called?',
      options: ['A rehash', 'A collision', 'An eviction', 'A cache miss'],
      answer: 1,
      why: 'Collisions are unavoidable (more possible keys than buckets). Chaining or probing handles them.',
    },
    {
      q: 'Why does the table double its buckets when the load factor gets high?',
      options: [
        'To save memory',
        'To keep chains short so lookups stay O(1) on average',
        'Because keys expire',
        'To sort the keys',
      ],
      answer: 1,
      why: 'More buckets → fewer keys per bucket → fewer probes. Resizing is O(n) but rare, so it amortises out.',
    },
    {
      q: 'After a resize from 8 to 16 buckets, why does every key move?',
      options: [
        'Keys are re-sorted',
        'Its hash changes',
        'Its index is hash % 16 now, not hash % 8',
        'Old buckets are deleted randomly',
      ],
      answer: 2,
      why: 'The hash is the same, but the modulus changed, so the bucket index is recomputed for every key.',
    },
  ],
};

export default lesson;
