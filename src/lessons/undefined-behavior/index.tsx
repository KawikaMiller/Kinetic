import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const n = (v: number) => v.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Undefined behaviour is not "the program crashes": it is a case where the language standard puts no requirements on the whole execution, so an optimiser may assume the case never happens and delete code that checks for it.',
    what: 'The function x + 1 < x looks like an overflow test. For a signed int the standard leaves overflow undefined, so a compiler may reason that x is never the maximum, that x + 1 is therefore larger, and that the comparison is false: the check can become return 0. For an unsigned int, wrap-around is defined, so the check stays. The lesson shows that rule applied by hand to a toy, draws every input of a small integer to show that the two versions differ at exactly one value outside the contract, repeats the idea with a null check that follows a dereference, lets you sort eight snippets into defined, implementation-defined, unspecified and undefined, and ends with the defences that turn the silent bug into something visible. Everything here is a labelled simulation: the C is shown, not run.',
    analogy: 'It is a contract with a clause that says "if you break this term, the other side owes you nothing": the compiler is free to build on the assumption that you never do, even in places that look unrelated.',
    useCases: [
      'Reading a surprising optimised build where an overflow or null check seems to have disappeared',
      'Choosing between wrapping, checked and trapping integer arithmetic in a new codebase',
      'Knowing which flags (-fwrapv, -fsanitize=undefined) change what the compiler may assume',
      'Telling undefined from implementation-defined and unspecified when reviewing C or C++',
    ],
    why: 'A bug that depends on undefined behaviour can pass every test in a debug build and fail in a release build, because the optimiser removes the very check you wrote. Knowing the rule is how you stop writing those checks and how you find them in someone else\'s code.',
    watch: 'The sign bit of a number is orange (--orange), a category and not a status. The "as written" column is blue (--info) and the column after the toy rewrite is violet (--violet). In the strip of inputs and in the tables, a green cell or row (--ok) is an input where the two columns agree and a red one (--bad) is where they differ, which is outside the contract. In the classification board a right answer is green and a wrong one red, and in the defences a defence that restores defined behaviour is green while the silent bug is red. The current input has a yellow ring or wash (--hi).',
  },
  tryThis: [
    `Overflow, on the defaults (signed, 32-bit, x = ${n(F.max32)}): as written the function returns ${F.writtenAtMax} and the rewritten one ${F.assumedAtMax}. Set the width to 8: the note says the value wraps to ${F.wrapped32To8}, and the strip draws ${F.space8} inputs. Press the MAX chip: the one red cell is ${F.max8}, and ${F.differing8} cell differs. Switch the type to unsigned: ${F.differing8Unsigned} cells differ.`,
    `Null check, in the scene "Null check after the load": with p = 0x1000 both versions return ${F.nullAgree}. Pick NULL: the table says "not defined" and three outcomes the standard allows are listed as examples.`,
    `Sorting, on the defaults (nothing sorted): put the first snippet, INT_MAX + 1, under "Undefined" and press Check. The score reads ${F.firstOnlyRight} of ${F.total}, because the other ${F.total - F.firstOnlyRight} are unsorted. Press "Why?" to read the clause.`,
    `Defences, on the defaults: "Nothing" returns ${F.noneResult} for INT_MAX, a silent miss. Pick -fwrapv: it returns ${F.wrapvResult}. Pick -fsanitize=undefined: the row shows a message of the form "${F.sanitizer}".`,
  ],
  keyIdeas: [
    `In this model signed overflow is undefined, so the rewrite assumes x + 1 > x and folds the check to return 0: of the ${F.space8} 8-bit inputs exactly ${F.differing8} differs (${F.max8}), and it is outside the contract.`,
    `Unsigned wrap-around is defined, so the rewrite is not applied: ${F.differing8Unsigned} of the ${F.space8} 8-bit inputs differ and the check keeps working.`,
    'Undefined behaviour means the standard promises nothing, so a null load may crash, may have its check removed, or may return garbage; a crash is one allowed outcome and a poor guide.',
    `A defence changes what the compiler may assume: -fwrapv defines the wrap (the call returns ${F.wrapvResult}), a sanitizer reports it, and checked arithmetic hands the overflow back as a value.`,
  ],
  quiz: [
    {
      q: 'The compiler turned `x + 1 < x` into `return 0` for a signed int. Which statement is true?',
      options: [
        'The standard allowed it, because signed overflow is undefined behaviour',
        'The hardware changed, because the processor stopped wrapping at the maximum',
        'The compiler has a bug, because the check is true at the maximum on real hardware',
        'The program is wrong only on machines that do not use two\'s complement integers',
      ],
      answer: 0,
      why: `Signed overflow is undefined, so a conforming program is assumed not to reach it and the comparison folds. At the 32-bit maximum ${n(F.max32)} the written function returns ${F.writtenAtMax} and the rewritten one ${F.assumedAtMax}, and that input is outside the contract.`,
    },
    {
      q: 'Which of these is not undefined behaviour in C?',
      options: [
        'Adding 1 to the largest unsigned int, which wraps to 0',
        'Adding 1 to the largest signed int, which overflows',
        'Shifting a 32-bit int left by 32 places in one step',
        'Reading through a pointer that holds null at the time',
      ],
      answer: 0,
      why: `Unsigned arithmetic wraps by definition, so the unsigned check keeps working: ${F.differing8Unsigned} of ${F.space8} 8-bit inputs differ. The three other snippets are on the board as undefined.`,
    },
    {
      q: 'A learner says "undefined behaviour means the program crashes". What is the accurate version?',
      options: [
        'The standard sets no requirements, so a crash is one allowed outcome among many',
        'The program crashes on real hardware, but only after the optimiser has run',
        'The behaviour is fixed per compiler, which must document what it does',
        'The result is an arbitrary value, but the program always keeps running',
      ],
      answer: 0,
      why: 'Nothing is required of the execution, so a crash, a removed check or a garbage value is allowed, and the null scene lists three of them. Behaviour that each compiler documents is implementation-defined, a different category.',
    },
    {
      q: 'Which defence lets the `x + 1 < x` check keep working at the maximum value?',
      options: [
        '-fwrapv, which defines signed wrap-around so the compiler cannot assume it away',
        '-O3, which optimises harder and so notices the overflow before folding the check',
        'A bigger int type, since the optimiser then no longer assumes anything',
        'Compiling in debug mode, since the standard turns the undefined case into a defined one',
      ],
      answer: 0,
      why: `With -fwrapv the wrap is defined, so the check stays and fires: the call returns ${F.wrapvResult}, where "Nothing" returned ${F.noneResult}. The other options leave the case undefined, so the assumption is still allowed.`,
    },
  ],
};

export default lesson;
