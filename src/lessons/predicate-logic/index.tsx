import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: '"For all" (∀) and "there exists" (∃) turn a predicate like likes(x, y) into a claim that is true or false, and the order you write them in changes what the claim says.',
    what: 'A predicate is a statement with holes, like likes(x, y). A quantifier fills a hole for a whole domain: ∀x means "for every x", ∃x means "for at least one x". ∀x ∃y likes(x, y) says everyone likes some dish, possibly a different one each; ∃y ∀x likes(x, y) says there is one dish that everyone likes. A ∀ is refuted by a single counterexample and an ∃ is proved by a single witness. Builds on `propositional-logic` (connectives and negation) and `sets-functions` (domains and relations).',
    analogy: '"Every lock has a key" versus "there is one key for every lock". The first is a building full of ordinary locks; the second is a master key.',
    useCases: [
      'SQL queries (one step past `sql-basics`): "customers who bought every product" is a NOT EXISTS inside a NOT EXISTS',
      'Specs and tests: "for every input there is a valid output" versus "one output works for every input"',
      'Types: a proof of ∀x ∃y is a function that returns, for each x, a y together with evidence that it works',
      'Access rules: "every request has some role that allows it" versus "one role allows every request"',
    ],
    why: 'Requirements, database queries, API contracts and property-based tests are all quantified statements, and swapping ∀ and ∃ or misplacing a NOT silently changes them. Reading the order correctly, knowing that one counterexample sinks a ∀, and pushing negations through by rule are how you write the query or the check that actually means what the ticket says.',
    watch: 'The grid has people as rows and dishes as columns. A blue tinted cell with ♥ means that person likes that dish; an empty cell with a grey outline means they don\'t. While the walk plays, the row or column being examined gets yellow rings. A witness turns solid green with ✓; a counterexample is outlined red with ✗ (the cells of a person who likes nothing, or the person who breaks a dish). In the formula panels, "true" is green and "false" is red, the examined formula\'s line has a yellow tint and left bar, and the ¬ you can push is a yellow button. The type reading is violet, and the witness under it is green when it exists and red when it doesn\'t.',
  },
  tryThis: [
    'Load Something each, no common dish, then pick ∃y ∀x under Examine and press play: every dish is knocked out by someone, while ∀x ∃y stays true.',
    "In that preset, click Ben's sushi cell to clear it: ∀x ∃y turns false and Ben's row is the counterexample.",
    'Load Nobody here (empty domain): both ∀x formulas are true with nobody to check, ∃x ∃y is false, and ∃y ∀x is true because pizza is liked by all zero people.',
    'Under Push the negation inward, click the yellow ¬ twice: ¬∀x ∃y becomes ∃x ∀y ¬likes(x, y), and the true/false next to each line never changes.',
    'Pick ∀x ∃y and read the SQL panel: the outer NOT EXISTS says "no person", the inner one "who likes no dish". Together that is ¬∃x ¬∃y, which is ∀x ∃y.',
  ],
  keyIdeas: [
    '∀x ∃y lets the witness y depend on x; ∃y ∀x needs one y for every x. The second always implies the first; the reverse can fail.',
    'One counterexample refutes a ∀; one witness proves an ∃.',
    '¬∀x P ≡ ∃x ¬P and ¬∃x P ≡ ∀x ¬P: a negation flips each quantifier it moves past.',
    'Over an empty domain, ∀ is vacuously true and ∃ is false.',
  ],
  quiz: [
    {
      q: 'On the "Something each, no common dish" grid, ∀x ∃y likes(x, y) is true. What is ∃y ∀x likes(x, y) there?',
      options: [
        'False: each person likes a dish, but no single dish suits all',
        'True: swapping the quantifiers never changes the meaning',
        'True: both formulas use the same predicate and variables',
        'False: ∃y ∀x is false on every grid that has three people in it',
      ],
      answer: 0,
      why: '∀x ∃y lets each person bring their own witness dish; ∃y ∀x demands one dish chosen before anyone is asked. Here every dish has someone who dislikes it, so ∃y ∀x is false. Swapping the order changed the claim. The last option is wrong too: on "Pizza for all" three people share pizza and ∃y ∀x is true.',
    },
    {
      q: 'With no people at all, what is ∀x ∃y likes(x, y)?',
      options: [
        'True: there is no person who fails to like a dish',
        'False: nobody likes anything, so the claim must fail',
        'Undefined: a formula needs at least one person to check',
        'False: ∀ over an empty domain is always false',
      ],
      answer: 0,
      why: 'A ∀ is false only if a counterexample exists, and with no people there is none, so it is vacuously true. "Nobody likes anything" sounds like a failure, but it would need a person who likes nothing; an empty domain has no such person. It is ∃ that is false over an empty domain.',
    },
    {
      q: 'What is ¬∀x ∃y likes(x, y) with the negation pushed all the way in?',
      options: ['∃x ∀y ¬likes(x, y)', '∀x ∃y ¬likes(x, y)', '∃x ∃y ¬likes(x, y)', '∀x ∀y ¬likes(x, y)'],
      answer: 0,
      why: 'Each quantifier the ¬ moves past flips: ¬∀x becomes ∃x ¬, then ¬∃y becomes ∀y ¬. So "not everyone likes something" means "someone likes nothing". Keeping ∀x and only negating the atom (the second option) says everyone dislikes some dish, a different claim.',
    },
    {
      q: 'How does SQL usually express "every customer has placed an order"?',
      options: [
        'NOT EXISTS a customer for whom NOT EXISTS an order',
        'EXISTS a customer for whom NOT EXISTS an order',
        'EXISTS a customer for whom EXISTS an order',
        'A FORALL keyword wrapped around the orders subquery',
      ],
      answer: 0,
      why: 'SQL has no "for all" quantifier, so ∀x ∃y is written as ¬∃x ¬∃y: there is no customer without an order. The second option drops the outer NOT and asks the opposite question, whether some customer has no order.',
    },
  ],
};

export default lesson;
