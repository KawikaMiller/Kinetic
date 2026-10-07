import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Put 23 people in a room and there\'s a 50.7% chance two share a birthday. Collisions come at about the square root of the number of possibilities, far sooner than intuition says.',
    what: 'The pigeonhole principle says that with more pigeons than holes, some hole must hold two: 366 people guarantee a shared birthday. The birthday paradox is the surprise that you need far fewer for a likely match, because what matters is pairs: 23 people make 253 pairs, and each pair is a chance to match. The exact chance is 1 − (364/365)(363/365)…; for any space of d equally likely values, a repeat becomes a coin flip at about 1.18 √d. The same maths decides how long random IDs and hashes stay unique.',
    analogy: 'Finding someone who shares your birthday is hard. Finding any two people who share one is easy, because every newcomer can match anyone already in the room.',
    useCases: [
      'Sizing random IDs: 32-bit IDs hit a 50% collision chance at about 77,000, not 4 billion',
      'Git short hashes: 7 hex digits (28 bits) start colliding in repos with tens of thousands of objects',
      'Hash tables expect collisions early, so they need a plan for them from the start',
      'Birthday attacks on hashes: a 64-bit hash gives only about 32 bits of collision resistance',
    ],
    why: 'Engineers pick ID sizes, short-hash lengths and hash functions all the time, and the linear guess ("2³² IDs before trouble") is wrong by a square root. Knowing √d is the danger point keeps duplicate keys, cache mix-ups and broken signatures out of production.',
    watch: 'Pigeonhole: each box is a hole with its pigeons as blue dots; a hole that must hold two turns red. Birthdays: the calendar has one row per month; days nobody has yet have a grey outline, days someone has are blue, the newest arrival is yellow, and the shared day turns red. On the curve plot the exact chance is violet, a yellow line and dot mark how many people are in the room now, and the grey dashed line is 50%. The histogram\'s blue bars count runs by how many people it took, with a grey dashed median line. Random IDs: the violet curve is the chance of a repeat, the yellow line is how many IDs you generated, and the grey dashed lines are 50% and the 50% point.',
  },
  tryThis: [
    'In Birthdays, watch a few runs: the first shared birthday usually comes in the 20s, nowhere near 183.',
    'Press "Add 1,000 runs": the median settles at about 23.',
    'In Pigeonhole, set 12 holes and slide pigeons from 12 to 13: now a double is guaranteed.',
    'In Random IDs, pick the Git short hash and press "Jump to the 50% point": about 19,000 objects.',
    'Pick UUIDv4 and set a billion IDs: the chance of a repeat is about 10⁻¹⁹.',
  ],
  keyIdeas: [
    'Pigeonhole: more items than slots guarantees a shared slot. 366 people guarantee a shared birthday.',
    'A likely match comes much sooner: 23 people give 50.7%, because they form 253 pairs.',
    'Among d equally likely values, a repeat is a coin flip at about 1.18 √d: 77,000 for 32-bit IDs.',
    'Size random IDs and hashes so √(possibilities) is far beyond how many you\'ll ever make.',
  ],
  quiz: [
    {
      q: 'How many people do you need in a room for a better-than-even chance that two share a birthday?',
      options: ['23', '183', '366', '57'],
      answer: 0,
      why: '23 people give 50.73%. 183, half of 365, is the classic guess, but it counts people when what matters is pairs: 23 people already make 253 pairs. 57 people give 99%, and 366 make it certain.',
    },
    {
      q: 'Ignoring Feb 29, how many people guarantee that two share a birthday?',
      options: ['366', '365', '183', '23'],
      answer: 0,
      why: 'Pigeonhole: 365 people could all have different birthdays, so it takes 366 to force a repeat (367 counting Feb 29). 23 makes a match likely, not certain.',
    },
    {
      q: 'Each request gets a random 32-bit ID. Roughly when does a duplicate become more likely than not?',
      options: [
        'After about 77,000 IDs',
        'After about 2 billion IDs',
        'After about 4 billion IDs',
        'Never, as long as IDs are random',
      ],
      answer: 0,
      why: 'The coin flip comes at about 1.18 × √(2³²) ≈ 77,000. 2 billion is half the space, the linear intuition; by then a duplicate is a near certainty.',
    },
    {
      q: 'Why is a UUIDv4 collision not a practical worry when a 7-character Git short hash can collide?',
      options: [
        'UUIDs have 122 random bits; short hashes only 28',
        'UUIDs are checked against a central registry',
        'Git short hashes are made one after another',
        'UUIDs include the time, so they never repeat',
      ],
      answer: 0,
      why: '28 bits reach 50% at about 19,000 objects, which is why Git lengthens short hashes in big repos; 122 random bits reach 50% only at about 2.7 × 10¹⁸ UUIDs. Version 4 UUIDs contain no timestamp (that\'s v1 and v7), and nothing checks them centrally.',
    },
  ],
};

export default lesson;
