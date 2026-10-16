import type { LessonModule } from '../../core/types';
import { FACTS as F, num } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A regex is a small program for a state machine: it compiles to an NFA, which can be run as a set of states in time bounded by input length times machine size, or explored by backtracking, whose work depends on the pattern.',
    what: `Thompson's construction turns each piece of a pattern into a two-ended fragment of states and arrows, then joins the fragments with ε arrows, so ${F.buildPattern} becomes ${F.buildStates} states. Running the NFA means keeping the set of states that could be active and advancing the whole set per character; the subset construction shows the DFA that would do the same with one state at a time. A backtracking engine instead tries alternatives in order and backs up on failure, which decides which match it returns and, for a pattern like ${F.nestedPattern}, how long it takes. This is a small dialect with its own matcher, not your browser's engine.`,
    analogy: 'It is a flow chart read by a crowd of tokens at once (the NFA), or by one token that walks, gets stuck and walks back (backtracking).',
    useCases: [
      'Predicting why a pattern that looks harmless can be slow on certain inputs',
      'Choosing between a linear-time engine and a backtracking one when a pattern comes from users',
      'Understanding why alternation order changes which match you get',
      'Reading the documentation of an engine that says "no back-references, linear time"',
    ],
    why: 'Patterns end up in validation, routing, logging and search, and their running time and results depend on the engine. Knowing the state machine underneath tells you when a pattern is safe to hand to untrusted input and when only an automaton-based engine will do.',
    watch: 'In the state diagrams a double ring is the accepting state and the arrow into the first state marks the start. A lit state is yellow (--hi); when the accepting state is lit it turns green (--ok). Arrows that consume a character are blue (--info) and thicker on the character just read; ε arrows are dashed and grey (--dim). The fragment just built is violet (--violet). In the match strip the matched characters are green and the active character is yellow. In the backtracking log a failed attempt that backed up is red (--bad), an attempt that went on to match is green, and the step budget running out is orange (--orange). In the plot the red curve is the backtracking matcher, the blue curve the NFA and an orange dot marks a run the budget cut off.',
  },
  tryThis: [
    `Build, on the defaults (${F.buildPattern}): press play to the end. The counts finish at ${F.buildStates} states and ${F.buildEpsilons} ε arrows, within the Thompson bound of ${F.buildBound}. Then type a** in the pattern field: it says "Position 3: nothing to repeat." and the diagram keeps the last good pattern.`,
    `Run it, on the defaults (${F.buildPattern} on ${F.runSubject}, full match): play to the end. Work finishes at ${F.runWork} state-reads, no more than ${F.runLength} characters x ${F.runStates} states = ${F.runBound}. Pick the preset ${F.growthPattern}: the NFA has ${F.growthNfa} states and the DFA ${F.growthDfa}.`,
    `Which match?, on the defaults (a|ab on ab): leftmost-first returns "${F.whichFirst}" and longest returns "${F.whichLongest}"; the browser's real RegExp on this fixed pair also returns "${F.whichReal}".`,
    `Backtracking, on the defaults (${F.nestedPattern} on ${F.nestedLength} a's): the matcher takes ${num(F.nestedSteps)} steps and the NFA ${F.nestedNfaWork} state-reads. Type ${F.nestedBudgetLength - F.nestedLength} more a's (${F.nestedBudgetLength} in all): the stage says it did not finish within ${num(F.budget)} steps.`,
  ],
  keyIdeas: [
    `A regex compiles to an NFA: ${F.buildPattern} becomes ${F.buildStates} states and ${F.buildEpsilons} ε arrows, and running it keeps a set of active states, so its work in this model stays within length x states (${F.runWork} state-reads against a ceiling of ${F.runBound} on the default).`,
    `Backtracking work depends on the pattern, with no length x states ceiling in this model: ${F.nestedPattern} on ${F.nestedLength} a's costs ${num(F.nestedSteps)} steps against ${F.nestedNfaWork} state-reads for the NFA, and the budget ends the run at ${F.nestedBudgetLength} a's.`,
    `A DFA lights one state per character but can be larger than the NFA: for ${F.growthPattern} the subset construction needs ${F.growthDfa} states against ${F.growthNfa} (the DFA sizes for k = 0 to 4 are ${F.growthDfas.join(', ')}).`,
    `A backtracking engine returns the first alternative that lets the rest succeed ("${F.whichFirst}" for a|ab on ab) where a POSIX rule returns the longest ("${F.whichLongest}"); the NFA itself allows both ends.`,
  ],
  quiz: [
    {
      q: 'A backtracking engine matches `a|ab` against `ab`. What does it return?',
      options: [
        '"a", the first alternative that lets the rest of the pattern succeed',
        '"ab", the longer of the two alternatives that both fit the subject',
        '"ab", because the engine compares both alternatives and keeps the longer match it found',
        'No match, because the first alternative leaves the letter b unread',
      ],
      answer: 0,
      why: `Alternatives are tried in order and the first success wins, so the match is "${F.whichFirst}" (the browser's RegExp agrees). The NFA allows both ends, and a POSIX rule would pick "${F.whichLongest}".`,
    },
    {
      q: 'What does an NFA simulation do instead of backtracking?',
      options: [
        'It keeps the set of states the machine could be in and advances that whole set per character',
        'It tries each alternative in turn and undoes the last choice whenever it reaches a dead end',
        'It converts the pattern to a DFA first, which always has fewer states than the NFA',
        'It remembers the text each group matched and compares it as it goes along',
      ],
      answer: 0,
      why: `Nothing is undone: on ${F.runSubject} the set holds up to ${F.runStates} states, and the work is ${F.runWork} state-reads. The subset DFA is a separate construction and can have more states, ${F.growthDfa} against ${F.growthNfa} for the growth pattern.`,
    },
    {
      q: 'A learner says a regex matches in time proportional to the input. Which statement about the matchers in this lesson is accurate?',
      options: [
        'The NFA simulation is bounded by length times states, but a backtracking matcher can blow past it',
        'Both matchers take time proportional to the input, because they read each character once',
        'The backtracking matcher is the faster one on every pattern, because it never has to keep a set of states and update it',
        'Both matchers are bounded by length times states, because they run the same machine',
      ],
      answer: 0,
      why: `${F.nestedPattern} on ${F.nestedLength} a's costs the backtracker ${num(F.nestedSteps)} steps and the NFA ${F.nestedNfaWork} state-reads; at ${F.nestedBudgetLength} a's the backtracker hits its ${num(F.budget)}-step budget. These are this lesson's own step counts, not a measurement of a real engine.`,
    },
    {
      q: 'Why does the state-machine scene refuse the back-reference `\\1`?',
      options: [
        'Matching it needs the text a group captured earlier, which a finite set of states cannot remember',
        'The reference points at group 1 before the group has been closed, which is a syntax error',
        'A back-reference can be matched only by a DFA, never by an NFA',
        'The dot and the set are the only atoms that an NFA fragment can be built from',
      ],
      answer: 0,
      why: 'A finite set of states cannot hold an arbitrary captured string, so the NFA refuses with "this needs memory an automaton does not have". The backtracking scene accepts the pattern because the matcher keeps the captures itself.',
    },
  ],
};

export default lesson;
