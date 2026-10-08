import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'GraphQL lets a client send one query that names exactly the fields it needs, and the server answers by running a resolver per field: no over-fetching, but the server\'s work, and its worst case, are now the client\'s choice.',
    what: 'A GraphQL API has one endpoint and a typed schema. A query is a selection set, fields nested as deep as the client likes, and the response has exactly that shape. The server runs one resolver per field, parents before children, so a list of 50 orders that each resolve their product makes 50 separate database calls unless a DataLoader batches them into one. Because a client can ask for anything the schema allows, servers measure a query\'s depth and cost first and reject it before any resolver runs.',
    analogy: 'Ordering by listing exactly what goes on the plate, instead of picking a fixed combo meal: no extras on the tray, but the kitchen cooks each item separately, and an enormous order has to be turned away at the door.',
    useCases: [
      'Mobile apps that need one tailored payload per screen over a slow network',
      'A product page that gathers data from several backend services behind one API',
      'Public APIs where many clients each want a different slice of the same data',
      'Front-end teams changing what a screen shows without waiting for a new endpoint',
    ],
    why: 'Most GraphQL war stories are in this lesson: the resolver that turns one query into hundreds of database calls, the query nobody priced, the 200 response that hides a failed field, and the cache that no longer works by URL. Knowing the trade-offs, not just the syntax, is what lets you choose GraphQL, or push back on it, with reasons. It builds on `client-server`, `rest-api-design`, `orm-n-plus-one` and `tree-traversals`.',
    watch: 'REST vs GraphQL: the timeline has a lane per request, blue while in flight and green once answered, and a red dashed bar for a 503; the yellow line is the current time and an orange errors[] marker appears when a field failed inside a 200. Below it, each REST response has a bar: the green part is the bytes the screen uses and the grey track is the unused rest. The status is green for 200 and red for 503. Beside it are the one GraphQL request and its response, where an orange line is a null field or the errors entry. In the top numbers, the lower of REST and GraphQL is green and the higher red. Resolvers: the tree has a box per resolver or list element, yellow while its level resolves, green once resolved, orange if it failed (null plus an error), and dashed for the "+ n more" stand-in. Each box shows the resolver, the plain fields it reads and its database call number. In the database strip, blue bars are single calls and violet is the one batched DataLoader call; with DataLoader off and more than 3 calls, the DB calls count turns red when the run ends, and green with it on. Cost limits: two bars show depth and cost with a tick at each limit, green within it and red over it; "Resolvers run" is green when the query was rejected first, and the error panel is red.',
  },
  tryThis: [
    'In REST vs GraphQL, press play and compare the timelines: REST needs five requests in two round trips, GraphQL one request.',
    'Set Product service to one product fails and play: REST shows one red 503, GraphQL shows HTTP 200 with an orange null field and an errors entry.',
    'In Resolvers, play with DataLoader off: level 2 makes one database call per order, the N + 1 pattern. Then switch DataLoader on.',
    'In Resolvers, set orders(last: n) to 50 with DataLoader off, then on, and compare the DB calls and the elapsed time.',
    'In Cost limits, drag Friends levels from 2 to 3 and the query is refused before any resolver runs. Set n to 50 at 2 levels and the cost limit trips alone.',
  ],
  keyIdeas: [
    'A response has exactly the shape of the query, so fields are never over-fetched, but the server still runs a resolver for each one.',
    'Plain resolvers on a list make 1 + N database calls; a DataLoader batches each level\'s lookups into one call.',
    'A failed field gives HTTP 200 with that field null and an entry in errors: check errors, not just the status.',
    'Clients choose the work, so servers price queries by depth and cost first; one POST endpoint also loses URL-keyed HTTP caching.',
  ],
  quiz: [
    {
      q: 'A query asks for a user\'s 50 newest orders and each order\'s product. With plain resolvers and no DataLoader, how many database calls fetch the orders and their products?',
      options: [
        '51: one for the orders, then one product call per order',
        '1: GraphQL combines the whole query into a single join',
        '2: one for the orders and one for all products together',
        '50: the orders arrive free, then one call for each order',
      ],
      answer: 0,
      why: 'Each product resolver does its own lookup, so 1 + 50 = 51: the N + 1 pattern. GraphQL does not join anything by itself, and the "2" answer is what a DataLoader gives by batching the 50 lookups into one call.',
    },
    {
      q: 'Why is HTTP caching harder for GraphQL than for `GET /users/1`?',
      options: [
        'Each query is a POST to one URL, so the URL no longer names the data',
        'The GraphQL specification forbids caching headers on any response',
        'GraphQL replies contain JSON, which no cache is able to store at all',
        'Resolvers rebuild the data on every request, so it is never repeated',
      ],
      answer: 0,
      why: 'HTTP caches key on the method and URL, and every GraphQL request is a POST to the same endpoint with the query in the body. Nothing forbids cache headers or JSON, and the same query often returns the same data; the cache just cannot tell queries apart by URL.',
    },
    {
      q: 'One product lookup fails while the rest of the query succeeds. What does the client get back?',
      options: [
        'HTTP 200, with that field null and an entry in the errors list',
        'HTTP 500 and no data, because part of the query failed to run',
        'HTTP 404 for the whole query, with the failed field named in it',
        'HTTP 200, with every field null since a response is all-or-nothing',
      ],
      answer: 0,
      why: 'A resolver error nulls only its own field and adds an entry to errors, while the request itself still succeeds. So a client that checks only the status code misses it, unlike a REST call, where that one failed request would be its own 503.',
    },
    {
      q: 'Why does a GraphQL server compute a query\'s cost before running any resolver?',
      options: [
        'A client can ask for far more work than a screen needs',
        'Resolvers can only run once the response size is known',
        'The schema forbids list fields until their cost is declared',
        'Costs are billed per field, so the client must approve them',
      ],
      answer: 0,
      why: 'Nested lists multiply, so a short query can mean thousands of resolver calls, and refusing it up front costs nothing. Cost has nothing to do with the order resolvers run in, and no schema or billing rule requires it.',
    },
    {
      q: 'Which statement about GraphQL compared with REST is accurate?',
      options: [
        'It can save round trips and unused fields, but each field still costs a resolver call',
        'It is faster for every query, because the client receives fewer bytes',
        'It removes the need for batching, since one query already combines the data',
        'It makes the server do less work, since it only ever runs one database call',
      ],
      answer: 0,
      why: 'Fewer requests and exact fields help the client, but the server still resolves every selected field, and naive resolvers can make it slower than a tuned REST endpoint. "Always faster" is the common myth, and batching remains the resolver author\'s job.',
    },
  ],
};

export default lesson;
