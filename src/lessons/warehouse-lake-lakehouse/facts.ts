/** warehouse-lake-lakehouse: the numbers the try-this entries and captions quote, each computed from the model at the scene's default. */
import { KINDS, capabilityTable, type Kind } from './capabilities';
import { DEFAULT_CONTENTION_SEED, runContention } from './contention';
import { run, matchesAsIngested } from './pipeline';
import { DEFAULT_STAR_SEED, QUESTIONS, buildStar, joinCount, runStar } from './star';
import { initialLake, race, readerVsWriter } from './tableformat';
import { MIX, PLACEMENTS, bestPlacement, mixCost, samePlacement, type Placement } from './workload';
import type { NeedId } from './init';

export const costOf = (p: Placement): number => mixCost(MIX, p).cost;
export const BEST: Placement = bestPlacement(MIX);

/** The workload scene: the cost of each way to place the mix, and the queue for a placement at a seed. */
export function workloadFacts() {
  const everyRow: Placement = { points: 'row', scans: 'row' };
  const split: Placement = { points: 'row', scans: 'column' };
  return {
    everyRow: costOf(everyRow),
    split: costOf(split),
    best: costOf(BEST),
    bestIsSplit: samePlacement(BEST, split),
    sharedWait: runContention(everyRow, DEFAULT_CONTENTION_SEED),
    splitWait: runContention(split, DEFAULT_CONTENTION_SEED),
    all: PLACEMENTS.map((p) => ({ p, cost: costOf(p) })),
  };
}

/** The pipeline scene: the revenue the ETL rerun gets against the as-ingested view an ELT replay reproduces. */
export function pipelineFacts() {
  const etl = run('etl', 'v2');
  const elt = run('elt', 'v2');
  return { etl, elt, etlDiffers: etl.differs.length, etlLost: etl.lost, eltMatches: matchesAsIngested(elt), etlMatches: matchesAsIngested(etl) };
}

/** The star scene: what the default question joins, and what the snowflake adds. */
export function starFacts() {
  const q = QUESTIONS[0];
  const star = buildStar(DEFAULT_STAR_SEED);
  return { question: q, joins: joinCount(q.id, false), snowJoins: joinCount(q.id, true), rows: runStar(star, q.id).answer.length, facts: star.facts.length };
}

/** The lake scene: the exhaustive reader and writer results at the starting lake. */
export function lakeFacts() {
  const lake = initialLake();
  return { on: readerVsWriter(lake, true), off: readerVsWriter(lake, false), race: race(lake), blind: race(lake, false) };
}

/** The comparison scene: how many of the chosen properties each architecture has. */
export function scores(needs: readonly NeedId[]): Record<Kind, number> {
  const table = capabilityTable().filter((r) => needs.includes(r.id));
  return Object.fromEntries(KINDS.map((k) => [k, table.filter((r) => r.cells[k].verdict === 'good').length])) as Record<Kind, number>;
}

export const leaders = (needs: readonly NeedId[]): Kind[] => {
  const s = scores(needs);
  const top = Math.max(...KINDS.map((k) => s[k]));
  return KINDS.filter((k) => s[k] === top);
};
