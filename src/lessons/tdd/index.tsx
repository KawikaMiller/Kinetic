import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Test-driven development is a loop of tiny steps: write one failing test, write just enough code to pass it, then tidy up while everything stays green.',
    what: 'Red: write a test for the next small behaviour and watch it fail, which proves the test can fail. Green: write the simplest code that passes. Refactor: improve the structure with the tests as a safety net, changing no behaviour. Repeat. It is not writing all the tests first: one test at a time leads the code. Its main payoffs are a test behind every behaviour and code shaped by how it is used; how much it improves design in practice depends on the people doing it, and studies of it disagree.',
    analogy: 'Laying a path one paving stone at a time, standing on each before placing the next, instead of sketching the whole garden and hoping the stones line up.',
    useCases: [
      'Katas like FizzBuzz, the bowling game and Roman numerals, for practising small steps',
      'Fixing a bug by first writing the test that reproduces it',
      'Growing pure logic (pricing, parsing, validation rules) where inputs and outputs are clear',
      'Pair and mob programming, where one person writes the failing test and the other makes it pass',
    ],
    why: 'TDD is a common interview and team practice, and even if you never follow it strictly, its habits pay off: seeing a test fail before trusting it, keeping refactors separate from behaviour changes, and taking steps small enough that a red test points straight at the cause. It builds on `test-pyramid` (unit tests) and `debugging-method` (small, checkable steps).',
    watch: 'The wheel has three arcs: red, green and refactor (blue). The phase you are in is drawn at full colour with a yellow ring; the others are faded. Passing tests are green with a ✓, failing tests red with a ✗ and what they got. In the code panel, lines the last move changed have a yellow tint and bar. An orange chip flags a behaviour the code has but no test pins. The move buttons are violet. In the change request scene the same colours apply to both codebases side by side, and the verdict marks a caught slip in green and one that slipped by in red.',
  },
  tryThis: [
    "Play the Kata with good moves only and watch the cycle lengths: every cycle is 2 moves.",
    'At the first step, pick Write all of FizzBuzz now: four behaviours appear, every one flagged orange as untested.',
    'At the 3 → Fizz step, pick Tidy up first, while the test is red: the 1 test goes red too.',
    'Finish the kata, then look at the step after the Bazz line: the combinations get pinned by a test that passes at once.',
    'Open Change request and pick A careless slip: the TDD suite catches it and the test-after suite misses it.',
  ],
  keyIdeas: [
    'Red, green, refactor: one failing test, the simplest pass, then tidy with the tests green.',
    'A test you never saw fail might not be able to fail.',
    'Refactor only on green, and never mix it with a behaviour change.',
    'TDD leaves a test behind every behaviour; it does not by itself guarantee a good design.',
  ],
  quiz: [
    {
      q: 'Which of these describes test-driven development?',
      options: [
        'One failing test at a time, each followed by just enough code',
        'Writing every test for a feature first, then all of its code',
        'Writing the code first, then tests to bring coverage to 100%',
        'Testing only the public API, never the internal functions',
      ],
      answer: 0,
      why: 'TDD interleaves: one small failing test, the code to pass it, a refactor, repeat. Writing all the tests up front is the common misconception; it gives you a pile of red tests and no feedback about which change fixed what.',
    },
    {
      q: 'Why watch a new test fail before writing the code for it?',
      options: [
        'It proves the test can fail, so a pass later means something',
        'Failing tests run faster, which keeps the whole suite quick',
        'The test runner needs a failing run to record a baseline',
        'It shows the code is wrong, so you can delete it and restart',
      ],
      answer: 0,
      why: 'A test that passes before the code exists might be testing nothing (a typo, the wrong function, an assertion that always holds). Seeing it red once is the cheapest check that it can catch a regression.',
    },
    {
      q: 'Halfway through making a red test pass, you notice some ugly code nearby. What does TDD say?',
      options: [
        'Get to green first, then refactor with every test passing',
        'Refactor now, because the code is open in front of you',
        'Never refactor in a TDD cycle; only write new features',
        'Delete the failing test, refactor, then write it again',
      ],
      answer: 0,
      why: 'Refactoring while red mixes two changes, so when something else goes red you cannot tell which change did it, as the kata shows when the 1 test breaks. Finish the small step, then tidy with the tests as your safety net.',
    },
    {
      q: 'A team says TDD made their design better. What is the most defensible claim TDD makes?',
      options: [
        'Every behaviour gets a test that once failed, and steps stay small',
        'Code written test-first always ends up with the best possible design',
        'TDD code never has bugs, because each line was written to pass a test',
        'TDD removes the need for integration tests and code review entirely',
      ],
      answer: 0,
      why: 'TDD reliably leaves tests behind and keeps feedback fast. Better design is a common hope, not a guarantee, and research on it is mixed; the misconception is that TDD is only about testing, or that it does the design for you. It certainly does not replace integration tests or review.',
    },
  ],
};

export default lesson;
