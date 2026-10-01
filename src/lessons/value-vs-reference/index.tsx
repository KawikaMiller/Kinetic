import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Assigning a number copies the number. Assigning an object copies an arrow to the same object, so two names can end up changing one thing.',
    what: "Primitives (numbers, strings, booleans) are copied: each variable gets its own value. Objects and arrays live on the heap, and a variable only holds a reference to one. Copying the variable, or passing it to a function, copies the reference, so both names point at the same object and a change through either one is seen by both. JavaScript passes that reference by value (pass-by-sharing): a function can mutate your object, but reassigning its parameter doesn't touch your variable.",
    analogy: 'A primitive is a sticky note with the number written on it: copy it and you have two notes. An object is a house, and a variable holds its address. Giving someone the address gives them the same house; repainting it changes it for everyone.',
    useCases: [
      'The bug where changing a "copy" of an object also changes the original',
      'State updates in React and Redux, which need new objects rather than mutated ones',
      'Knowing when a function can change the arguments you pass it',
      'Choosing a shallow copy ({ ...obj }) or a deep copy (structuredClone)',
    ],
    why: 'Aliasing bugs are some of the most common and confusing bugs juniors hit: a value "changes by itself" because another name points at the same object. Once you can picture the arrows, you can predict them, and it explains why frameworks insist on immutable updates.',
    watch: "The highlighted code line is the one running. On the right, each name is a tag with a box: a blue box holds a value, and a violet box holds a reference, drawn as a violet arrow to a blue object on the heap. When a line changes an object, the object is ringed and every name that can reach it flashes green. Names from a function that has returned are dimmed. A faded, dashed box tagged \"garbage\" is an object nothing refers to any more. The console prints output in green and errors in red, and a name that caused an error turns red.",
  },
  tryThis: [
    'Play "Copy a number", then "Share an object": same code, opposite outcome.',
    'In "Pass to a function", watch mutate change a, and reassign leave it alone.',
    'In "Shallow vs deep copy", see which names flash green when s.tags.push runs.',
    'Run "const ≠ frozen" to the end: the mutation works, the reassignment throws.',
  ],
  keyIdeas: [
    'Primitives are copied; object variables hold a reference to one shared object.',
    'Passing an object to a function copies the reference: mutations show, reassignments don\'t.',
    '{ ...obj } copies one level; nested objects are still shared. structuredClone copies deeply.',
    'const stops rebinding a name, not changing the object it points to.',
  ],
  quiz: [
    {
      q: 'const cfg = { debug: false }; cfg.debug = true; What happens?',
      options: [
        'TypeError: cfg is const',
        'cfg.debug becomes true',
        'Nothing: the change is ignored',
        'cfg is copied, then changed',
      ],
      answer: 1,
      why: 'const only stops cfg being pointed at a different object. The object itself can still be changed; use Object.freeze to prevent that.',
    },
    {
      q: 'function f(p) { p.n = 2; p = { n: 3 }; } const a = { n: 1 }; f(a); What is a.n?',
      options: ["It's 1", "It's 2", "It's 3", 'It throws'],
      answer: 1,
      why: "p starts as a copy of the reference, so p.n = 2 changes a's object. Reassigning p afterwards only re-points p; a still refers to the object with n = 2, so it isn't 3.",
    },
    {
      q: 'const a = { tags: [] }; const b = { ...a }; b.tags.push("x"); What is a.tags.length?',
      options: [
        '0: b got its own copy of tags',
        '1: both share the same tags array',
        'It throws, because a is const',
        'It depends on the JS engine',
      ],
      answer: 1,
      why: 'Spread makes a new outer object, but its tags field still holds a reference to the same array, so both a and b see the push. The copy is shallow.',
    },
    {
      q: 'Why is { n: 1 } === { n: 1 } false?',
      options: [
        '=== checks identity, and these are two objects',
        '=== compares the keys but not their values',
        'Number values are never compared exactly',
        "It isn't: the expression is actually true",
      ],
      answer: 0,
      why: 'For objects, === asks "are these the same object?", not "do they look the same?". Compare contents yourself, or with a deep-equality helper.',
    },
  ],
};

export default lesson;
