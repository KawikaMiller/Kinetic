import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "In client-server systems, clients (browsers, apps, scripts) send requests over the network and a server sends back responses, following a shared contract called an API.",
    what: "The server owns the data and the business rules; clients only see what the API exposes. An API is a set of endpoints (like GET /users/42) and the exact shape of what each returns, usually JSON over HTTP. Good servers are stateless: each request carries everything needed, so any copy of the server can answer it.",
    analogy: "A restaurant: diners (clients) order from the menu (the API) through a waiter; they never walk into the kitchen (the server's internals) or the pantry (the database).",
    useCases: [
      "Every web and mobile app talking to its backend",
      "Public APIs such as Stripe, GitHub or weather services",
      "Internal services calling each other inside a company",
      "Scripts and CLIs automating things through an API",
    ],
    why: "It's the shape of almost everything you'll build. Knowing where the boundary is tells you what can change freely (server internals), what must stay compatible (the contract), and what always fails eventually (the network). Breaking an API that old mobile apps depend on is a classic junior mistake.",
    watch: "Clients sit on the left and your server side is inside the dashed box on the right. Blue pills are requests, violet ones are database queries, green are responses and red are failures. Each client's little screen shows what the user sees. Below, the API contract and the last JSON body update as you go. Switch scenarios to scale out, crash the server, or ship a breaking change.",
  },
  tryThis: [
    "Play \"A request\": the browser, the phone and a terminal all hit the same endpoint.",
    "Switch to \"Scale out\" and watch the same user land on two different servers and still get the same answer.",
    "Play \"Breaking change\" and see who ends up with \"Hello, undefined\".",
    "In \"Server down\", notice how much of the work is the client's job.",
  ],
  keyIdeas: [
    "Clients ask, servers answer; only the server touches the database.",
    "The API is a contract: endpoints plus response shapes. Clients depend on it, not on server internals.",
    "Stateless servers keep nothing between requests, so any replica can answer and you scale by adding copies.",
    "Renaming or removing fields breaks clients you can't redeploy; version the API or make additive changes.",
  ],
  quiz: [
    {
      q: 'Why shouldn’t a mobile app connect straight to the database?',
      options: ['Databases can’t speak JSON', 'It would expose credentials and bypass the server’s rules', 'Phones are too slow', 'It’s fine if the database is fast'],
      answer: 1,
      why: 'The server enforces authentication, permissions and business rules. Anything shipped in an app can be extracted.',
    },
    {
      q: 'What makes it possible for any of three server copies to handle your next request?',
      options: ['Sticky sessions', 'The servers are stateless; state lives in the database or the request', 'Each server has a full copy of your memory', 'The client picks the server'],
      answer: 1,
      why: 'If servers remember nothing between requests, they are interchangeable.',
    },
    {
      q: 'You need to rename a JSON field that old mobile apps read. Safest approach?',
      options: ['Rename it and force-update the app', 'Add the new field and keep the old one (or add a /v2)', 'Rename it on a Friday', 'Let the app crash and fix it later'],
      answer: 1,
      why: 'Additive changes and versioning keep existing clients working while new ones move on.',
    },
  ],
};

export default lesson;
