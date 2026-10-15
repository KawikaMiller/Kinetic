import type { LessonModule } from '../../core/types';
import { sig } from '../../core/format';
import { STRATEGIES, differences, initState, seededWorld, write, type Config } from './shop';
import { RATIO, STALENESS_REFRESH, WORKLOAD_CONFIG, WORLD_SEED, crossover, readFormula, workloadTotal, writeFormula } from './workload';
import { Stage } from './Stage';

/** The numbers the try-this entries quote, all from the engine on the seeded shop. */
const BASE = seededWorld(WORLD_SEED);
const label = (id: string) => STRATEGIES.find((s) => s.value === id)!.label;
const cheapestAt = (ratio: number) => STRATEGIES.map((s) => ({ s, t: workloadTotal(s.value, WORKLOAD_CONFIG, ratio).total })).reduce((a, b) => (b.t < a.t ? b : a)).s.value;
const CROSS = crossover('incremental', 'live', WORKLOAD_CONFIG, BASE)!;
const LOW = RATIO.min;
const HIGH = RATIO.max;
const staleCfg: Config = { refreshEvery: STALENESS_REFRESH.initial, fix: 'none' };
const productId = BASE.items[0].productId;
const staleAfter = write('full', staleCfg, initState('full', BASE), { kind: 'rename', productId, name: 'Renamed' });
const staleRow = differences('full', staleCfg, staleAfter.state)[0].what;
const copies = BASE.items.filter((i) => i.productId === productId).length;
const fixCost = writeFormula('copy', { ...staleCfg, fix: 'update' }, { items: BASE.items.length, copies }, 'rename');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When a normalised schema is too slow to read, you can precompute the answer: a materialized view, one kept up to date on every write, or a copy of a value stored where it is read. Each trades slower or riskier writes for cheaper reads.',
    what: 'A dashboard asks for revenue per customer and units per product. A live join computes it from the base tables on every read. A materialized view stores the result, and it is either rebuilt in full every so often (cheap to keep, stale in between) or maintained incrementally (every write also updates the aggregate rows it affects). A denormalised copy stores a value, such as the product name, inside each row that needs it, so reads skip the join; renaming the product then leaves old names behind unless every copy is updated. The lesson counts rows touched, reads plus writes, and the best choice depends on how many reads each write has to serve.',
    analogy: 'A restaurant that tallies the day\'s takings. Adding up every receipt whenever the owner asks is accurate and slow. A running total on the till is quick to read, and every sale has to remember to update it. A tally written up once an evening is cheap, and wrong for the rest of the day.',
    useCases: [
      'Choosing between a live query, a materialized view and a cache for a slow dashboard',
      'Finding out why a report shows an old product or customer name',
      'Deciding how often a materialized view should refresh, and what staleness is acceptable',
      'Reviewing a trigger that maintains a summary table, and what happens when it has a bug',
    ],
    why: 'Every denormalisation is a decision to pay on write what you save on read, and to own the consistency yourself. Seniors are expected to price both sides, say how stale an answer is allowed to be, and recognise the update anomaly before it reaches a customer-facing report.',
    watch:
      'The two tables are the dashboard: revenue per customer and units per product. A green row is a live answer, a blue row is read from precomputed data, a red row differs from the live query and says what the live value is, and a yellow row is the one the last write changed. A violet note says the view was just rebuilt, and a violet line in the plot is where the incremental view starts to beat the live join. In the totals table the cheapest strategy is green and the dearest red. The curves are the cost of a write and its reads for each strategy. The chips say what is a toy and what is seeded or from memory.',
  },
  tryThis: [
    `Press "Read the dashboard" on the live join: it touches ${readFormula('live', WORKLOAD_CONFIG, BASE)} rows, a scan of ${BASE.items.length} items, ${BASE.orders.length} orders and ${BASE.products.length} products.`,
    `Switch the read strategy to "View, incremental" and press "Read the dashboard": ${readFormula('incremental', WORKLOAD_CONFIG, BASE)} rows. Then press "Place an order": it touches ${writeFormula('incremental', WORKLOAD_CONFIG, { items: BASE.items.length, copies: 0 }, 'place')} rows, against ${writeFormula('live', WORKLOAD_CONFIG, { items: BASE.items.length, copies: 0 }, 'place')} on the live join.`,
    `Drag "Reads per write" to its left end (${sig(LOW, 2)}): ${label(cheapestAt(LOW))} is the cheapest. Drag it to the right end (${sig(HIGH, 3)}): ${label(cheapestAt(HIGH))} is.`,
    `In "Staleness" press "Rename a product": the view is 1 write behind and differs from the live query, on the row "${staleRow}".`,
    `In "The update anomaly" press "Rename a product": ${copies} ${copies === 1 ? 'copy has' : 'copies have'} an old name and the dashboard shows two names for one product. Switch the fix to "update every copy" and press it again: the rename then touches ${fixCost} rows.`,
  ],
  keyIdeas: [
    'In this model a materialized view is as old as its last refresh, and the lesson reads off the rows that differ from the live query.',
    'In this model an incremental view stays equal to a full recomputation while its write rules are right; a forgotten refund rule drifts without any error.',
    'A denormalised copy leaves old values behind when the source changes, unless every copy is updated or the value is recomputed on read.',
    'Which strategy touches the fewest rows depends on reads per write: the live join wins when writes dominate, and a view wins as reads grow.',
  ],
  quiz: [
    {
      q: 'A report reads a materialized view that is refreshed every night. At noon a product is renamed. What does the report show that afternoon?',
      options: [
        'The old name, because the view changes only when it is refreshed',
        'The new name, because the database tracks which rows a view was built from',
        'An error, because the view no longer matches the table it was built from',
        'Both names, because the view keeps one row for each version of the product',
      ],
      answer: 0,
      why: 'A materialized view is a stored result, so it is as old as its last refresh. The base table has the new name and the view does not, which is the staleness the lesson reads off the rows that differ.',
    },
    {
      q: 'A product\'s name is copied into every order item. The product is renamed by updating one row. What does a report that groups by the copied name show?',
      options: [
        'Two names for one product, because the old copies keep the name they were written with',
        'One name, because the report joins the copies back to the product table first',
        'The new name only, because renaming a product updates its copies automatically',
        'No rows for that product, because the copies no longer match anything in the table',
      ],
      answer: 0,
      why: 'Denormalising is not just caching: a cache can be dropped, and a copy is data you now have to keep consistent. The rename touched one row, so the copies still carry the old name.',
    },
    {
      q: 'When does an incrementally maintained view beat a live join?',
      options: [
        'When reads per write are high enough that cheaper reads outweigh the extra rows each write updates',
        'When the base tables are small enough to fit in memory, since a view then costs nothing at all to keep',
        'When the dashboard is read rarely, because a view saves work that is not being done',
        'When writes are far more common than reads, because writes then build up the view',
      ],
      answer: 0,
      why: `Each write pays extra to keep the view current and each read saves a scan of the tables, so the view wins once reads per write pass a crossover. In this lesson that is ${sig(CROSS, 2)} reads per write.`,
    },
    {
      q: 'What can an incremental view get wrong that a full refresh cannot?',
      options: [
        'Drift: a maintenance rule that forgets a case, such as a refund, leaves it wrong until rebuilt',
        'Staleness: it answers with old data between refreshes, however many writes have happened, unlike a full refresh',
        'Cost: each read has to scan the base tables before it can return the stored answer',
        'Names: it always shows the product name that was current when the view was created',
      ],
      answer: 0,
      why: 'A full refresh recomputes from the tables, so a bug in a write rule cannot reach it. An incremental view applies each write by rule, and a rule that misses a case stays wrong with no error until something rebuilds it.',
    },
    {
      q: 'Why might a team keep the live join even though each read is the most expensive?',
      options: [
        'It is current by construction and has nothing to maintain, which suits few reads per write',
        'It is the only strategy whose reads touch no rows of the base tables in this model',
        'It stores the dashboard once, so a write to any table updates the answer for free',
        'It is cheapest at every ratio of reads to writes once the tables are indexed',
      ],
      answer: 0,
      why: 'The live join keeps writes as cheap as they can be and does not go stale. When reads are rare, the saving a view offers is small, and the maintenance it adds is a cost and a place for bugs.',
    },
  ],
};

export default lesson;
