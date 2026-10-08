import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A null can hide in any value and crashes at the first dot after it; option types and sum types put "might be missing" and "one of these cases" into the type, so the compiler makes you handle them.',
    what: 'In most languages any reference can be null, and reading a property of it fails at run time. Optional chaining (?.) stops that crash but hands back undefined, so you still have to decide what missing means (?? supplies a default). Option (Maybe) types and TypeScript\'s strictNullChecks put the possibility into the type: a string | null has to be narrowed with a check before it is used as a string. Algebraic data types go further: a sum type (a Rust enum, a TypeScript union with a kind tag) says a value is exactly one of a few variants, each with its own data, and exhaustive matching makes the compiler reject code that forgets one. Result (Either) is the same idea for errors.',
    analogy: 'A form where "middle name" is either filled in or ticked "none", instead of a blank you might forget to check. A sum type is a form with exactly one of three boxes ticked: never two, never zero.',
    useCases: [
      'Crash reports full of "Cannot read properties of null" and NullPointerException',
      'Typing an API call in a frontend as Loading | Loaded | Failed',
      'Rust Option and Result, Kotlin nullable types, Swift optionals, Java Optional',
      'Adding a state to an enum and letting the compiler find every switch to update',
    ],
    why: 'Null dereferences are a very common cause of production crashes, and the fixes (optional chaining, strict null checks, Option, exhaustive switches) come up in every code review. Knowing why ?. alone is not a fix, and how a never-check catches a forgotten case, prevents real outages. Result is the error-handling version of the same idea (see `error-handling-models`); the lesson builds on `type-systems` and on Option<T> as a generic from `generics-polymorphism`.',
    watch:
      'In Null, the chain is a row of boxes: the link being read is yellow with a glow, present values blue, the null that crashed red, a null that was handled green, and links that never ran are dashed and faded; the result box turns green when handled and red when undefined leaked out. The crash prints red in the console, normal output green. In Narrowing, the type\'s members are pills: string blue, null and undefined red while still possible, struck through, dashed and grey once a guard rules them out; the x.length line is tinted orange when tsc rejects it, green when accepted, and red when the x! assertion hides a crash. In Sum types, each variant is a shaped slot (circle, square, triangle): solid green with its own arm, dashed orange when the compiler flags it as missing, dashed grey with no arm while the catch-all takes it. The catch-all is a box, blue while it catches values and grey when unreachable. The value being matched is a small yellow shape that drops in; its results print green, catch-all results blue, a compiler error orange and a warning grey, and the code line the compiler points at is tinted orange (covered arms green as they run). In the flags table, nonsense combinations are tinted red and real states are outlined in grey.',
  },
  tryThis: [
    'In Null, play the default (address is null, plain dots): the crash names the property it tried to read, city.',
    'Switch Code to ?. only: no crash, but it prints Ship to undefined. Then pick ?. with ??.',
    'In Narrowing, set x is to string | undefined and pick the guard x !== null: tsc still says no. Try x != null.',
    'In Sum types, play the default: rustc lists State::Failed(_) as not covered. Turn on the catch-all and play again.',
    'With the catch-all still on, turn the Failed arm back on: the catch-all becomes unreachable.',
  ],
  keyIdeas: [
    'The crash comes at the dot after the null, often far from where the null came from.',
    '?. stops the crash but yields undefined: the missing value still needs handling, with ?? or a check.',
    'With strictNullChecks, string | null must be narrowed by a guard before it is used as a string.',
    'Sum types with exhaustive matching turn a forgotten case into a compile error and make impossible states unwritable.',
  ],
  quiz: [
    {
      q: '`user?.address?.city` no longer crashes when address is null. What is still left to do?',
      options: [
        'Decide what a missing city means: ?. only yields undefined',
        'Nothing: optional chaining makes every null in the chain safe',
        'Wrap the line in try/catch, because ?. can still throw on null',
        'Turn on strictNullChecks, or the browser ignores the ?. operator',
      ],
      answer: 0,
      why: 'Optional chaining turns the crash into undefined, and undefined then flows on: the lesson prints "Ship to undefined". The tempting "nothing left" is the misconception: ?. silences the crash, but the missing value still needs a default (??) or a check. It never throws on null, and it works with or without strictNullChecks.',
    },
    {
      q: '`x` is `string | undefined`. Why does tsc still reject `x.length` inside `if (x !== null)`?',
      options: [
        'The guard rules out null, but x can still be undefined there',
        'tsc ignores if checks and only trusts the x! assertion',
        'A strict !== comparison never narrows a type in TypeScript',
        'A string | undefined can never be read inside a function body',
      ],
      answer: 0,
      why: 'Narrowing removes exactly what the guard rules out. !== null removes null, which this type never had, so undefined is still possible and tsc reports TS18048. x != null or if (x) would remove both. Strict comparisons do narrow, as x !== undefined shows.',
    },
    {
      q: 'A Rust `match` on State has arms for Loading and Loaded but not Failed. When is that reported?',
      options: [
        'At compile time: non-exhaustive patterns, Failed(_) not covered',
        'At run time, the first time a Failed value reaches the match',
        'Never: the missing arm silently returns a default value',
        'Only when the code is built in release mode with warnings',
      ],
      answer: 0,
      why: 'Rust requires every match to be exhaustive and refuses to compile it otherwise (error E0004), naming the missing patterns. The program never runs with the gap, so no user ever hits it. A catch-all _ arm would make it compile, and hide the next forgotten variant too.',
    },
    {
      q: 'Why model a request as `Loading | Loaded(data) | Failed(error)` instead of three flags?',
      options: [
        'Flags allow 8 combinations, 5 of them nonsense; the sum has 3',
        'Sum types use less memory than three booleans at run time',
        'Flags cannot be checked by a compiler in any language',
        'A sum type lets a value be loading and failed at once',
      ],
      answer: 0,
      why: 'Three booleans have 2³ = 8 combinations, and only 3 mean a real state; the other 5 (loading and failed at once, for example) can still be written by mistake. A sum type has exactly 3 values, so the nonsense ones cannot be built at all. Memory is not the point, and flags are perfectly type-checkable; they just allow too much.',
    },
    {
      q: 'What does the non-null assertion `x!` do when the code runs?',
      options: [
        'Nothing: it is erased, so a real null still crashes later',
        'It checks x and throws a clear error right there if it is null',
        'It replaces a null x with an empty string at that point',
        'It converts x to an Option that must be unwrapped first',
      ],
      answer: 0,
      why: 'x! only tells the type checker to stop worrying; it is erased from the emitted JavaScript. If x really is null, x!.length throws the usual TypeError. It is a promise you make, not a check the program performs.',
    },
  ],
};

export default lesson;
