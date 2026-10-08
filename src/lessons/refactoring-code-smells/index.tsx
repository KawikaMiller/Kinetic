import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Refactoring changes the structure of code without changing what it does, in small named steps, each one checked by tests that stay green.',
    what: 'A code smell is a surface sign that the structure could be better: a long function, duplicated branches, a mysterious name, a long parameter list. Each smell has known refactorings, named in catalogues like Martin Fowler\'s Refactoring: Extract Function, Rename, Introduce Parameter Object. Before touching untested code you pin its current behaviour with characterization tests, quirks and all, then refactor in steps that keep them green. Fixing a bug is a behaviour change, so it is a separate step with its own test.',
    analogy: 'Rearranging a kitchen so the cooking is easier, without changing a single recipe. If the soup tastes different afterwards, you did more than rearrange.',
    useCases: [
      'IDE refactorings (Rename, Extract Method, Change Signature) that rewrite every call site safely',
      'Pinning legacy code with characterization tests before changing it',
      'Code review comments like "extract this" or "this flag wants two functions"',
      'Preparatory refactoring: reshape the code so the next feature is a small change',
    ],
    why: 'Much of a working engineer\'s time can go on changing code someone else wrote. Knowing the smells gives you words for what is wrong in a review (`code-review`), and keeping refactors behaviour-preserving, with the tests as a safety net, is what lets you clean up without shipping a regression. Pure, small functions are the natural end point (`functional-programming`).',
    watch: 'Lines with a smell have a wavy orange underline; the smell you picked is underlined in solid yellow instead. After a step, lines the refactoring added or changed are tinted blue with a blue bar, and lines it removed stay in place tinted red and struck through. The test badge and the Tests stat are green while all characterization tests pass and red when any fails; the console lists each test, a green ✓ or a red ✗ with what it got. Smell chips are orange, the unsafe edit chip red, and the grey metrics compare with the original.',
  },
  tryThis: [
    'Pick Magic literal and apply Replace Magic Literal: a named constant appears, the tax line changes, and all 12 tests stay green.',
    'Apply Extract Function and watch Longest function drop while the tests stay green.',
    'Apply the six refactorings in any order you like: every order ends at the same clean code.',
    'Turn on the Unsafe edit chip: one test goes red, because rounding the tax first is a behaviour change.',
    'Apply Remove Flag Argument and read how the tests now call it: the API changed, the expected totals did not.',
  ],
  keyIdeas: [
    'A refactoring changes structure, never behaviour; the tests are your evidence and safety net, not a proof.',
    'Pin untested code with characterization tests before you change it.',
    'Name the smell, then reach for its refactoring, one small step at a time.',
    'Bug fixes are behaviour changes: their own commit, with their own test.',
  ],
  quiz: [
    {
      q: 'While extracting a function you notice the tax should really be rounded to cents first. What should you do?',
      options: [
        'Finish the refactor, then fix it in its own commit with a test',
        'Fix it in the same commit, since you are touching that code now',
        'Change the characterization test to the new value and carry on',
        'Leave it, because refactored code cannot have bugs left in it',
      ],
      answer: 0,
      why: 'Mixing a fix into a refactor means a red test could be either change, and reviewers cannot tell structure from behaviour. Quietly updating the characterization test is the tempting wrong move: it hides a behaviour change inside a commit that claims to have none.',
    },
    {
      q: 'What makes a change a refactoring?',
      options: [
        'The structure changes while observable behaviour stays the same',
        'The code gets shorter, whatever else happens to the behaviour',
        'It fixes the bugs it finds along the way as it tidies the code',
        'It rewrites the code from scratch in a newer and cleaner style',
      ],
      answer: 0,
      why: "Refactoring is defined by preserved behaviour, not by the result looking nicer. That's the misconception: \"rewriting it better, fixing bugs as you go\" is a rewrite, and it gives up the safety net that makes small refactorings cheap.",
    },
    {
      q: 'Before refactoring old code that has no tests, what do characterization tests pin down?',
      options: [
        'What the code does today, quirks included',
        'What the specification says it should do',
        'Only the parts of it that look correct',
        'How fast each function runs before the change',
      ],
      answer: 0,
      why: 'A characterization test records current behaviour, even odd behaviour like free shipping from exactly 50, so any refactoring that changes it goes red. Whether that behaviour is right is a separate question for a separate change.',
    },
    {
      q: 'A function is called as total(items, type, coupon, region, express). Which smell and fix fit the express argument?',
      options: [
        'A flag argument: split it into two explicit functions',
        'A magic literal: replace it with a named constant',
        'Duplicated code: consolidate it into one branch',
        'A mysterious name: rename the function to fit it',
      ],
      answer: 0,
      why: 'A boolean that switches the function between two behaviours makes every call site read like total(..., true). Remove Flag Argument gives each behaviour its own named function. The long parameter list is a smell here too, but its fix is Introduce Parameter Object, not a rename.',
    },
  ],
};

export default lesson;
