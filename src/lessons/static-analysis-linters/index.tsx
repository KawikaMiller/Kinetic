import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Formatters, linters, type checkers and tests each catch a different kind of problem before your code runs in production, and none of them catches everything.',
    what: "A formatter (Prettier) only rewrites whitespace and layout, so the code means the same. A linter (ESLint) matches code against rules for suspicious patterns: unused variables, == instead of ===, a promise nobody awaits. A type checker (TypeScript) proves things about values, like \"this might be null\". Tests run the code and check its behaviour, which is the only way to catch a logic bug like an off-by-one.",
    analogy: 'Spell check, grammar check, a fact-checker and a test reader each catch a different kind of mistake in an essay. Passing spell check does not make the argument right.',
    useCases: [
      'Pre-commit hooks and CI that run Prettier, ESLint and tsc on every change',
      'Editor squiggles that flag a bug while you type, long before review',
      'Deciding whether a lint rule is worth an inline // eslint-disable-next-line',
      'Explaining in review why "it passed lint" is not the same as "it works"',
    ],
    why: 'Every team you join will have these tools in CI, and they will flag your code from day one. Knowing what each one can and can\'t catch tells you why a check failed, how to fix it properly, and why you still need tests.',
    watch: "The code on the left highlights in yellow every line a switched-on tool flags, with the rule name at the end of the line. On the right, each tool layer is a band: green-bordered when it's on, dashed and dimmed when it's off. A problem drops through the layers in order and lands, as a green chip, in the first one that catches it; anything nothing catches lands in the red Production band. The table marks with ✓ which tool can catch which problem, in green where it actually did, with the columns of switched-off tools dimmed. The formatter diff strikes through the old line and shows the new one, with a green chip when the tokens are unchanged. Inside the eqeqeq rule, the violet pattern finds the match highlighted in yellow. These are small toy versions of the tools: the table matches what Prettier, ESLint and tsc --strict really report on this code.",
  },
  tryThis: [
    'Switch on Linter only: three problems still ship, even though the linter "passes".',
    'Switch on Formatter and open the Formatter diff: only whitespace changed.',
    'Switch on Type checker: it is the only tool that sees user may be null.',
    'Turn every layer on, then set Silence eqeqeq on the == line to eslint-disable.',
    'Find the one problem only Tests can catch.',
  ],
  keyIdeas: [
    'Formatters change layout, never meaning; linters flag suspicious patterns; type checkers prove facts about values.',
    'Only tests run the code, so only tests catch logic bugs like an off-by-one.',
    'Each layer catches what the others miss: you want all of them, not one.',
    'An inline disable comment silences a rule for one line: fine for a real exception, dangerous as a habit.',
  ],
  quiz: [
    {
      q: 'ESLint and TypeScript both pass with zero errors. What does that tell you?',
      options: [
        'No rule or type errors, but logic bugs can remain',
        'The code is correct and does what it was meant to',
        'The test suite is guaranteed to pass too',
        'The code is formatted in the house style',
      ],
      answer: 0,
      why: 'Linters and type checkers check patterns and types, not what the code is supposed to do. The off-by-one loop passes both and only a test catches it.',
    },
    {
      q: 'Which tool catches "user.name" when user can be null?',
      options: [
        'Prettier, the formatter',
        "ESLint's eqeqeq rule",
        "TypeScript's strictNullChecks",
        'None: only tests catch it',
      ],
      answer: 2,
      why: "The type checker knows user is User | null, so it reports TS18047: 'user' is possibly 'null'. eqeqeq is about == vs ===, and Prettier only reformats.",
    },
    {
      q: 'What does a formatter like Prettier change?',
      options: [
        "How it's written, never what it does",
        'Logic bugs that it spots while reformatting',
        'Unused variables and imports it removes',
        'Type errors it can fix automatically',
      ],
      answer: 0,
      why: "It reprints the same code in a consistent style: layout, line wrapping, quotes, semicolons. Some tokens change spelling, but the meaning never does; removing unused code is a linter's job.",
    },
  ],
};

export default lesson;
