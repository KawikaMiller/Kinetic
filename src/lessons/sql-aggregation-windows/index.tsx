import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'GROUP BY collapses rows into one row per group and summarises each with an aggregate; a window function computes the same kinds of totals but keeps every row, looking at a frame of its neighbours.',
    what: 'WHERE filters single rows, then GROUP BY sorts what is left into groups, then aggregates (COUNT, SUM, AVG, MAX) turn each group into one row, then HAVING filters whole groups. Aggregates skip NULL, except COUNT(*), which counts rows. A window function such as SUM(amount) OVER (PARTITION BY region ORDER BY month) adds a column instead: PARTITION BY splits the rows like GROUP BY would, and the frame decides which rows of the partition each row adds up. With ORDER BY and no frame clause, the frame is RANGE up to the current row, so rows that tie on the ORDER BY share one total.',
    analogy: 'GROUP BY is counting the votes in each ballot box and keeping only the totals. A window function is writing, on every single ballot, how many votes had been counted in its box by the time it was read.',
    useCases: [
      'Dashboards and reports: revenue per region, signups per day, errors per service',
      'Running totals, moving averages and month-over-month change with SUM or AVG OVER',
      '"Top 3 per category" with ROW_NUMBER or RANK, and de-duplicating rows by keeping row 1',
      'Finding a query that silently undercounts because COUNT(col) skipped NULLs',
    ],
    why: 'Almost every report and analytics query is a GROUP BY or a window function, and the classic bugs are quiet ones: a filter in the wrong clause, a count that skips NULLs, a running total that jumps on tied dates, a "top N" that drops ties. Knowing the order WHERE → GROUP BY → HAVING runs in, and that a window keeps rows, is what makes these queries right the first time. It builds on `sql-basics` and `relational-algebra`.',
    watch: 'The SQL at the top lights the clause running now with a yellow bar; a line that is not valid SQL is red, with a red message below. GROUP BY: the sales table, NULL amounts in violet italics. Rows WHERE drops turn grey and struck through; then the rows regroup into buckets, each with a heading and an underline in its own hue (amber, pink, sky, orange, repeating past four), and the result table appears with one row per group in the same hue. Groups HAVING removes are struck through in grey, heading and result row too. Window frames: every row stays, each partition under a heading and underline in its hue (amber, pink, sky); the row being computed is yellow with a yellow edge, the rows in its frame violet with a violet edge, and the total column fills in row by row. Ranking: the same partition hues, and the RANK and DENSE_RANK of tied amounts in bold blue.',
  },
  tryThis: [
    'Play the WHERE vs HAVING preset and watch HAVING strike West out after grouping. Then switch Put it in to WHERE.',
    'Load COUNT(*) vs COUNT(amount), play to the end, then switch Aggregate to COUNT(*): which regions change, and by how much?',
    'Load the non-aggregated column preset and read the red line; then set GROUP BY to rep.',
    "In Window frames, play the default frame and stop on South's two 2026-02 rows; then switch to ROWS UNBOUNDED PRECEDING and look again.",
    'In Ranking, find the two tied South sales and compare RANK with DENSE_RANK on the row after them.',
  ],
  keyIdeas: [
    'WHERE filters rows before grouping; HAVING filters whole groups after, so only HAVING can test an aggregate.',
    'COUNT(*) counts rows; COUNT(col), SUM, AVG and MAX skip NULLs.',
    'A window function adds a column and keeps every row: PARTITION BY splits, the frame picks the neighbours.',
    'With ORDER BY, the default frame is RANGE: tied rows share a running total. Say ROWS to count physical rows.',
  ],
  quiz: [
    {
      q: 'How many rows does SELECT SUM(amount) OVER (PARTITION BY region) FROM sales return for the 16-row table?',
      options: ['16', '3', '1', '14'],
      answer: 0,
      why: 'A window function never collapses rows: each of the 16 gets its region\'s total in a new column. GROUP BY region would give 3 rows, and 14 is how many amounts are not NULL.',
    },
    {
      q: 'Why does WHERE SUM(amount) > 450 fail when HAVING SUM(amount) > 450 works?',
      options: [
        'WHERE runs on single rows, before any group exists',
        'WHERE only accepts columns listed in the SELECT',
        'SUM is not allowed anywhere in a grouped query',
        'HAVING is just the newer spelling of WHERE',
      ],
      answer: 0,
      why: 'The database runs WHERE, then GROUP BY, then HAVING. When WHERE runs there are no groups to sum yet, so aggregates are only allowed in HAVING (and SELECT). They are not interchangeable spellings: a test on a plain column works in both, but in WHERE it shrinks the input before grouping.',
    },
    {
      q: 'A group has 5 rows, and one of them has amount NULL. What are COUNT(*) and COUNT(amount)?',
      options: ['5 and 4', '5 and 5', '4 and 4', '4 and 5'],
      answer: 0,
      why: 'COUNT(*) counts rows, NULL or not: 5. COUNT(amount) counts the non-NULL values: 4. SUM and AVG skip the NULL the same way, so AVG divides by 4, not 5.',
    },
    {
      q: 'Amounts 200, 110, 90, 90, 60 are ranked highest first. What does RANK give the 60?',
      options: ['5', '4', '3', '6'],
      answer: 0,
      why: 'RANK gives the tied 90s both 3 and then skips, so the 60 is 5: one more than the number of rows above it. DENSE_RANK would give 4, and ROW_NUMBER 5 too, but without ever repeating a number.',
    },
    {
      q: 'In SUM(amount) OVER (ORDER BY month), two rows share March. What total does each March row show?',
      options: [
        'The same, including both March amounts',
        'A different one each, in the order they were read',
        'The total up to February, without March',
        'An error, since month is not unique',
      ],
      answer: 0,
      why: 'With ORDER BY and no frame clause the frame is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, and RANGE treats rows with an equal month as one step, so both see both. A different total each is what ROWS gives, and then only if the ORDER BY breaks the tie.',
    },
  ],
};

export default lesson;
