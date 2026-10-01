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
      options: [
        'It exposes DB credentials and skips the server’s rules',
        'Databases can’t send or receive JSON data at all',
        'Phones are too slow to run database queries',
        'It’s fine as long as the database is fast enough',
      ],
      answer: 0,
      why: 'The server enforces authentication, permissions and business rules, and anything shipped in an app can be extracted. Speed isn’t the issue: a fast database is still wide open.',
    },
    {
      q: 'What makes it possible for any of three server copies to handle your next request?',
      options: [
        'They’re stateless: state lives in the DB or the request',
        'Sticky sessions pin each user to one server copy',
        'Each copy stores your login in its own memory',
        'The client picks a copy and sends every request there',
      ],
      answer: 0,
      why: 'If servers remember nothing between requests, they are interchangeable. Sticky sessions do the opposite: they tie you to one copy.',
    },
    {
      q: 'You need to rename a JSON field that old mobile apps read. Safest approach?',
      options: [
        'Add the new field, keep the old one (or add /v2)',
        'Rename it and force every user to update the app',
        'Rename it and ship the app update the same day',
        'Rename it, then fix old apps when they crash',
      ],
      answer: 0,
      why: 'Additive changes and versioning keep existing clients working while new ones move on. Old app versions stay installed for months, so a same-day update still breaks them.',
    },
  ],
};

export default lesson;
