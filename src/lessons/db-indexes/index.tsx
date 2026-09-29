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
    watch: 'The tree at the top is the index: root, internal pages, then sorted leaves linked left to right. The boxes at the bottom are the table\'s heap pages on disk. Yellow is the page being read now, blue pages have already been read, green keys are matches, and a violet key is a newly inserted row. The dashed yellow line follows the leaf\'s pointer to the row\'s page. Compare the Page reads counter between Full table scan and Index lookup.',
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
      q: 'Why can a B+tree over a billion rows be only ~4 levels deep?',
      options: ['It stores only a sample of rows', 'Each page holds hundreds of keys, so each level multiplies reach by hundreds', 'It compresses the table', 'It keeps everything in RAM'],
      answer: 1,
      why: 'With ~200 keys per page, 4 levels reach 200⁴ = 1.6 billion keys. High fan-out keeps trees shallow.',
    },
    {
      q: 'What does adding an index cost you?',
      options: ['Nothing, indexes are free', 'Slower writes and extra storage', 'Slower reads on that column', 'It locks the table forever'],
      answer: 1,
      why: 'Each INSERT/UPDATE/DELETE must also update every index on the table, and each index is stored on disk.',
    },
    {
      q: 'Which query benefits from a B+tree index on created_at but not from a hash index?',
      options: ['WHERE created_at = \'2026-01-01\'', 'WHERE created_at > now() - interval \'7 days\'', 'Both equally', 'Neither'],
      answer: 1,
      why: 'Range conditions need sorted order. A B+tree walks its sorted leaves; a hash index can only answer exact matches.',
    },
  ],
};

export default lesson;
