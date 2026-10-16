import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A parser decides from a table: a top-down (LL) parser predicts the rule from the next token and needs left recursion removed, while a bottom-up (LR) parser shifts tokens and reduces them, and both show an ambiguity as a table cell with two entries.',
    what: `Take a grammar, compute FIRST and FOLLOW, and the predictive table tells a top-down parser which rule to expand for each next token; two rules in one cell is a conflict, and a left-recursive rule makes a recursive-descent parser call itself without reading anything (the lesson stops it at ${F.budget} nested expansions). A bottom-up parser builds the LR(0) automaton instead, then the ACTION and GOTO tables from FOLLOW: it pushes tokens, and reduces the top of its stack to a nonterminal when a rule is complete. The side-by-side scene runs both on the same tokens, and the precedence game turns the conflicts of an ambiguous grammar into your own choices. SLR(1) and LL(1) here are the textbook versions; real generators use stronger lookahead.`,
    analogy: 'Top-down is reading a recipe from the title and splitting it into steps as you go; bottom-up is collecting ingredients and combining them into the dish once you recognise the combination.',
    useCases: [
      'Understanding why hand-written parsers use recursive descent and rewrite left-recursive rules into loops',
      'Reading a parser generator\'s "shift/reduce conflict" warning and knowing what it is asking',
      'Seeing why operator precedence needs either layered rules or explicit declarations',
      'Choosing a grammar shape that a given tool can accept',
    ],
    why: 'Every language tool starts with a parser, and the errors you meet (a conflict warning, a parser that overflows its stack on a left-recursive rule, an expression that groups the wrong way) are table facts you can read once you know how the tables are built.',
    watch: 'In the tables, a cell with two rules or two actions is red (--bad) until you choose, then green (--ok); ACTION cells are blue (--info) and GOTO cells violet (--violet). The top-down tree is blue and the bottom-up trees violet, two methods and not a verdict. The symbol being expanded or shifted is yellow (--hi), a matched token or a reduced node green (--ok), and the recursion budget running out is orange (--orange). In the input strip, tokens already read are green and the next token is yellow.',
  },
  tryThis: [
    `Top-down tables, on the defaults (the layered grammar): the table has ${F.layeredConflictCells} conflict cells, ${F.layeredLeftRecursive.join(' and ')} are left-recursive, and the recursive-descent run stops after ${F.layeredExpansions} expansions in a row (the budget is ${F.budget}). Press "Remove left recursion": the conflict cells drop to ${F.rewrittenConflictCells} and the rules become the LL-friendly form.`,
    `Bottom-up tables, on the defaults (the layered grammar): the automaton has ${F.layeredStates} states and ${F.layeredLrConflicts} conflicts. Pick the Ambiguous preset: ${F.ambiguousLrConflicts} ACTION cells show a shift and a reduce, each red until you click it to choose.`,
    `Side by side, on the defaults (the LL-friendly grammar on ${F.lockTokens}): top-down accepts in ${F.lockTdSteps} steps and bottom-up in ${F.lockBuSteps}. Pick the Layered preset: top-down stops at its recursion budget while bottom-up accepts.`,
    `Precedence game, on the defaults (reduce everywhere): the tree evaluates to ${F.openingValue}. Set "After E + E, next token *" to Shift: the value becomes ${F.oneClickValue}, which is what the usual precedence gives.`,
  ],
  keyIdeas: [
    `A top-down parser predicts from one token and cannot handle left recursion: in this model the layered grammar has ${F.layeredConflictCells} conflicting cells and stops at the ${F.budget}-expansion budget, and rewriting it leaves ${F.rewrittenConflictCells}.`,
    `A bottom-up parser takes the left-recursive layered grammar as it is: the automaton has ${F.layeredStates} states and the SLR(1) table has ${F.layeredLrConflicts} conflicts, so the two methods accept different sets of grammars.`,
    'Top-down grows the tree from the root and prints a leftmost derivation; bottom-up joins nodes from the leaves and prints the reverse of a rightmost derivation, so the two derivations of one tree use the same rules, applied in different orders.',
    `Ambiguity appears as conflict cells: the ambiguous grammar has ${F.ambiguousLrConflicts}, and on 2 + 3 * 4 shifting after E + E gives ${F.oneClickValue} where reducing gives ${F.openingValue}.`,
  ],
  quiz: [
    {
      q: 'Which of the two parsers needs left recursion removed from `E -> E + T | T` before it works?',
      options: [
        'The top-down parser, which would expand E again without reading a token',
        'The bottom-up parser, which cannot shift a token while an E is on its stack',
        'Both parsers, because a left-recursive rule is ambiguous whatever the method',
        'Neither parser, because both read the table and the table is not affected',
      ],
      answer: 0,
      why: `A top-down parser with the layered grammar stops after ${F.layeredExpansions} expansions in a row without reading a token (the budget is ${F.budget}), while the bottom-up parser accepts it with ${F.layeredStates} states and ${F.layeredLrConflicts} conflicts.`,
    },
    {
      q: 'In a shift/reduce conflict after `E + E` with `*` next, which choice gives `2 + (3 * 4)`?',
      options: [
        'Shift, so the multiplication is built first and then joined to the 2',
        'Reduce, so the addition is built first and then multiplied by the 4',
        'Either one, because the tree comes out the same whichever choice the table makes here',
        'Neither one, because the grammar cannot build that tree at all',
      ],
      answer: 0,
      why: `Shifting keeps reading, so 3 * 4 is reduced first and the value is ${F.oneClickValue}; reducing builds 2 + 3 first and the value is ${F.openingValue}, with the ids numbered 2, 3, 4.`,
    },
    {
      q: 'A learner says bottom-up parsers build the tree from the root. What is the accurate version?',
      options: [
        'They build it from the leaves, joining nodes when a rule is complete on the stack',
        'They build it from the root, but they read the tokens from the right end first',
        'They build it from the leaves, but only after the whole input has been read',
        'They build no tree at all, because they only decide whether to accept the input',
      ],
      answer: 0,
      why: 'Each reduce joins the nodes on top of the stack under a new parent, so the trees grow upward and the derivation printed is the reverse of a rightmost one. A parser that expands from the start symbol is the top-down method.',
    },
    {
      q: 'The layered grammar is SLR(1) here but not LL(1). What does that show?',
      options: [
        'The methods do not accept the same grammars: this one suits bottom-up but not top-down',
        'The two methods accept the same grammars, so one table would do for both',
        'LL parsers are weaker only because their table builder has a bug in how it uses FOLLOW sets',
        'SLR is always the better method, because it handles every grammar there is',
      ],
      answer: 0,
      why: `The layered grammar has ${F.layeredConflictCells} LL(1) conflict cells and ${F.layeredLrConflicts} SLR(1) conflicts, so it suits the bottom-up method as written; the top-down method needs it rewritten first.`,
    },
  ],
};

export default lesson;
