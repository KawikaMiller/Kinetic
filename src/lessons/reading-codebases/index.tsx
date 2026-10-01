import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'You don\'t read a new codebase top to bottom. You start from something you know (a route, an error message, a failing test) and follow the code with search, go to definition, find references and blame.',
    what: 'Navigating code is a search problem. Search (grep) finds where a piece of text appears. Go to definition jumps from a name to the line that declares it; find references lists everything that uses it. Following definitions from an entry point traces a request through the layers: route → controller → service → repository → database. Blame shows the commit that last changed a line, and its message often says why. Tests describe what the code is supposed to do, so they are documentation too.',
    analogy: 'Finding a book in a library: you use the catalogue and the shelf numbers, not read every book from the front door onwards.',
    useCases: [
      'Your first ticket on a new team: "fix the discount bug" in a repo you\'ve never seen',
      'Answering "why does this endpoint return 402?" during an incident',
      'Finding out who changed a value and why before you change it back',
      'Checking every caller before you rename or change a function',
    ],
    why: 'Most of a junior\'s first months are spent reading code, not writing it. Knowing where to start and which tool to reach for turns "I\'m lost in a million lines" into a five-step search, and blame plus a good commit message saves you asking around.',
    watch: 'The left column is the file tree: the open file has a yellow bar, files you\'ve visited turn violet, and the answer\'s file turns green when you find it. The middle is the open file: the selected line is tinted yellow with a yellow bar, text matching your search is boxed in blue, and the answer line turns green with "← here". On the right, search results have a blue edge and references a violet one. Symbols on the selected line are listed in violet with violet "Go to definition" and "Find references" chips. Blame opens a commit card with its hash, author, date and message. The breadcrumbs at the bottom are violet chips joined by arrows, in the order you visited the files.',
  },
  tryThis: [
    'On the "Discount" task, search for WELCOME10 and count the matches: how many are tests?',
    'On "402", open routes/checkout.ts, select line 7, and use "Go to definition" on createCheckout. Then select the line that checks PaymentDeclined and use "Find references".',
    'On "Tax change", find the TAX_RATE line and press "Blame this line". Who changed it, and which ticket was it for?',
    'On "Saving orders", follow definitions from the route and watch the breadcrumbs build route → controller → service → repository.',
    'Solve a task your own way, then press "Show the efficient path" and compare the step counts.',
  ],
  keyIdeas: [
    'Start from an entry point (a route) or a failing test, never from the top of the first file.',
    'Search finds text; go to definition and find references follow the code itself.',
    'Blame tells you who changed a line and, through the commit message, why.',
    'Tests are documentation: they say what the code is meant to do.',
  ],
  quiz: [
    {
      q: "You've been asked why POST /checkout sometimes returns 402. What's the best first move?",
      options: [
        'Search for "402" or the route, then trace it',
        'Read every file in the repo from the top',
        'Ask the team to rewrite checkout first',
        'Read the README from start to finish',
      ],
      answer: 0,
      why: 'Start from something concrete you know (the status code or the route) and follow it. Reading everything is the slow way, and the README rarely explains one status code.',
    },
    {
      q: 'Search for "PaymentDeclined" and "Find references" on PaymentDeclined can differ. Why?',
      options: [
        'Search also matches strings and comments',
        'They never differ: both look for the name',
        'Find references follows calls made at runtime',
        'Search skips names in class definitions',
      ],
      answer: 0,
      why: "In this repo, errors.ts has the string 'PaymentDeclined' as the error's name. Search finds it; references skip it because it's text, not a use of the class.",
    },
    {
      q: 'The tax rate looks wrong. What does blame tell you before you change it?',
      options: [
        'Who changed the line last, when, and why',
        'Whether the code still compiles after it',
        'Which tests will fail if you change it',
        'The value the tax rate should really be',
      ],
      answer: 0,
      why: 'Here blame shows Priya raised it to 8.25% for the Austin store under FIN-212: a deliberate change, so talk to finance before "fixing" it. Blame shows history, not the right value.',
    },
    {
      q: 'Why are tests a good place to start in an unfamiliar codebase?',
      options: [
        'They show the intended behaviour with real inputs',
        "They're always the shortest files to read",
        'They hold the production config and secrets',
        'Tests are never wrong, unlike the code',
      ],
      answer: 0,
      why: 'A test like "takes 10% off with the WELCOME10 coupon" tells you the behaviour and names the function that implements it. Tests can be wrong too; they\'re a map, not gospel.',
    },
  ],
};

export default lesson;
