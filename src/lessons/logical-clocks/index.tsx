import type { LessonModule } from '../../core/types';
import { ruleText } from './clocks';
import { DEFAULT_PRESET, PROCESSES, viewOf } from './execution';
import { BROKEN_SEED, DEFAULT_REGISTER, widestVector } from './register';
import { Stage } from './Stage';

/** The event e of the default drawing, the receive at the end of the two-message chain, and the rule that stamps it. */
const start = viewOf(DEFAULT_PRESET.model());
const e = start.stamps.findIndex((_, i) => start.name(i) === 'e');
const SIBLING_ENTRIES = widestVector({ ...DEFAULT_REGISTER, mode: 'siblings' });
const eRule = ruleText(start.stamps[e], PROCESSES[start.stamps[e].lane]);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Without a shared clock you can still order events: a Lamport clock gives every event a number that respects cause and effect, and a vector clock also tells you when two events are concurrent.',
    what: "Happened-before is a partial order: an event comes before another if it is earlier on the same process, or sends a message the other receives, or both through a chain of those. A Lamport clock stamps each event with one number, bumped on every event and pushed up to the largest stamp it sees in a message. If a happened before b then L(a) < L(b), but a smaller stamp does not prove a happened before b. A vector clock keeps one counter per process and compares componentwise, so a happened before b exactly when V(a) < V(b), and incomparable vectors mean concurrent. A store that keeps concurrent versions as siblings can then avoid silently dropping a write.",
    analogy: 'Each friend keeps a diary of numbered entries and copies the biggest number they hear in a letter. Entry numbers never contradict who wrote to whom, but two numbers alone cannot show that two entries never knew about each other; a diary that records how many entries it has seen of every friend can.',
    useCases: [
      'Dynamo-style stores that keep concurrent writes as siblings for the application to merge',
      'Ordering events in a distributed log or trace without trusting machine clocks',
      'Spotting that two edits were made without knowledge of each other in collaborative tools',
      'Explaining why last-write-wins on a counter or timestamp can drop a user\'s write',
    ],
    why: 'Wall clocks cannot order close events, so systems need an order built from messages. Knowing what Lamport and vector stamps can and cannot tell you decides whether a design loses writes or keeps them for someone to resolve.',
    watch:
      "The three processes are plain categories (P1 amber, P2 pink, P3 sky) and a blue arrow is a message. Each event shows its Lamport stamp in white and its vector in grey, with the vector counters this event raised in violet. A selected event is ringed in yellow. When you compare two events, the ground truth, the Lamport order and the vector order are three separate cards: green is happened-before, orange is concurrent (a fact, not an error) and red is a clock that is wrong about the truth. In the register scene a green chip is a version a replica keeps, an orange chip a kept version that a newer one makes stale, and a red struck chip a write the replica silently threw away.",
  },
  tryThis: [
    `In the default drawing a happened before e through two messages. Press e on P3: its Lamport rule reads ${eRule.lamport}, and its vector rule reads ${eRule.vector}.`,
    'Open "Before, or concurrent?" and press "Find me a pair", then press a pair: the Lamport card orders the two events although the truth card says concurrent, and the vector card agrees with the truth.',
    'In "Before, or concurrent?" load "two concurrent writes" and press a, then b: both writes have Lamport stamp 1, the vectors [1,0,0] and [0,1,0] are incomparable, and the vector card says concurrent.',
    `Open "Use it: a replicated register" (Lamport last-write-wins, seed ${BROKEN_SEED}): a replica throws write a away although it is concurrent with write b, and the invariants read broken. "Jump to the first violation" lands on it.`,
    `Switch the register to "version-vector siblings": both writes are kept, the resolution replaces both, and the largest vector has ${SIBLING_ENTRIES} entries on this seed, one per replica that coordinated a write; a seed where the resolution lands on a third replica gives 3. "Siblings that are never pruned" breaks the second invariant: a replica keeps an ancestor.`,
  ],
  keyIdeas: [
    'If a happened before b then L(a) < L(b); a smaller Lamport stamp alone does not prove a happened before b.',
    'Vector clocks compare componentwise: a happened before b exactly when V(a) < V(b), and incomparable vectors mean concurrent.',
    'Last-write-wins on Lamport stamps breaks a tie by replica id, so in this model one of two concurrent writes is silently discarded.',
    'Keeping concurrent versions as siblings preserves both until a client writes a version that dominates them, and the vector grows with the number of writers.',
  ],
  quiz: [
    {
      q: 'Two events on different processes have Lamport stamps 3 and 5 and no message path joins them. What is true?',
      options: [
        'They are concurrent: the smaller stamp does not show that it came first',
        'The event stamped 3 happened before the one stamped 5, since stamps respect order',
        'They must be the same event seen by two processes, because no path joins them',
        'The event stamped 5 happened first, because a larger stamp means more events seen',
      ],
      answer: 0,
      why: 'A Lamport clock guarantees that cause comes with a smaller stamp, not the reverse. With no path between the events, neither caused the other, whatever the stamps.',
    },
    {
      q: 'Which comparison of two vector stamps shows that the events were concurrent?',
      options: [
        'Neither vector is at most the other in every component',
        'The vectors are equal in every component except the last',
        'The sum of the first vector is smaller than the sum of the second',
        'The first vector is larger in some components and equal in all the others',
      ],
      answer: 0,
      why: 'Happened-before means one vector is less than or equal to the other component by component. When each is bigger somewhere, neither event knew about the other, so they are concurrent.',
    },
    {
      q: 'Two clients write at once, through different replicas, to a store that keeps one version by Lamport stamp. What happens?',
      options: [
        'Both writes get the same stamp, a tie-break picks one, and the other is dropped',
        'Both writes are kept, because the two stamps show which of them came first',
        'The write that was made later in real time wins, since Lamport stamps follow the clock',
        'The store notices the conflict by itself and asks a client to merge the two versions',
      ],
      answer: 0,
      why: 'Neither client had seen the other\'s write, so both stamp 1 and a rule such as the replica id decides. The loser disappears without an error, which is the silent loss the register scene shows.',
    },
    {
      q: 'What does a store that keeps siblings do with two concurrent versions of a value?',
      options: [
        'It keeps both until a client writes a version whose vector dominates them',
        'It keeps the one with the larger vector and drops the smaller one',
        'It merges them itself by taking the larger of the two stored values',
        'It keeps the one whose replica answered first and discards the other',
      ],
      answer: 0,
      why: 'Incomparable vectors mean neither version replaces the other. Both stay as siblings, and a resolving write carrying the joined vector then replaces both.',
    },
    {
      q: 'How does the size of a version vector grow?',
      options: [
        'With the number of replicas or clients that coordinated writes to it',
        'With the number of writes to the value, one new entry for every write made',
        'With the length of the stored value, one entry for each byte it holds',
        'It stays the same size however many writers there are, since it is a counter',
      ],
      answer: 0,
      why: 'There is one counter per writer, so more writers means a longer vector. Mitigations such as dotted version vectors exist to tame this and are outside the lesson.',
    },
  ],
};

export default lesson;
