import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A dynamic array occasionally copies everything to grow, but if it doubles its capacity each time, those copies add up to less than 2 per push, so push is O(1) amortized.',
    what: "A dynamic array (a JavaScript array, Python list, Java ArrayList or C++ vector) keeps its elements in one fixed-size block. When the block is full, a push allocates a bigger block, copies every element across and frees the old one. That one push is expensive, but amortized analysis looks at the total cost of a whole sequence of operations: with doubling, n pushes copy fewer than 2n elements in all, while growing by a fixed number of slots copies about n² / 20 for +10, which is O(n) per push.",
    analogy: 'Moving house when the family grows. If you buy a house twice as big each time, you move rarely, and the moving costs, spread over everyone who joined, stay small. If you only ever add one room, you are moving all the time.',
    useCases: [
      'Every growable list: JavaScript arrays, Python lists, Java ArrayList, C++ std::vector, Go slices',
      "A `hash-table` that doubles its buckets and rehashes when it gets too full",
      'String builders and byte buffers that grow while you append',
      'Explaining why one slow request in a log does not make the whole operation slow',
    ],
    why: "You append to arrays all day, and one day a profiler will show a single slow append. Amortized analysis is how you know whether that is fine (doubling) or a real O(n) problem (fixed-size growth, or shrinking at the wrong threshold). It builds on `big-o` and `arrays-linked-lists`, and interviewers ask it often.",
    watch: "The array is drawn as slots, 16 to a row: filled slots are blue, empty capacity is dim grey, and the slot being written (or, in the trap, cleared) is yellow and raised. During a resize the old block appears above the new one, and the elements copied so far are violet and raised in both. In the cost chart each push is a bar: green for a plain write (cost 1), red for a resize push (1 + the copies); the grey line is the running average and the dashed grey rule marks 3 per operation. In the total-writes plot 2× is a sky-blue line, 1.5× amber and +10 slots pink; the chosen policy is solid and thick, the others dashed, the dashed grey line is 3n, and a dashed yellow rule marks your current push count. The bank shows its coins as yellow dots (its stat is yellow, red when overdrawn, with red overdrawn text). In the trap, the copies stat is red once any copy happens and green while there are none. The legends use small square or line swatches in the same colours.",
  },
  tryThis: [
    'Press Push until the block is full, then once more: watch the new block appear, the violet copies, and the tall red bar.',
    'With 2×, press Push 8 more until you reach 48: the running average stays under 3 and the bank never empties.',
    'Switch Growth to +10 slots and push to 48: the bank goes overdrawn at push 42, and the pink total-writes curve bends upward.',
    'Try 1.5×: it resizes more often than 2×, and a 3-coin bank runs dry, yet the average still levels off.',
    'Pick Pop-shrink trap with ½ full, then ¼ full, and compare the copies after the fill.',
  ],
  keyIdeas: [
    'With doubling, n pushes copy fewer than 2n elements in total, so push is O(1) amortized even though one push can be O(n).',
    'Growing by a fixed k slots copies about n² / 2k elements in total: O(n) per push, however big k is.',
    'Potential method: with Φ = 2·size − capacity + 1, every doubling push costs exactly 3 amortized writes.',
    'Shrink at a quarter full, not a half: halving at half full can make every alternating push and pop copy.',
  ],
  quiz: [
    {
      q: 'A doubling dynamic array sometimes copies every element on a push. What is the cost of push, amortized over many pushes?',
      options: [
        'O(1) per push, because the rare big copies average out',
        'O(n) per push, because any one push can copy everything',
        'O(log n) per push, because there are log n resizes',
        'O(n²) in total, because each resize copies it all',
      ],
      answer: 0,
      why: "One push can cost n, but it only happens after about n/2 cheap pushes since the last resize. Across n pushes the copies add up to less than 2n, so the total is under 3n and each push is O(1) amortized. The O(n) option is the trap: it judges the whole sequence by its single worst step.",
    },
    {
      q: 'Starting from capacity 1 and doubling, how many element copies do 9 pushes cause in total?',
      options: ['15', '8', '36', '9'],
      answer: 0,
      why: 'Resizes happen when the 2nd, 3rd, 5th and 9th elements arrive, copying 1 + 2 + 4 + 8 = 15 elements. That is under 2 × 9 = 18, as the doubling bound promises. 36 is what copying everything on every push would cost.',
    },
    {
      q: 'Why does growing by +10 slots each time make push O(n) amortized?',
      options: [
        'Resizes still copy everything, but come every 10 pushes',
        'Adding 10 slots at a time wastes memory, and waste costs time',
        'Each resize copies only 10 elements, adding up slowly',
        'The array is searched for a free slot on every push',
      ],
      answer: 0,
      why: "A resize copies all the elements, and with a fixed step there is one every 10 pushes, so the copies add up to about n² / 20: 49,600 for 1,000 pushes. Copying only 10 elements per resize would be cheap, but that's not what a resize does: the whole block moves.",
    },
    {
      q: 'Why does shrinking to half capacity at half full thrash on alternating push and pop?',
      options: [
        'After a shrink the block is full, so the next push must grow',
        'Pops cost more than pushes, so the bank always runs out first',
        'Halving the capacity leaves no room for the popped element',
        'Each pop copies the array twice: once to shrink, once to grow',
      ],
      answer: 0,
      why: 'Shrinking a 16-slot block holding 8 leaves an 8-slot block holding 8: completely full. The next push must grow it again, the next pop shrinks it, and every operation copies 8 elements. A pop only ever triggers one copy, the shrink; the grow belongs to the next push.',
    },
    {
      q: 'With 1.5× growth (capacity rounded down), a bank of 3 coins per push goes negative. What does that tell you?',
      options: [
        'Push is still O(1) amortized, with a bigger constant',
        'Push becomes O(n) amortized, just like growing by +10',
        "The banker's method doesn't work below 2× growth",
        'The array must switch to doubling once it overdraws',
      ],
      answer: 0,
      why: "Any fixed growth factor above 1 keeps the copies proportional to n, so some constant deposit pays for them; this lesson's model finds 5 coins per push enough for 10,000 pushes at 1.5×. +10 is different: no fixed deposit ever keeps up. The banker's method works fine; 3 was just the wrong number for this factor.",
    },
  ],
};

export default lesson;
