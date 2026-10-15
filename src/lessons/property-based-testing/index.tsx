import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Instead of writing the examples, write the rule the answer must obey and let the machine invent the inputs, then shrink any failure down to something you can read.',
    what: 'You run real JavaScript sorting functions, some with a deliberate bug, against properties such as "the output is in order" and "the output has the same values as the input". A seeded generator fires 100 random arrays; the first failure is shrunk step by step into the smallest failing input the shrinker can reach. A bug-by-property matrix shows which rules catch which bugs, and a generator panel shows why a bug that needs repeated values can slip past 100 cases of a wide range. The runner is a small teaching toy, not a real library.',
    analogy: 'Like a fuzzing inspector who tests a bridge by driving thousands of random loads over it, then, when one fails, removes weight until she finds the lightest load that still breaks it.',
    useCases: [
      'Testing a parser, formatter or serializer with "decode of encode gives back the input"',
      'Checking a sort, a merge or a diff against a slow, obviously correct reference',
      'Finding the edge cases nobody thought to write an example for, such as empty or repeated input',
      'Replaying a failure from its seed in CI and handing a small counterexample to whoever fixes it',
    ],
    why: 'Example tests only check the cases you thought of. Property tests check a rule across many inputs you did not, and shrinking makes the failures cheap to understand. Knowing what a passing run does and does not prove keeps you from trusting it too much.',
    watch: 'Cases that passed are green and a case that failed is red, as is the wrong line of code once a failure is found. In Shrink, the input being shrunk is yellow, an accepted shrink is green because it still fails, a rejected one is grey and struck through, and the smallest failing input is violet. In the matrix, green cells caught a bug and say at which case, orange cells did not catch it in 500 cases, which is not the same as the code being correct, and grey cells belong to the correct sort. Violet chips are properties. Dashed grey chips say which parts are real JavaScript and which are toys.',
  },
  tryThis: [
    'On Fire random inputs, press Run 100 cases at the defaults: the no-comparator sort fails on case 3 with a seven-value array, and the wrong line turns red.',
    'On Shrink, with the defaults, play the steps: the seven-value array shrinks to [17, 3] and the last caption says no single shrink still fails. Rejected candidates are struck through.',
    'On Properties worth writing, only same length is ticked at first and two of the three buggy versions survive. Tick non-decreasing and same values as well and none survive.',
    'On Generator design, the opening range 0..1,000,000 repeats a value in 2.8 × 10⁻⁵ of cases and the seeded run finds nothing in 100. Switch Values to −5..5 and the same bug fails at case 1.',
    'On Fire random inputs, look at Your own array, which starts as 10, 2, -3: two functions break it. Type 5, 5 and a different one fails, since only the dedupe version loses a repeated value.',
  ],
  keyIdeas: [
    'A property states what should hold for any input, and the machine invents the inputs. You keep the rule, not a list of examples.',
    'A passing run says that those inputs passed, and nothing more. No failure found is not a proof of correctness.',
    'Shrinking keeps whatever still fails while making the input smaller, so the counterexample is short enough to read, and the same seed replays it.',
    'The generator decides what you can find: a bug that needs repeated values hides from a wide range. Non-decreasing plus same values together define sorting.',
  ],
  quiz: [
    {
      q: 'A property test runs 100 random cases and all of them pass. What can you conclude?',
      options: [
        'That these 100 inputs passed, while other inputs may still fail',
        'That the function is correct, because random inputs cover the whole space',
        'That it is correct unless a failure is very rare, which shrinking would then find',
        'That the properties are weak, since a sound function fails a case now and then',
      ],
      answer: 0,
      why: 'Passing runs report on the inputs that were tried. A bug that needs repeated values can sit behind a one-in-thousands case, and shrinking starts once something has failed.',
    },
    {
      q: 'Why does a property-testing tool shrink a failing input before showing it?',
      options: [
        'The first failure is often long and noisy, so a small failing input is easier to read and fix',
        'Shrinking proves the function has no other bug, because the smallest case is the only one that matters',
        'The tool has to shrink the input to make the function run fast enough to be tested at all',
        'The seed only reproduces the failure after the failing input has been shrunk',
      ],
      answer: 0,
      why: 'Shrinking keeps what still fails and drops the rest. The result is a smaller input that shows the cause more plainly; it says nothing about other bugs.',
    },
    {
      q: 'Which pair of properties together pins down what a sort must do?',
      options: [
        'Same length and idempotent: the right size, and sorting again changes nothing',
        'Idempotent and non-decreasing: ordered, and sorting again changes nothing',
        'Same length and same values: nothing lost, nothing added',
        'Non-decreasing and same values: the output is in order and holds the input’s values',
      ],
      answer: 3,
      why: 'A function returning zeros passes the first pair, one returning an empty array passes the second, and the identity function passes the third. In order plus the same values leaves one possible output.',
    },
    {
      q: 'A function that dedupes while sorting passed 100 cases with values from 0 to 1,000,000. What would find the bug?',
      options: [
        'Draw values from a small or edge-biased range so repeats are likely',
        'Run 100 more cases from the same wide range, since more is better',
        'Tick the idempotent property, which a dedupe bug breaks',
        'Shrink one of the passing inputs until it is a repeat',
      ],
      answer: 0,
      why: 'With a wide range a repeat in eight draws is about 2.8 × 10⁻⁵ per case. A narrow range makes repeats common, and the idempotent property does not catch a dedupe bug.',
    },
  ],
};

export default lesson;
