import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Compare-and-swap lets threads update shared data without a lock by retrying when someone else got there first, but a successful CAS says the value matched, not that nothing changed in between, and "lock-free" does not mean each thread makes progress.',
    what: `A CAS loop reads a value, computes a new one and swaps it in if the value is still what it read; if not, it retries. The lesson counts the full set of schedules of two and three CAS-incrementing threads, then builds a Treiber stack on a three-node heap with a free list and lets an explorer find the shortest interleaving that corrupts it (the ABA problem: a node is popped, freed, reused and pushed back, so a stale CAS succeeds). A tagged head and hazard pointers are run against the same programs, and a last scene separates lock-free from wait-free with a scripted adversary. Each step is atomic and in order on a simulated model.`,
    analogy: 'Booking the last seat by reading the seat map, then pressing buy if the map is unchanged: if it changed you start over. ABA is the map showing the same seat free again after someone else bought it and cancelled.',
    useCases: [
      'Reading or reviewing concurrent queues, stacks and counters in language runtimes and kernels that avoid locks on hot paths',
      'Understanding why a lock-free structure needs a safe-reclamation scheme (tagged pointers, hazard pointers, epochs) rather than just a CAS',
      'Choosing between a lock, a CAS loop and a hardware fetch-and-add for a shared counter, given what a suspended thread can do to the others',
      'Explaining a rare corruption that needs one thread to pause at exactly the wrong moment',
    ],
    why: 'Lock-free code removes the suspended-lock-holder problem and adds a harder one, memory reclamation. It builds on `race-conditions` (locks and unlocked updates), `thread-pools-work-stealing` and `memory-ordering-atomics`, whose ordering questions are set aside here: every step is assumed ordered.',
    watch: 'The thread whose step just ran is ringed blue-green. A successful CAS is green and a failed CAS is red; a value a thread still remembers is blue. In the heap drawing the free list and retired nodes are violet, a node a thread holds is blue, and a node in the wrong place (two places, or none) is red. In the progress scene a green cell is a completed increment, a red cell a failed CAS, a dashed cell a wait for the lock, and a blue cell a load.',
  },
  tryThis: [
    `In The CAS loop (2 threads), press run T1 next twice (load, CAS) and then run T2 next twice: no retry. Press Reset, run T1 next, run T2 next (both load), then run T1 next and run T2 next: T2's CAS fails ("x is now 1, you expected 0") and it retries. The table says ${F.retrying2} of the ${F.interleavings2} first-attempt interleavings retry.`,
    `In A lock-free stack and ABA, with "ABA via reuse" and plain CAS selected, press Find the corruption: the replay has ${F.reuseDepth} steps and ends with "${F.reuseMessage}".`,
    `With the same program, switch the mode to tagged head and press Find the corruption: ${F.reuseTaggedStates} states, no violation, exhaustive. Switch to hazard pointers and press it again: ${F.reuseHazardStates} states, also clean.`,
    `In Lock-free is not wait-free, choose the adversary schedule with the CAS loop: T1 failed ${F.adversaryFailed} times in ${F.rounds} rounds while T2 completed ${F.adversaryT2}. Switch the counter to fetch_add: T1 finishes in ${F.fetchAddT1Steps} step.`,
  ],
  keyIdeas: [
    'A successful CAS says the value matched when the CAS ran, not that nothing changed in between: another thread can change a value and put it back, which is ABA.',
    `On the "ABA via reuse" program plain CAS corrupts the stack in ${F.reuseDepth} steps, while a tagged head and hazard pointers pass the same program (${F.reuseTaggedStates} and ${F.reuseHazardStates} states, exhaustive within the bound).`,
    `Hazard pointers protect reclamation, not a program that recycles a node itself: the re-push program still corrupts the stack under them after ${F.repushHazardDepth} steps, while the tagged head passes it.`,
    `Lock-free means some thread completes, not each thread: in the adversary run T1 failed ${F.adversaryFailed} times in ${F.rounds} rounds and completed ${F.adversaryT1}, while fetch_add finishes T1 in ${F.fetchAddT1Steps} step.`,
  ],
  quiz: [
    {
      q: 'A thread loads head = A, is paused, and later its CAS(head, A, B) succeeds. What can it not conclude?',
      options: [
        'That head still held the node A at the instant its own CAS ran',
        'That its CAS took effect as a single indivisible step on the head',
        'That head points to B right after the swap went through for it',
        'That nothing changed the stack since its own load',
      ],
      answer: 3,
      why: `A CAS compares the value it sees now, nothing more. Other threads can pop A, free it, reuse it and push it back, so head is A again although the stack changed: in the model that corrupts the stack in ${F.reuseDepth} steps.`,
    },
    {
      q: 'With a tagged head, the stalled thread\'s CAS fails in the ABA program. Why does it fail?',
      options: [
        'Head is back to A but its counter moved on, so the pair no longer matches',
        'Head is no longer A, because the other thread pushed a different node on top',
        'The allocator refuses to hand A out again after it has been freed once',
        'The CAS notices that B was freed and so it declines to swap the head',
      ],
      answer: 0,
      why: `The head is a pair (node, counter) and each successful CAS adds 1, so a head that returns to A carries a different counter. The same program passes exhaustively in the model (${F.reuseTaggedStates} states).`,
    },
    {
      q: 'Which statement is true of a lock-free counter?',
      options: [
        'Each thread finishes within a bounded number of its own steps, however the others run',
        'Whenever threads run, some operation completes, though one thread can lose each round',
        'A suspended thread can hold up the other threads the way a lock holder would',
        'Its CAS loop retries only when another thread has crashed in the middle of a swap',
      ],
      answer: 1,
      why: `In the adversary run T2 completed ${F.adversaryT2} increments while T1 failed ${F.adversaryFailed} times and completed ${F.adversaryT1}: progress for the system, none for one thread. The first option is the wait-free guarantee, which fetch_add shows (T1 needs ${F.fetchAddT1Steps} step).`,
    },
    {
      q: 'Hazard pointers stop the "ABA via reuse" corruption but not "ABA by re-push". Why?',
      options: [
        'The second program uses more threads, which hazard pointers cannot cover',
        'They defer freeing a node someone is reading, and re-push never frees',
        'Hazard pointers work on an empty stack, which the second program lacks',
        'The re-push program is not lock-free, so the guarantee does not apply',
      ],
      answer: 1,
      why: `A hazard pointer holds back a free until nobody protects the node. The re-push program never calls free, so nothing is deferred; in the model it fails after ${F.repushHazardDepth} steps while the tagged head passes.`,
    },
    {
      q: 'Two threads each CAS a counter once. How many of the 6 interleavings of their (load, CAS) pairs need a retry?',
      options: [
        'Two: the runs in which the two threads\' steps do not overlap at all in time',
        'Six: every CAS has to be tried twice before it can succeed',
        'Four: the same four that lose an update when the counter is unlocked',
        'None: a CAS on a shared counter cannot fail, by its definition',
      ],
      answer: 2,
      why: `${F.retrying2} of the ${F.interleavings2} retry: in both, the thread that loaded before the other's update lands is the one that is stale. The two runs with no overlap retry nothing. A failed CAS is the update an unlocked counter would have lost.`,
    },
  ],
};

export default lesson;
