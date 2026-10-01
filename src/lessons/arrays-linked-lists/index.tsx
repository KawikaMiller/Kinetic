import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Arrays keep items side by side in one block of memory; linked lists scatter items anywhere and chain them together with pointers. That one difference decides which operations are cheap.",
    what: "An array's items sit in consecutive memory, so item i lives at base + i × size: one multiplication and you're there. The catch is that inserting or deleting in the middle means shifting everything after it. A linked list's nodes live wherever memory was free, each holding a pointer to the next. Reaching item i means walking i pointers, but once you're there, inserting or removing is just rewiring two pointers.",
    analogy: "An array is a row of numbered lockers: you can go straight to locker 7, but squeezing a new one in means everyone shuffles down. A linked list is a scavenger hunt: each clue tells you where the next one is hidden.",
    useCases: [
      "Arrays: nearly everything, from Python/JS lists to image pixels and database pages",
      "Linked lists: LRU caches, OS free-memory lists, undo histories",
      "Stacks, queues and deques, built on top of either one",
      "Knowing why ArrayList beats LinkedList in most real Java code",
    ],
    why: "These are the two basic ways to lay data out in memory, and almost every other structure (stacks, queues, hash tables, trees) is built from one or both. Knowing their costs is how you choose. CPUs love contiguous memory, which is why arrays usually win in practice even when Big-O calls it a tie.",
    watch: "The top strip is the array: contiguous slots, each labelled with its index and memory address. The bottom strip is memory for the linked list: nodes sit in scattered slots and violet arcs are their next pointers. Yellow = the slot or node being worked on, blue = a newly allocated node, green = written or found, red = being removed. A pointer being rewired flashes yellow. Compare the two step counters.",
  },
  tryThis: [
    'Access the End of both. The array does one address calculation; the list walks every node.',
    'Insert at the Front: every array element shuffles right, while the list rewires just two pointers.',
    'Insert at the End: now the array wins, because this list has no tail pointer and must walk to the end.',
    'Delete from the Middle: both pay O(n), for completely different reasons.',
  ],
  keyIdeas: [
    'Array access is O(1): address = base + index × item size.',
    'Array insert/delete near the front is O(n): everything after it has to shift.',
    'Linked-list access is O(n), but inserting or removing at a node you already hold is O(1).',
    'Contiguous memory is cache-friendly, so arrays usually win real benchmarks.',
  ],
  quiz: [
    {
      q: 'Why can an array jump straight to item 500?',
      options: [
        "Item i's address is base + i × size",
        'It keeps a cached index of every item',
        'It binary-searches its memory for item 500',
        'It follows a pointer from item to item',
      ],
      answer: 0,
      why: 'Contiguous layout turns "find item i" into one multiplication and one addition. Following pointers item to item is how a linked list does it, in O(n).',
    },
    {
      q: 'Inserting at the front of a 1,000-item array costs roughly…',
      options: ['1 step', '10 steps', '1,000 steps', '1,000,000 steps'],
      answer: 2,
      why: 'Every existing item has to shift one slot to the right to make room: O(n). One step is what a linked list pays.',
    },
    {
      q: 'Iterating an array is usually much faster than iterating a linked list of the same length because…',
      options: [
        'Array items sit together, so the CPU cache preloads them',
        'Arrays iterate in O(1) while lists take O(n)',
        'A linked list must be sorted before it can be read',
        "Each list node must be locked before it's read",
      ],
      answer: 0,
      why: "Both are O(n) to iterate, so it isn't a Big-O difference: the list jumps around memory and misses the cache, while the array streams through it.",
    },
  ],
};

export default lesson;
