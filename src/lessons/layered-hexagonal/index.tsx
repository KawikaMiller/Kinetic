import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Layered and hexagonal apps can have the same pieces; the difference is which way the arrows point. In a hexagon the business logic depends on nothing, and databases, web frameworks and CLIs plug into interfaces it owns.',
    what: 'A layered architecture stacks controller, service, repository and database, each importing the one below, so the business rules end up depending on storage. Hexagonal architecture, Alistair Cockburn\'s "ports and adapters", puts the domain in the centre: it defines ports (interfaces such as OrderRepository), adapters outside implement them (Postgres, in-memory, an HTTP controller, a CLI), and one composition root wires them together. The dependency rule: source dependencies only point inward.',
    analogy: 'A laptop with USB-C ports: it says what shape a charger, a screen or a drive must have, and anything that fits plugs in. It doesn\'t have a particular brand of screen soldered to the motherboard.',
    useCases: [
      'Swapping a database or payment provider without touching business rules',
      'Unit-testing domain logic with in-memory adapters instead of a real database',
      'Driving the same use case from an HTTP API, a CLI, a queue consumer and tests',
      'Enforcing "the domain imports nothing outward" with an import-rule lint in CI',
    ],
    why: 'In many codebases the business rules import the ORM, the HTTP framework and the payment SDK, so every infrastructure change becomes a business-logic change and every test needs a database. Knowing the dependency rule lets you spot that in review, structure new services so the core stays testable, and talk sensibly about "clean", "onion" and "hexagonal", which are variations on this one idea.',
    watch:
      'Boxes are source files and arrows are their import lines. In the layered view, four tinted bands run top to bottom: controller (amber), service (violet), repository (sky) and database (grey), and each file is tinted in its band\'s colour. In the hexagon view, a violet-tinted hexagon holds the domain: domain files are tinted violet and ports blue, driving adapters (HTTP controller, CLI) amber, driven adapters sky blue, and the ORM library and main.ts grey. An adapter you just swapped in is solid yellow and slides in. An import that points the wrong way (outward, or up) is a thick red arrow, and its import line is tinted red in the code panel. The box whose source is showing has a white outline. In the stats, the rule counter and the changed-files counter are green at 0 and red above 0. The test-speed bars are green for the domain test and red for the integration test.',
  },
  tryThis: [
    'In the layered view, switch the Database adapter to In-memory: OrderService, the file with the business rule, has to change.',
    'Toggle View to Hexagon and swap the database again: only main.ts and the adapters change, and "Domain files changed" stays at 0.',
    'Swap the Driver from HTTP controller to CLI in the hexagon: a new adapter slides in on the left, and the domain is untouched again.',
    'Set Domain to "Domain imports the ORM": a red arrow points outward. Swap the database now and the domain-files counter jumps to 1.',
    'Click any box, such as PostgresOrderRepo or placeOrder, to read its real source and see which imports make up its arrows.',
  ],
  keyIdeas: [
    'Hexagonal is not "more layers": it is the same pieces with the dependencies pointing inward, at interfaces the domain owns.',
    'The domain depends on nothing; adapters depend on the domain\'s ports; only the composition root names concrete adapters.',
    'An infrastructure swap should edit adapters and wiring, never the files with the business rules.',
    'It costs extra interfaces and wiring: for a small script or a thin CRUD app, plain layers are often enough.',
  ],
  quiz: [
    {
      q: 'What really separates the hexagon from the layered app in this lesson?',
      options: [
        'Which way dependencies point: adapters import the domain\'s ports',
        'It adds more layers between the controller and the database',
        'It puts the database at the centre and builds outwards from it',
        'It removes the composition root that names concrete classes',
      ],
      answer: 0,
      why: 'Both drawings have a controller, the business rule, a repository and a database. In the layered app the service imports the repository class; in the hexagon the domain defines OrderRepository and the adapter imports it. "More layers" is the misconception: the hexagon here has fewer rings than the layered app has bands.',
    },
    {
      q: 'With the domain importing the ORM, what does swapping Postgres for in-memory force?',
      options: [
        'An edit to domain/placeOrder.ts, the file with the business rule',
        'A one-line edit to main.ts, the composition root, and nothing more',
        'No edits anywhere, because the adapters are interchangeable',
        'A rewrite of every adapter that implements one of the ports',
      ],
      answer: 0,
      why: 'A domain that knows which storage it uses has to change when the storage does, which the domain-files counter shows jumping to 1. One edit in main.ts is what the clean hexagon needs; it is tempting, but it only holds when nothing in the domain names the database.',
    },
    {
      q: 'In the hexagon, who owns the OrderRepository interface?',
      options: [
        'The domain: it states what storage it needs from the outside',
        'The Postgres adapter, since that is the class implementing it',
        'main.ts, because it decides which adapter will be plugged in',
        'The ORM library, since it is the code that knows the tables',
      ],
      answer: 0,
      why: 'The port lives in domain/ and is written in the domain\'s terms (save an order), not the database\'s. That is the dependency inversion: the adapter imports the domain\'s interface, so the arrow points inward even though the call goes outward at runtime.',
    },
    {
      q: 'Why can the domain\'s own tests run without a database?',
      options: [
        'It depends only on ports, so a test passes in in-memory adapters',
        'Test runners stub out every database call automatically for you',
        'The domain caches each query, so it never needs to reach storage',
        'TypeScript strips the database code out when it runs unit tests',
      ],
      answer: 0,
      why: 'placeOrder takes an OrderRepository, a PaymentPort and a Notifier, and this lesson\'s tests run it with the in-memory repository and with the Postgres one. Nothing strips or stubs database code by magic; it is the inward-only imports that make the swap possible.',
    },
    {
      q: 'When is a full ports-and-adapters setup most likely overkill?',
      options: [
        'A one-off script that reads a CSV file and prints a total',
        'A service whose database is going to be replaced next quarter',
        'Domain rules that need fast unit tests without any database',
        'One use case that is driven from both an HTTP API and a CLI',
      ],
      answer: 0,
      why: 'Ports and wiring pay for themselves when infrastructure changes, needs faking in tests, or has several drivers: the other three options. A throwaway script has none of those, so the extra interfaces are just ceremony.',
    },
  ],
};

export default lesson;
