import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A tracing garbage collector frees memory by finding everything the program can still reach from its roots (stack variables, globals, registers) and reclaiming the rest. It frees what is unreachable, not what you have stopped using.',
    what: 'Mark starts at the roots and follows every reference, shading objects gray while they wait on a work list and black once their fields are scanned. Anything left white is unreachable, so sweep returns it to the free list; a compacting collector also slides the survivors together so free memory is one block. Because it only asks what is reachable, a cycle of objects pointing at each other is collected as soon as nothing outside reaches it. Generational collectors exploit the fact that most objects die young: frequent minor collections trace only the young generation, using a remembered set (kept up by a write barrier) for old objects that point into it.',
    analogy: 'Cleaning a house by tying a string to everything you can reach from the front door and following the strings; whatever has no string attached goes in the bin, even two boxes taped together in a corner.',
    useCases: [
      'Reading GC logs or a profiler that shows pause times in a JVM, .NET or Node.js service',
      'Understanding why allocation-heavy code causes frequent, short young-generation collections',
      'Knowing why a reference cycle is not a leak under a tracing collector, and what still is',
      'Tuning heap size and generation sizes when pauses hurt a latency-sensitive service',
    ],
    why: 'Most code you write today runs on a garbage-collected runtime, and GC pauses and memory growth are a common source of latency spikes and outages. Knowing that the collector traces reachability tells you what it can and can\'t free. It builds on `stack-vs-heap` (where objects live), `value-vs-reference` (references between them) and `graph-search` (the marking is a graph traversal).',
    watch: 'Roots are violet slots on the left (stack, global and register), and every reference is a violet arrow. While the collector traces, objects not seen yet are dim (white), objects on the work list are yellow (gray) and marked objects are blue (black), with a ring on the one being scanned. Garbage turns dashed red with a "garbage" tag before it is removed; empty slots are dashed outlines marked "free". With Reference counts on, each object\'s tag shows the count a reference-counting runtime would hold after freeing everything whose count reaches zero. In the timeline the program\'s running time is grey, and the pause is orange: a dashed orange bar on the program lane while the collector\'s orange mark and sweep bars run, with a yellow line for now. Generations: the young generation is a sky-blue band and the old one an amber band; objects there are grey when not being traced, tagged with their age or "remembered", a promoted object turns green with a "promoted" tag, and a reference to freed memory is a dashed red arrow. In Many short-lived objects, grey bars are the program running and orange bars the pauses, to scale.',
  },
  tryThis: [
    'Play Basic: the yellow work list spreads out from the roots, and temp and oldCart are left white, then swept.',
    'Load Unreachable cycle and turn Reference counts on: node A and node B each show rc 1, yet the trace frees both.',
    'Load Fragmented and play it: 3 free slots but no run of 2; turn After sweep to Compact and play again.',
    'Point user at null with the editor (or click the user root): most of the heap becomes garbage and the pause gets shorter.',
    'On Generations, turn the Write barrier Off: the minor GC frees entry while cache still points at it.',
  ],
  keyIdeas: [
    'A tracing collector keeps whatever is reachable from the roots and frees everything else.',
    'Unreachable cycles are collected; naive reference counting would leak them.',
    'Most objects die young, so minor GCs trace only the young generation, helped by a remembered set.',
    'Stop-the-world pauses grow with the live data the collector must trace and move.',
  ],
  quiz: [
    {
      q: 'You set `cart = null`, but the old cart is also stored in a history array the program still uses. When is it freed?',
      options: [
        'Not while the history array still reaches it',
        'Straight away, as soon as cart is set to null',
        'At the next collection, because cart is null',
        'When the function that created it returns',
      ],
      answer: 0,
      why: 'A collector frees what is unreachable, not what one variable stopped pointing at. The history array is reachable from the roots and still references the cart, so the cart stays live. Clearing one reference only helps when it was the last path to the object.',
    },
    {
      q: 'Two objects point at each other and nothing else points at either. What does a tracing GC do?',
      options: [
        'Frees both: neither is reachable from a root',
        'Keeps both: each still has a reference to it',
        'Frees one, then the other at the next GC',
        'Reports the cycle as a leak and keeps them',
      ],
      answer: 0,
      why: 'Marking starts at the roots and never reaches the pair, so both stay white and are swept. Naive reference counting would keep them, since each count is 1, which is why cycles are a problem for reference counting but not for tracing.',
    },
    {
      q: 'Why do objects turn gray before they turn black during marking?',
      options: [
        'Gray means found but fields not yet scanned',
        'Gray means the object will be freed shortly',
        'Gray marks objects the program just allocated',
        'Gray marks objects living in the old generation',
      ],
      answer: 0,
      why: 'Gray objects are on the work list: reached, but their own references not followed yet. Scanning one shades its white children gray and turns it black. When no gray objects remain, everything reachable is black and the rest is garbage.',
    },
    {
      q: 'A minor GC traces only the young generation. How does it avoid freeing a young object that only an old object points at?',
      options: [
        'It also starts from a remembered set of old objects',
        'It traces the whole old generation on every minor GC',
        'Old objects are not allowed to point at young ones',
        'It waits until the young object is old enough first',
      ],
      answer: 0,
      why: 'A write barrier records every old object that stores a young reference into the remembered set, and the minor GC treats those as extra roots. Without it, the young object looks unreachable and is freed while still in use; turn the barrier off in the lesson to see it.',
    },
    {
      q: 'In a stop-the-world mark-sweep, what makes the pause longer?',
      options: [
        'More live objects to mark, and to move if compacting',
        'More garbage objects waiting to be marked as live',
        'More references set to null since the last collection',
        'More roots in the program that hold no reference',
      ],
      answer: 0,
      why: 'Marking visits every live object once, and compaction copies each one, so the work grows with live data. Garbage is never marked; sweeping it costs a little per slot. That is why short-lived garbage is cheap and big live heaps cause long pauses.',
    },
  ],
};

export default lesson;
