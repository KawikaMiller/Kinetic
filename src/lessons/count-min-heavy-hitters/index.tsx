import type { LessonModule } from '../../core/types';
import { SMALL_WIDTH, breakFacts, gridFacts, heavyFacts, mergeFacts, sizeFacts } from './facts';
import { Stage } from './Stage';
import { pctText } from '../../core/format';

const grid = gridFacts();
const size = sizeFacts();
const heavy = heavyFacts();
const merge = mergeFacts();
const broken = breakFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A Count-Min sketch estimates how often each item occurred in a stream from a small fixed grid of counters: it can only overcount, by a bounded amount, which is enough to find the heaviest items without counting everything.',
    what: 'A Bloom filter says "seen it or not" and HyperLogLog counts distinct items; a Count-Min sketch answers "how many times?". Each item is hashed once per row of a d by w grid and adds one to its cell in each row, and its estimate is the smallest of those d cells. Collisions only add, so the estimate is never below the truth, and with w = ⌈e/ε⌉ and d = ⌈ln(1/δ)⌉ it is within ε times the stream length with probability 1 − δ. The sketch cannot list its items, so heavy hitters are found by keeping a few candidates beside it.',
    analogy: 'Several tally boards ruled differently: each item is ticked on one square of every board, and to ask "how many?" you read its squares and trust the smallest, since the others were inflated by items that share them.',
    useCases: [
      'Finding the most requested URLs, search terms or keys in a stream',
      'Spotting hot keys and heavy flows in database or network traffic',
      'Counting events across partitions or machines and merging the sketches',
      'Feeding caches and rate limits that need approximate frequencies in tiny memory',
    ],
    why: 'An exact count per item costs a counter for every distinct item ever seen. Knowing how a sketch trades memory for a bounded overcount lets you size one on purpose, and tells you which questions it answers well (the top items) and which it does not (rare items, exact counts).',
    watch:
      'The grid: yellow cells are the chosen item\'s cell in each row, the green ring marks the smallest of them (the estimate), a red tint marks a cell shared by several different items, and the table\'s green column is the exact Map. Size: blue dots are items within the limit, red dots are over the violet ε·N line. Heavy hitters: blue is a candidate, green a true top item, dim an evicted one. Merge: green is an estimate that matches, red a wrong merged one. Breaking it: red dots are over the line or below zero. Chips say what is simulated, a toy or from memory.',
  },
  tryThis: [
    `In "The grid", press "Stream 30 items" and click ${grid.word} in the table: its estimate is ${grid.estimate} against a true ${grid.truth}, and "Below the truth" reads ${grid.below}; ${grid.shared} cells are red because different items share them.`,
    `In "Size against error", the default width of ${size.normal.w} and depth of ${size.normal.d} give ε·N = ${Math.round(size.normal.limit)} and ${pctText(size.normal.share, 1)} of items over the line. Press the "ε = 0.05, δ = 0.05" chip: width ${size.chip.w}, depth ${size.chip.d}, ε·N = ${Math.round(size.chip.limit)}, and ${pctText(size.chip.share, 2)} of items are over it, against δ = ${pctText(size.chip.delta, 1)}.`,
    `In "Heavy hitters", all five true top items are candidates at the default width (recall ${pctText(heavy.atDefault, 0)}). Drag Width down to ${SMALL_WIDTH}: recall falls to ${pctText(heavy.atSmall, 0)}.`,
    `In "Merge partitions", the sum of the three sketches matches the sketch of everything in all ${merge.cells} cells. Switch Hash seeds to "Different per partition": ${merge.differing} of ${merge.cells} cells differ and ${merge.below} of the five biggest items are estimated below their true count.`,
    `In "Breaking it", switch Estimate by to "The mean": the worst overcount grows from ${Math.round(broken.minWorst)} to ${Math.round(broken.meanWorst)}. Switch it back and turn Deletes on: ${broken.under} items are undercounted, up from ${broken.underAtStart}.`,
  ],
  keyIdeas: [
    'Collisions only add, so in this model the minimum of an item\'s cells is never below its true count: the error is an overcount.',
    'Width sets the error bound ε·N and depth the chance δ of passing it, so in this model a wider sketch shrinks the bound and more rows shrink the failure chance exponentially.',
    'The bound is relative to the total N, so a sketch ranks heavy items well and says little about items rarer than ε·N; it cannot list its items, which is why candidates are kept beside it.',
    'In this model sketches with the same hash functions add cell by cell into the sketch of the combined stream, and sketches with different hashes cannot be merged.',
  ],
  quiz: [
    {
      q: 'In an insert-only stream, can a Count-Min sketch estimate an item below its true count, the way a Bloom filter can wrongly say "present"?',
      options: [
        'No: collisions only add to a cell, so the minimum of the item\'s cells is at or above its true count',
        'Yes: a collision can overwrite a cell, losing the counts of whichever item was written there first',
        'Yes: taking the minimum over d cells can drop below the truth whenever two of the rows disagree',
        'No: the sketch is exact for every item that has appeared more than once in the stream so far',
      ],
      answer: 0,
      why: 'Updates add to the item\'s cells, and other items add more on top. In this model the minimum can be too high but not too low.',
    },
    {
      q: 'What does making the sketch wider change about its guarantee?',
      options: [
        'It lowers ε = e / w, so the error bound ε·N shrinks; the chance of passing it depends on depth',
        'It lowers the chance δ of passing the bound, while the bound ε·N itself stays exactly where it was',
        'It makes every estimate exact once the width is larger than the number of distinct items seen',
        'It raises the error bound, because more columns give more cells for other items to inflate',
      ],
      answer: 0,
      why: 'Width is w = ⌈e/ε⌉, so a larger w means a smaller ε and a tighter bound. Depth is what drives δ down. A wide sketch can still collide, so it is not exact.',
    },
    {
      q: 'Why does a heavy-hitter finder keep a small set of candidates beside the sketch?',
      options: [
        'The sketch gives the count of any item you ask about but cannot list which items it has seen',
        'The sketch overcounts, and the candidate set strips that error out of the final top items it reports',
        'The grid is too small to hold counts for the biggest items, so they spill into the set',
        'Candidates make updates cheaper, because the sketch is read only when an item changes',
      ],
      answer: 0,
      why: 'Hashing throws the item away and keeps just counters, so there is nothing to enumerate. The candidate set remembers which items are worth asking about.',
    },
    {
      q: 'Three partitions each keep a sketch with different hash seeds, and their grids are added cell by cell. What results?',
      options: [
        'A wrong sum: a cell stands for different items in each grid, so estimates can fall below the truth',
        'The combined sketch exactly, because adding counters does not depend on which hash function chose the cell',
        'The combined sketch with a little extra overcount, as with any collision between two different items',
        'An error, because grids built from different seeds have different sizes and cannot be added at all',
      ],
      answer: 0,
      why: 'Cell (i, j) means "the items that hash to j under row i\'s function", which differs between seeds. Adding unlike cells mixes counts, so the same seeds are needed for a sum to be the combined sketch.',
    },
    {
      q: 'A sketch with w = 272 and d = 5 sees N = 20,000 items, so ε·N is about 200. What does that say?',
      options: [
        'An item is overcounted by at most about 200 with probability at least 99.3%; rare items can still be far off',
        'Every item is estimated within 200 of its true count, with certainty, whatever the stream looks like',
        'Only the 200 most popular items are counted accurately, and the rest are dropped by the sketch',
        'The sketch has about 200 counters left over after storing the counts of the heavy items',
      ],
      answer: 0,
      why: 'The theorem bounds the added error by ε·N with probability 1 − δ, here about 99.3%. An item that occurred 5 times can be estimated at 205, a huge relative error.',
    },
  ],
};

export default lesson;
