/**
 * warehouse-lake-lakehouse, scene 3: a star schema. One fact table (an order line: keys to dimensions plus measures) and three
 * dimension tables. Each business question is answered by joining the fact to the dimensions it needs and grouping; a flat
 * pre-joined table, built by a separate and plainly written path, is the oracle. A "snowflake" moves the region out of the
 * customer dimension into a table of its own, which costs one more join for questions about regions.
 */
import { mulberry32, pick, randInt } from '../../core/random';

export interface Customer { id: number; name: string; segment: string; region: string }
export interface Product { id: number; name: string; category: string }
export interface DateRow { id: number; date: string; month: string }
export interface Fact { id: number; customer: number; product: number; date: number; qty: number; amount: number }
export interface RegionRow { id: number; name: string; country: string }

export interface Star {
  facts: Fact[];
  customers: Customer[];
  products: Product[];
  dates: DateRow[];
}

export const REGIONS: readonly { name: string; country: string }[] = [
  { name: 'North', country: 'NL' },
  { name: 'South', country: 'FR' },
  { name: 'East', country: 'DE' },
  { name: 'West', country: 'US' },
];
export const SEGMENTS = ['consumer', 'business', 'public'] as const;
const PRODUCT_NAMES = ['pen', 'cup', 'bag', 'hat', 'mug', 'lamp', 'desk', 'book'];
const CATEGORIES = ['office', 'home', 'gifts'];
export const DAYS = 60;
export const FACT_COUNT = 120;
export const CUSTOMER_COUNT = 10;
export const RECENT_DAYS = 30;
export const DEFAULT_STAR_SEED = 3;
const FIRST_DAY = Date.UTC(2026, 0, 1);

const iso = (dayIndex: number) => new Date(FIRST_DAY + dayIndex * 86_400_000).toISOString().slice(0, 10);

export function buildStar(seed: number, facts: number = FACT_COUNT): Star {
  const rnd = mulberry32(seed);
  const customers = Array.from({ length: CUSTOMER_COUNT }, (_, i) => ({ id: i + 1, name: `customer ${i + 1}`, segment: pick(SEGMENTS, rnd), region: pick(REGIONS, rnd).name }));
  const products = PRODUCT_NAMES.map((name, i) => ({ id: i + 1, name, category: CATEGORIES[i % CATEGORIES.length] }));
  const dates = Array.from({ length: DAYS }, (_, i) => ({ id: i, date: iso(i), month: iso(i).slice(0, 7) }));
  const rows = Array.from({ length: facts }, (_, i) => ({
    id: i + 1,
    customer: randInt(1, customers.length, rnd),
    product: randInt(1, products.length, rnd),
    date: randInt(0, DAYS - 1, rnd),
    qty: randInt(1, 5, rnd),
    amount: randInt(5, 60, rnd),
  }));
  return { facts: rows, customers, products, dates };
}

export type QuestionId = 'region-month' | 'top-products' | 'segment-orders';
export interface Question {
  id: QuestionId;
  label: string;
  /** The dimensions it joins, and the columns it reads from them. */
  joins: { table: 'customer' | 'product' | 'date'; columns: string[] }[];
  /** Columns of the fact table it reads. */
  factColumns: string[];
}
export const QUESTIONS: Question[] = [
  { id: 'region-month', label: 'Revenue by region by month', joins: [{ table: 'customer', columns: ['region'] }, { table: 'date', columns: ['month'] }], factColumns: ['amount'] },
  { id: 'top-products', label: 'Top products in the last 30 days', joins: [{ table: 'product', columns: ['name'] }, { table: 'date', columns: ['id'] }], factColumns: ['qty'] },
  { id: 'segment-orders', label: 'Orders per customer segment', joins: [{ table: 'customer', columns: ['segment'] }], factColumns: ['id'] },
];
export const questionOf = (id: QuestionId): Question => QUESTIONS.find((q) => q.id === id)!;

export type Answer = [string, number][];
const sortAnswer = (a: Answer): Answer => [...a].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
const TOP = 3;

