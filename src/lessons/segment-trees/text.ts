import { plural } from '../../core/format';

/** Scene 1: one edit, then the mixed workload, in cells touched. */
export function costCaption(f: {
  index: number;
  n: number;
  prefixWrites: number;
  segmentWrites: number;
  fenwickWrites: number;
  updates: number;
  queries: number;
  totals: { prefix: number; segment: number; fenwick: number };
}): string {
  const cheapest = Object.entries(f.totals).sort((a, b) => a[1] - b[1])[0][0];
  const names: Record<string, string> = { prefix: 'prefix sums', segment: 'the segment tree', fenwick: 'the Fenwick tree' };
  const tie = Object.values(f.totals).filter((t) => t === f.totals[cheapest as keyof typeof f.totals]).length > 1;
  return `Changing cell ${f.index} rewrites ${plural(f.prefixWrites, 'prefix cell')}, against ${plural(f.segmentWrites, 'segment-tree node')} and ${plural(f.fenwickWrites, 'Fenwick cell')}. Over the seeded ${plural(f.updates + f.queries, 'operation')} (${f.updates} updates, ${f.queries} queries) at n = ${f.n.toLocaleString('en-US')}, cells touched: prefix sums ${f.totals.prefix.toLocaleString('en-US')}, segment tree ${f.totals.segment.toLocaleString('en-US')}, Fenwick ${f.totals.fenwick.toLocaleString('en-US')}${tie ? '.' : `: ${names[cheapest]} touched the fewest.`}`;
}

/** Scene 4: the Fenwick query or update just chosen. */
export function fenwickCaption(f: { query: number; hops: number[]; ranges: string[]; updateAt: number; updateHops: number[]; n: number }): string {
  return `Prefix query ${f.query} reads cells ${f.hops.join(', ')}, covering ${f.ranges.join(', ')}. An update at ${f.updateAt} writes cells ${f.updateHops.join(', ')} (n = ${f.n}).`;
}

/** What the side-by-side count means, stated once. */
export const minScaleNote = 'Numbers stored: the Fenwick tree keeps n, an iterative segment tree 2n, a recursive one up to 4n slots (a layout detail); the Fenwick tree is smaller but answers fewer questions.';
