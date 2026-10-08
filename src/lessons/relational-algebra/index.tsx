import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Relational algebra is the maths under SQL: a few operators that each take whole relations (sets of rows) and return a new relation, so they nest into expressions like arithmetic.',
    what: 'A relation is a set of rows with named columns. σ (select) keeps the rows where a condition holds, π (project) keeps some columns and drops the duplicates that leaves, ⋈ (natural join) pairs rows that agree on their shared columns, × pairs every row with every row, ∪ and − combine two relations with the same columns, and ρ renames a column. SQL is built on these, with two big differences: its query results are bags (a table with a key is a set), so a plain SELECT keeps duplicates, and it has NULL, which gives comparisons a third answer, UNKNOWN.',
    analogy: 'A pipeline of spreadsheet steps where every step hands a whole new sheet to the next: "only these rows", "only these columns", "line these two sheets up by student id". Because each step outputs a sheet, you can plug any step into any other.',
    useCases: [
      'Reading EXPLAIN output: in Postgres, the Filter, Hash Join and Append nodes are algebra operators',
      'Writing "customers with no orders" correctly, with NOT EXISTS or EXCEPT instead of a NOT IN that a NULL breaks',
      'Spotting an accidental cross join that turns two small tables into millions of rows',
      'Knowing why DISTINCT and UNION cost a sort or a hash, while UNION ALL is cheap',
    ],
    why: 'Every SQL query you write is turned into a tree of these operators, and the database is free to rearrange that tree. Knowing the algebra explains why the order you write a query in is not the order it runs, why duplicates appear and disappear, and why NULL silently drops rows from reports. It builds on `sql-basics` and `sets-functions`.',
    watch: 'Build & run: the expression tree has a box per operator, base relations at the leaves on a darker fill. The operator running now is a solid yellow box, and the node picked for editing has a dashed yellow outline. A yellow "n rows" count appears under each node once its result is known; a node that can\'t run is red, with a red count and a red message under the tree. In the tables below, rows passing through an operator are tinted blue, rows filtered out or cancelled are grey and struck through, and rows a π or ∪ is about to merge flash violet before they disappear. A column ρ just renamed has a yellow header. Push σ down: the two plans in the same boxes and yellow counts (a toggle picks the right-hand plan: σ moved down alone, or also joining the small side first), then the intermediate-row totals, red for the larger and green for the smaller. SQL\'s NULL: each tested row is green with a TRUE chip, grey with a FALSE chip or orange with an UNKNOWN chip; NULL values are violet italics, and rows an outer join padded with NULL have a violet tint.',
  },
  tryThis: [
    'Load "students taught by Hopper", press play, and watch π merge the second Ada. Then switch Semantics to Bag and play it again.',
    'In "cross product explosion", pick the Courses leaf and swap it for Enrolments: × goes red over the shared sid. Pick Enrolments, wrap it in ρ (sid → sid2), and play.',
    'In Push σ down, play both plans and compare the counts under each node, then switch Right-hand plan to also join the small side first, and pick Knuth and Liskov.',
    "In SQL's NULL, the NOT IN query returns nobody: switch the sid NULL enrolment to Absent, then back, then switch Version to NOT EXISTS.",
    "In SQL's NULL, pick the outer join and compare filter in WHERE with filter in ON.",
  ],
  keyIdeas: [
    'Every operator takes relations and returns one, so σ, π, ⋈, ∪ and − nest into trees.',
    'The algebra uses sets; SQL uses bags: SELECT keeps duplicates unless DISTINCT, UNION and EXCEPT drop them unless ALL.',
    'Filtering one side of an inner join first gives the same answer, with smaller intermediates when the filter drops rows: optimisers rewrite your query this way.',
    'NULL makes comparisons UNKNOWN and WHERE drops UNKNOWN: beware = NULL, <> on a nullable column, and NOT IN.',
  ],
  quiz: [
    {
      q: 'SELECT name FROM Students NATURAL JOIN Enrolments lists Ada three times. Why?',
      options: [
        'SQL keeps duplicate rows unless you write DISTINCT',
        'The Students table stores three copies of Ada',
        'NATURAL JOIN repeats each row once per column',
        'Ada has three ids, so the join matches her three times',
      ],
      answer: 0,
      why: "Ada is enrolled on three courses, so the join makes three rows, and π name cuts each down to 'Ada'. The algebra would merge them; SQL's SELECT is a bag operation and keeps them until you say DISTINCT. Her row is stored once: the copies come from the join, not the table.",
    },
    {
      q: 'You write SELECT … FROM a JOIN b ON … WHERE b.x = 1. Must the database join everything before it filters?',
      options: [
        'No: it may filter b first, with the same result',
        'Yes: SQL runs clauses in the order they are written',
        'Yes: WHERE can only see rows once every join is done',
        'No, but filtering early changes which rows come back',
      ],
      answer: 0,
      why: 'σ on a column of b commutes with the inner join, so filtering b first gives exactly the same rows with smaller intermediates; optimisers do this rewrite all the time. SQL is declarative: the written order says what you want, not the steps (a filter on the null-filled side of an outer join is the exception, which is why ON and WHERE differ there).',
    },
    {
      q: 'Enrolments has one row with sid NULL. What does WHERE sid NOT IN (SELECT sid FROM Enrolments) return?',
      options: [
        'No rows: each test comes out FALSE or UNKNOWN',
        'Every student, since NULL matches nothing at all',
        'The students with no enrolment, as you would hope',
        'An error, since the subquery returned a NULL',
      ],
      answer: 0,
      why: 'NOT IN means sid <> each value AND … AND sid <> NULL. The last comparison is UNKNOWN, so for a student with no enrolment the whole test is UNKNOWN, and for an enrolled one it is FALSE. WHERE keeps only TRUE, so nothing survives. NOT EXISTS treats an UNKNOWN comparison as "no match" and returns the expected students.',
    },
    {
      q: 'Students has 5 rows and Courses has 4, with no column names in common. How many rows has Students × Courses?',
      options: ['20', '9', '5', '4'],
      answer: 0,
      why: '× pairs every row with every row: 5 × 4 = 20. Adding the row counts (9) is what ∪ would do if the columns matched. A join without a condition, or with one that always holds, is this same explosion.',
    },
    {
      q: 'A LEFT JOIN keeps every course, but adding WHERE e.sid = 1 drops the courses with no match. Why?',
      options: [
        'Their e.sid is NULL, so the test is UNKNOWN and fails',
        'WHERE runs first, before the LEFT JOIN has its turn',
        'A LEFT JOIN keeps unmatched rows only with no WHERE',
        'NULL = 1 is FALSE there, as it is for any other number',
      ],
      answer: 0,
      why: 'The unmatched courses come out of the LEFT JOIN with NULL in every Enrolments column, and NULL = 1 is UNKNOWN, not FALSE; WHERE drops both. Put the test in ON instead and it only decides which enrolments match, so the courses survive with NULL.',
    },
  ],
};

export default lesson;
