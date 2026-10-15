import { DEFAULT_COSTS, NO_INDEXES, planQuery, queryById, type Basis, type IndexSet, type Params, type PlanResult, type QueryId, type Setup, type StatsMode } from './model';
import { ORDERS, ordersCounts, type Counts, type Status, type TableShape } from './table';

/** The plan scenes share one view; this says what each one lets the learner touch, and what it pins. */
export type PlanSceneId = 'tree' | 'indexes' | 'misestimate' | 'sort';

/** Every control the plan view has. A scene shows some of them; the rest are pinned to constants. */
export interface PlanControls {
  query: QueryId;
  customerId: number;
  status: Status;
  day: number;
  indexes: IndexSet;
  stats: StatsMode;
  analyze: boolean;
}

export const DEFAULT_CONTROLS: PlanControls = {
  query: 'customer', customerId: 4242, status: 'refunded', day: 300, indexes: { ...NO_INDEXES, customer: true }, stats: 'fresh', analyze: false,
};

export interface SceneDef {
  label: string;
  /** Queries the scene offers (the first is its default). */
  queries: readonly QueryId[];
  /** Index toggles shown; any index not listed is pinned (to `pinnedIndexes`). */
  indexToggles: readonly (keyof IndexSet)[];
  pinnedIndexes: IndexSet;
  showStats: boolean;
  /** `analyze` shown as a toggle, or pinned to this value. */
  analyze: 'toggle' | boolean;
  candidatesTable: boolean;
  textPlan: boolean;
}

const ALL_QUERIES: readonly QueryId[] = ['customer', 'status', 'recent', 'customerNewest', 'statusNewest'];

export const PLAN_SCENES: Record<PlanSceneId, SceneDef> = {
  tree: { label: 'SQL becomes a tree', queries: ALL_QUERIES, indexToggles: [], pinnedIndexes: { ...NO_INDEXES, customer: true }, showStats: false, analyze: 'toggle', candidatesTable: false, textPlan: true },
  indexes: { label: 'Indexes and statistics', queries: ALL_QUERIES, indexToggles: ['customer', 'status', 'created', 'composite'], pinnedIndexes: NO_INDEXES, showStats: true, analyze: false, candidatesTable: true, textPlan: false },
  misestimate: { label: 'Misestimates', queries: ['status'], indexToggles: [], pinnedIndexes: { ...NO_INDEXES, status: true }, showStats: true, analyze: true, candidatesTable: true, textPlan: false },
  sort: { label: 'Sort elimination', queries: ['customerNewest', 'statusNewest'], indexToggles: ['customer', 'status', 'composite'], pinnedIndexes: NO_INDEXES, showStats: false, analyze: false, candidatesTable: true, textPlan: false },
};

/** A scene's starting controls: its first query, and its index toggles at the scene's own pinned (default) set. */
export const initialControls = (scene: PlanSceneId): PlanControls => ({ ...DEFAULT_CONTROLS, query: PLAN_SCENES[scene].queries[0], indexes: PLAN_SCENES[scene].pinnedIndexes });

/** What the planner is actually fed in a scene: hidden controls are replaced by the scene's constants. */
export interface EffectiveInputs {
  query: QueryId;
  params: Params;
  setup: Setup;
  analyze: boolean;
}

export function effectiveInputs(scene: PlanSceneId, ctl: PlanControls): EffectiveInputs {
  const def = PLAN_SCENES[scene];
  const indexes = { ...def.pinnedIndexes };
  for (const id of def.indexToggles) indexes[id] = ctl.indexes[id];
  return {
    query: def.queries.includes(ctl.query) ? ctl.query : def.queries[0],
    params: { customerId: ctl.customerId, status: ctl.status, day: ctl.day },
    setup: { indexes, stats: def.showStats ? ctl.stats : 'fresh' },
    analyze: def.analyze === 'toggle' ? ctl.analyze : def.analyze,
  };
}

/** The plan for a scene's controls. Scenes always cost with the default constants (the crossover scene owns random_page_cost). */
export function scenePlan(scene: PlanSceneId, ctl: PlanControls, basis: Basis = 'estimate', table: TableShape = ORDERS, counts: Counts = ordersCounts()): PlanResult {
  const e = effectiveInputs(scene, ctl);
  return planQuery({ query: queryById(e.query), params: e.params, setup: e.setup, costs: DEFAULT_COSTS, table, counts, basis });
}
