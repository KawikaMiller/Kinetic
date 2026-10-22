/** What the scenes show about a fuzz run, derived once from the run itself. */
import type { ByteField } from '../../components/ByteGrid';
import type { LogRow } from '../../components/logRows';
import { bucketCrashes, type CrashRecord, type FuzzResult } from './fuzzer';
import { ENTRY, LENGTH_AT, MAGIC_LENGTH, PAYLOAD_AT, cfgEdges, edgeFrom, edgeTo, type BranchId, type TargetOptions } from './target';

export const nodeName = (n: number): string => (n === ENTRY ? 'start' : `b${n}`);
export const edgeName = (edge: number): string => `${nodeName(edgeFrom(edge))} to ${nodeName(edgeTo(edge))}`;

/** How many branch edges the target can exercise in this mode: the denominator of every coverage figure. */
export const totalEdges = (magic: TargetOptions['magic']): number => cfgEdges(magic).length;

/** The coverage curve as a step function: edges covered against executions (x = executions, so a jump is a vertical segment). */
export function coverageCurve(run: FuzzResult): [number, number][] {
  const seedEdges = run.corpus[0].newEdges.length;
  const points: [number, number][] = [[0, seedEdges]];
  let last = seedEdges;
  run.coverage.forEach((count, i) => {
    if (count !== last) {
      points.push([i, last], [i + 1, count]);
      last = count;
    }
  });
  points.push([run.executions, last]);
  return points;
}

/** The branches the most recent new-coverage event reached: what the graph paints as "new". */
export function newestNodes(run: FuzzResult): Set<number> {
  const last = run.events.findLast((e) => e.kind === 'new-coverage');
  return new Set(last?.kind === 'new-coverage' ? last.edges.map(edgeTo) : []);
}

/** The branches a set of covered edges reaches (the entry always counts). */
export const reachedNodes = (edges: ReadonlySet<number>): Set<number> => new Set([ENTRY, ...[...edges].map(edgeTo)]);

/** Largest crashing input of a site (the longest, the earliest on a tie): the realistic one a triager starts from. */
export function largestCrash(crashes: readonly CrashRecord[], site: BranchId): CrashRecord | null {
  return crashes.filter((c) => c.site === site).reduce<CrashRecord | null>((best, c) => (best === null || c.bytes.length > best.bytes.length ? c : best), null);
}

/** Log rows for a run: every new-coverage event, the first crash of each site, and one line counting the repeats. */
export function logRowsOf(run: FuzzResult): LogRow[] {
  const buckets = bucketCrashes(run.crashes);
  const firstOfSite = new Set(buckets.map((b) => b.first.at));
  const rows: LogRow[] = run.events
    .filter((e) => e.kind === 'new-coverage' || firstOfSite.has(e.at))
    .map((e, i) => ({
      id: i,
      at: `#${e.at.toLocaleString('en-US')}`,
      tone: e.kind === 'crash' ? ('bad' as const) : ('ok' as const),
      text: e.kind === 'crash' ? `crash (site b${e.site})` : `new coverage: ${e.edges.length} new edge${e.edges.length === 1 ? '' : 's'}`,
    }));
  const repeats = buckets.map((b) => ({ site: b.site, more: b.count - 1 })).filter((b) => b.more > 0);
  if (repeats.length > 0) {
    rows.push({ id: rows.length, tone: 'muted', text: `${repeats.map((r) => `${r.more.toLocaleString('en-US')} more crashes at b${r.site}`).join(', ')}: same sites, not listed one by one` });
  }
  return rows;
}

/** The fields of the record format that exist in these bytes, for the byte view. */
export function fieldsOf(length: number): ByteField[] {
  const fields: ByteField[] = [];
  if (length > 0) fields.push({ from: 0, to: Math.min(length, MAGIC_LENGTH) - 1, label: 'magic', tone: 'amber' });
  if (length > LENGTH_AT) fields.push({ from: LENGTH_AT, to: LENGTH_AT, label: 'length', tone: 'pink' });
  if (length > PAYLOAD_AT) fields.push({ from: PAYLOAD_AT, to: length - 1, label: 'payload and checksum', tone: 'sky' });
  return fields;
}
