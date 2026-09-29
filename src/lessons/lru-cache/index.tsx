import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A cache keeps copies of frequently used data somewhere fast. When it fills up, an eviction policy such as LRU (least recently used) decides what gets thrown out.",
    what: "Reads check the cache first. A hit returns immediately; a miss goes to the slow source, such as a database, and the answer is stored in the cache on the way back. Space is limited, so LRU evicts whatever hasn't been used for the longest. A real LRU pairs a hash map with a doubly linked list so both get and put are O(1).",
    analogy: "Your desk vs. the filing cabinet. Papers you touched recently stay on the desk; when the desk is full, the one you haven't looked at in the longest goes back in the cabinet.",
    useCases: [
      "Redis or Memcached in front of a database",
      "CPU caches, browser caches and CDNs",
      "Memoizing expensive function calls",
      "The classic interview question: \"design an LRU cache\"",
    ],
    why: "Caching is the cheapest big performance win you'll ever get, and one of the easiest ways to create stale-data bugs. Understanding hit ratio, eviction and access patterns lets you size a cache and predict whether it will actually help.",
    watch: "Requests travel from the client toward the database. Green means a cache hit, served instantly. Red means a miss: a trip to the slow database, with the value coming back in blue. The cache row runs from safest on the left to next-to-go on the right (for LRU, most to least recently used), and the slot with the red dashed border is the one about to be evicted.",
  },
  tryThis: [
    'Press play and follow one request: cache first, database only on a miss.',
    'Slide traffic to "uniform", then to "very hot keys", and watch the hit ratio.',
    'Switch LRU → FIFO on the same traffic. FIFO happily evicts the hottest item.',
    'Click the emoji to request something yourself and force an eviction.',
  ],
  keyIdeas: [
    'A cache trades a little memory for a lot of speed: hits skip the slow trip.',
    'When the cache is full, the eviction policy decides who gets kicked out.',
    'LRU bets that recently used data will be used again, which usually holds for real traffic.',
    'LRU = hash map + doubly linked list, so get and put are both O(1).',
  ],
  quiz: [
    {
      q: 'An LRU cache is full and needs space. Which item goes?',
      options: ['The newest one', 'The one used longest ago', 'The one used least often', 'A random one'],
      answer: 1,
      why: 'Least Recently Used: the item whose last access is oldest sits at the tail and is evicted first.',
    },
    {
      q: 'Why does an LRU cache pair a hash map with a doubly linked list?',
      options: [
        'To keep items sorted alphabetically',
        'The map finds a node in O(1); the list reorders and evicts in O(1)',
        'To store two copies for safety',
        'Linked lists use less memory than arrays',
      ],
      answer: 1,
      why: 'Map lookup finds the node instantly, and unlinking or moving a node in a doubly linked list is constant time.',
    },
    {
      q: 'Traffic becomes more skewed (a few very popular keys). The hit ratio usually…',
      options: ['Goes up', 'Goes down', 'Stays exactly the same', 'Drops to zero'],
      answer: 0,
      why: 'Hot keys stay cached and get hit again and again, so a small cache covers most requests.',
    },
  ],
};

export default lesson;
