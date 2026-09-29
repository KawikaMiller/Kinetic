import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Consistent hashing assigns keys to servers so that adding or removing a server moves only a small share of the keys, instead of nearly all of them.",
    what: "The naive approach, hash(key) % N, remaps almost every key when N changes. Consistent hashing puts servers and keys on the same circle of hash values, and each key belongs to the next server clockwise. A new server only takes over the keys in its slice of the circle. Virtual nodes give each server many points on the ring so the load evens out.",
    analogy: "Houses on a ring road, each served by the next fire station clockwise. Build a new station and only the houses just before it switch over; everyone else keeps theirs.",
    useCases: [
      "Sharding distributed caches across many nodes",
      "Data partitioning in DynamoDB, Cassandra and Riak",
      "Load balancers and CDNs keeping the same user on the same server",
      "Growing or shrinking a cluster without a flood of cache misses",
    ],
    why: "When a cluster changes size, % N sends a stampede of cache misses or data moves straight at your database. Consistent hashing is the standard fix, and a staple of senior system-design interviews about sharding and caching.",
    watch: "The circle is the hash space. Server points sit on it, and each coloured arc shows which server owns that slice. Dots are keys, coloured by owner; yellow ones just moved. Add a server and compare the keys-moved counter against the % N view. The bars show keys per server against a fair share.",
  },
  tryThis: [
    'Click "+ Add server" on the ring: only the keys next to the new server walk over.',
    'Switch to hash(key) % N and add a server: watch nearly everything fly.',
    'With 1 virtual node the bars are lopsided. Drag virtual nodes to 50 and watch them even out.',
    'Hover a key to trace its clockwise walk to its owner.',
  ],
  keyIdeas: [
    'hash % N remaps almost every key when N changes: a cache stampede waiting to happen.',
    'A hash ring moves only about 1/N of keys when a server joins or leaves.',
    'Each key belongs to the first server clockwise from its hash.',
    'Virtual nodes give each server many small arcs, which evens out the load.',
  ],
  quiz: [
    {
      q: 'You have 4 cache servers using hash(key) % 4 and add a 5th. Roughly what fraction of keys move?',
      options: ['~20%', '~50%', '~80%', '0%'],
      answer: 2,
      why: 'A key stays put only if hash % 4 == hash % 5, which is true for about 1 in 5 keys.',
    },
    {
      q: 'On a consistent-hash ring, a new server takes keys from…',
      options: ['Every server equally', 'Only the next server clockwise from it', 'A random server', 'The busiest server'],
      answer: 1,
      why: 'The new point splits one arc; only keys in that slice change owner.',
    },
    {
      q: 'Why use virtual nodes?',
      options: [
        'To make lookups faster',
        'To encrypt the keys',
        'To spread each server over many small arcs so load is even',
        'To avoid hashing entirely',
      ],
      answer: 2,
      why: 'With one point each, arc sizes are random; many points per server average out the variance.',
    },
  ],
};

export default lesson;
