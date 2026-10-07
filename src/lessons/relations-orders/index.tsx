import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A relation says which pairs of things are related; four properties decide whether it groups things into classes (an equivalence) or ranks them (a partial order), and a partial order often cannot put everything in one line.',
    what: "A relation on a set is just a set of pairs (a, b), drawn as a 0/1 matrix or as arrows. Reflexive: everything relates to itself. Symmetric: a R b forces b R a. Antisymmetric: a R b and b R a only when a = b. Transitive: a R b and b R c force a R c. Reflexive + symmetric + transitive is an equivalence relation, which splits the set into classes. Reflexive + antisymmetric + transitive is a partial order, drawn as a Hasse diagram, where some pairs may be incomparable.",
    analogy: 'Family trees and folders: "is an ancestor of" ranks people, but you and your cousin are incomparable, neither is the other\'s ancestor. "Has the same birthday as" sorts people into 366 groups instead.',
    useCases: [
      'Dependency and scheduling: tasks ordered by "must come before", run in any linear extension',
      'Grouping records that are "the same" by some key (equivalence classes)',
      'Version and permission lattices, like subsets of {read, write, execute} ordered by ⊆',
      'Spotting a broken assumption: "close to" feels like it chains, but it isn\'t transitive',
    ],
    why: "Relations are the vocabulary behind sorting, deduplication, type hierarchies, dependency graphs and database keys. Knowing that a partial order need not be a line explains why build orders and version histories have many valid orderings, and knowing the properties lets you check a comparator or a grouping rule before it bites you.",
    watch: "Each 1 in the matrix is a pair in the relation, washed blue, and the same pairs are the blue arrows in the graph (an arrow from a node to itself is a reflexive pair). Pairs a closure just added flash yellow. The four property chips are green with ✓ when the property holds and red with ✗ when it fails; the chosen property's counterexample is red: solid cells and arrows for pairs that are there, outlined cells marked ? and dashed red arrows for pairs that are missing, and its elements are washed red. In Equivalence classes view each class gets its own colour (amber, pink, sky, orange, violet, blue). In Partial order view the Hasse diagram puts bigger elements on top, and the chosen incomparable pair is violet.",
  },
  tryThis: [
    'Load Divides (divisors of 12), switch to Partial order: 4 and 6 are incomparable, so there is no single line.',
    'Load Within 1 of: the Transitive chip is red. Press the Transitive closure button and watch the waves fill it in.',
    'Load Same remainder mod 3 and switch to Equivalence classes: three coloured groups.',
    'Pick Your own, set every diagonal cell only, and check the chips: symmetric and antisymmetric both hold.',
    'In Partial order view press Show a linear extension: one line that respects every pair.',
  ],
  keyIdeas: [
    'Equivalence relation = reflexive + symmetric + transitive; it partitions the set into classes.',
    'Partial order = reflexive + antisymmetric + transitive; incomparable pairs mean no single line.',
    'Symmetric and antisymmetric are not opposites: equality is both, and many relations are neither.',
    'A closure adds the fewest pairs needed to make a property hold; transitive closure is Warshall\'s algorithm.',
  ],
  quiz: [
    {
      q: 'With the divisors of 12 ordered by "divides", how do 4 and 6 compare?',
      options: [
        'Neither divides the other, so they are incomparable',
        '6 is bigger, because 6 is the larger of the two numbers',
        '4 comes first, because it appears earlier in the list',
        'They are equal, because both of them divide twelve',
      ],
      answer: 0,
      why: "The order here is divisibility, not size: 4 doesn't divide 6 and 6 doesn't divide 4. So the pair is incomparable, which is exactly why a partial order can't always be drawn as one line. Numeric size would be a different relation.",
    },
    {
      q: 'Can a relation be both symmetric and antisymmetric?',
      options: [
        'Yes: if no two different elements are related, it is both',
        'No: the two properties are exact opposites of each other',
        'Only when the relation also happens to be transitive',
        'Only on a set that has an even number of elements',
      ],
      answer: 0,
      why: 'Antisymmetric only forbids a R b and b R a for different a and b. If different elements are never related, like equality, both conditions hold. The names sound like opposites, but a relation can be both, either, or neither.',
    },
    {
      q: 'Which three properties make an equivalence relation?',
      options: [
        'Reflexive, symmetric and transitive',
        'Reflexive, antisymmetric and transitive',
        'Symmetric, antisymmetric and transitive',
        'Reflexive, symmetric and antisymmetric',
      ],
      answer: 0,
      why: 'Equivalence is about being "the same" in some respect, so it must go both ways (symmetric). Reflexive, antisymmetric and transitive is the recipe for a partial order instead.',
    },
    {
      q: 'What is the transitive closure of a relation?',
      options: [
        'The smallest transitive relation that contains every original pair',
        'The relation with every pair that does not break transitivity',
        'The relation left after removing pairs that break transitivity',
        'The largest relation on the set, the one with every possible pair in it',
      ],
      answer: 0,
      why: 'A closure only ever adds pairs, and only the ones it is forced to: whenever a R b and b R c, it adds a R c, until nothing more is forced. Removing pairs is not a closure, and the full relation is transitive but usually far bigger than needed.',
    },
  ],
};

export default lesson;
