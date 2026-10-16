/**
 * warehouse-lake-lakehouse, scene 5: the comparison table. Each cell is computed from the models of the earlier scenes, using
 * four properties of each architecture as the lesson uses the words ("one common usage": the terms overlap in practice).
 */
import { initialLake, readerVsWriter } from './tableformat';
import { MIX, isScan, opCost } from './workload';

export type Kind = 'warehouse' | 'lake' | 'lakehouse';
export const KINDS: Kind[] = ['warehouse', 'lake', 'lakehouse'];

/** The properties of each, as this lesson uses the words. */
export interface Properties {
  /** The system owns the storage (data lives inside it) rather than sitting in open files on object storage. */
  ownsStorage: boolean;
  /** Data files are in a format other tools can read directly. */
  openFiles: boolean;
  /** A metadata layer (a catalogue or a table format) tracks which files make up each table. */
  metadataLayer: boolean;
  /** Data is laid out by column. */
  columnar: boolean;
}

export const PROPERTIES: Record<Kind, Properties> = {
  warehouse: { ownsStorage: true, openFiles: false, metadataLayer: true, columnar: true },
  lake: { ownsStorage: false, openFiles: true, metadataLayer: false, columnar: false },
  lakehouse: { ownsStorage: false, openFiles: true, metadataLayer: true, columnar: true },
};

/** Illustrative storage prices, per terabyte per month: managed warehouse storage against plain object storage. */
export const PRICE_PER_TB: Record<'owned' | 'object', number> = { owned: 40, object: 23 };

export type Verdict = 'good' | 'bad';
export interface Cell {
  verdict: Verdict;
  text: string;
}
export interface CapabilityRow {
  id: 'schema' | 'transactions' | 'open' | 'cost' | 'bi';
  label: string;
  cells: Record<Kind, Cell>;
}

const scan = MIX.find(isScan)!;

export function capabilityTable(): CapabilityRow[] {
  const tear = (k: Kind) => readerVsWriter(initialLake(), PROPERTIES[k].metadataLayer);
  const price = (k: Kind) => (PROPERTIES[k].ownsStorage ? PRICE_PER_TB.owned : PRICE_PER_TB.object);
  const scanCost = (k: Kind) => opCost(scan, PROPERTIES[k].columnar ? 'column' : 'row').cost;
  const cheapest = Math.min(...KINDS.map(price));
  const best = Math.min(...KINDS.map(scanCost));
  const by = <T,>(f: (k: Kind) => T): Record<Kind, T> => ({ warehouse: f('warehouse'), lake: f('lake'), lakehouse: f('lakehouse') });
  return [
    {
      id: 'schema',
      label: 'Schema enforced on write',
      cells: by((k) => ({ verdict: PROPERTIES[k].metadataLayer ? 'good' : 'bad', text: PROPERTIES[k].metadataLayer ? 'yes: a metadata layer holds the schema' : 'no: files accept any row' })),
    },
    {
      id: 'transactions',
      label: 'Transactions: readers never see half a write',
      cells: by((k) => {
        const r = tear(k);
        return { verdict: r.torn === 0 ? 'good' : 'bad', text: `${r.torn} of ${r.total} reader and writer interleavings tear` };
      }),
    },
    {
      id: 'open',
      label: 'Open file format',
      cells: by((k) => ({ verdict: PROPERTIES[k].openFiles ? 'good' : 'bad', text: PROPERTIES[k].openFiles ? 'yes: other tools read the files' : 'no: the system\'s own storage' })),
    },
    {
      id: 'cost',
      label: 'Cost of storing raw data (per TB a month)',
      cells: by((k) => ({ verdict: price(k) === cheapest ? 'good' : 'bad', text: `$${price(k)} (illustrative)` })),
    },
    {
      id: 'bi',
      label: 'Dashboard (scan) performance',
      cells: by((k) => ({
        verdict: scanCost(k) === best ? 'good' : 'bad',
        text: PROPERTIES[k].columnar ? `${scanCost(k).toLocaleString('en-US')} value-equivalents for one scan` : `${scanCost(k).toLocaleString('en-US')} value-equivalents for one scan if the files are row-oriented (CSV, JSON); columnar files such as Parquet would cost ${best.toLocaleString('en-US')}`,
      })),
    },
  ];
}
