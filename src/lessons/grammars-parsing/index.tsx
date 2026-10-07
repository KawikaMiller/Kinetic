import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A context-free grammar is a small set of rewrite rules that says which token sequences are valid, and a parse tree records how a sequence was built from them: the structure every parser is after.',
    what: 'Each production says a non-terminal (like E for "expression") can be replaced by a sequence of terminals (tokens) and non-terminals. A derivation starts from the start symbol and keeps rewriting until only tokens are left; the rewrites form a parse tree. Unlike a finite automaton, a grammar can nest without limit, which is why it handles brackets and expressions. A grammar is ambiguous when one input has two different trees, and the cure is to shape the grammar so precedence is built in.',
    analogy: 'A recipe that refers to other recipes: a "sauce" is a "base" plus "seasoning", a "base" is "stock" or "roux". Following the references until only ingredients are left is a derivation.',
    useCases: [
      'Language specifications: JavaScript, Python and SQL are defined by grammars',
      'Parser generators (ANTLR, Bison, tree-sitter) take a grammar and produce a parser',
      'Data formats like JSON, and config and query languages, are specified as grammars',
      'Editors use tree-sitter grammars for syntax highlighting and code folding',
    ],
    why: 'Reading a language spec, writing a small DSL, or debugging why `1 + 2 * 3` came out as 9 all come down to grammars. It also settles the classic interview question of why regular expressions can\'t validate nested structures like HTML or balanced brackets (the `dfa-nfa` machines have no memory to count with).',
    watch:
      'In the parse tree, non-terminals are violet boxes and terminals (the tokens) are blue rounded leaves; ε (empty) is a dashed grey leaf. The non-terminal to expand next is filled yellow, both in the tree and in the sentential form row below it, and the grammar line just applied is tinted yellow. In Ambiguity, each tree is evaluated bottom-up with a value badge under each node; the tree that follows "* before +" has a green border and result, a competing tree an orange one. In Why not regex, the DFA\'s current state and the bracket just read are yellow, read brackets are dim, the blue marker points at the next one, and a wrong verdict (and the state that ran out of room) is red. Double rings mark accepting states.',
  },
  tryThis: [
    'With the Ambiguous grammar and 1 + 2 * 3, open Ambiguity: two trees, worth 7 and 9.',
    'Switch to the Layered grammar on the same input: only one tree is left, and it is worth 7.',
    'In Derive, build the tree yourself by picking productions; pick E → T first with the Layered grammar and see why it is refused.',
    'Try 1 + 2 + 3 + 4 with the Ambiguous grammar: 5 trees, even though they all give the same value.',
    'In Why not regex, set k to 3 and drag n up: at n = 3 the DFA runs out of states and rejects a balanced string.',
  ],
  keyIdeas: [
    'A grammar rewrites non-terminals into tokens; a parse tree records which rules built the input.',
    'Grammars can nest without limit, which finite automata (and so plain regexes) cannot.',
    'A grammar is ambiguous when one input has more than one parse tree.',
    'Precedence comes from the grammar\'s shape: layering E, T and F makes * bind tighter than +.',
  ],
  quiz: [
    {
      q: 'With `E -> E + E | E * E | num`, how many parse trees does `1 + 2 * 3` have?',
      options: ['2', '1', '3', '4'],
      answer: 0,
      why: 'Either the + or the * can be the top of the tree, giving (1 + 2) * 3 = 9 and 1 + (2 * 3) = 7. Not every grammar gives each string exactly one tree: this one is ambiguous, which is why real grammars are layered.',
    },
    {
      q: 'In the layered grammar, what makes * bind tighter than +?',
      options: [
        '* lives in T, one level below E, so it ends up deeper in the tree',
        'The parser is told separately that * has a higher priority',
        'The * rule is written above the + rule in the list of rules',
        'Multiplication is always worked out before addition by maths',
      ],
      answer: 0,
      why: 'E → E + T means a + can only combine whole Ts, and a T is where * lives, so every * sits below every + in the tree. No outside priority table is involved, and the order the lines are written in does not matter to a grammar.',
    },
    {
      q: 'Why can\'t a regular expression (a finite automaton) check that brackets are balanced at every depth?',
      options: [
        'It has finitely many states, so it cannot count unbounded depth',
        'Brackets are special characters that regexes cannot match',
        'It reads left to right, so it cannot look back at the openers',
        'It could, but the regex would be too slow to use in practice',
      ],
      answer: 0,
      why: 'Remembering depth n needs a different state for every n, and a finite automaton only has a fixed number. Brackets can be matched by escaping them; the problem is counting, not syntax. Grammars nest because a rule like S → ( S ) S can refer to itself.',
    },
    {
      q: 'What is a leftmost derivation?',
      options: [
        'Each step rewrites the leftmost non-terminal that is left',
        'Each step rewrites whichever rule is listed first in the grammar',
        'The parse tree is built from its leftmost leaf to the right',
        'Only rules whose right side starts with a token can be used',
      ],
      answer: 0,
      why: 'The choice of which production to use is still free; only the position is fixed, always the leftmost non-terminal. That makes each parse tree correspond to exactly one leftmost derivation, which is how the Derive scene builds one.',
    },
  ],
};

export default lesson;
