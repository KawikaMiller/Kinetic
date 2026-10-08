import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Instead of a class building its own collaborators with new, it asks for them (usually as constructor parameters), and one place at the edge of the program decides which real ones to pass.',
    what: 'Dependency injection means a class receives the objects it depends on instead of creating them. That inverts control over wiring: the class says what it needs, and a composition root (often just main) picks the concrete classes and passes them in. A DI container automates that wiring from registrations, but it is optional; constructor parameters and one function that builds the graph are the whole technique.',
    analogy: 'A chef who is handed ingredients can cook in any kitchen and can be tested with plastic vegetables. A chef who insists on driving to one particular farm every morning cannot.',
    useCases: [
      'Unit-testing a service with a fake repository and a spy mailer instead of a real database and mail server',
      'Swapping Postgres for an in-memory store in local development without touching business code',
      'Reading a framework (Spring, ASP.NET Core, NestJS, Angular) that resolves constructors from a container',
      'Spotting a hidden dependency: a "clean" constructor whose methods reach into a global registry',
    ],
    why: 'Code you can\'t test without a database gets fewer tests, and the ones it gets are slow and flaky. Asking for dependencies makes test doubles possible, keeps the choice of infrastructure in one file, and is the everyday form of dependency inversion. Interviewers love "how would you test this?", and the answer is usually "inject it".',
    watch:
      'Scene 1: boxes are objects in grey. OrderService, the class under test, is solid yellow, and the test doubles (FakeRepo, SpyMailer) are tinted sky blue. Orange arrows are a hard-wired new inside a class; a dashed orange arrow is a hidden lookup in a global registry; blue arrows are dependencies injected through the constructor; grey arrows are objects the test creates. The Unit test stat is green for pass, red for fail and grey before a run; in the output, passing lines are green and failures and errors red. Scene 2: grey arrows are what main() creates and blue arrows what it injects; the class you just switched to, and its arrow, turn yellow, and classes not chosen are faded grey. The changed line of main.js is tinted yellow; the output is green when the order goes through and red on a refused connection. The Run stat is green or red, and the concrete-classes stat is green at 0. Scene 3: the registration being resolved or built is solid yellow, with the chain of arrows from the root in yellow; classes built at least once are tinted green. Under each box, the key and instance count are grey, and singletons that exist carry a violet "shared" tag. In the circular preset, the classes and arrows of the cycle turn red. The table row being resolved is yellow; the Instances stat is yellow, and Outcome is green when resolved, red on a cycle and grey while running.',
  },
  tryThis: [
    'In scene 1, press "Run the unit test": it fails on the (simulated) database. Switch to constructor injection and run again: green.',
    'Pick "service locator" and run: the constructor takes nothing, yet the test still hits the database through the hidden Registry.',
    'In scene 2, switch Repository to In-memory and Mailer to Console: arrows re-point, one line of main.js changes, and the order goes through.',
    'In scene 3, play the Shop registrations, then set repo to transient and play again: InMemoryRepo goes from ×1 to ×4.',
    'Pick "Circular: orders ⇄ audit" and play: resolution stops with the cycle in red, before either class is built.',
  ],
  keyIdeas: [
    'Ask for dependencies (constructor parameters) instead of creating them with new inside the class.',
    'Wire the concrete classes in one composition root at the program\'s edge; business code never names them.',
    'A container automates the wiring and manages lifetimes (singleton, transient, scoped), but DI works without one.',
    'A service locator hides dependencies behind a global lookup: the constructor looks clean, the coupling is still there.',
  ],
  quiz: [
    {
      q: 'Does dependency injection need a framework or a container?',
      options: [
        'No: passing collaborators in through the constructor is the whole idea',
        'Yes: without a container nothing can build the object graph for you',
        'Only in typed languages, where a compiler has to check the interfaces',
        'Only once an app has more than a handful of classes to wire together',
      ],
      answer: 0,
      why: 'Scene 2 wires everything in a plain main() with no library at all. A container saves typing in big graphs and manages lifetimes, which is why frameworks ship one, but it is a convenience on top of the technique, not the technique. This is the main misconception.',
    },
    {
      q: 'Why does the hard-wired unit test fail, even though OrderService\'s logic is fine?',
      options: [
        'OrderService builds its own PostgresRepo, so the test cannot swap it out',
        'The fake repository in that test returns an id of 0 instead of 1',
        'The test runner cannot construct a class whose constructor does work',
        'The test expects the order total to be returned, not the saved order',
      ],
      answer: 0,
      why: 'The constructor calls new PostgresRepo() itself, so every OrderService talks to the (simulated) database and the test can\'t substitute anything. The hard-wired test has no fake repository at all; that only appears once the dependency is injected.',
    },
    {
      q: 'A class\'s constructor takes nothing, but its methods call Registry.get(\'repo\'). What is the problem?',
      options: [
        'The dependency is hidden: callers can\'t see it or pass in another one',
        'It can never work, because a registry object cannot hold instances',
        'It builds a brand-new repository every single time a method is called',
        'A registry forces every service it holds to have a transient lifetime',
      ],
      answer: 0,
      why: 'This is the service locator pattern. It works, but nothing in the constructor tells you the class needs a repository, and a test has to know to patch the global registry first and restore it afterwards. Constructor injection makes the same dependency visible in the signature.',
    },
    {
      q: 'In the Shop registrations, repo is a singleton. Resolving checkout twice builds how many InMemoryRepo instances?',
      options: ['1', '2', '4', '6'],
      answer: 0,
      why: 'A singleton is built the first time anything needs it and reused afterwards, across both resolves. As a transient it would be built once per request: OrderService and ReportService each ask for it, on each of the two resolves, which makes 4.',
    },
    {
      q: 'OrderService needs AuditLog, and AuditLog needs OrderService. What does a container do?',
      options: [
        'Fails to resolve, because neither constructor can run first',
        'Builds one of them half-finished and fills it in afterwards',
        'Quietly skips AuditLog and builds the OrderService anyway',
        'Builds a new pair over and over until memory runs out',
      ],
      answer: 0,
      why: 'Each constructor needs the other object to already exist, so there is no valid order. Containers detect the cycle and fail with the chain, as scene 3 does. The fix is in the design: split a class, or inject a factory or an event instead of the object itself.',
    },
  ],
};

export default lesson;
