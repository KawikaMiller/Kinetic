import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An ORM that loads related rows lazily sends one query for the list and then one more for every row in it: N+1 round trips, each one a wait, however fast the database is.',
    what: 'With lazy loading, `p.author` doesn\'t read the author until the code touches it, so a loop over 20 posts quietly sends 20 author queries after the 1 that fetched the posts. The fixes ask for everything at once: a JOIN (one query, but one row per child, repeating the parent\'s columns), an eager batch with `IN (…)` (two queries), or a DataLoader that collects every key requested in one tick (the loads must be issued together, as GraphQL resolvers or Promise.all do) and sends them as one batched query. Some ORMs also cache repeats with an identity map, which trims the N but does not remove it. Nested relations make it worse: posts, their comments and who wrote each comment is 1 + N + one per comment.',
    analogy: 'Fetching a shopping list by walking to the shop once per item, instead of taking the whole list. Each trip is short, but you spend nearly all of your day walking, not shopping.',
    useCases: [
      'Django, Rails, Hibernate, SQLAlchemy and Prisma pages that slow down as the list grows',
      'A GraphQL resolver per field quietly asking the database once per parent object',
      'Spotting it in a query log or an APM trace: the same statement hundreds of times with a different id',
      'Reviewing a pull request that adds a field to a loop over rows',
    ],
    why: 'N+1 is the most common reason a page that is fast with 5 rows of test data crawls in production, and the database looks healthy the whole time: every query is quick, there are just hundreds of them. Counting queries per request catches it; the fix is choosing what to load up front, and knowing what each fix costs. It builds on `sql-basics`, `db-indexes` and `client-server`.',
    watch: 'The timeline has one row for the application, where a dashed grey bar means it is idle waiting for an answer, and one for the queries in flight. The first query is blue, the repeated one-per-item queries orange (the N), and the queries of a fix green while that strategy beats lazy loading on time, red when it does not. A yellow cursor marks the time so far, and a yellow outline on a bar marks the queries from the code line you clicked. In the code panel the line that just ran is yellow. The SQL log lists the statements sent, in the same colours; the table compares every strategy, green for the quickest and red for the slowest. In the nested page, rows a join repeats (the post\'s title and body again on each comment) are red.',
  },
  tryThis: [
    'On Posts and authors, press play on lazy loading with the page at 20 posts: count the orange queries. Then drag Posts on the page up to 200.',
    'Set Round-trip latency to 0.2 ms and compare the lazy page with the eager batch; then set it to 20 ms. On Nested at 200 posts, compare eager join with eager batch at both.',
    'Pick eager join, eager batch and DataLoader-style batching in turn, and compare their queries and total time in the table.',
    'On Nested, load the lazy strategy and watch the queries add up; then choose eager join and read the rows that came back over the wire.',
    'Click the third line of the ORM code and find its queries in the timeline and the log.',
  ],
  keyIdeas: [
    'Lazy loading in a loop sends 1 query plus one per row: N+1 round trips, however fast the database is.',
    'In blocking code each query waits a full round trip before the next can start, so the total grows with the count times the latency.',
    'The fixes batch (IN) or join; a DataLoader collects keys within a tick and sends one query for them.',
    'A join returns a row per child and repeats the parent on each, so fixing the count can raise the bytes.',
  ],
  quiz: [
    {
      q: 'A team says: "Our ORM writes the SQL for us, so it is efficient." What is wrong with that?',
      options: [
        'It sends exactly what the code asks for, one lazy load at a time',
        'ORMs always write SQL that cannot use any of your indexes',
        'ORMs only work properly with databases running on one machine',
        'The SQL is fine, but the ORM cannot send more than one query',
      ],
      answer: 0,
      why: 'An ORM translates what your code touches into queries, and lazy loading touches one row at a time, so a loop becomes N+1 statements. Each statement can be perfectly good SQL; there are just far too many. ORMs can use indexes, and they send as many queries as the code causes.',
    },
    {
      q: 'A page lists 20 posts, and the code reads p.author.name in the loop with lazy loading. How many queries does the page send?',
      options: ['21', '20', '2', '1'],
      answer: 0,
      why: 'One query fetches the 20 posts, and then each p.author is loaded on first use: 20 more, for 1 + 20 = 21. An eager batch would send 2 (posts, then authors with IN), and a join would send 1.',
    },
    {
      q: 'The database answers each query in 0.05 ms, yet the lazy page takes over 100 ms at 5 ms latency. Why?',
      options: [
        'Its 21 queries each wait a 5 ms round trip: 21 × 5 = 105 ms',
        'The database is slow while it answers queries from a loop',
        'Lazy loading makes each query return far more bytes of data',
        'Five milliseconds is how long every query takes to plan',
      ],
      answer: 0,
      why: 'Total time is about the number of queries times the latency, plus the small work each one does. Here the work is around 1 ms of the 106 ms: the application is waiting, not the database computing. So N+1 matters even when the database is fast, and gets worse as latency or N grows.',
    },
    {
      q: 'You fix the nested page (posts, comments, commenters) with one JOIN. What is the catch?',
      options: [
        'One row per comment, with the post repeated on each: more bytes',
        'A join can only combine two tables, never three of them',
        'The join returns the posts that have comments and drops the rest',
        'The query now has to be sent once for every post on the page',
      ],
      answer: 0,
      why: 'A join returns one row per child, so a post with 5 comments appears 5 times, its title and every other column repeated: more bytes over the wire, which the lesson counts. A LEFT JOIN keeps posts with no comments, and the whole page still takes a single query.',
    },
    {
      q: 'What does a DataLoader-style batcher do with the 20 calls to authors.load(id) made by the loop?',
      options: [
        'It collects the ids until the loop yields, then sends one IN query',
        'It sends all 20 queries at once, in parallel over one connection',
        'It caches each author in memory so a later page never queries',
        'It rewrites the loop so that it runs inside the database itself',
      ],
      answer: 0,
      why: 'Every load() made in the same tick is gathered, de-duplicated and sent as a single WHERE id IN (…) query, so the page needs 2 queries instead of 21. Sending 20 in parallel would still be 20 queries, and a loader\'s cache lasts for one request, not across pages.',
    },
  ],
};

export default lesson;
