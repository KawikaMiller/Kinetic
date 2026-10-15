import { mulberry32, shuffle } from '../../core/random';

/** The toy table's size: rows, pages (a toy 100 rows per page) and distinct customers. */
export interface TableShape {
  rows: number;
  pages: number;
  customers: number;
}

/** The lesson's `orders` table. */
export const ORDERS: TableShape = { rows: 100_000, pages: 1_000, customers: 10_000 };

/** `created_at` is a toy date: a day number from 1 to DAYS. */
export const DAYS = 365;

export const STATUSES = ['shipped', 'paid', 'new', 'refunded'] as const;
export type Status = (typeof STATUSES)[number];

/** Per mille of the table in each status: 70%, 20%, 9.5%, 0.5% (a skewed column). */
const STATUS_PER_MILLE: Record<Status, number> = { shipped: 700, paid: 200, new: 95, refunded: 5 };
const PER_MILLE = 1000;

/** The share of the table in each status, as the fresh statistics know it. */
export const STATUS_SHARE: Record<Status, number> = {
  shipped: STATUS_PER_MILLE.shipped / PER_MILLE,
  paid: STATUS_PER_MILLE.paid / PER_MILLE,
  new: STATUS_PER_MILLE.new / PER_MILLE,
  refunded: STATUS_PER_MILLE.refunded / PER_MILLE,
};

/** What stale statistics believe: gathered when the table was small and status was spread evenly. */
export const STALE_STATUS_SHARE: Record<Status, number> = { shipped: 0.25, paid: 0.25, new: 0.25, refunded: 0.25 };

export const TABLE_SEED = 7;
/** Offsets added to the table seed for the three independent column shuffles. */
const CUSTOMER_STREAM = 1;
const STATUS_STREAM = 2;
const DATE_STREAM = 3;
const SEED_STRIDE = 10;
const MAX_TOTAL = 500;

export interface Order {
  id: number;
  customer_id: number;
  status: Status;
  created_at: number;
  total: number;
}

const permutation = (n: number, seed: number): number[] =>
  shuffle(Array.from({ length: n }, (_, i) => i), mulberry32(seed));

/**
 * The seeded table. Counts are exact by construction (every customer has rows / customers rows, each
 * status its per-mille share); the row order and the pairing of the columns are shuffled by the seed.
 * `rows` must be a multiple of 1,000 and of `customers`.
 */
export function makeOrders(shape: TableShape, seed: number): Order[] {
  const { rows, customers } = shape;
  if (rows % PER_MILLE !== 0 || rows % customers !== 0) throw new Error('rows must be a multiple of 1,000 and of customers');
  const byCustomer = permutation(rows, seed * SEED_STRIDE + CUSTOMER_STREAM);
  const byStatus = permutation(rows, seed * SEED_STRIDE + STATUS_STREAM);
  const byDate = permutation(rows, seed * SEED_STRIDE + DATE_STREAM);
  const money = mulberry32(seed * SEED_STRIDE);
  let running = 0;
  const cuts = STATUSES.map((s) => (running += (rows / PER_MILLE) * STATUS_PER_MILLE[s]));
  return Array.from({ length: rows }, (_, i) => ({
    id: i + 1,
    customer_id: (byCustomer[i] % customers) + 1,
    status: STATUSES[cuts.findIndex((cut) => byStatus[i] < cut)],
    created_at: (byDate[i] % DAYS) + 1,
    total: 1 + Math.floor(money() * MAX_TOTAL),
  }));
}

/** What a query really returns: counted from the rows, never estimated. */
export interface Counts {
  byCustomer: ReadonlyMap<number, number>;
  byStatus: Readonly<Record<Status, number>>;
  /** sinceDay[d] = rows with created_at >= d, for d = 1..DAYS (index 0 unused). */
  sinceDay: readonly number[];
}

export function countRows(orders: readonly Order[]): Counts {
  const byCustomer = new Map<number, number>();
  const byStatus: Record<Status, number> = { shipped: 0, paid: 0, new: 0, refunded: 0 };
  const perDay = new Array<number>(DAYS + 2).fill(0);
  for (const o of orders) {
    byCustomer.set(o.customer_id, (byCustomer.get(o.customer_id) ?? 0) + 1);
    byStatus[o.status]++;
    perDay[o.created_at]++;
  }
  const sinceDay = new Array<number>(DAYS + 2).fill(0);
  for (let d = DAYS; d >= 1; d--) sinceDay[d] = sinceDay[d + 1] + perDay[d];
  return { byCustomer, byStatus, sinceDay };
}

let lessonCounts: Counts | null = null;
/** The counts of the 100,000-row lesson table, built once on first use. */
export function ordersCounts(): Counts {
  lessonCounts ??= countRows(makeOrders(ORDERS, TABLE_SEED));
  return lessonCounts;
}
