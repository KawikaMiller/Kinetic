import { plural } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { capabilityTable } from './capabilities';
import { DEFAULT_CONTENTION_SEED } from './contention';
import { lakeFacts, leaders, pipelineFacts, scores, starFacts, workloadFacts } from './facts';
import { Stage } from './Stage';
import { crashWriter, directoryRows, initialLake, readTable } from './tableformat';
import { ALL_NEEDS } from './init';
import { COUNTRIES } from './pipeline';

const work = workloadFacts();
const pipe = pipelineFacts();
const star = starFacts();
const lake = lakeFacts();
const crashed = crashWriter(initialLake(), 1);
const seenOn = readTable(crashed).length;
const seenOff = directoryRows(crashed).length;
const everyone = scores(ALL_NEEDS);
const fewer = ALL_NEEDS.filter((n) => n !== 'open' && n !== 'cost');
const fewerLeaders = leaders(fewer);
const n = (x: number) => x.toLocaleString('en-US');
const checks = capabilityTable().length;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Operational stores serve many small reads and writes, analytical stores serve big scans, and a lake is files with no commit step. A table format over the files adds snapshots and an atomic pointer, which is what makes a lakehouse behave like a warehouse on cheap storage.',
    what: 'A mix of five operations is priced on a row store and on a column store, and a seeded queue shows scans holding up point operations on a shared store. A pipeline then re-runs after a business rule changes, with and without a kept raw extract. A star schema answers business questions by joins and is checked against a flat table. Finally a lake of immutable files gets snapshots and a pointer, and every interleaving of readers and writers is run to show what the layer buys.',
    analogy: 'A shop with a till and a stock-take. The till handles one customer at a time and must never lose a sale; the stock-take reads every shelf and wants the data laid out by product. Putting both on one counter makes the queue wait for the stock-take. A lake is boxes of receipts piled up; a table format is the ledger that says which boxes make up today\'s books.',
    useCases: [
      'Deciding where reporting queries should run so they do not slow the operational database',
      'Choosing between loading raw data first and cleaning it on the way in',
      'Writing dashboard questions as joins over a fact table and its dimensions',
      'Explaining why files in object storage need a table format before several jobs can share them',
    ],
    why: 'The words warehouse, lake and lakehouse sell products, but the differences are mechanical: where the data lives, whether a commit is atomic, and whether the raw data was kept. Knowing the mechanism lets you judge any product by what it does when two jobs touch the same table.',
    watch:
      'Row stores are blue and column stores violet; the cost of the placement you chose is green when it is the cheapest and red when a dearer one. In the pipeline, source and ingest are blue, raw zone and curated tables violet, right totals green and wrong or purged data red. In the star schema a table or column the question uses is blue and an unused one dim. In the lake the pointer is yellow, files in the current snapshot green, orphan and older files dim, a time-travelled snapshot blue, and a failed commit or torn read red. In the comparison a green tick is a property an architecture has and a red cross one it lacks. Chips say what is simulated, a toy, illustrative or from memory.',
  },
  tryThis: [
    `In "Two workloads" everything starts on the row store: the five-operation mix costs ${n(work.everyRow)}, and a point operation waits up to ${work.sharedWait.maxPointWait} ticks behind a scan (seed ${DEFAULT_CONTENTION_SEED}). Set Scans go to the Column store: the mix drops to ${n(work.split)} and the wait is ${work.splitWait.maxPointWait}.`,
    `In "ETL vs ELT" press Business rule changed: ETL has to read the source again and ${plural(pipe.etlWrong, 'country total')} of ${COUNTRIES.length} come out wrong. Switch Pipeline to ELT: it replays the kept raw rows and all of them are right.`,
    `In "Star schema" the revenue-by-region question joins ${star.joins} dimensions. Switch Region to its own table (the snowflake): it joins ${star.snowJoins}, and the answer is still equal to the flat table.`,
    `In "A table format over files" with Snapshots and a pointer, ${lake.on.torn} of ${lake.on.total} writer and reader interleavings tear. Switch Table format to None: ${lake.off.torn} of ${lake.off.total} do. Back on snapshots, press Crash after file A: a reader still sees ${n(seenOn)} rows; switch to None and it sees ${n(seenOff)}.`,
    `In "Pick a name" all ${checks} properties are counted: lakehouse has ${everyone.lakehouse}, warehouse ${everyone.warehouse} and lake ${everyone.lake}. Press Open file format and Cost of storing raw data to stop counting them: ${fewerLeaders.join(' and ')} tie.`,
  ],
  keyIdeas: [
    'In this model a row store is cheaper for point reads and writes and a column store for scans, and when both share one store a scan holds it while point operations queue behind it.',
    'ELT keeps the raw extract, so a changed rule can be replayed from it; in this model ETL must read the source again, which may no longer hold the old data.',
    'A table format makes a commit atomic: in this model a reader that goes through the snapshot pointer sees the table before or after a commit, and a reader that lists the directory can see half of one.',
    'Warehouse, lake and lakehouse are common usage and the terms overlap in practice; in this lesson they differ by what each has: a schema, transactions, open files, storage cost and scan speed.',
  ],
  quiz: [
    {
      q: 'A team says a data lake is just a cheaper warehouse. What do plain files in object storage lack, as the torn-read scene shows?',
      options: [
        'A commit step, so a reader that lists the directory can see half of a write still in progress',
        'Enough speed, because object storage can only be read one row at a time by any reader',
        'A way to hold more than a few files, since object storage has a small limit on how many it keeps',
        'Any way to be queried, because only a warehouse can read data that sits in files at all',
      ],
      answer: 0,
      why: 'Files alone have no commit: a writer adds files one by one and a reader listing the directory can catch it between them. A table format adds the snapshot list and the pointer swap that make the write atomic.',
    },
    {
      q: 'What does ELT mean, as opposed to the claim that it skips transformation?',
      options: [
        'Load the raw data first and transform it inside the store, so a changed rule is replayed from raw',
        'Load the data without cleaning it and never transform it, since the analysts can clean it up themselves later',
        'Transform on the way in and then load only the result, which saves the cost of keeping the raw data',
        'Extract and load in one step, so the transform is done by the source system before anything is sent on',
      ],
      answer: 0,
      why: 'ELT still transforms: the transform runs after the load, inside the analytical store, over raw data that was kept. That is why the rerun after a rule change does not depend on what the source holds now.',
    },
    {
      q: 'Why does a star schema keep order lines in one table and customers, products and dates in others?',
      options: [
        'Order lines repeat but a description is stored once and found by key, so a question joins only what it needs',
        'Joins are free in an analytical store, so splitting the data costs nothing and each table can be edited alone',
        'A single wide table cannot hold more than one kind of key, so the dimensions have to be kept in separate tables',
        'Splitting makes the answers differ from a flat table in a useful way, because they are grouped before they are joined',
      ],
      answer: 0,
      why: 'Order lines are many and each description is stored once, so the fact table stays narrow. A snowflake splits a dimension further and costs one more join for questions that need it; either way the answer equals the flat table.',
    },
    {
      q: 'Scans and point operations share one store. What do the point operations notice, and what removes it?',
      options: [
        'Some wait behind a scan that holds the store; sending each class to its own store removes the wait',
        'Nothing, because a store serves several operations at once and a scan only slows itself down',
        'Their cost goes up by the size of the scan, so a smaller table is the only way to bring it down again',
        'They are refused while a scan runs, so the application has to retry each one after a fixed pause',
      ],
      answer: 0,
      why: 'In this model a store serves one operation at a time in arrival order, so a long scan makes the point operations behind it wait. Separate stores serve each class without that queue.',
    },
    {
      q: 'Two writers both read snapshot 3 and each write a file. The first swaps the pointer. What happens to the second\'s swap?',
      options: [
        'It fails the compare, so that writer re-reads, rebuilds its list on top of the new snapshot and swaps again',
        'It succeeds and replaces the first writer\'s snapshot, so the first writer\'s rows disappear until the next commit',
        'It waits for the first writer to finish and then merges the two lists by itself without reading the pointer again',
        'It fails and the second writer\'s file is deleted, because only one writer may ever add data in a given hour',
      ],
      answer: 0,
      why: 'The swap succeeds when the pointer is still the version the writer read, and fails otherwise. A failed compare means someone committed first, so the loser retries on top of it; a blind swap would drop the first writer\'s rows.',
    },
  ],
};

export default lesson;
