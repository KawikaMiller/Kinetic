import { bytes, decimal } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { costs, encodingFacts, skipFacts, tiedQueries, vectorFacts } from './facts';
import { queryOf } from './layout';
import { Stage } from './Stage';
import { DEFAULT_THRESHOLD } from './zones';
import { BATCH_VALUES } from './vector';

const sum = costs('sum-price');
const point = costs('point');
const insert = costs('insert');
const tied = tiedQueries().map((q) => queryOf(q).label)[0];
const enc = encodingFacts();
const skip = skipFacts();
const vec = vectorFacts();
const small = vectorFacts(BATCH_VALUES);
const spill = vectorFacts(BATCH_VALUES + 1);
const n = (x: number) => x.toLocaleString('en-US');
const pages = (x: number) => `${x} ${x === 1 ? 'page' : 'pages'}`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A table can be laid out row by row or column by column. A column layout reads only the columns a scan needs and compresses far better, a row layout reads or writes a whole row in one place, and neither wins every query.',
    what: 'The same 16-row table is packed into 64-byte pages two ways: whole rows together, or each column on its own pages. A query lights the pages each layout must touch, counted in bytes (pages times page size) on both sides. Then columns are encoded (runs, a dictionary, deltas), whole row groups are skipped from their min and max, and a scan is counted in function calls per row against per batch.',
    analogy: 'A filing cabinet. Filing every customer as one folder makes pulling one customer easy, but adding up every customer\'s balance means opening every folder. Keeping one drawer per field (all the balances together) makes that sum one drawer, and looking up one customer means opening every drawer.',
    useCases: [
      'Reporting and dashboard queries that sum or average a few columns over millions of rows',
      'Deciding whether a table that is read whole and rewritten often belongs in a row-oriented store',
      'Reading why a sorted column compresses so much better than the same values in insert order',
      'Understanding how a file can skip a block of data without reading it',
    ],
    why: 'Storage layout decides how many bytes a query has to move, and moving bytes is where analytic queries spend their time. Knowing why a column layout wins scans and loses whole-row writes explains the split between operational and analytical databases.',
    watch:
      'Each page is a row of 4-byte fields, tinted one hue per field (id grey, country amber, product pink, qty blue, price orange). A page the query touches has a yellow rail with its size, solid cells are the fields it needs, and a page it never touches is dim; in a verdict the cheaper layout is green and the dearer red. In Encodings, runs and dictionary entries are tinted tokens, green is smaller than raw and red is bigger. In the zone-map scene a dim row group has a green tick and was never read. Chips say what is a toy, illustrative or from memory.',
  },
  tryThis: [
    `In "Same table, two layouts" the default query is SUM(price): the row store touches ${pages(sum.rowPages)} (${bytes(sum.rowBytes)}) and the column store ${pages(sum.colPages)} (${bytes(sum.colBytes)}), ${decimal(sum.ratio, 2)} times fewer bytes. Pick INSERT one row: the cheaper layout flips, to ${pages(insert.rowPages)} in the row store and ${pages(insert.colPages)} in the column store.`,
    `In "Where rows win" the default query is one whole row: ${pages(point.rowPages)} in the row store, ${pages(point.colPages)} in the column store. In the table below it, ${tied} is the query where the layouts tie.`,
    `In "Encodings" pick Run-length for country: it takes ${bytes(enc.unsorted)}, more than the ${bytes(enc.raw)} raw. Now set Sort rows to By country: the same encoding takes ${bytes(enc.sorted)}.`,
    `In "Skip what you can" the filter is qty > ${DEFAULT_THRESHOLD} on rows in insert order: ${skip.asIs.skippedGroups.length} row groups are skipped. Set Sort rows to By qty: ${skip.sorted.skippedGroups.length} are, and the sum stays ${skip.sorted.sum}.`,
    `In "Vectorised scans" summing ${n(vec.n)} values takes ${n(vec.perRow)} calls one row at a time and ${n(vec.perBatch)} per batch. Type ${n(small.n)} and the batch count is ${n(small.perBatch)}; type ${n(spill.n)} and it is ${n(spill.perBatch)}.`,
  ],
  keyIdeas: [
    'In this model a column layout touches fewer bytes for a scan of a few columns, a row layout touches fewer for a whole-row read or write, and a single-field update ties: neither layout wins every query.',
    'Sorting changes what a column compresses to: in this lesson a sorted column collapses into a few runs, so layout and encoding work together rather than as separate steps.',
    'A min and a max per row group let a reader skip a group without reading it, and in this model skipping leaves the answer unchanged when the rule tests the max against a greater-than filter.',
    'Doing the work a batch at a time cuts the number of function calls, which is the per-row overhead this lesson counts; actual speed depends on the engine and the CPU.',
  ],
  quiz: [
    {
      q: 'A query fetches every field of one customer by id. In this lesson\'s model, which layout touches fewer bytes?',
      options: [
        'The row store, because the whole row sits on one page while the column store reads one page per column',
        'The column store, because each of its pages is smaller than a row-store page',
        'The column store, because a column layout reads fewer bytes than a row layout for any query',
        'Neither, because a lookup by id touches the same number of bytes in either layout',
      ],
      answer: 0,
      why: 'The row store keeps the five fields of a row together, so one page holds the whole row. The column store keeps each field in its own place, so one row costs one page per column. Columnar is not just faster: it wins scans of few columns and loses whole-row reads.',
    },
    {
      q: 'A country column has 4 distinct values over 16 rows. Run-length encoding takes more bytes in insert order than sorted by country. What does that show?',
      options: [
        'Encoding depends on layout: sorting puts equal values side by side, so runs get long and few',
        'Run-length encoding is always a bad choice on a country column, whatever order the rows are in',
        'Sorting changes the values, so the sorted column has fewer distinct countries to store',
        'Compression is a separate final step, so the order of the rows has no effect on how well it works',
      ],
      answer: 0,
      why: 'Run-length encoding stores one entry per run of equal neighbours. In insert order the countries alternate, so nearly each row is its own run; sorted, equal countries sit together and a handful of runs covers the column. The order of rows is part of the layout and decides how well an encoding works.',
    },
    {
      q: 'A row group\'s zone map says its qty runs from 2 to 7, and the filter is qty > 8. What can the reader do?',
      options: [
        'Skip the group without reading it, because even its largest qty is not above 8',
        'Read the group anyway, because a minimum of 2 does not rule out a larger value inside',
        'Skip the group only after reading its column chunks, to check the zone map is right',
        'Read the group, because skipping only works when the filter tests the smallest value',
      ],
      answer: 0,
      why: 'The max of 7 is not above 8, so no row in the group can pass qty > 8. Testing the min instead would skip groups that do hold matching rows, which changes the answer.',
    },
    {
      q: 'A table has five columns. In this model, how many pages does a column store write to insert one row?',
      options: [
        'One page per column, so five, where the row store writes the one page that holds the row',
        'One page, because the new row is written together in a single place in either layout',
        'Five pages in the row store and one in the column store, since each column is stored whole',
        'None until a later step, because a column store must rebuild every column page before writing',
      ],
      answer: 0,
      why: 'A column store keeps each field of the new row in that field\'s own column, which is a different page for each column. The row store appends the row to one page. This is the cost side of the layout that makes scans cheap.',
    },
    {
      q: 'Why does a batch-at-a-time scan make fewer function calls than a row-at-a-time scan?',
      options: [
        'One call handles a whole batch, so the per-call overhead is paid per batch, not per row',
        'A batch skips the rows that fail the filter, so fewer values ever reach a function',
        'A batch always runs faster in seconds, so the engine can afford to make fewer calls',
        'A batch stores its values in compressed form, so a call has less data to handle',
      ],
      answer: 0,
      why: 'Calls drop from one per row to one per batch of values. The lesson counts calls and shows no timings, because the real speed depends on the engine and the CPU.',
    },
  ],
};

export default lesson;
