import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A lexer turns a string of characters into a stream of tokens (numbers, names, keywords, operators) by always taking the longest token it can, so the parser never has to think about individual characters.',
    what: 'Each kind of token is a small pattern, and all of them run together as one DFA (the machine from `dfa-nfa`). From the current position the lexer keeps reading while a longer token is still possible, remembers the last place a token was complete, and when the DFA gets stuck it backs up to that place and emits the token: maximal munch. When two rules match the same length, the one listed first wins, which is why `if` is a keyword but `iffy` is a name. Whitespace and comments are consumed and dropped.',
    analogy: 'Reading a sentence with no spaces: you keep taking letters while they could still be a longer word, then commit to the longest word you saw.',
    useCases: [
      'Every compiler and interpreter starts here: V8, CPython, javac, the TypeScript compiler',
      'Syntax highlighters in editors colour code by token kind',
      'Linters and formatters (ESLint, Prettier) work from tokens and the tree built on them',
      'Template engines, config languages and query languages (SQL, GraphQL) all lex first',
    ],
    why: 'Puzzling errors like "unexpected token" and quirks like `a+++b` meaning `(a++) + b` come straight from the lexer. Knowing the longest-match rule and keyword priority explains them, and writing a small tokenizer for a config format or a DSL is a common real task.',
    watch:
      'In the source line, yellow is the lexeme being scanned, a green bar marks the last spot where a complete token ended, and orange characters were read past it and are about to be given back (a space shows as ␣). Finished whitespace and comments are dim and struck through, errors are red with a wavy underline, and characters not reached yet are grey. Token chips are coloured by kind: numbers blue, identifiers violet, keywords amber, operators sky blue, strings pink, parentheses grey, errors red. The DFA on the right uses the same colours for its accepting states (double rings); the current state is filled yellow, the arrow just taken turns yellow, and an orange Stuck note appears when the DFA has no arrow for the character just read.',
  },
  tryThis: [
    'Step through a+++b: after ++ the DFA has no arrow for a third +, so ++ is emitted and the last + starts a new token.',
    'Load iffy = 1, then flip Rule order to Identifiers first and load if x then 1: if stops being a keyword.',
    'Load n = 3.x and watch the lexer read 3 and the dot, get stuck on x, and give two characters back.',
    'Load x = 3.14.15: the number ends at the second dot, which becomes an error with its line and column.',
    'Type 1 + + 2 in the field: it lexes into four perfectly good tokens, even though it is nonsense.',
  ],
  keyIdeas: [
    'Maximal munch: always take the longest token possible from the current position.',
    'The lexer reads past the end of a token to know it has ended, then gives those characters back.',
    'Equal-length ties go to the rule listed first, which is why keywords are listed before identifiers.',
    'A lexer checks spelling, not grammar: putting tokens in a sensible order is the parser\'s job.',
  ],
  quiz: [
    {
      q: 'The line `1 + + 2` goes through the lexer. What happens?',
      options: [
        'It gives four valid tokens; the parser rejects it',
        'The lexer stops at the second + with an error',
        'The lexer merges the two + signs into one ++',
        'The lexer drops the extra + and gives 1 + 2',
      ],
      answer: 0,
      why: 'Each piece is a perfectly good token: NUMBER, OP, OP, NUMBER. Whether they make sense in that order is grammar, which the lexer never checks. The space between the two + signs ends the first token, so they cannot merge into ++.',
    },
    {
      q: 'Why does `iffy` become one identifier instead of the keyword `if` followed by `fy`?',
      options: [
        'The identifier rule matches 4 characters and the longest wins',
        'Identifiers are always checked before keywords by the lexer',
        'Keywords only count when the next character is a space',
        'The lexer looks the word up in a dictionary of real names',
      ],
      answer: 0,
      why: 'The keyword rule can match only `if` (2 characters) while the identifier rule matches all 4, and maximal munch takes the longer one. Rule order only breaks ties of equal length, and in this lexer the keyword rule is listed first.',
    },
    {
      q: 'How does the lexer split `a+++b`?',
      options: ['a, ++, +, b', 'a, +, ++, b', 'a, +++, b', 'a, +, +, +, b'],
      answer: 0,
      why: 'From the first + the longest possible token is ++ (there is no +++ operator), so it takes that, then the remaining + is a token of its own. That is why JavaScript reads `a+++b` as `(a++) + b`.',
    },
    {
      q: 'While scanning `3.x` the DFA reads 3, then the dot, then gets stuck on x. What does the lexer emit first?',
      options: [
        'NUMBER 3, giving back the dot and the x',
        'An error, because 3. is not a number',
        'NUMBER 3. with the dot kept on the end',
        'Nothing until it finds a space or the end',
      ],
      answer: 0,
      why: 'The last accepting spot was right after 3, so the lexer backs up there and emits NUMBER 3. The dot and x are given back and read again: the dot then becomes an error token of its own. "3." is not accepted, because a fraction needs a digit after the dot.',
    },
  ],
};

export default lesson;
