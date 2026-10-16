import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A pushdown automaton is a finite state machine with one stack, which is exactly what it takes to count nested things: it pushes as it reads the first half and pops as it reads the second, where a machine with only states runs out.',
    what: `The machine reads a string while keeping a stack; each move looks at the state, the next input symbol (or none) and the top of the stack, then pops it and pushes a string. It accepts when the input is used up and it is in an accepting state or the stack is empty. Some languages, like the even-length palindromes, force it to guess where the middle is, so it keeps a set of configurations and the right guess survives. A finite automaton with ${F.dfaStates} states can count a's only up to ${F.k}; the stack has no such limit. You can also write a transition table yourself and let a checker find the first string where it is wrong.`,
    analogy: 'It is a person reading a sentence with a stack of sticky notes: put a note down for every open bracket, take the top one off for every close bracket, and the pile tells you what is still owed.',
    useCases: [
      'Understanding why matching nested brackets or tags is more than a regular expression can do',
      'Seeing what a parser\'s stack is for before reading about LL and LR tables',
      'Explaining why a language with matched counts needs memory that grows with the input',
      'Reading "context-free" as "recognised by a machine with one stack"',
    ],
    why: 'Nesting is everywhere in code: brackets, tags, calls, expressions. Knowing that a finite state machine cannot track nesting depth, and what one stack buys you, is the reason parsers are built the way they are.',
    watch: 'The top of the stack is yellow (--hi), and the first configuration\'s stack sits beside the input. Each live configuration is a violet box (--violet) because the set is a set of guesses; an accepting configuration is green (--ok). A rejection from a missing move is red (--bad) and one that ends with symbols still on the stack is orange (--orange), a different kind of failure. In the transition list the rule that just fired is tinted yellow. In the duel, the state the word ends in is yellow, the states it passed through blue (--info) and the dead state red.',
  },
  tryThis: [
    `Step a machine, on the defaults (a^n b^n on ${F.subject}, accept by final state): play to the end. It accepts after ${F.moves} moves with the stack at most ${F.peakStack} symbols deep. Switch "Accept by" to Empty stack: it still accepts, after ${F.emptyStackMoves} moves, and the last move pops the bottom marker. Type aab: the input ends and the verdict reads "${F.leftoverText}".`,
    `Step a machine, on the defaults: pick the wwᴿ chip (it loads ${F.wwrSample}) and play: the machine guesses the middle, so up to ${F.wwrPeak} configurations are live at once, and one of them accepts.`,
    `DFA duel, on the defaults (k = ${F.k}, n = ${F.n}): the DFA has ${F.dfaStates} states and ${F.dfaAtN ? 'accepts' : 'rejects'} a^${F.n} b^${F.n} while the PDA ${F.pdaAtN ? 'accepts' : 'rejects'} it. Move n down to ${F.k}: both accept.`,
    `Build your own, on the defaults (the a^n b^n table): press Check. The first disagreement is ${F.asBuiltInput}: "${F.asBuiltReason}". Press "Show a solution" and Check again: all ${F.solutionChecked.toLocaleString('en-US')} strings up to length ${F.checkLength} agree.`,
  ],
  keyIdeas: [
    `One stack is enough to count without a limit: the a^n b^n machine accepts ${F.subject} in ${F.moves} moves with the stack up to ${F.peakStack} deep, and a longer word makes the stack deeper.`,
    `A DFA that counts up to k a's needs 2k + 2 states (${F.dfaStates} for k = ${F.k}) and fails at n = ${F.firstDisagreement}, the first word where the PDA and it disagree: by the pigeonhole step a state repeats, so two different words look the same to it.`,
    'Accepting by final state and accepting by empty stack recognise the same languages in this lesson: the finishing move either keeps the bottom marker or pops it, and the tests agree on every string checked.',
    `A language like wwᴿ needs a guess: the machine keeps a set of configurations (up to ${F.wwrPeak} on ${F.wwrSample}) and accepts if any of them does, which a deterministic parser avoids by restricting the grammar.`,
  ],
  quiz: [
    {
      q: 'Why can no DFA recognise a^n b^n for every n?',
      options: [
        'With s states, reading a s times revisits a state, so it cannot tell a^i b^i from a^j b^i',
        'A DFA cannot read two different letters in one word, so mixed words are out of reach',
        'A DFA has no start state to count from, so its first move is always undefined',
        'A DFA can count a\'s but not b\'s, because it reads the input from left to right',
      ],
      answer: 0,
      why: `For k = ${F.k} the DFA has ${F.dfaStates} states and works up to n = ${F.k}; at n = ${F.firstDisagreement} it rejects a word the PDA accepts, and raising k moves that point out.`,
    },
    {
      q: 'What must the wwᴿ machine do when it reaches the middle of the word?',
      options: [
        'Guess that this is the middle, and keep a configuration for every possible guess',
        'Measure the length of the input first, then switch to popping at exactly half',
        'Empty its stack completely, then start again from the second half of the input',
        'Compare the next letter with the stack top, since the machine always knows the middle',
      ],
      answer: 0,
      why: `A machine reading left to right has no way to know where the middle is, so the ε-move that switches to popping is taken at each position as a separate configuration: up to ${F.wwrPeak} are live on ${F.wwrSample}, and the right guess alone ends in acceptance.`,
    },
    {
      q: 'A DFA with 2k + 2 states handles brackets nested up to depth k. What does it do at depth k + 1?',
      options: [
        'It falls into its dead state and rejects a balanced word the PDA accepts',
        'It grows an extra state on the fly and carries on, like a stack would',
        'It accepts anyway, because depth k + 1 looks like depth k to its counter',
        'It crashes, because a DFA has no move defined for a word of that length',
      ],
      answer: 0,
      why: `At n = ${F.firstDisagreement} with k = ${F.k} the counter has run out: the DFA ends in its dead state and rejects, while the PDA accepts. A fixed number of states cannot follow unbounded nesting.`,
    },
    {
      q: 'What does the stack give a pushdown automaton that a finite automaton lacks?',
      options: [
        'Memory that grows with the input and is read last in, first out',
        'The ability to match any pattern, since a stack can hold the whole input',
        'The ability to run two counts at once, since each symbol has its own slot',
        'Faster matching, since a stack lets the machine skip the symbols it knows',
      ],
      answer: 0,
      why: 'The stack grows as needed and just its top is visible, which is what nested structure needs and why two independent counts at once are beyond one stack: that limit is the next step up the hierarchy of machines.',
    },
  ],
};

export default lesson;
