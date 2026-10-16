/**
 * warehouse-lake-lakehouse, scene 2: ETL against ELT when a business rule changes. The operational database is the source:
 * by the time the rule changes it has overwritten some prices and purged some old rows. ELT kept the raw extract and replays
 * it; ETL threw it away after transforming, so it has to extract again from what the source holds now. Neither is simply right: ELT
 * reproduces the as-ingested view exactly (with the old prices), ETL sees today's source (with the corrected prices) minus what it purged.
 */

export type Mode = 'etl' | 'elt';
export type Rule = 'v1' | 'v2';
export type Status = 'paid' | 'test' | 'cancelled';

export interface OrderRow {
  id: number;
  country: string;
  qty: number;
  price: number;
  status: Status;
}

/** What the source held when the pipeline first ran. */
export const INGESTED: readonly OrderRow[] = [
  { id: 1, country: 'NL', qty: 2, price: 10, status: 'paid' },
  { id: 2, country: 'DE', qty: 1, price: 40, status: 'paid' },
  { id: 3, country: 'NL', qty: 3, price: 15, status: 'cancelled' },
  { id: 4, country: 'FR', qty: 1, price: 25, status: 'paid' },
  { id: 5, country: 'DE', qty: 4, price: 5, status: 'test' },
  { id: 6, country: 'NL', qty: 1, price: 30, status: 'paid' },
  { id: 7, country: 'FR', qty: 2, price: 20, status: 'paid' },
  { id: 8, country: 'DE', qty: 2, price: 35, status: 'cancelled' },
  { id: 9, country: 'FR', qty: 5, price: 8, status: 'paid' },
  { id: 10, country: 'NL', qty: 1, price: 50, status: 'paid' },
];

/** Rows the source purged after its retention window, and prices it corrected in place, since the first run. */
export const PURGED_IDS: readonly number[] = [1, 2];
export const CORRECTED_PRICES: Readonly<Record<number, number>> = { 6: 33, 9: 10 };

/** What the source holds when the rule changes. */
export const SOURCE_NOW: readonly OrderRow[] = INGESTED.filter((r) => !PURGED_IDS.includes(r.id)).map((r) => ({ ...r, price: CORRECTED_PRICES[r.id] ?? r.price }));

/** Which orders count: v1 drops test orders; v2 (the changed rule) counts only paid orders. */
export const counts = (r: OrderRow, rule: Rule): boolean => (rule === 'v1' ? r.status !== 'test' : r.status === 'paid');

/** Revenue (qty x price) per country over the rows the rule counts. Countries with no counted order are left out. */
export function revenue(rows: readonly OrderRow[], rule: Rule): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (counts(r, rule)) out.set(r.country, (out.get(r.country) ?? 0) + r.qty * r.price);
  return out;
}

export const COUNTRIES = ['DE', 'FR', 'NL'] as const;

export interface Run {
  mode: Mode;
  rule: Rule;
  /** The curated table after this run. */
  curated: Map<string, number>;
  /** What the new rule says about the data as it was ingested: the view an exact replay reproduces. */
  asIngested: Map<string, number>;
  /** Raw rows kept in the lake after the run (none for ETL). */
  rawKept: number;
  /** How many times the pipeline read the source. */
  extracts: number;
  /** Where the transform ran on this run. */
  source: 'raw files' | 'the source again' | 'the first extract';
  /** Countries whose total differs from `asIngested`: the source has purged rows or corrected prices since. */
  differs: string[];
  /** The countries among `differs` with no total at all, because the source purged every row they were counted from. */
  lost: string[];
}

const same = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/** The first run (rule v1), or the rerun after the rule changed to v2. */
export function run(mode: Mode, rule: Rule): Run {
  const asIngested = revenue(INGESTED, rule);
  if (rule === 'v1') {
    const curated = revenue(INGESTED, 'v1');
    return { mode, rule, curated, asIngested, rawKept: mode === 'elt' ? INGESTED.length : 0, extracts: 1, source: 'the first extract', differs: [], lost: [] };
  }
  const curated = mode === 'elt' ? revenue(INGESTED, 'v2') : revenue(SOURCE_NOW, 'v2');
  const differs = [...new Set([...asIngested.keys(), ...curated.keys()])].filter((k) => asIngested.get(k) !== curated.get(k)).sort();
  return {
    mode,
    rule,
    curated,
    asIngested,
    rawKept: mode === 'elt' ? INGESTED.length : 0,
    extracts: mode === 'elt' ? 1 : 2,
    source: mode === 'elt' ? 'raw files' : 'the source again',
    differs,
    lost: differs.filter((k) => !curated.has(k)),
  };
}

export const matchesAsIngested = (r: Run): boolean => same(r.curated, r.asIngested);

/** Which source rows differ from what was ingested, for the stage to mark. */
export const sourceChange = (id: number): 'purged' | 'corrected' | null => (PURGED_IDS.includes(id) ? 'purged' : id in CORRECTED_PRICES ? 'corrected' : null);
