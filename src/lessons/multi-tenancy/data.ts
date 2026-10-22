/**
 * Data isolation, as a small in-memory model: one pooled table with a tenant column, against a
 * schema or a database for each tenant. The shops and orders are invented; the costs and effort are
 * illustrative constants, not any vendor's numbers.
 */

export type Isolation = 'pooled' | 'schema' | 'database';
export const ISOLATIONS: Isolation[] = ['pooled', 'schema', 'database'];
export const ISOLATION_NAME: Record<Isolation, string> = { pooled: 'One pooled table', schema: 'A schema per tenant', database: 'A database per tenant' };

export interface OrderRow {
  id: number;
  tenant: string;
  item: string;
  total: number;
}

/** Invented shops (no real company is meant) and a few invented orders each. */
export const SHOPS = ['Pinewood Bakery', 'Quartz Cycles', 'Lantern Books'] as const;
export const ORDERS: readonly OrderRow[] = [
  { id: 1, tenant: SHOPS[0], item: 'sourdough loaf', total: 6 },
  { id: 2, tenant: SHOPS[0], item: 'rye starter', total: 12 },
  { id: 3, tenant: SHOPS[0], item: 'seed crackers', total: 4 },
  { id: 4, tenant: SHOPS[1], item: 'inner tube', total: 9 },
  { id: 5, tenant: SHOPS[1], item: 'bell', total: 7 },
  { id: 6, tenant: SHOPS[2], item: 'atlas', total: 30 },
  { id: 7, tenant: SHOPS[2], item: 'bookmark set', total: 5 },
  { id: 8, tenant: SHOPS[2], item: 'reading lamp', total: 25 },
];

export interface QueryResult {
  /** The query as it would be written, for the learner to read. */
  sql: string;
  rows: OrderRow[];
  /** Rows of other tenants that came back. */
  leaked: number;
}

const FILTERED_SQL = 'SELECT * FROM orders WHERE tenant_id = :me';
const UNFILTERED_SQL = 'SELECT * FROM orders';

/**
 * `list orders` as the caller's tenant. In the pooled table the filter is the application's job: a
 * query that forgets it returns every tenant's rows, unless row-level security is on, which applies
 * the tenant filter inside the database whatever the query says. With a schema or a database per
 * tenant the connection only reaches the caller's own data, so forgetting the filter returns only
 * their rows.
 */
export function listOrders(model: Isolation, tenant: string, o: { filtered: boolean; rowLevelSecurity: boolean }): QueryResult {
  const visible = model === 'pooled' ? ORDERS : ORDERS.filter((r) => r.tenant === tenant);
  const guarded = model === 'pooled' && o.rowLevelSecurity;
  const rows = o.filtered || guarded ? visible.filter((r) => r.tenant === tenant) : [...visible];
  return { sql: o.filtered ? FILTERED_SQL : UNFILTERED_SQL, rows, leaked: rows.filter((r) => r.tenant !== tenant).length };
}

/** Illustrative figures for a platform with this many tenants. */
export const TENANT_COUNT = 100;

export interface IsolationCosts {
  /** Currency units per tenant per month. */
  costPerTenant: number;
  /** Tenants whose data one forgotten filter can expose. */
  leakReach: (tenants: number) => number;
  /** Tenants that share one failure and one pool of CPU when a tenant misbehaves. */
  sharedFate: (tenants: number) => number;
  /** How many times a schema change has to run. */
  migrations: (tenants: number) => number;
}

export const COSTS: Record<Isolation, IsolationCosts> = {
  pooled: { costPerTenant: 1, leakReach: (n) => n, sharedFate: (n) => n, migrations: () => 1 },
  schema: { costPerTenant: 3, leakReach: () => 1, sharedFate: (n) => n, migrations: (n) => n },
  database: { costPerTenant: 20, leakReach: () => 1, sharedFate: () => 1, migrations: (n) => n },
};
