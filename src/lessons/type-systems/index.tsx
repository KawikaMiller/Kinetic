import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A type system decides which operations make sense on which values; static languages check that before the program runs, dynamic ones while it runs, and type inference lets a static checker work out the types you didn\'t write.',
    what: 'Two separate questions are often mixed up. When are types checked: static (before running, by a compiler or checker) or dynamic (while running, as each operation happens)? And how willingly are values converted: loose languages turn "5" into 5 to make an operation work, strict ones refuse. Inference is how a static checker fills in missing types: give each unknown a type variable, collect the equations the code implies, and solve them by unification. What is left over is a generic type that works for any type you plug in.',
    analogy: 'A spell checker that underlines mistakes as you type (static) versus a reader who only stumbles when they reach the bad sentence (dynamic). Whether a typo is silently autocorrected is a separate setting (loose or strict).',
    useCases: [
      'TypeScript, Java, Rust and Go catch whole classes of bugs before a deploy',
      'Editors use inferred types for autocomplete, hover info and safe renames',
      'Python type hints with mypy add a static check to a dynamic language',
      'OCaml, Haskell and F# infer almost every type with Hindley-Milner',
    ],
    why: 'Choosing a language, adding TypeScript to a JavaScript codebase, or reading a "property does not exist on type" error all need these ideas. Knowing that static and strong are different axes avoids a classic interview mix-up, and seeing inference as equation solving explains the error messages it produces. The AST being typed here is the kind built in `parsing-ast`.',
    watch:
      'In Two axes, the grid places languages by when they check (rows) and whether they convert silently (columns); the cell with the example\'s language fills yellow. In When it fails, a red line is the error or crash; the coverage dots in the JavaScript gutter are green for lines the tests ran and dim grey for the line they never reached. In Inference, each AST node carries a type badge: violet while it still contains type variables (α, β…), blue once it is concrete, green for the final result at the root. The node and the constraint being solved are yellow, and a type error turns its node and the conflicting constraints red.',
  },
  tryThis: [
    'In Two axes, click each example: JavaScript and Python are both dynamic, yet only one converts "5" silently.',
    'Play When it fails: TypeScript flags line 4 before anything runs, while JavaScript passes its tests and crashes later.',
    'In Inference, step through twice and watch α turn into β → γ, until the root reads (a → a) → a → a.',
    'Load f f and watch the occurs check refuse a type that would contain itself.',
    'Type fn pick b x y = if b then x else y in Your own and predict the type before stepping.',
  ],
  keyIdeas: [
    'Static versus dynamic is about when types are checked; strict versus loose is about silent conversions.',
    'Type inference still checks statically: the types are worked out, not skipped.',
    'Inference collects equations between types and solves them by unification.',
    'Type variables left in the answer make the function generic: it works for any type.',
  ],
  quiz: [
    {
      q: 'JavaScript and Python are both dynamically typed. Why does only JavaScript turn "5" * 2 into 10?',
      options: [
        'JavaScript converts silently (loose); Python refuses (strict)',
        'Python checks its types before running, and JavaScript does not',
        'JavaScript is a statically typed language under the hood',
        'Python has no type system at all, so it cannot convert',
      ],
      answer: 0,
      why: 'Both check types while running. The difference is the other axis: how willingly values are converted. Python does have types; it checks them at run time and raises a TypeError instead of converting.',
    },
    {
      q: 'OCaml infers the type of a function without any annotations. Is OCaml dynamically typed?',
      options: [
        'No: inference happens before running, so it is still static',
        'Yes: without annotations the types are only known at run time',
        'Partly: inferred parts are dynamic, annotated parts are static',
        'Yes: inference is just a kind of dynamic type checking',
      ],
      answer: 0,
      why: 'Inference works out the types at compile time, from the code alone, and any mismatch is an error before the program runs. Leaving annotations out changes who writes the types, not when they are checked.',
    },
    {
      q: 'What type does inference give `fn twice f x = f (f x)`?',
      options: ['(a → a) → a → a', 'a → a → a', '(a → b) → a → b', 'int → int → int'],
      answer: 0,
      why: 'f is applied to x and then to its own result, so its result type must equal its argument type: f is a → a, and x and the answer are a. (a → b) → a → b would only fit f applied once.',
    },
    {
      q: 'Why does `fn self f = f f` fail to type-check?',
      options: [
        'f\'s type would have to contain itself: α = α → β',
        'Functions are never allowed to take other functions as input',
        'The function named self is not in scope inside its own body',
        'f has no type annotation, so the checker gives up on it',
      ],
      answer: 0,
      why: 'Applying f to itself needs α = α → β, and no finite type satisfies that, which is what the occurs check catches. Functions as arguments are fine, as twice shows, and missing annotations are what inference is for.',
    },
  ],
};

export default lesson;
