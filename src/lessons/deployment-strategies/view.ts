import type { GanttBar } from '../../components/GanttLanes';
import type { GridCellSpec } from '../../components/CellGrid';
import {
  DEPLOY_START, REPLICAS, STRATEGIES, hitBy, simulate,
  type Config, type Outcome, type Req, type Run, type Strategy, type TickState,
} from './model';

export const STRATEGY_LABEL: Record<Strategy, string> = {
  recreate: 'Recreate',
  rolling: 'Rolling',
  bluegreen: 'Blue-green',
  canary: 'Canary',
};

/** The server grid is 5 columns by 4 rows (20 servers); extra capacity gets a grid of its own. */
export const GRID_COLS = 5;
export const GRID_ROWS = REPLICAS / GRID_COLS;
export const SERVER_CELL_PX = 52;
/** The request grid: one minute's 200 requests, 20 to a row. */
export const REQ_COLS = 20;
export const REQ_ROWS = 10;

export type SlotKind = 'v1' | 'v2' | 'starting' | 'standby' | 'down' | 'none';

export interface Slots {
  /** The main fleet (blue, for blue-green): always REPLICAS cells. */
  primary: SlotKind[];
  /** Capacity beyond the main fleet (surge pods, canary pods, the green fleet); empty when the run never needs any. */
  extra: SlotKind[];
}

const fill = (kinds: SlotKind[], length: number, rest: SlotKind): SlotKind[] => [...kinds, ...Array.from({ length: Math.max(0, length - kinds.length) }, () => rest)];
const many = (kind: SlotKind, n: number): SlotKind[] => Array.from({ length: n }, () => kind);

/** How many cells the extra grid has: whole rows, enough for the most extra servers the run ever runs. */
export function extraCells(run: Run): number {
  const extra = run.cfg.strategy === 'bluegreen' ? REPLICAS : run.peakPods - REPLICAS;
  return extra > 0 ? Math.ceil(extra / GRID_COLS) * GRID_COLS : 0;
}

/**
 * Where each server sits in the grids at a minute. Blue-green keeps its two fleets apart (blue
 * in the main grid, green in the extra one); the others list new servers first, then servers
 * starting, then v1, and spill anything past the 20th into the extra grid.
 */
export function slotsAt(run: Run, tick: TickState): Slots {
  const cells = extraCells(run);
  if (run.cfg.strategy === 'bluegreen') {
    const blue: SlotKind = tick.v1 > 0 ? 'v1' : tick.standby > 0 && tick.v2 > 0 ? 'standby' : 'none';
    const green: SlotKind = tick.startingV2 > 0 ? 'starting' : tick.v2 > 0 ? 'v2' : tick.standby > 0 ? 'standby' : 'none';
    return { primary: many(blue === 'none' ? 'down' : blue, REPLICAS), extra: many(green, cells) };
  }
  const seq = [...many('v2', tick.v2), ...many('starting', tick.startingV2 + tick.startingV1), ...many('v1', tick.v1)];
  return { primary: fill(seq.slice(0, REPLICAS), REPLICAS, 'down'), extra: fill(seq.slice(REPLICAS), cells, 'none') };
}

export function slotCell(kind: SlotKind): GridCellSpec {
  switch (kind) {
    case 'v1': return { tone: 'info', fill: 'solid', text: 'v1' };
    case 'v2': return { tone: 'violet', fill: 'solid', text: 'v2' };
    case 'starting': return { tone: 'hi', fill: 'outline', text: '...' };
    case 'standby': return { tone: 'dim', fill: 'tint', text: 'idle' };
    case 'down': return { tone: 'dim', fill: 'outline', text: 'off' };
    case 'none': return { fill: 'none' };
  }
}

const OUTCOME_WORDS: Record<Outcome, string> = {
  ok: 'served',
  bug: 'failed: the planted bug in v2',
  natural: 'failed: background error',
  outage: 'failed: no server was up',
  schema: 'failed: v1 cannot read the new schema',
};

export const describeRequest = (i: number, r: Req) => `Request ${i + 1}: ${r.by === 'none' ? 'no server' : r.by}, ${OUTCOME_WORDS[r.outcome]}`;

export function requestCell(r: Req | undefined): GridCellSpec {
  if (!r) return { fill: 'none' };
  return r.outcome === 'ok' ? { tone: 'ok', fill: 'solid' } : { tone: 'bad', fill: 'solid' };
}

/** Whole-number percentage of a share, "<1%" never rounded to nothing when it is not nothing. */
export function share(w: number): string {
  if (w === 0) return '0%';
  if (w < 0.01) return '<1%';
  return `${Math.round(w * 100)}%`;
}

/** Failed requests among the minute's sample (everything that is not ok). */
export const failedCount = (reqs: readonly Req[]) => reqs.filter((r) => r.outcome !== 'ok').length;

/** The values the failures-per-minute sparkline draws up to minute `t`: deploy-caused failures each minute. */
export const hitSeries = (run: Run, t: number) => run.tallies.slice(0, t + 1).map(hitBy);

// ── The side-by-side comparison ─────────────────────────────────────────

export interface CompareRow {
  strategy: Strategy;
  run: Run;
}

/** All four strategies on the same bug, schema, drain setting and seed; each keeps its own settings. */
export function compareAll(cfg: Config): CompareRow[] {
  return STRATEGIES.map((strategy) => ({ strategy, run: simulate({ ...cfg, strategy }) }));
}

/** Lane bars for one run: servers starting, users on v2, and the rollback, each only when it happened. */
export function compareBars(row: CompareRow): GanttBar[] {
  const { run, strategy } = row;
  const bars: GanttBar[] = [];
  const stop = run.trigger && !run.trigger.blocked ? run.trigger.tick + 1 : run.ticks.length;
  const exposed = run.firstExposure ?? run.ticks.length;
  if (exposed > DEPLOY_START) bars.push({ id: `${strategy}-prep`, lane: strategy, start: DEPLOY_START, end: exposed, tone: 'hi', label: 'starting' });
  if (run.firstExposure !== null && stop > exposed) bars.push({ id: `${strategy}-exposed`, lane: strategy, start: exposed, end: stop, tone: 'violet', label: 'v2' });
  if (run.trigger && !run.trigger.blocked && run.rolledBackAt !== null) {
    bars.push({ id: `${strategy}-back`, lane: strategy, start: stop, end: Math.max(stop + 1, run.rolledBackAt + 1), tone: 'orange', label: 'undo' });
  }
  return bars;
}

export interface CompareSummary {
  fewest: Strategy[];
  most: Strategy[];
  fewestHit: number;
  mostHit: number;
}

/** Which strategies hit the fewest and the most users, by expected users hit (ties kept together). */
export function compareSummary(rows: readonly CompareRow[]): CompareSummary {
  const hit = (r: CompareRow) => Math.round(r.run.expectedHit);
  const fewestHit = Math.min(...rows.map(hit));
  const mostHit = Math.max(...rows.map(hit));
  return {
    fewest: rows.filter((r) => hit(r) === fewestHit).map((r) => r.strategy),
    most: rows.filter((r) => hit(r) === mostHit).map((r) => r.strategy),
    fewestHit,
    mostHit,
  };
}
