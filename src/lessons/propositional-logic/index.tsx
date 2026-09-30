import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Propositional logic is the maths of true/false statements joined by AND, OR, NOT, IF-THEN and IF-AND-ONLY-IF. A truth table checks a claim in every possible case at once.',
    what: 'A proposition is a statement that is either true or false, like "it is raining" (p). Connectives build bigger ones: ¬p (not), p ∧ q (and), p ∨ q (or), p → q (if p then q) and p ↔ q (p exactly when q). Two formulas are equivalent when they agree on every row of the truth table; one disagreeing row is enough to prove they are different.',
    analogy: 'p → q is a promise: "if it rains, I\'ll bring an umbrella". You only break it by not bringing one when it rains. On a dry day you have kept the promise whatever you carry.',
    useCases: [
      'Refactoring if conditions safely: is !(a && b) the same as !a || !b?',
      'Guard clauses and short-circuiting: user && user.name only reads name when user exists',
      'Reading requirements precisely: "if premium then free shipping" says nothing about non-premium users',
      'Test cases: each row of the truth table is a case your condition has to handle',
    ],
    why: 'Most bugs in if statements are logic mistakes: a flipped condition, a confused converse, a && that should be ||. Checking the truth table, or just the rows that matter, catches them before production does.',
    watch: 'The truth table has one row per combination of p, q and r: green T is true and faint F is false. The row outlined in yellow is the one being evaluated; click any row to choose it. Rows where F1 and F2 give different answers turn red. The JavaScript pane writes each formula as a JS condition (→ becomes !p || q, ↔ becomes ===) and shows how JavaScript evaluates it on the chosen row: faint, struck-through parts are never run because && and || stop early.',
  },
  tryThis: [
    'Pick "p → q vs its converse" and click the two red rows: that\'s where "if p then q" and "if q then p" disagree.',
    'Pick "p → q vs its contrapositive": no red rows. The contrapositive always means the same thing.',
    'Pick "Short-circuit: user && user.name" and click a row where user is F: user.name is struck through because it never runs.',
    'Type ¬p ∧ ¬q into F2 on the "Refactor" preset and watch red rows appear: negating each part isn\'t enough.',
    'Build p ∨ ¬p with the keypad: it\'s true on every row, a tautology.',
  ],
  keyIdeas: [
    'Two formulas are equivalent only if they agree on every row; one counterexample row proves they differ.',
    'p → q is false only when p is true and q is false. When p is false it\'s true automatically (vacuous truth).',
    'The converse q → p is a different claim; the contrapositive ¬q → ¬p is the same claim.',
    'JavaScript\'s && and || stop as soon as the answer is known, so the right side may never run.',
  ],
  quiz: [
    {
      q: 'p → q is true. Does that mean q → p is true?',
      options: ['Yes, always', 'No: the converse is a different claim', 'Only when p is true', 'Only in JavaScript'],
      answer: 1,
      why: 'Rain → wet streets doesn\'t mean wet streets → rain (a sprinkler wets them too). The table shows rows where one holds and the other doesn\'t.',
    },
    {
      q: 'Which formula always means the same as p → q?',
      options: ['q → p', '¬p → ¬q', '¬q → ¬p', 'p ∧ q'],
      answer: 2,
      why: 'The contrapositive ¬q → ¬p agrees with p → q on every row. The other two options are the converse and the inverse, which don\'t.',
    },
    {
      q: 'When p is false, what is p → q?',
      options: ['Always true', 'Always false', 'The same as q', 'Undefined'],
      answer: 0,
      why: 'An if-then only promises something when its premise holds. With a false premise the promise can\'t be broken, so it\'s true: vacuous truth.',
    },
    {
      q: 'In `user && user.name`, when is user.name never evaluated?',
      options: ['When user is falsy', 'When user.name is empty', 'Never: both sides always run', 'When user is truthy'],
      answer: 0,
      why: '&& stops at the first falsy value, so a missing user short-circuits the expression before user.name can throw.',
    },
  ],
};

export default lesson;
