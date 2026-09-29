import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A monolith ships your whole app as one deployable; microservices split it into independently deployed services that talk over the network. Neither is \"better\": you're trading simplicity for independence.",
    what: "In a monolith, modules call each other in-process and share one database, so calls are fast and transactions are easy, but everything builds, deploys and fails together. Microservices give each capability its own process and data, so teams deploy and scale independently, but every call becomes a network hop that adds latency and failure modes. Split badly (chatty calls, shared database) and you get a distributed monolith: the costs of both and the benefits of neither.",
    analogy: "A monolith is one big restaurant kitchen: fast to shout across, but a grease fire closes the whole place. Microservices are a food court: each stall runs itself, but a meal from three stalls means three queues.",
    useCases: [
      "Deciding how to structure a new product (most start as a monolith, and should)",
      "Splitting out one part that needs to scale or deploy on its own",
      "Drawing service boundaries around teams and business capabilities",
      "Recognising and untangling a distributed monolith",
    ],
    why: "Senior engineers are expected to make, and defend, architecture decisions whose costs last for years. Knowing the real trade-offs (latency, transactions, blast radius, deploy independence, team structure) keeps you from cargo-culting microservices into a system that didn't need them.",
    watch: "Pick an architecture and a scenario. Green boxes are healthy, blue dashed boxes are deploying, yellow are degraded, red are down. Moving dots are calls: violet = in-process function call, blue = network call, white = database query. Watch the latency, network hops and blast radius counters, and turn on Teams to see who owns what.",
  },
  tryThis: [
    'Play "Checkout request" on all three architectures and compare latency and hops.',
    'Run "Ship a bug" on the monolith, then on microservices: count what goes down.',
    'Try "Deploy a change" on the distributed monolith: why does everything redeploy?',
    'Turn on Teams and see how the architecture mirrors the org chart.',
  ],
  keyIdeas: [
    'Monolith: in-process calls, one DB, easy transactions, but one deploy and one blast radius.',
    'Microservices: independent deploys and scaling, paid for with network hops and lost transactions.',
    'Shared databases and chatty synchronous calls create a distributed monolith.',
    "Conway's law: system boundaries end up matching team boundaries, so design both together.",
  ],
  quiz: [
    {
      q: 'Five services all read and write the same database tables. What have you most likely built?',
      options: ['A modular monolith', 'A distributed monolith', 'Event sourcing', 'A well-isolated microservice system'],
      answer: 1,
      why: 'Shared tables couple every service: schema changes force lockstep deploys, so you get network costs without independence.',
    },
    {
      q: 'Which is usually HARDER after moving from a monolith to microservices?',
      options: ['Deploying one component', 'Scaling one hot component', 'Keeping order + payment in one atomic transaction', 'Letting teams own their code'],
      answer: 2,
      why: 'Data now lives in separate databases, so atomicity needs sagas or other distributed patterns.',
    },
    {
      q: 'A memory leak in product search takes down checkout. Which architecture were you most likely running?',
      options: ['Monolith', 'Microservices with timeouts and fallbacks', 'A static site', 'Serverless functions'],
      answer: 0,
      why: 'All modules share one process and heap, so one leak can crash every feature at once.',
    },
  ],
};

export default lesson;
