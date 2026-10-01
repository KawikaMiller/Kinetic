import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A set is a collection of distinct things; a function maps every input to exactly one output. Together they are the vocabulary under types, tables, maps and hash functions.',
    what: 'Sets combine by union (in either), intersection (in both), difference (in the first but not the second) and symmetric difference (in exactly one). A function from A to B gives every member of A exactly one arrow into B. It is injective (one-to-one) when no two inputs share an output, surjective (onto) when every output is used, and bijective when it is both: then every output leads back to exactly one input, so the whole mapping can be undone.',
    analogy: 'A cloakroom: every coat gets exactly one ticket (a function). If two coats could share a ticket it wouldn\'t be one-to-one, and you couldn\'t hand the right coat back.',
    useCases: [
      'SQL: UNION, INTERSECT and EXCEPT are set operations; INNER JOIN matches the keys two tables share',
      'Types: a TypeScript union type A | B is the union of the values of A and B',
      'Hash tables and IDs: a hash maps many keys into fewer buckets, so collisions are guaranteed',
      'Reversible encodings: a mapping can be undone only if it is injective (one-to-one); a bijection also uses every output',
    ],
    why: 'Deduplicating lists, merging permission sets, reasoning about which rows a query returns, and understanding why hash collisions and ID clashes happen all use this vocabulary. It is also the language of every type system you will meet.',
    watch: 'Sets pane: each circle is a set (A blue, B violet, C orange) inside a dashed box of everyone. The operation you pick shades its region yellow, and the names inside it turn solid yellow; drag a name into another region to change which sets it belongs to. Functions pane: inputs are blue dots on the left and outputs violet dots on the right, joined by blue arrows. An input you have picked turns yellow. Arrows turn red when a rule is broken: an input with two arrows, or two inputs landing on one output. An input with no arrow gets a red dashed ring, and an output nothing maps to is dimmed.',
  },
  tryThis: [
    'In the Sets pane, switch the operation between A ∩ B, A − B and A △ B and watch the shaded region move.',
    'Drag "ken" from B into the overlap with A: it joins A ∩ B.',
    'Turn "Sets" to A, B, C and pick A ∩ B ∩ C: only names in all three circles light up.',
    'In the Functions pane, pick "string → hash bucket (8)": ten strings into eight buckets have to collide.',
    'On "user → id", click an input and then a second output: two arrows from one input break the function.',
  ],
  keyIdeas: [
    'Union = in either, intersection = in both, difference = in the first only, symmetric difference = in exactly one.',
    'A function gives every input exactly one output; two inputs sharing an output is still fine.',
    'Injective: no shared outputs. Surjective: every output used. Bijective: both, so every output leads back to exactly one input.',
    'Pigeonhole: with more inputs than outputs, some outputs must be shared, which is why hashes collide.',
  ],
  quiz: [
    {
      q: 'Two different people map to the same birthday. Is person → birthday still a function?',
      options: ['No: a function can\'t repeat an output', 'Yes: it just isn\'t one-to-one', 'Only if everyone has a different birthday', 'Only if every date is used'],
      answer: 1,
      why: 'A function only needs each input to have exactly one output. Sharing outputs makes it non-injective, not "not a function".',
    },
    {
      q: 'Which set operation matches SQL\'s EXCEPT?',
      options: ['A ∪ B', 'A ∩ B', 'A − B', 'A △ B'],
      answer: 2,
      why: 'A EXCEPT B returns the rows in A that are not in B: the difference A − B.',
    },
    {
      q: 'You hash 10 strings into 8 buckets. What must happen?',
      options: ['Nothing special', 'At least two strings share a bucket', 'Two buckets stay empty', 'The hash fails'],
      answer: 1,
      why: 'Pigeonhole principle: 10 items into 8 holes means some hole gets two. No mapping from 10 to 8 things can be one-to-one.',
    },
    {
      q: 'Which mapping has an inverse defined on every output?',
      options: ['Any function', 'A surjective one only', 'A bijection', 'One with more outputs than inputs'],
      answer: 2,
      why: 'Injective is enough to undo the outputs actually used: each leads back to one input. A bijection is also surjective, so every output is used and the inverse is defined everywhere.',
    },
  ],
};

export default lesson;
