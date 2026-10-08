import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Opening a database connection costs far more than a small query, so apps keep a pool of open connections and lend them out. The pool must be big enough for the load, small enough for the database, and every borrowed connection must be given back.',
    what: 'A new connection needs a TCP handshake, usually TLS and a login, and the database starts a process or thread for it: tens of milliseconds, against a query that may take two. A pool opens connections once and lends one to each request, which hands it back when done. If the pool is too small, requests queue for a connection and give up after an acquire timeout. If it is too big, or many app instances each have one, the total (instances × pool size) can pass the database\'s maximum, which refuses new connections and slows down under the weight of the ones it has. Little\'s law gives a starting size: connections in use ≈ requests per second × time each is held. A code path that forgets to return its connection slowly drains the pool until nothing is left.',
    analogy: 'Taxis at a rank: hailing and briefing a new driver for every trip takes longer than the ride, so a fleet waits at the rank and is lent out. Too few cars and a queue forms; too many and the road clogs; a car that never returns is one fewer for everyone.',
    useCases: [
      'Web apps and APIs talking to PostgreSQL, MySQL or SQL Server through a driver or ORM pool',
      'Serverless and autoscaled services, where many instances multiply the connections',
      'Poolers such as PgBouncer or a cloud database proxy, which share few real connections between many clients',
      'Any client of a limited resource that is slow to set up: HTTP clients, message brokers, Redis',
    ],
    why: '"Timed out waiting for a connection" and "too many connections" are among the most common production database errors, and the usual fix, a bigger pool, often makes things worse. Understanding the pool as a queue in front of a limited resource is the basis for sizing it and for spotting leaks. It builds on `tcp-udp` and `tls-handshake` for what a connection costs, on `processes-threads` for why the database pays per connection, and on `semaphores-condition-variables`, since a pool is a counting semaphore with a queue.',
    watch: 'Each cell is one connection. Blue is in use, grey is idle and yellow is opening (the handshake). An orange outline is a slot the database refused because it was at its maximum, and red is a leaked connection: an outline at first, solid once leak detection has flagged it. Violet is a request waiting for a connection, and the sparkline is the longest wait. In the cost bar, yellow, amber and violet are TCP, TLS and login, and blue is the query. In the gauges green is healthy, orange the database at its limit and red a heavy load.',
  },
  tryThis: [
    'Start from Pool too small. How many requests wait, and what happens to them after a second? Raise Pool size each to 5: what changes?',
    'Switch to No pool: how does the latency change, and what does every request now pay that the pool paid only once?',
    'Pick Too big, many instances: how many slots does the database refuse, and what happens to the speed of queries? Lower Pool size each to 10.',
    'Pick A leak and watch the red cells. How many requests does it take to drain the pool, and which gauge warns you first?',
    'Start from About right and compare the measured connections in use with Little\'s law. Raise Requests a second to 300 (6 of the 10 slots busy) and watch both for ten seconds, then to 500 to see the pool saturate.',
  ],
  keyIdeas: [
    'A connection is expensive to open (TCP, TLS, login, a database process) and cheap to reuse, so a pool pays that cost once and lends the connection to many requests.',
    'A pool is a queue in front of a limited resource: too small and requests wait and time out, too big and the database is overloaded. Past what the database can run at once, extra connections only add overhead.',
    'The database sees instances × pool size, not the pool size: twenty instances with fifty connections each want a thousand connections from a database that may allow five hundred.',
    'A connection that is never returned is gone for good. Return connections in a finally block or a scoped helper, and use leak detection to flag connections held far too long.',
  ],
  quiz: [
    {
      q: 'Why is a request faster with a connection pool than without one?',
      options: [
        'The connection is already open, so the TCP, TLS and login cost is not paid again by every request',
        'The pool runs each query on its own faster server, so the work itself takes much less time to finish, whatever the query is',
        'A pooled query skips the database\'s parsing and planning steps, since the pool has cached them',
        'The pool batches many requests into a single query, so the database only has to run one',
      ],
      answer: 0,
      why: 'Opening a connection takes tens of milliseconds of handshakes and login. The pool pays it once per connection and reuses the connection, while the query itself costs the same either way.',
    },
    {
      q: 'Twenty app instances each hold a pool of 50, and the database allows 500 connections. What happens?',
      options: [
        'They want 1,000 connections, so the database refuses about half and the ones it holds slow it down',
        'Nothing is wrong, because each pool is below the database limit when looked at on its own',
        'The database raises its own limit to 1,000 to fit, which only costs some memory on the server',
        'The pools shrink on their own until the total fits, and every request carries on as before',
      ],
      answer: 0,
      why: 'The database counts every connection from every instance: 20 × 50 = 1,000. Past its maximum it refuses new ones, and a database holding many connections spends more per query on memory and switching between them.',
    },
    {
      q: 'Requests are timing out with "timed out waiting for a connection", and the database is mostly idle. What is the most likely cause?',
      options: [
        'The pool is too small for the load, or connections are leaking, so requests queue until the acquire timeout',
        'The database is overloaded and needs a larger pool to share the work between more connections at once, so that every query finishes sooner',
        'The queries are too simple, and the pool has nothing to optimise for them',
        'The app opens too few connections to start with, which the database treats as a failure',
      ],
      answer: 0,
      why: 'The wait is for a pool slot, not for the database. A pool smaller than rate × hold time, or one that has lost connections to a leak, makes requests queue while the database sits idle. A bigger pool on an overloaded database would make it worse.',
    },
    {
      q: 'Roughly how many connections does a service need if it makes 200 queries a second and each holds a connection for 25 ms?',
      options: [
        'About 5 in use on average, by Little\'s law, plus headroom for bursts',
        'About 200, one for every query made in a second, whatever each one takes',
        'About 8,000, found by multiplying 200 by the 25 ms of every single query',
        'About 1, since a connection can be reused immediately by the next query',
      ],
      answer: 0,
      why: 'Connections in use ≈ arrival rate × time held: 200 × 0.025 = 5. Bursts and slow queries mean a pool needs some headroom above that average, but far less than one connection per request.',
    },
    {
      q: 'A code path takes a connection from the pool and returns early on an error without giving it back. What is the effect over time?',
      options: [
        'The pool loses a connection each time that path runs, until none are left and every request times out',
        'The database closes the connection on its own, so the pool slowly refills with fresh ones',
        'Nothing at all, because a connection that is not returned is reused by the next request anyway',
        'The pool grows by one connection each time, which does no real harm',
      ],
      answer: 0,
      why: 'A borrowed connection that is never returned stays marked in use for good. The usable pool shrinks by one per leak until nothing is left, which is why returning it in a finally block, and flagging connections held too long, matter.',
    },
  ],
};

export default lesson;
