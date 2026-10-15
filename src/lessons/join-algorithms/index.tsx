import type { LessonModule } from '../../core/types';
import { SHORT_LABEL, cheapestAndDearest, costTable, hashJoin, mergeJoin, nestedLoop } from './join';
import { DEFAULT_SPEC, makeTables } from './tables';
import { Stage } from './Stage';

/** The numbers the try-this entries quote, all from the model on the default tables (8 customers, 12 orders). */
const T = makeTables(DEFAULT_SPEC);
const SPILL_MEMORY = 3;
const nested = nestedLoop(T, 'eq', false);
const indexed = nestedLoop(T, 'eq', true);
const hashed = hashJoin(T, SPILL_MEMORY);
const mergeSort = mergeJoin(T, false);
const mergePre = mergeJoin(T, true);
const costs = costTable(T, 'eq');
const { cheapest } = cheapestAndDearest(costs);
const oneRows = costTable(makeTables({ ...DEFAULT_SPEC, oneCustomer: true }), 'eq');
const unit = (id: string, rows = costs) => rows.find((r) => r.id === id)!.cost!;
const cheapestNames = cheapest.map((id) => SHORT_LABEL[id]).join(' and ');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A join can run three ways: a nested loop, a hash join or a merge join. They return the same rows and differ in cost, and which is cheapest depends on the sizes, the keys, the indexes and the join condition.',
    what: 'To join two tables the engine must match rows on a key. A nested loop takes each outer row and looks through the inner table for matches, with a full scan or an index probe. A hash join builds a hash table from the smaller side and probes it with the other, and when the build side outgrows memory it splits both sides into batches and spills the rest to disk. A merge join sorts both sides on the key, unless an index already supplies the order, and walks them with two pointers. Hash and merge need an equality; a nested loop will take any condition. This lesson counts the work of each in one unit on small tables you can edit.',
    analogy: 'Matching name tags to guests. Checking every tag against every guest is the nested loop; with an alphabetical guest list you jump straight to the right name (the index). Hashing is dropping tags into labelled bins and checking each guest against one bin. Merging is sorting both piles and walking down them side by side.',
    useCases: [
      'Reading a query plan and knowing what a Hash Join, Merge Join or Nested Loop node is doing',
      'Deciding whether an index on a join column will help or never be used',
      'Explaining why a join slowed down when one table outgrew memory',
      'Knowing why a join on an inequality or a function of a column cannot use a hash',
    ],
    why: 'Join order and join method decide most of a slow query\'s time. A senior engineer is expected to look at a plan, say why the planner chose a hash join here and a nested loop there, and know what changes the answer: table sizes, the index on the inner key, available memory, and whether the condition is an equality.',
    watch:
      'Each table is a grid with a coloured rail beside the rows the algorithm is touching. In the nested loop the outer row is yellow, the inner row being compared blue, a match green and a row with no match grey. In the hash join the blue rows are in the hash table, the yellow row is probing, a violet outline marks the bucket just touched and an orange rail marks a row spilled to disk. In the merge join the strips show the sorted keys with an outer and an inner pointer; grey rows have been passed, green rows were emitted and a violet note says the inner pointer rewound. A sky ring marks the key you are editing. In the cost table the cheapest row is green, the dearest red and a row that cannot run this join grey. The chips say what is a toy and what is shown without being run.',
  },
  tryThis: [
    `In "Nested loop" (8 customers, 12 orders) the plain loop makes ${nested.work} comparisons. Switch the inner key to "index": the same ${nested.pairs.length} pairs cost ${indexed.work} node visits.`,
    `In "Hash join" the default memory fits the 8-row build side and nothing spills. Move the memory slider to ${SPILL_MEMORY} rows: ${hashed.rowsSpilled} rows are spilled in ${hashed.batches} batches, and the hash operations stay at ${hashed.work}.`,
    `In "Merge join" (inputs need sorting) the join costs ${mergeSort.work} comparisons, ${mergeSort.sortComparisons} of them sorting. Switch to "already sorted" and it costs ${mergePre.work}.`,
    `In "Which one, and when none" the cheapest on the default tables is ${cheapestNames} at ${unit(cheapest[0])} units and the nested loop is the dearest at ${unit('nested')}. Switch the condition to a.key < b.key: hash and merge are refused.`,
    `In "Which one, and when none" switch the outer table to one customer: the index nested loop costs ${unit('indexNested', oneRows)} units and the hash join ${unit('hash', oneRows)}.`,
  ],
  keyIdeas: [
    'In this model the nested loop, the hash join and the merge join return the same rows and differ only in the work they do.',
    'In this lesson a hash or merge join needs an equality condition; the nested loop is the one method that takes a range or any other test.',
    'A tiny outer table with an index on the inner key makes the nested loop cheapest in this model, so "hash join is fastest" is a tendency, not a rule.',
    'When the build side outgrows memory a hash join splits both sides by key and spills; the rows it spills are extra I/O on top of the hash operations.',
  ],
  quiz: [
    {
      q: 'The outer table has one row and the inner table is large, with an index on its join key. Which algorithm is cheapest?',
      options: [
        'A nested loop that probes the index once for the one outer row',
        'A hash join, since building a hash table is always the fastest way to match rows',
        'A merge join, because sorting a large inner table costs less than one probe',
        'A hash join, because the planner prefers it for any join over a million rows',
      ],
      answer: 0,
      why: 'One probe of the index costs a few node visits, far below hashing or sorting the large table. A hash join is a good default for large equality joins, not a law.',
    },
    {
      q: 'A query joins on a.x < b.y. Which join algorithms can run it?',
      options: [
        'Only a nested loop: hash and merge joins can only find rows with equal keys',
        'A hash join, by putting the rows in order of their hash value first',
        'A merge join, because sorted inputs make any comparison cheap to check',
        'Any of the three, since the condition is checked after the rows are found',
      ],
      answer: 0,
      why: 'A hash lookup finds rows with the same key and a sorted run is only useful for equal keys, so in this model neither can answer an inequality. The nested loop tests the condition on each pair.',
    },
    {
      q: 'A hash join\'s build side does not fit in memory. What does the engine do in this model?',
      options: [
        'It splits both sides into batches by key, joins batch 0 now and writes the rest out to read back',
        'It stops with an out-of-memory error, and the query has to be rewritten with a smaller join',
        'It switches to a nested loop for the rest of the join, whatever the sizes of the two tables',
        'It keeps building the one table past the memory limit, letting the operating system swap it to disk',
      ],
      answer: 0,
      why: 'Rows with the same key land in the same batch on both sides, so each batch can be joined on its own. The spilled rows are written and read back, which is the extra cost the memory limit adds.',
    },
    {
      q: 'An index already supplies the order of both inputs to a merge join. Which part of its cost goes away?',
      options: [
        'The sort of both sides: only the single pass over the two sorted inputs is left',
        'The pass over both inputs, because an index already holds the pairs that match',
        'The hash table, since a merge join builds one from the rows once they are sorted',
        'The key comparisons, because rows that arrive in order never have to be compared',
      ],
      answer: 0,
      why: `Sorting is the bulk of a merge join's cost: on the default tables ${mergeSort.sortComparisons} of its ${mergeSort.work} units. With the order supplied it drops to ${mergePre.work}, which is still a little more than the hash join's ${unit('hash')}: the order saves the sort, it does not make merge beat hash.`,
    },
    {
      q: 'The customers table has a NULL key on one row and the orders table has a NULL key on another. Does an equality join pair them?',
      options: [
        'No: a comparison with NULL is never true, so a NULL key matches nothing',
        'Yes: two NULLs are equal, so the engine pairs the rows with no other match',
        'Yes, but only in a hash join, because NULL hashes to bucket 0',
        'No, but only in a merge join, because NULLs sort to the end of the input',
      ],
      answer: 0,
      why: 'In SQL a NULL is "unknown", so NULL = NULL is not true. The three algorithms leave out NULL-key rows before any match, and the lesson tests that against a brute-force join.',
    },
  ],
};

export default lesson;
