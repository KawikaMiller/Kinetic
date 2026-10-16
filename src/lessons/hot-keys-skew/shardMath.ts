import { integer } from '../../core/format';
import { SHARDS, type Loads } from './skew';

/** Each shard's load as a share of its own capacity when the cluster is `util` busy with `requests` plain requests (capacity is sized for those). */
export const loadFractions = (loads: readonly number[], util: number, requests: number): number[] => loads.map((x) => (requests === 0 ? 0 : (x / requests) * SHARDS * util));

export const totalOf = (l: Loads) => l.loads.reduce((a, b) => a + b, 0);

/** The conservation line, in exact whole numbers: shard requests = requests - cached + extra. */
export function conservationText(l: Loads): string {
  return `${integer(l.requests)} requests - ${integer(l.absorbed)} cached + ${integer(l.extra)} extra`;
}

/** A load next to its capacity mark: whole percent, but a load that rounds to 100% without being 100% shows a decimal, so red or green never contradicts the label. */
export const pct = (v: number) => (Math.round(v * 100) === 100 && v !== 1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);

/** What the bars draw: green and red against the capacity mark, and a yellow outline on the hottest shard. */
export const SHARD_LEGEND_ITEMS = [
  { color: 'var(--ok)', label: 'a shard under its capacity (the mark)' },
  { color: 'var(--bad)', label: 'a shard past its capacity' },
  { color: 'var(--hi)', label: 'the hottest shard (outlined)' },
];