/** The snowflake: customers point at a region table instead of carrying the region name. */
export interface Snowflake extends Star {
  regions: RegionRow[];
  customerRegion: Map<number, number>;
}
export function snowflaked(star: Star): Snowflake {
  const regions = REGIONS.map((r, i) => ({ id: i + 1, name: r.name, country: r.country }));
  return { ...star, regions, customerRegion: new Map(star.customers.map((c) => [c.id, regions.find((r) => r.name === c.region)!.id])) };
}

export interface StarRun {
  answer: Answer;
  /** Dimension tables joined, counting the region table in a snowflake. */
  joins: string[];
}

/** The star-schema way: look each fact's keys up in the dimension tables and group the measure. */
export function runStar(star: Star, q: QuestionId, snowflake = false): StarRun {
  const cust = new Map(star.customers.map((c) => [c.id, c]));
  const prod = new Map(star.products.map((p) => [p.id, p]));
  const date = new Map(star.dates.map((d) => [d.id, d]));
  const snow = snowflake ? snowflaked(star) : null;
  const regionName = new Map(snow?.regions.map((r) => [r.id, r.name]) ?? []);
  const sums = new Map<string, number>();
  const add = (key: string, v: number) => sums.set(key, (sums.get(key) ?? 0) + v);
  const joins = questionOf(q).joins.map((j) => j.table as string);
  if (q === 'region-month') {
    if (snowflake) joins.push('region');
    for (const f of star.facts) {
      const c = cust.get(f.customer)!;
      const region = snow ? regionName.get(snow.customerRegion.get(c.id)!)! : c.region;
      add(`${region} ${date.get(f.date)!.month}`, f.amount);
    }
    return { answer: sortAnswer([...sums]), joins };
  }
  if (q === 'top-products') {
    const last = star.dates.length - 1;
    for (const f of star.facts) if (date.get(f.date)!.id > last - RECENT_DAYS) add(prod.get(f.product)!.name, f.qty);
    return { answer: [...sums].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP), joins };
  }
  for (const f of star.facts) add(cust.get(f.customer)!.segment, 1);
  return { answer: sortAnswer([...sums]), joins };
}

export interface FlatRow {
  region: string;
  month: string;
  segment: string;
  product: string;
  date: string;
  qty: number;
  amount: number;
}

/** The oracle: every fact row pre-joined to everything, found with plain `find`, then grouped by a separate routine. */
export function flatTable(star: Star): FlatRow[] {
  return star.facts.map((f) => {
    const c = star.customers.find((x) => x.id === f.customer)!;
    const p = star.products.find((x) => x.id === f.product)!;
    const d = star.dates.find((x) => x.id === f.date)!;
    return { region: c.region, month: d.month, segment: c.segment, product: p.name, date: d.date, qty: f.qty, amount: f.amount };
  });
}

/** The last `RECENT_DAYS` days up to and including `lastDate`, worked out with calendar arithmetic rather than day numbers. */
const cutoffDate = (lastDate: string): string => new Date(Date.parse(lastDate) - (RECENT_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);

export function answerFlat(flat: readonly FlatRow[], lastDate: string, q: QuestionId): Answer {
  const groups: Record<string, number> = {};
  const bump = (k: string, v: number) => {
    groups[k] = (groups[k] ?? 0) + v;
  };
  for (const r of flat) {
    if (q === 'region-month') bump(`${r.region} ${r.month}`, r.amount);
    else if (q === 'top-products') {
      if (r.date >= cutoffDate(lastDate)) bump(r.product, r.qty);
    } else bump(r.segment, 1);
  }
  const entries = Object.entries(groups);
  return q === 'top-products' ? entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP) : sortAnswer(entries);
}

export const sameAnswer = (a: Answer, b: Answer): boolean => a.length === b.length && a.every(([k, v], i) => k === b[i][0] && v === b[i][1]);

/** Joins a question needs in the star and in the snowflake. */
export const joinCount = (q: QuestionId, snowflake: boolean): number => questionOf(q).joins.length + (snowflake && q === 'region-month' ? 1 : 0);
