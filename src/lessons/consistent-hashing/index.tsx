import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Consistent hashing assigns keys to servers so that adding or removing a server moves a small share of the keys, instead of nearly all of them.",
    what: "The naive approach, hash(key) % N, changes the owner of about N/(N+1) of the keys when you add a server. Consistent hashing puts servers and keys on the same circle of hash values, and each key belongs to the next server point clockwise. A new server takes over just the keys in the slices its points split. Virtual nodes give each server many points on the ring so the load evens out.",
    analogy: "Houses on a ring road, each served by the next fire station clockwise. Build a new station and only the houses just before it switch over; the other houses keep theirs.",
    useCases: [
      "Sharding distributed caches across many nodes",
      "Dynamo-style stores: Cassandra and Riak place data on a ring (from memory, check their docs)",
      "Load balancers and CDNs that keep the same user on the same server (many offer a consistent-hash mode)",
      "Growing or shrinking a cluster without a flood of cache misses",
    ],
    why: "When a cluster changes size, % N sends a stampede of cache misses or data moves straight at your database. A hash ring is a common fix, and a recurring topic in system-design interviews about sharding and caching.",
    watch: "The circle is the hash space. Each server has its own colour: A sky blue, B orange, C pink, D teal, E lime, F magenta, G indigo, H pale grey. The coloured arcs show which server owns that slice, the small circles on the ring are the server points (labelled with the letter), and the dots are keys, coloured by their owner. A key that just moved pulses with a yellow ring, and a yellow arc traces a hovered key's walk. Add a server and compare the keys-moved counter with the other scheme: green is the cheap scheme and red the costly one. The bars show keys per server against the fair-share mark, and the busiest-server number turns green at 1.2× or less and red above 1.5×. The chip says the keys and the hash are a toy.",
  },
  tryThis: [
    'On the hash ring, click "+ Add server": the keys that move are the ones just before the new point, and they all land on the new server.',
    'Switch to hash(key) % N and click "+ Add server": the large majority of the keys move. Compare the red count with the green one the ring would have moved.',
    'With 1 virtual node the bars are lopsided: the busiest of the four starting servers holds more than twice its fair share. Drag virtual nodes to 50 and the busiest drops to about 1.2× or less.',
    'Hover a key, or move the Inspect key slider, to trace its clockwise walk to its owner.',
  ],
  keyIdeas: [
    'hash % N changes a key\'s owner whenever N changes it: adding one server to N moves about N/(N+1) of the keys, a cache stampede waiting to happen.',
    'On a hash ring a join moves about 1/(N+1) of the keys on average, each onto the new server; with few points per server one join can move far more or far fewer.',
    'A key belongs to the first server point clockwise from its hash, so a change stays local to the arcs next to the points that come or go.',
    'Virtual nodes give each server many small arcs, which evens out the load.',
  ],
  quiz: [
    {
      q: 'You have 4 cache servers using hash(key) % 4 and add a 5th. About what share of keys now map to a different server?',
      options: [
        'About 20%, roughly the share the new server should end up holding',
        'About 50%, since half of the residues change when N goes from 4 to 5',
        'About 80%, since a key keeps its server when hash % 4 equals hash % 5',
        'Close to 0%, since a key\'s hash does not change when a server is added',
      ],
      answer: 2,
      why: 'A key keeps its server when hash % 4 equals hash % 5, which happens for 1 hash in 5. The hash itself is unchanged, but the divisor changed, so the other 4 in 5 keys are dealt to a new server.',
    },
    {
      q: 'A server joins a hash ring. Which servers can gain keys?',
      options: [
        'Just the new one: each key that moves lands on it',
        'Every server gains a share, because the ring re-balances on a join',
        'The next server clockwise from the new one, which takes its keys',
        'Only the busiest servers, which hand keys to the new one',
      ],
      answer: 0,
      why: "In this model a key's owner is the first point clockwise from it. A new point becomes the first point for the keys in the arc just before it, so the new server gains keys and the older servers lose them.",
    },
    {
      q: 'Why does a join move very different numbers of keys when each server has a single point?',
      options: [
        'Ring lookups are randomised, so one key can map to different servers',
        'The hash function changes when a server joins, so keys are re-dealt',
        'Servers that join later are given a larger share of the ring',
        'The new point lands where its hash puts it, so the arc it splits may be large or small',
      ],
      answer: 3,
      why: 'Each point sits where its hash puts it, so arcs have random sizes and the arc a new point splits may hold many keys or few. Many points per server average that out.',
    },
    {
      q: 'Why give each server many virtual nodes?',
      options: [
        'To shorten each lookup by cutting the walk around the ring',
        'To spread each server over many small arcs, which evens the load',
        'To keep every key on its server even when servers join or leave',
        'To store each key on several servers, so that losing one loses nothing',
      ],
      answer: 1,
      why: 'With one point each, arc sizes are random. Many points per server average the variance out, at the cost of a bigger table to search.',
    },
  ],
};

export default lesson;
