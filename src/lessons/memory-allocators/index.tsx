import type { LessonModule } from '../../core/types';
import { n } from './captions';
import { classFacts, coalesceFacts, fragmentedFacts, pageFacts, scriptFacts } from './facts';
import { Stage } from './Stage';

const script = scriptFacts();
const frag = fragmentedFacts();
const coalesce = coalesceFacts();
const classes = classFacts();
const pages = pageFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'malloc has to find a hole big enough, and over time the holes get small and scattered: enough free bytes in total is not the same as a block big enough, and freeing memory does not hand it back to the operating system.',
    what: 'An allocator keeps track of the holes in a heap. A placement policy decides which hole serves a request: first fit takes the lowest, best fit the smallest that fits, worst fit the largest, next fit carries on from the last allocation. Free blocks that sit next to each other can be merged (coalescing). Even so, live blocks scattered through the heap leave holes too small to use: external fragmentation. Allocators also round requests up to size classes, which trades that for internal waste. And a page can return to the operating system only when every object on it is free.',
    analogy: 'A car park where cars leave at random. There may be ten free spaces, but if they are all single spaces between parked cars, a lorry still cannot park.',
    useCases: [
      'Explaining a process whose memory use stays high after a burst of frees',
      'Choosing between a general-purpose allocator and pools or arenas for a workload',
      'Reading "fragmentation" in an allocator\'s statistics or a heap profile',
      'Understanding why compacting garbage collectors can release memory that a C allocator cannot',
    ],
    why: 'Allocation policy and fragmentation decide how much memory a long-running service really needs. The lesson covers policy and fragmentation only: it shows holes as a picture and models no allocator\'s internal metadata. It builds on `stack-vs-heap`.',
    watch:
      'Arena: each live block takes its own hue (amber, pink, sky or orange) with its id on its first unit, never green or red; a free hole is a dim outline, the block just placed is ringed in yellow, and a failed allocation is written in red (the fragmented line and the out-of-memory line alike). In the policy table the row of the chosen policy is yellow. Size classes: violet is internal waste inside a class, the sky bars are the seeded requests and the bars for the other spacings are dim. Pages: grey is a full page, red a partly used page whose free bytes cannot be returned, green an empty page that can be. Chips say what is a toy, simulated or from memory.',
  },
  tryThis: [
    `In "The arena and its holes" press "Run the 200-operation script" (first fit, coalescing on): ${n(script.holes)} holes remain and external fragmentation is ${script.fragmentation}. In the policy table, "Failed: fragmented" reads worst fit ${n(script.fragmentedFailures.worst)}, next fit ${n(script.fragmentedFailures.next)}, first fit ${n(script.fragmentedFailures.first)} and best fit ${n(script.fragmentedFailures.best)}, and "Failed: out of memory" reads ${n(script.fullFailures.worst)}, ${n(script.fullFailures.next)}, ${n(script.fullFailures.first)} and ${n(script.fullFailures.best)} in the same order.`,
    `In "The arena and its holes", press Reset, then alloc 12, 8, 12, 8, 12, 8, click the three blocks of 12 to free them, and press 16: ${n(frag.free)} units are free in ${n(frag.holes)} holes but the largest is ${n(frag.largest)}, so the allocation fails as fragmented, not as out of memory.`,
    `In "The arena and its holes", press Reset, alloc 8 twice, then click both blocks: with coalescing on (as it opens) ${n(coalesce.on)} hole remains. Reset, turn coalescing off and repeat: ${n(coalesce.off)} holes remain and the largest is ${n(coalesce.offLargest)}.`,
    `In "Size classes" (25% spacing) there are ${n(classes.quarter.classes)} classes and ${classes.quarter.waste} of the bytes handed out are internal waste. Choose "Powers of two": ${n(classes.pow2.classes)} classes and ${classes.pow2.waste}.`,
    `In "Why memory stays high" (${n(pages.k)} objects a page, ${pages.freed} freed at random) ${n(pages.randomReturnable)} of ${n(pages.pages)} pages are returnable. Choose "Oldest first": ${n(pages.oldestReturnable)} of ${n(pages.pages)}.`,
  ],
  keyIdeas: [
    'In this model an allocation fails as fragmented when enough units are free in total but no single hole is big enough, which is different from being out of memory.',
    `The placement policy changes which holes survive: on the one seeded script the policies fail between ${n(script.fragmentedMin)} and ${n(script.fragmentedMax)} allocations as fragmented, while running out of memory is the same ${n(script.fullFailures.first)} for these four, and another seed can reorder them.`,
    'Size classes trade external fragmentation for internal waste: finer spacing wastes less and needs more classes.',
    'A page can go back to the operating system once none of its objects is live, so freeing a large share of the objects at random returns far fewer pages than that share.',
  ],
  quiz: [
    {
      q: 'An arena has 40 units free, in four holes of 10 units each. Can `alloc(16)` succeed?',
      options: [
        'No: no single hole is big enough, so it fails as fragmented although 40 units are free',
        'Yes: the allocator joins neighbouring holes on demand until the request fits, so the total decides',
        'Yes: 40 units are free and 16 is less than 40, so the request is certain to be served',
        'No: the arena is out of memory once its free space is split into holes, whatever their sizes',
      ],
      answer: 0,
      why: `A block has to fit in one hole. In this model the best a policy can do is the largest hole, 10 units, so the request fails as fragmented; the arena is not out of memory (${n(frag.free)} units are free in the lab example, with the largest hole ${n(frag.largest)}).`,
    },
    {
      q: 'You free 90% of a process\'s objects, picked at random. Why does the process\'s memory fall far less than 90%?',
      options: [
        'In this model a page goes back only when every object on it is free, and random freeing leaves a live object on many pages',
        'The operating system waits a fixed time before it takes freed memory back, so the drop is delayed',
        'Freed objects are kept by the allocator as a cache, so none of them is ever handed back',
        'Random frees damage the free list, so the allocator can no longer tell which pages are empty',
      ],
      answer: 0,
      why: `With ${n(pages.k)} objects a page, a page is empty when its ${n(pages.k)} objects are among the freed ones: ${n(pages.randomReturnable)} of ${n(pages.pages)} pages in the lab (${pages.randomShare} of the pages, so memory falls by well under the 90% freed), against ${n(pages.oldestReturnable)} when the oldest are freed first.`,
    },
    {
      q: 'Holes of 10, 4 and 6 units are free and `alloc(4)` arrives. Which hole does best fit use?',
      options: ['The 4-unit hole', 'The 10-unit hole', 'The 6-unit hole', 'None: it fails'],
      answer: 0,
      why: 'Best fit takes the smallest hole that fits, which is exactly 4 units here and leaves no remainder; first fit and worst fit would take the 10-unit hole.',
    },
    {
      q: 'The size classes are made finer, from powers of two to 25% spacing. What changes?',
      options: [
        'Less internal waste, but more classes to keep and more partly filled slabs',
        'More internal waste, but fewer classes to keep and fewer partly filled slabs to manage',
        'No change in waste, only a different set of names for the same classes of size',
        'Less external fragmentation, because the holes are then always exactly the right size for a request',
      ],
      answer: 0,
      why: `On the seeded requests, powers of two waste ${classes.pow2.waste} of the bytes handed out with ${n(classes.pow2.classes)} classes, and 25% spacing wastes ${classes.quarter.waste} with ${n(classes.quarter.classes)}.`,
    },
    {
      q: 'Two neighbouring blocks are both freed while coalescing is off. What is left?',
      options: [
        'Two separate holes that cannot together serve one request bigger than either',
        'One hole that is the size of both blocks, ready for a larger request to use at once',
        'Nothing: the allocator returns both blocks to the operating system straight away',
        'One hole, but only until the next allocation splits it again into two smaller holes',
      ],
      answer: 0,
      why: `Without coalescing the holes stay separate entries: in the lab, ${n(coalesce.off)} holes remain against ${n(coalesce.on)} with coalescing on, and the largest is ${n(coalesce.offLargest)} units.`,
    },
  ],
};

export default lesson;
