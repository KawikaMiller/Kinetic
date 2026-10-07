import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A finite automaton reads input one symbol at a time, remembers nothing but which state it is in, and says yes or no at the end: the machine behind regexes, lexers and every UI state machine.',
    what: 'A DFA has exactly one arrow per state and symbol, so it is always in one state. An NFA may have several arrows for a symbol, or none, plus ε-arrows it can take for free, so it is in a set of states at once and accepts if any of them is accepting. The subset construction turns any NFA into a DFA whose states are those sets, so both recognise exactly the same languages: the regular languages.',
    analogy: 'A turnstile: it is locked or unlocked, a coin unlocks it, a push locks it again. It never remembers how many people went through, only where it is now.',
    useCases: [
      'Regex engines compile patterns into NFAs and DFAs (`regex-basics` is the user side)',
      'Lexers run one combined DFA to chop source code into tokens',
      'UI and protocol state machines: a door, a checkout flow, a TCP connection',
      'Input validation and protocol parsers in network devices',
    ],
    why: 'Every "if we are in state X and event Y happens" bug is a state machine you did not draw. Drawing it shows missing transitions (events your UI forgets to handle) and impossible states. It is also why some patterns, like balanced brackets, are beyond regex, which comes up in interviews and in code review.',
    watch:
      'Circles are states; a double ring marks an accepting state, and the short arrow from nowhere marks the start. The lit state (or states, in an NFA) is filled yellow, and the arrow being taken this step flashes thick and blue. States the start can never reach are dim grey. The verdict reads green for accepted and red for rejected. On the tape the symbol just read is yellow, symbols already read are dim, and the blue "next" marker points at the next one. In NFA → DFA the NFA states of the row being filled are yellow, the table cell being filled is solid violet, filled cells are grey outlines, and the new DFA arrow and the box it points at are blue; accepting DFA boxes have a double outline, with → for the start and ✓ for accepting rows. In Build one, the violet chips mark accepting states.',
  },
  tryThis: [
    'Run Divisible by 3 on 110 (six) and 111 (seven): the state is the remainder so far.',
    'Pick the Door controller and type lo: lock, then open, has no arrow, so the machine dies and rejects.',
    'Switch to the NFA 3rd from end is 1, step through 0100, and count the lit states.',
    'In NFA → DFA, drag n from 1 to 4 and watch the DFA states double each time: 2, 4, 8, 16.',
    'In Build one, pick Contains 11 and wire the machine until the checker stops finding counterexamples.',
  ],
  keyIdeas: [
    'A finite automaton remembers only its current state: no counter, no stack.',
    'An NFA is in a set of states at once; it accepts if any of them is accepting.',
    'The subset construction turns any NFA into a DFA, so both recognise exactly the regular languages.',
    'The price is size: an NFA with n + 1 states can need a DFA with 2ⁿ.',
  ],
  quiz: [
    {
      q: 'Can an NFA recognise a language that no DFA can?',
      options: [
        'No: the subset construction gives an equivalent DFA',
        'Yes: guessing lets it match patterns a DFA cannot',
        'Yes, but only when it uses ε-arrows somewhere',
        'Only if the NFA has more states than the DFA',
      ],
      answer: 0,
      why: 'Every NFA converts to a DFA that accepts exactly the same strings, as the NFA → DFA scene builds row by row. The NFA can be much smaller to write, but it is not more powerful. ε-arrows do not change that either: the construction follows them inside each set.',
    },
    {
      q: 'An NFA reads its whole input and ends with states {A, C} lit. Only C is accepting. What is the verdict?',
      options: ['Accepted, as one accepting state is enough', 'Rejected, since A is not an accepting state', 'Undecided until the NFA picks one of them', 'Accepted only if A and C were lit together'],
      answer: 0,
      why: 'An NFA accepts if any path ends in an accepting state. A being non-accepting just means that path failed; the C path succeeded. There is no later moment where it "picks": the set is the whole answer.',
    },
    {
      q: 'In a DFA, the current state has no arrow for the next symbol. What happens?',
      options: ['The machine dies and the input is rejected', 'It skips that symbol and reads the next one', 'It stays where it is and keeps on reading', 'It jumps back to the start state and retries'],
      answer: 0,
      why: 'A missing arrow is shorthand for an arrow into a dead state that loops forever and never accepts. Skipping or staying would be a different machine; the door controller in the lesson relies on missing arrows to refuse illegal events.',
    },
    {
      q: 'The NFA for "the 3rd symbol from the end is 1" has 4 states. How many states does its DFA from the subset construction have?',
      options: ['8', '4', '16', '6'],
      answer: 0,
      why: 'The DFA has to remember the last three symbols, and there are 2³ = 8 patterns of three bits, each needing its own state. 16 would be the count of every subset of 4 NFA states, but only 8 of them are reachable.',
    },
  ],
};

export default lesson;
