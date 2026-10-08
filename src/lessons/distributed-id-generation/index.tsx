import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Machines can make unique IDs without asking anyone, by mixing a clock, a machine number and random bits. Which mix you choose decides whether IDs sort by time, how big they are and how kindly they treat a database index.',
    what: 'UUIDv4 is 122 random bits, so a collision is practically impossible, but the IDs have no order. UUIDv7 and ULID put a millisecond timestamp first and random bits after, so they sort by creation time, to the millisecond. A snowflake-style ID packs a 41-bit timestamp, a 10-bit machine ID and a 12-bit sequence into 64 bits: it is smaller and sorts too, but every machine needs its own ID, and it must not issue more than 4,096 IDs a millisecond or run when the clock steps backwards. Primary keys end up in a B-tree index, where time-ordered keys append to the right-hand page and random keys land on a different page every time.',
    analogy: 'Ticket numbers at several shop counters: each counter can hand out tickets without phoning the others if the ticket carries the time, the counter\'s own letter and a running number on that counter.',
    useCases: [
      'Primary keys for rows created by many app servers without a central counter',
      'Event, message and trace IDs that should sort roughly by when they happened',
      'Public IDs that must not be guessable or countable, where random UUIDs fit',
      'Sharded databases, where each shard or node needs IDs that never clash with another\'s',
    ],
    why: 'The ID is the first design choice of a table and the hardest to change. Random primary keys are a classic cause of slow inserts and bloated indexes at scale, snowflake generators have caused real duplicate-ID incidents when a clock stepped back, and sortable IDs quietly publish when something was created. It builds on `bit-manipulation` and `binary-hex` for the fields, `birthday-paradox` for the collision odds and `db-indexes` for why order matters to a B-tree.',
    watch: 'In the bit strips, blue is the timestamp, violet the machine ID, orange the sequence, sky-blue the random bits and yellow the version and variant bits. In the index view a yellow cell is a page written in the last 100 inserts and a red one a page made by a split in that same window; grey pages are older. Orange in the limits scene means a generator waited or refused, and red is a duplicate ID. In the odds and trade-offs scenes green is the cheap side of a trade, red the costly one, and orange, amber and green are the three ID sizes.',
  },
  tryThis: [
    'In ID anatomy, press Generate 5 at once on UUIDv7, then on UUIDv4: which fields change between the five, and which format keeps them in order?',
    'In Index locality, UUIDv4 sits at 1,000 inserts: how many of the pages were written in the last 100 inserts, and how many for UUIDv7?',
    'In Snowflake limits, A burst, ask for 5,000 IDs: how many milliseconds does it take, and why can 5,000 not fit in one?',
    'In The clock goes backwards the safeguard is off: count the duplicates, then pick Refuse and Wait it out and see what changes.',
    'In Two machines, one ID, make the machine IDs different and find out what stops the duplicates.',
  ],
  keyIdeas: [
    'Unique without coordination means the ID carries its own uniqueness: random bits make a clash unlikely, and a machine ID plus a sequence make it impossible as long as every machine ID is handed out once and the clock never goes backwards.',
    'A timestamp at the front makes IDs sort by time, which keeps database inserts on the right-hand edge of the index; random IDs scatter inserts across every page, causing splits and reads from disk.',
    'Time-ordered IDs reveal when something was created, and a snowflake generator depends on a clock that never goes backwards: refuse or wait, never carry on, and never reuse a machine ID.',
    'Short random IDs are not safe at scale: the birthday paradox makes a repeat likely long before the space is full, which is why UUIDs use 122 random bits and a 32-bit random ID does not.',
  ],
  quiz: [
    {
      q: 'Why do UUIDv7 keys insert faster into a B-tree index than UUIDv4 keys?',
      options: [
        'New v7 keys sort after the old ones, so they land on the right-hand page instead of a random page each time',
        'A v7 key is only 64 bits long, so twice as many keys fit on every page and the tree is half as deep',
        'A v7 key is checked for uniqueness once per millisecond, which saves most of the comparisons an insert makes',
        'The database stores v7 keys in a separate index that never needs a page split at all',
      ],
      answer: 0,
      why: 'Both are 128 bits. The timestamp at the front makes each new v7 key larger than the last, so inserts append to the rightmost page, while random v4 keys touch a different page each time.',
    },
    {
      q: 'A snowflake-style generator has issued 4,096 IDs in the same millisecond. What must it do for the 4,097th?',
      options: [
        'Wait until the clock reads the next millisecond, then start the sequence again from zero',
        'Carry on counting the sequence into the machine ID bits, which are never needed otherwise',
        'Issue the ID with the same sequence number again, because the machine ID keeps it unique',
        'Switch to random bits for the rest of that millisecond and carry on without any pause',
      ],
      answer: 0,
      why: 'The 12-bit sequence only holds 0 to 4,095. Overflowing it would change another field or repeat an ID, so the generator waits for a new millisecond.',
    },
    {
      q: 'A server\'s clock steps back by a few milliseconds after a sync, and its snowflake generator keeps issuing IDs from the new, earlier time. What can go wrong?',
      options: [
        'It can repeat IDs it already issued for those milliseconds, since the machine ID and sequence repeat too',
        'Every ID it issues from then on is rejected by the database as having an invalid timestamp',
        'Nothing, because the machine ID in each ID keeps it different from every other ID ever issued',
        'The generator switches to the random format on its own until the clock catches up again',
      ],
      answer: 0,
      why: 'The same millisecond, machine ID and sequence give the same ID. A safe generator refuses to issue anything, or waits, until the clock passes the last time it used.',
    },
    {
      q: 'Two snowflake machines are accidentally configured with the same machine ID. What is the result?',
      options: [
        'They can issue identical IDs whenever they read the same millisecond and are at the same sequence number',
        'Nothing is wrong here, because the 41-bit timestamp is enough to make every single ID unique on its own',
        'The two generators notice each other on the network and quietly share one sequence number between them',
        'Every ID the pair makes is longer than 64 bits, so inserts into a 64-bit column start to fail for good',
      ],
      answer: 0,
      why: 'Uniqueness comes from the combination of time, machine and sequence. With equal machine IDs two machines can land on the same time and sequence, so each machine ID must be assigned to one machine only.',
    },
    {
      q: 'Why is a random 32-bit ID a poor choice for a table that will hold hundreds of thousands of rows?',
      options: [
        'A repeat becomes likely near 77 thousand IDs, far below the 4.3 billion possible values',
        'A 32-bit ID cannot be stored in a primary key column at all, because those need at least 64 bits',
        'Random numbers can only repeat once the generator has produced every value in the whole space',
        'The odds of a repeat only grow when the same IDs happen to be made on more than one machine',
      ],
      answer: 0,
      why: 'Repeats arrive around the square root of the space, not when it is full: about 77 thousand IDs gives even odds of a clash with 32 bits. With 122 random bits that point is some 2.7 × 10¹⁸ IDs away.',
    },
  ],
};

export default lesson;
