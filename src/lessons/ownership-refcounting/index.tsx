import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Reference counting frees an object the moment nothing points at it, but a cycle keeps itself alive; ownership rules decide at compile time where each free happens, with no count and no collector.',
    what: 'Every object carries a count of the references to it. When the count reaches zero the object is freed, and its own references are released in turn, so a chain frees in order. Two objects that point at each other never reach zero even when nothing else can reach them: they leak, where a tracing collector would find them unreachable and free them at its next collect. A weak reference does not count, which breaks the cycle. Ownership takes a different road: a value has one owner, any number of shared borrows or one mutable borrow may be live, a borrow lives until its last use, and the compiler rejects a program that breaks those rules, so the free is at a known line.',
    analogy: 'Counting is a library where each borrower signs the sheet and the book is pulled when the sheet is empty: two borrowers who only ever borrow from each other keep every book on the shelf forever. Ownership is a rule that only one person holds the book at a time.',
    useCases: [
      'Understanding why Python, Swift and C++ shared pointers can leak a cycle, and what weak references fix',
      'Reading Rust borrow-checker errors as rules about who may use a value and when',
      'Choosing between counting, tracing and ownership for a language runtime or a long-lived service',
      'Judging what thread-safe counts cost when many threads share an object',
    ],
    why: 'How memory goes back decides pauses, leaks and what a bug looks like: a cycle that leaks quietly, a pause while the collector runs, or a compile error before the program exists. Knowing the three lets you read the trade-offs in any language you meet.',
    watch: 'A live object is a plain grey box with a yellow count badge (--hi). A freed object is dashed green (--ok) with a "freed" tag, the cheap correct outcome, and a leaked object, unreachable but never freed, is dashed red (--bad) with a "leaked" tag. In the tracing view an unreachable object waiting for a collect is dim. A weak reference is a dashed violet arrow (--violet). In the ownership listing a line where a shared borrow is live is blue (--info), where a mutable borrow is live violet (--violet), x after it was moved is dim (--dim), and the conflicting line is red (--bad).',
  },
  tryThis: [
    `Counting, on the defaults (the cycle script has run): ${F.openLeaked} objects show as leaked, each with count 1. Set the operation to "collect" and press Do it: tracing frees ${F.collectFreed} objects at op ${F.collectOp}, while counting still leaks ${F.openLeaked}.`,
    `Weak edge, from the defaults: press "Cycle with a weak back edge". The cycle frees at ops ${F.weakFreedAt.join(' and ')} and leaks ${F.weakLeaked}. Press "A chain frees in order": ${F.chainFreed} objects free together at op ${F.chainFreedAt[0]}, one release after another.`,
    `Cost, from the defaults: the cycle script made ${F.updates} count updates, costing ${F.plainCost}. Set Counts to "thread-safe (atomic)": the same updates cost ${F.atomicCost} in the toy model.`,
    `Ownership, in the second scene (it opens on "Shared ends before &mut", ${F.openingAccepted ? 'accepted' : 'rejected'}): memory goes back ${F.openingFreed}. Press "Shared, then &mut": rejected at line ${F.sharedThenMutLine} (${F.sharedThenMutRule}). "Two &mut": line ${F.twoMutLine} (${F.twoMutRule}). "Use after move": line ${F.afterMoveLine} (${F.afterMoveRule}).`,
  ],
  keyIdeas: [
    `Reference counting frees an object at the instant its count reaches zero, and a chain of ${F.chainFreed} objects frees together, one release after another, in this model.`,
    `A cycle keeps both counts at 1, so ${F.cycleLeaked} unreachable objects leak under counting; a tracing collect frees them, and making the back edge weak lets counting free them at ops ${F.weakFreedAt.join(' and ')}.`,
    `Count updates have a price: in the toy model ${F.updates} updates cost ${F.plainCost} when plain and ${F.atomicCost} when atomic, and real cost depends on contention and hardware.`,
    'Ownership turns the free into a compile-time fact: shared borrows end at their last use, a mutable borrow excludes the others, and the price is that some correct programs are rejected.',
  ],
  quiz: [
    {
      q: 'Two objects point at each other, and the last outside reference to them is dropped. What does a counting runtime do?',
      options: [
        'Keeps both, since each count stays at 1 and neither reaches zero',
        'Frees both, since nothing outside can reach either of them',
        'Frees one of them, since the first release brings that count to zero',
        'Raises an error, since a cycle is detected when the count is read',
      ],
      answer: 0,
      why: `Each object is still referenced by the other, so both counts stay at 1 and the pair leaks: ${F.cycleLeaked} objects in the script. A tracing collect or a weak back edge frees them.`,
    },
    {
      q: 'Why is `let r = &s; let m = &mut s; use r` rejected, while swapping the last two lines is accepted?',
      options: [
        'A shared borrow lasts to its last use, and a mutable borrow cannot overlap it',
        'A mutable borrow must come first, since it needs the value untouched',
        'A shared borrow ends when the next line starts, so the order is a style rule',
        'Two borrows of one value are refused, since only one reference may exist',
      ],
      answer: 0,
      why: `A borrow is live from its creation to its last use. In "Shared, then &mut" the shared borrows are used after the mutable one starts, so it is rejected at line ${F.sharedThenMutLine}; when their last use comes first they have ended, and "Shared ends before &mut" is accepted.`,
    },
    {
      q: 'Someone says "ownership is just garbage collection at compile time". What is the accurate version?',
      options: [
        'The compiler proves where each free goes, so no collector runs and no count is kept',
        'The compiler runs a collector while building and leaves the freed memory out of the program',
        'The compiler keeps counts like a runtime would, but updates them without a cost',
        'The compiler frees at the end of the program, so the memory is held until then',
      ],
      answer: 0,
      why: 'Ownership decides the point of the free from the rules, so nothing runs at that moment except the free itself. The price is that the checker rejects some correct programs, and the escape hatches are named in the lesson.',
    },
    {
      q: 'What does a weak reference read as once its target has been freed?',
      options: [
        'Null, since the weak reference never kept the target alive',
        'A dangling arrow, since the pointer still holds the old address',
        'The last value the target held, since the weak copy is a snapshot',
        'An error that stops the program, since using it is a bug',
      ],
      answer: 0,
      why: 'A weak reference does not count, so it cannot keep its target alive and it reads as null once the target is freed, not as a dangling arrow. In the lesson that is what lets the weak back edge free the cycle.',
    },
  ],
};

export default lesson;
