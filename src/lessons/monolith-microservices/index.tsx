import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A monolith ships your whole app as one deployable; microservices split it into independently deployed services that talk over the network. Neither wins everywhere: you're trading simplicity for independence.",
    what: "In a monolith, modules call each other in-process and share one database, so calls are fast and transactions are easy, but everything builds, deploys and fails together. Microservices give each capability its own process and data, so teams deploy and scale independently, but every call becomes a network hop that adds latency and failure modes. Split badly (chatty calls, shared database) and you get a distributed monolith: the costs of both and the benefits of neither.",
    analogy: "A monolith is one big restaurant kitchen: fast to shout across, but a grease fire closes the whole place. Microservices are a food court: each stall runs itself, but a meal from three stalls means three queues.",
    useCases: [
      "Deciding how to structure a new product (many teams start with a monolith)",
      "Splitting out one part that needs to scale or deploy on its own",
      "Drawing service boundaries around teams and business capabilities",
      "Recognising and untangling a distributed monolith",
    ],
    why: "Teams are expected to make, and defend, architecture decisions whose costs last for years. Knowing the trade-offs (latency, transactions, blast radius, deploy independence, team structure) helps you avoid copying microservices into a system that didn't need them.",
    watch: "Pick an architecture and a scenario. Boxes have a green outline when healthy, a blue dashed outline while deploying, an orange outline when degraded and a red outline with a red cross when down. Moving dots are calls: violet is an in-process function call, blue a network call, white a database query. The latency, network hops and blast radius counters follow the scene (the blast radius turns red when something is down). In the Teams scenario each team gets a colour (sky blue, teal, lime, magenta) shown as a dot on its boxes. The chips say the numbers are made-up round figures and that the deploy, bug and teams storylines are scripted.",
  },
  tryThis: [
    'Play "Checkout request" on all three architectures and compare latency and hops: the database work is the same in each, so the difference is the network and the chatter.',
    'Run "Ship a bug" on the monolith, then on microservices: count what goes down.',
    'Try "Deploy a change" on the distributed monolith: why does everything redeploy?',
    'Pick the Teams scenario on each architecture and see how it mirrors the org chart.',
  ],
  keyIdeas: [
    'Monolith: in-process calls, one DB, easy transactions, but one deploy and one blast radius.',
    'Microservices: independent deploys and scaling, paid for with network hops and lost transactions.',
    'Shared databases and chatty synchronous calls create a distributed monolith.',
    "Conway's law: system boundaries tend to match team boundaries, so design both together.",
  ],
  quiz: [
    {
      q: 'Five services all read and write the same database tables. What have you most likely built?',
      options: [
        'A modular monolith: one deployable process split into modules with clear boundaries',
        'A distributed monolith: split code that is still coupled through its data',
        'A well-isolated microservice system with one owner per data store',
        'An event-sourced system where services only exchange immutable events',
      ],
      answer: 1,
      why: 'Shared tables couple the services: a schema change forces lockstep deploys, so you get network costs without independence.',
    },
    {
      q: 'Which is usually HARDER after moving from a monolith to microservices?',
      options: [
        'Deploying one component on its own, without touching the others',
        'Scaling one hot component on its own hardware',
        'Keeping an order and its payment in one atomic transaction',
        'Letting each team own and change its own code',
      ],
      answer: 2,
      why: 'Data now lives in separate databases, so atomicity needs sagas or other distributed patterns.',
    },
    {
      q: 'A memory leak in product search takes down checkout. Which architecture were you most likely running?',
      options: [
        'Microservices that use timeouts and fallbacks between services',
        'A static site served from a CDN with no server code',
        'Serverless functions that each run in their own isolated instance',
        'A monolith, where every module shares one process and heap',
      ],
      answer: 3,
      why: 'The modules share one process and heap, so one leak can crash the whole app at once.',
    },
    {
      q: 'Why is the same checkout slower as microservices than in the monolith in this lesson?',
      options: [
        'Microservices run on slower hardware than a monolith does',
        'The database does more work for each request in microservices',
        'Each call between services crosses the network, which in-process calls skip',
        'A microservice request has to wait for all of the services to finish deploying first',
      ],
      answer: 2,
      why: 'The database work is the same four accesses in each architecture here; the extra time is the network calls between services.',
    },
  ],
};

export default lesson;
