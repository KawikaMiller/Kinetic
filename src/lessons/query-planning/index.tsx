import type { LessonModule } from '../../core/types';
import { pctText, sig } from '../../core/format';
import { DEFAULT_COSTS, FAST_STORAGE_RANDOM_PAGE_COST, crossoverRows, indexScanCost, seqScanCost } from './model';
import { initialControls, scenePlan } from './scenes';
import { ORDERS } from './table';
import { Stage } from './Stage';

const COST_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
const money = (x: number): string => x.toLocaleString('en-US', COST_FORMAT);
const seq = seqScanCost(ORDERS, DEFAULT_COSTS);
const indexTen = indexScanCost(ORDERS, 10, DEFAULT_COSTS);
const crossSlow = crossoverRows(ORDERS, DEFAULT_COSTS)!;
const crossFast = crossoverRows(ORDERS, { ...DEFAULT_COSTS, randomPage: FAST_STORAGE_RANDOM_PAGE_COST })!;
/** The "Sort elimination" scene's default plan: no index, so Limit over Sort over a seq scan. */
const sortScene = scenePlan('sort', initialControls('sort'));
const SORT_TEN_ROWS = sortScene.candidates[sortScene.chosen].total;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A query planner costs every way it could run a query, using statistics about the data, and runs the cheapest. An index is one candidate among several, and a plan is an estimate until it runs.',
    what: `You write what you want, not how to get it. The planner turns the SQL into a tree of steps (scan a table, sort, limit), puts a cost on each step from page counts and row estimates, and picks the tree with the lowest total. An index scan reads few pages when few rows match, so it wins for selective filters; when a large share of the table matches, reading every page in order is cheaper, and the planner switches. The estimates come from statistics: when they are out of date the planner can be wrong by a large factor and choose a worse plan. This lesson runs a toy planner on a toy table of ${ORDERS.rows.toLocaleString('en-US')} rows; the cost formulas are simplified and the numbers are not PostgreSQL's.`,
    analogy: 'Planning a delivery round. Visiting ten houses scattered across town is quickest by going to each one (an index), but if you have to call on most of the street, driving down it once in order is faster than zig-zagging. The planner guesses which case you are in from a census it took earlier, and if the census is old it can pick the wrong round.',
    useCases: [
      'Reading EXPLAIN output to find out why a query is slow',
      'Deciding which index to add, and which one a query will never use',
      'Spotting stale statistics after a bulk load or a big delete',
      'Explaining why a query that was fast on small data got slow as the table grew',
    ],
    why: 'Most slow-query work is a conversation with the planner. Seniors are expected to read a plan, know that it is an estimate, tell an estimate from what ran, and know which of three levers to pull: an index, fresher statistics, or a rewritten query. "Add an index" is not an answer on its own.',
    watch:
      'A plan is a column of boxes, the step that runs last at the top. A blue outline is an index scan and an orange one a Sort (a costly step, not an error); with EXPLAIN ANALYZE a red outline means the estimated rows are far from the actual rows, with the ratio written. A yellow ring marks the node whose cost is being worked out (click a node); a dashed grey box is a candidate the planner rejected. In the candidate table the green row is the chosen plan and the dim rows lost. In the crossover plot the blue curve is the index scan, the flat grey line the seq scan, the violet line where they cross and the yellow line is yours to drag; a green dot is the cheaper plan there and a red dot the dearer. The chips say what is a toy, what is shown without being run and what is from memory.',
  },
  tryThis: [
    `In "SQL becomes a tree" (customer 4242, an index on customer_id), switch EXPLAIN to ANALYZE: the Index Scan reads 10 rows against an estimate of 10, and costs ${money(indexTen)}.`,
    `In "Indexes and statistics" (the customer query, no index) switch on the customer_id index: the Seq Scan at ${money(seq)} loses to an Index Scan at ${money(indexTen)}, ${sig(seq / indexTen, 3)} times cheaper.`,
    `In "The crossover" the lines cross at ${crossSlow.toLocaleString('en-US')} rows (${pctText(crossSlow / ORDERS.rows, 2)} of the table). Press "1.1 (fast storage)" and they cross at ${crossFast.toLocaleString('en-US')} rows (${pctText(crossFast / ORDERS.rows, 1)}).`,
    'In "Misestimates" (status refunded, an index on status) the planner uses the index. Switch the statistics to stale: it now thinks 25,000 rows match against 500 in the data, off by 50 times, and picks the seq scan.',
    `In "Sort elimination" (customer 4242, newest 10, no index) the plan is Limit, Sort, Seq Scan at ${money(SORT_TEN_ROWS)}. Switch on the (customer_id, created_at) index: the Sort disappears and the cost falls to ${money(indexTen)}.`,
  ],
  keyIdeas: [
    'In this model the planner costs every candidate plan and runs the cheapest, so an index is a candidate and never an instruction.',
    `The index scan wins while few rows match; past the crossover (${crossSlow.toLocaleString('en-US')} rows here, ${crossFast.toLocaleString('en-US')} at random_page_cost ${FAST_STORAGE_RANDOM_PAGE_COST}) reading the table in order is cheaper.`,
    'An EXPLAIN plan is an estimate until ANALYZE runs it, and stale statistics can put the estimate off by 50 times in this lesson (25,000 rows against 500).',
    'An index on the filter column and then the sort column lets the planner skip a Sort; an index on any other column does not.',
  ],
  quiz: [
    {
      q: 'A query returns 40% of a large table and there is an index on its filter column. What does the planner do?',
      options: [
        'It chooses a seq scan: fetching that share of rows page by page at random costs more than reading in order',
        'It uses the index, because an index on the filter column is taken whenever one exists on that column',
        'It uses the index, because index scans read fewer pages than a seq scan whatever share of rows match',
        'It chooses a seq scan, because the planner ignores every index on any table that holds over a thousand rows',
      ],
      answer: 0,
      why: 'The planner compares costs. Past the crossover an index scan fetches nearly the whole table anyway, at the random-page price, so reading the table in order costs less. An index is a candidate, not an instruction.',
    },
    {
      q: 'EXPLAIN, with no ANALYZE, prints rows=500 on a scan node. What is that number?',
      options: [
        'The planner\'s estimate from its statistics: only ANALYZE runs the query and shows actual rows',
        'The number of rows this same query returned the last time anyone ran it on the table',
        'The exact count of rows in the table that match the filter at this moment in time',
        'A row limit the planner applied so that the scan would not read too many pages',
      ],
      answer: 0,
      why: 'Plain EXPLAIN does not run the query, so each row count in it comes from statistics. Running it with ANALYZE adds the actual counts, and a big gap between the two is the sign of a bad estimate.',
    },
    {
      q: 'After a bulk load, a lookup of a rare status uses a seq scan even though an index exists on status. What is the likely cause?',
      options: [
        'Stale statistics: the planner thinks the value is common, so refreshing them (ANALYZE) can change the plan',
        'The index is corrupt, so the planner skips it and the index has to be rebuilt before it helps',
        'Indexes stop working after a bulk load, and only a full server restart switches them back on',
        'A seq scan is chosen on any table that holds more than a few thousand rows, whatever the query asks',
      ],
      answer: 0,
      why: 'In this lesson the stale statistics believe each status holds a quarter of the table, so a lookup of the rare status looks like a 25,000-row fetch and loses to the seq scan. Fresh statistics see 500 rows.',
    },
    {
      q: 'Which index lets the planner skip the Sort in WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10?',
      options: [
        'An index on customer_id alone, since it already finds every row of that customer',
        'A composite index on (customer_id, created_at), with the filter column first',
        'An index on status, because it narrows the rows before any sort happens',
        'An index on total, because a smaller value sorts ahead of a larger one',
      ],
      answer: 1,
      why: 'With customer_id first, one customer\'s entries sit together, and with created_at second they are in date order, so the planner reads them backwards and stops after ten. An index on customer_id alone finds the rows but leaves them in no date order.',
    },
    {
      q: 'The team moves to fast SSDs and lowers random_page_cost from 4.0 to 1.1. In this model, what happens to the crossover?',
      options: [
        'It moves right: the index stays cheaper for far more rows (813 to 76,447 here)',
        'It moves left: index scans start losing to the seq scan at fewer rows than before',
        'It stays put, because random_page_cost only changes the cost of the seq scan',
        'It disappears, because a cheaper random page lets the seq scan win at any row count',
      ],
      answer: 0,
      why: 'A random page costs less, so each page an index scan fetches costs less, and the index scan stays under the flat seq-scan cost until many more rows match. The seq scan cost does not use random_page_cost.',
    },
  ],
};

export default lesson;
