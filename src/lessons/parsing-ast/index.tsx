import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A parser turns a flat list of tokens into an abstract syntax tree (AST): a tree of operators and operands that captures what the code means, ready to be evaluated, checked or rewritten.',
    what: 'A recursive-descent parser has one function per grammar rule. Each function looks at the next token, consumes what belongs to it and calls the function for the tighter-binding part, so precedence falls out of which function calls which. Left-associative chains like 8 - 3 - 2 are built by a loop, because the grammar rule written as E → E + T would make the function call itself forever. The parse tree records every grammar step and bracket; the AST keeps only the meaning.',
    analogy: 'Diagramming a sentence: the parse tree is the full grammar-school diagram with every clause label, the AST is the gist, who did what to whom.',
    useCases: [
      'Compilers and interpreters build an AST, then check and run it',
      'ESLint, Prettier and codemods read, check and rewrite ASTs',
      'Databases parse SQL into a tree before planning the query',
      'Spreadsheets and calculators parse formulas the same way',
    ],
    why: 'Most tools that touch code (linters, formatters, bundlers, IDE refactors) work on ASTs, and writing a small parser for a config format or a query language is a classic task. Knowing how precedence and associativity are encoded explains bugs like 2 ^ 3 ^ 2 coming out as 64 instead of 512, and the left-recursion trap is a standard interview topic. It builds on `grammars-parsing` and `lexing-tokens`.',
    watch:
      'The running line of the parser source and the running frame on the call stack are yellow; waiting frames are dimmed. In the token strip the cursor is blue, consumed tokens are dim, and ⏹ marks the end of input. In the AST, operator nodes are violet circles and numbers blue; a node is filled green the moment it is built, and yellow while the post-order walk evaluates it, with its value in a badge underneath. A syntax error and the stack-cap overflow turn the line, the stack and the result red. In AST vs parse tree, the parse tree\'s call nodes are square-cornered and its tokens rounded; nodes the AST drops (calls and brackets) are dashed and grey.',
  },
  tryThis: [
    'Step through 1 + 2 * 3 and watch parseTerm build Binary(*) before parseExpr builds Binary(+).',
    'Load 8 - 3 - 2: the while loop builds the left minus first, so it evaluates to 3, not 7.',
    'Load 2 ^ 3 ^ 2: parseUnary handles the exponent, so the second ^ nests on the right and the answer is 512.',
    'Flip parseExpr to Naive left recursion and step: it calls itself until the 12-frame cap without moving the cursor.',
    'Open AST vs parse tree and compare node counts, then type (((7))) and see the brackets vanish from the AST.',
  ],
  keyIdeas: [
    'One function per grammar rule; precedence comes from which function calls which.',
    'Left-associative operators are parsed with a loop, because left recursion never consumes a token.',
    'The AST keeps operators and operands; the parse tree also keeps every grammar step and bracket.',
    'Evaluating an AST is a post-order walk: children first, then the node that combines them.',
  ],
  quiz: [
    {
      q: 'What is the difference between the parse tree and the AST for (1 + 2) * 3?',
      options: [
        'The AST drops the brackets and the grammar-rule chain',
        'They are the same tree, just drawn with different node shapes',
        'The AST keeps the brackets so it can remember the grouping',
        'The parse tree is the smaller one, since it only keeps tokens',
      ],
      answer: 0,
      why: 'The grouping is already in the AST\'s shape: + is a child of *, so the brackets add nothing and are dropped, along with every expr/term/factor step. The parse tree is the bigger one, keeping all of it.',
    },
    {
      q: 'Why is parseExpr written as a loop instead of following E → E + T directly?',
      options: [
        'It would call itself forever without reading a token',
        'Loops are faster than recursion in every programming language',
        'A loop is what makes * bind more tightly than + in this parser',
        'The direct version would group 8 - 3 - 2 the wrong way round',
      ],
      answer: 0,
      why: 'With E → E + T the function\'s first act is to call itself with the cursor unmoved, so it never makes progress: the Naive toggle shows it hitting the stack cap. Precedence comes from parseExpr calling parseTerm, not from the loop.',
    },
    {
      q: 'With this lesson\'s rules, what does 2 ^ 3 ^ 2 evaluate to?',
      options: ['512', '64', '12', '81'],
      answer: 0,
      why: '^ is right-associative here: the exponent is parsed by parseUnary, which can contain another ^, so it is 2 ^ (3 ^ 2) = 2 ^ 9 = 512. Grouping from the left would give (2 ^ 3) ^ 2 = 64.',
    },
    {
      q: 'In which order does a post-order walk evaluate the AST of 1 + 2 * 3?',
      options: ['1, 2, 3, then *, then +', '+, then *, then 1, 2, 3', '1, +, 2, *, 3 left to right', '*, then 1, 2, 3, then +'],
      answer: 0,
      why: 'Children before parents: a node can only combine values that already exist. The root (+) comes last because it needs 2 * 3 first. Reading left to right is the token order, not an evaluation order.',
    },
  ],
};

export default lesson;
