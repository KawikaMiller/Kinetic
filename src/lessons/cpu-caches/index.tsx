import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The CPU normally fetches a whole cache line from RAM (64 bytes on most CPUs), not one int, so code that uses neighbouring data runs far faster than code that jumps around.',
    what: 'A cache is a small, fast copy of recently used memory, organised in lines (64 bytes on most CPUs). An address splits into an offset inside the line, a set index that picks which set the line may live in, and a tag that says which line it is. Each set holds a few lines (its ways); when a set is full, the least recently used line is evicted. A miss is compulsory the first time a line is touched, capacity when the data in use is bigger than the whole cache, and conflict when it would fit but too many lines map to the same set.',
    analogy: 'Fetching a whole shelf from the library when you ask for one book. If your next book is on the same shelf it\'s instant; if every book you want is on a different floor, the trolley never helps.',
    useCases: [
      'Why looping over a 2D array row by row in C, Java or NumPy beats going column by column',
      'Struct of arrays in game engines and databases: only the fields a loop needs travel through the cache',
      'Power-of-two matrix sizes that suddenly run slower (conflict misses), fixed by padding',
      'Reading "L1 miss" and "cache-miss" counters in perf, VTune or Instruments',
    ],
    why: 'Two loops that do the same arithmetic can differ several times over in speed just because of the order they touch memory. Knowing about lines, sets and the three kinds of miss is how you read a profiler\'s cache counters and fix the loop. It builds on `memory-hierarchy` (how slow RAM is), `arrays-linked-lists` (contiguous layout) and `binary-hex` (the address bits).',
    watch: 'Top left: the loop in C, with the line doing the read in yellow. Top right: the address being read, bit by bit: tag bits blue, set bits violet, offset bits grey; a 1 is a filled bit, a 0 an outlined one. Middle left: memory, one square per 4-byte int, each row labelled with its address. The yellow square is the int being read, the blue-tinted squares are the rest of its cache line, blue-outlined squares belong to other lines in the cache right now, and dark grey squares were read earlier but have been evicted. In the struct layouts, the letters name each int\'s field. Middle right: the cache, one row per set and one column per way, each showing the line it holds, with the way LRU would evict next (or the empty way it fills next) beside each set. The way just used is green on a hit and red on a miss; the other ways of the same set are violet. An orange struck-out address under it is the line just evicted.',
  },
  tryThis: [
    'On "16 × 16", run Row-wise, then Column-wise: same 256 reads, a 94% hit rate against 0%.',
    'On "8 × 8", compare both loop orders: why does the order hardly matter for an array this small?',
    'On "Rows 64 ints apart", go Column-wise and watch every row land in set 0: after the first column, every miss is a conflict miss.',
    'On "Structs", compare Array of structs with Struct of arrays: count the lines that hold an x.',
  ],
  keyIdeas: [
    'Memory moves in 64-byte lines: touching one byte brings its neighbours along.',
    'Walk memory in the order it\'s laid out; a stride that skips lines wastes the rest of each one.',
    'Misses are compulsory (first touch), capacity (too much data) or conflict (one set overloaded).',
    'Keep the data a hot loop needs together, even if that means splitting your structs.',
  ],
  quiz: [
    {
      q: 'Two loops read the same 256 ints of `int a[16][16]`, one row-wise and one column-wise. What happens?',
      options: [
        'Row-wise uses all 16 ints of every line it loads',
        'Both cost the same, since the work done is identical',
        'Column-wise is faster: it touches fewer of the lines',
        'Neither uses the cache, as arrays skip the L1',
      ],
      answer: 0,
      why: 'Memory arrives a line at a time. Row-wise, one miss brings in 16 ints that the next 15 reads use. Column-wise, each read lands on a different line, and with 16 lines in play and 8 in the cache, every one misses. Same work, very different cost.',
    },
    {
      q: 'With 64-byte lines and 4 sets, which bits of an address pick the set?',
      options: ['Bits 6 and 7, just above the offset', 'The lowest 2 bits of the address', 'The top 2 bits of the address', 'Bits 4 and 5, above a 4-bit offset'],
      answer: 0,
      why: 'A 64-byte line needs 6 offset bits (0 to 5). The next log₂ 4 = 2 bits, 6 and 7, choose the set, and everything above is the tag.',
    },
    {
      q: 'The rows of `int a[8][64]` are 256 bytes apart. A column-wise walk over its first 8 columns misses every time. Why?',
      options: [
        'Every row starts in the same set, which has only 2 ways',
        'The 8 lines it uses are more than this cache can ever hold',
        'Column-wise loops can never be helped by a cache at all',
        'Each int is placed in a cache line of its very own here',
      ],
      answer: 0,
      why: 'Only 8 lines are in use and the cache holds 8, so this isn\'t a capacity problem. 256 bytes is a multiple of 4 sets × 64 bytes, so every row maps to set 0 and they keep evicting each other: conflict misses. Padding the rows fixes it.',
    },
    {
      q: 'A loop sums only `.x` over 32 structs `{ int x, y, z, w; }`. Why does a struct of arrays help?',
      options: [
        'The xs sit together, so every line brought in is all xs',
        'It makes each struct smaller, so more of them fit in cache',
        'The compiler can skip loading the y, z and w fields',
        'Struct of arrays turns every load into a cache hit',
      ],
      answer: 0,
      why: 'In an array of structs, each 64-byte line holds 4 xs and 12 ints the loop never reads: 8 lines for 32 xs. With the xs in their own array, 2 lines hold all 32. The first touch of each line still misses.',
    },
    {
      q: 'Row-wise over `int a[16][16]`, with 64-byte lines starting empty: how many of the 256 reads miss?',
      options: ['16 misses', '256 misses', '4 misses', '64 misses'],
      answer: 0,
      why: 'Each row is 16 ints × 4 bytes = 64 bytes, exactly one line. The first read of each row misses and loads the line; the other 15 hit. 16 rows, 16 misses.',
    },
  ],
};

export default lesson;
