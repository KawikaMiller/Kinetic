import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An index is a separate, sorted structure (usually a B+tree) that lets the database jump straight to matching rows instead of reading the whole table.',
    what: 'Table rows live in pages on disk in no useful order, so without an index a query has to read every page (a full table scan). A B+tree index keeps the indexed column sorted in a shallow tree of pages: a lookup reads the root, a few internal pages, then a leaf that points at the row. Every page holds hundreds of keys, so even a billion-row table is only about four levels deep. The cost is on writes: every INSERT, UPDATE or DELETE must keep each index up to date too.',
    analogy: 'The index at the back of a textbook. Instead of reading all 600 pages to find "mutex", you look it up alphabetically and jump to page 212.',
    useCases: [
      'Primary keys and unique constraints (which are backed by indexes)',
      'Speeding up WHERE, JOIN and ORDER BY on hot columns',
      'Range queries: "orders from the last 7 days"',
      'Diagnosing slow queries with EXPLAIN: seq scan vs index scan',
    ],
    why: 'A missing index is the single most common reason a query that was fast in development takes seconds in production. Mid-level engineers are expected to read a query plan, add the right index, and know that each index makes writes slower and takes space.',
    watch: "The tree at the top is the index: root, internal pages, then sorted leaves linked left to right by dashed lines. The boxes at the bottom are the table's heap pages on disk. A yellow outline is the page being read now; blue outlines, edges and leaf links are pages and paths already read. Green ids are matches, and a violet id is the newly inserted row. The dashed yellow line follows the leaf's pointer to the row's page. The Page writes counter turns red once an insert writes. In the At scale panel, the red bar is the full scan and the green bar the index lookup, on a log scale. Compare the Page reads counter between Full table scan and Index lookup.",
  },
  tryThis: [
    'Run Full table scan, then Index lookup on the same table. Compare page reads.',
    'Run a Range query and watch the walk hop along the linked leaves.',
    'Insert rows until a leaf splits. Count the page writes for a single INSERT.',
    'Drag the At scale slider to a billion rows: millions of pages vs about five.',
  ],
  keyIdeas: [
    'No index means a full table scan: every page, every time, O(n).',
    'A B+tree lookup reads one page per level, and the tree stays shallow: O(log n).',
    'Leaves are sorted and linked, so range queries walk sideways cheaply.',
    'Every index must be updated on every write: faster reads, slower writes, more disk.',
  ],
  quiz: [
    {
      q: 'Why can a B+tree over a billion rows be only about four levels deep?',
      options: [
        'It indexes only a sample of the rows',
        'Each page holds hundreds of keys',
        'It compresses the whole table first',
        'It keeps every level in memory',
      ],
      answer: 1,
      why: 'With ~200 keys per page, each level multiplies the reach by 200: four levels reach 200⁴ = 1.6 billion keys. Keeping pages in memory makes each read faster, but it does not change how many levels there are.',
    },
    {
      q: 'What does adding an index cost you?',
      options: [
        'Nothing: indexes are free to keep',
        'Slower writes and extra disk space',
        'Slower reads on the indexed column',
        'A lock on the table while it exists',
      ],
      answer: 1,
      why: 'Each INSERT, UPDATE and DELETE must also update every index on the table, and each index is stored on disk. Reads on the indexed column get faster, not slower.',
    },
    {
      q: 'An orders table has an index on created_at. Which query can a B+tree index serve but a hash index cannot?',
      options: [
        "WHERE created_at = '2026-01-01'",
        "WHERE created_at >= '2026-01-01'",
        "WHERE id = 42 AND status = 'paid'",
        "WHERE lower(email) = 'a@b.co'",
      ],
      answer: 1,
      why: 'Range conditions need sorted order: a B+tree walks its sorted leaves, a hash index can only answer exact matches. The equality on created_at suits both kinds of index, and the last two queries do not touch created_at at all.',
    },
    {
      q: "In this lesson's tree, an INSERT lands in a full leaf whose parent has room. How many page writes does the index part cost?",
      options: ['1', '2', '3', '5'],
      answer: 2,
      why: "Both halves of the split leaf, plus the parent that gains a separator: 3. Add the row's own heap page and the INSERT costs 4 writes, which is why every extra index makes writes slower.",
    },
  ],
};

export default lesson;
