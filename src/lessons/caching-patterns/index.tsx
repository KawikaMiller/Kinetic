import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A cache makes reads fast by remembering answers, but every pattern is a bet on what happens when the answer changes: delete the key on a write, bound the damage with a TTL, and put every input in the key.',
    what: 'In cache-aside the app checks the cache, loads from the database on a miss and fills the cache, then on a write updates the database and deletes the key. Write-through sends every write through the cache layer to the database; write-behind acknowledges writes from the cache and flushes them later, so a crash loses what was queued. Keeping cache and database in step is the hard part: two writers, or a reader and a writer, can interleave so that an old value is stored last, and a lagging read replica can hand the cache an old value. Deleting beats overwriting, a TTL bounds how long a mistake lives, and the key must name every input the content depends on.',
    analogy: 'A notice board outside a shop: reading the board is quicker than asking the manager, but when the price changes someone must take the old sign down, and if two people update it at once the wrong sign can win.',
    useCases: [
      'Product, profile and settings data in Redis or Memcached in front of a database',
      'Page and API response caches, where the key has to include language and version',
      'Write-behind counters and analytics, where losing the last few writes is acceptable',
      'Read-heavy services on read replicas, where replica lag decides how fresh a cache fill can be',
    ],
    why: 'Cache bugs are quiet: the app keeps answering fast, and wrongly. A stale price, the French page served to German readers or a hot key expiring under load are classic production incidents, and "just add a cache" is where many start. It builds on `lru-cache`, which owns eviction, on `db-indexes` for the reads a cache saves, and on `replication`, where replica lag comes from.',
    watch: 'Arrows run between the app or clients, the cache and the database (and a replica). Green is a cache hit, red a miss (the costly side: a trip to the database), yellow the fill after it, blue a database read or write, violet an invalidation (a delete), a dim loop on the cache a TTL expiring, and orange a stale value read or stored; the light blue arrows are writes into the cache itself. Red is also writes lost to a crash. The boxes under the diagram show what each store holds now, and an orange cache box means its entry is older than the database\'s. In the charts, green is the hit rate and orange the stale reads.',
  },
  tryThis: [
    'In Patterns, step through cache-aside: after the write\'s database arrow the cache box turns orange for exactly one arrow. What closes that gap, and what could slip into it?',
    'Switch to Write-behind and turn on Cache crashes: how many acknowledged writes disappear, and what is the database left holding?',
    'In Stale-data races, step through Update then set. Then switch Writers to Delete the key: where did the stale value go?',
    'Pick Replica lag and drag the lag down from 5 s: at what lag does the cache box stop turning orange, and why that number?',
    'In Cache keys the locale is missing: find the row where a hit serves the wrong page and add locale back. Then switch to the Account page and see what is missing now.',
  ],
  keyIdeas: [
    'Cache-aside reads lazily and invalidates on write; write-through keeps cache and database level at the cost of slower writes; write-behind is fast but loses whatever was queued if the cache dies.',
    'Prefer deleting a key to overwriting it: overwrites let two writers store the older value last, while a delete leaves nothing stale behind. A reader that loaded before the write can still fill an old value in afterwards.',
    'A TTL does not make a cache correct, it bounds how wrong it can be: a stale entry lives at most the TTL, and a longer TTL buys hit rate at the cost of freshness.',
    'The key must name every input the content depends on (user, locale, version) and nothing more: too little serves wrong pages, too much fragments the cache. A hot key expiring under load is usually fixed with request coalescing, locks or early refresh, and many keys with jittered TTLs.',
  ],
  quiz: [
    {
      q: 'Two writers each update the database and then set the cache, in crossing order: A\'s database write, B\'s, then B\'s cache set, then A\'s. What is left?',
      options: [
        'The database holds B\'s value and the cache holds A\'s older one, with nothing to fix it',
        'Both hold B\'s value, because the last database write wins in both places at once, whatever order the cache saw',
        'The cache ends up empty, because two conflicting writes cancel each other out',
        'Both hold A\'s value, since A\'s cache set was the very last step of all four',
      ],
      answer: 0,
      why: 'The database order and the cache order disagree, so the older value is stored last and stays until it expires or another write overwrites it. Deleting the key instead of setting it would have left the cache empty in this interleaving.',
    },
    {
      q: 'Why is deleting the key on a write safer than overwriting it with the new value?',
      options: [
        'A delete leaves nothing behind for crossing writers to leave stale, while an overwrite can store the older value last',
        'Deleting is cheaper than writing, because the cache does not have to hold the new value',
        'An overwrite is invisible to other readers until it commits, whereas a delete is seen by every reader at once',
        'A delete also removes the row from the database, so the two can no longer disagree',
      ],
      answer: 0,
      why: 'Whichever delete comes last, the key is empty and the next read loads the database\'s current value. Cost has nothing to do with it, and a cache delete never touches the database row.',
    },
    {
      q: 'A reader misses and loads the old price. The writer then updates the database and deletes the key, and only then does the reader fill the cache. What happens?',
      options: [
        'The old price is cached after the delete, and stays until its TTL runs out or the next write',
        'The delete already ran, so the fill finds the key gone and the cache refuses it',
        'The cache notices the newer database write and rejects the older value on its own',
        'Nothing: the reader\'s value is replaced as soon as its response reaches the client',
      ],
      answer: 0,
      why: 'The delete had nothing to remove when it ran, and a plain cache stores whatever it is given. This read-fill race is why a TTL is kept as a backstop even when every writer invalidates.',
    },
    {
      q: 'A write-behind cache acknowledges four writes, flushes after the second, then crashes. How many writes are lost?',
      options: [
        'Two: the third and fourth writes, which were queued after the last flush',
        'None, because the flush wrote the latest value of every write to the database',
        'All four, because a crash discards everything the cache has ever held in memory',
        'Only the last one, because the earlier queued writes were merged into it',
      ],
      answer: 0,
      why: 'The flush made the first two durable (as one write of the second value). The third and fourth only ever existed in the cache and its queue, so both are gone, even though the app was told they succeeded.',
    },
    {
      q: 'The locale is missing from the cache key of a page that differs by language. What goes wrong?',
      options: [
        'Whoever fills the entry first decides the language everyone else is served',
        'Every request misses, because no two requests can ever produce the same key',
        'The cache refuses to store the page until a locale has been added to its key',
        'The hit rate falls, because every reader now ends up with a private copy',
      ],
      answer: 0,
      why: 'With fewer parts in the key, different pages collide on one entry, so a hit hands back the page cached for someone else. A key that is too specific fragments the cache instead, and it never serves a wrong page.',
    },
  ],
};

export default lesson;
