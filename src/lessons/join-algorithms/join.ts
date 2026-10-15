/**
 * The three join algorithms as pure code, each returning the joined pairs, the counters the lesson
 * teaches with and the events a step player replays. A row is `{ id, key }`; a NULL key never matches
 * (as in SQL), so the algorithms skip NULL-key rows where a real engine would too.
 * One unit of cost, defined once (AC-0/T3 #18): key comparisons plus hash operations plus sort comparisons.
 */

export interface Row {
  /** The row's label within its table, 1-based, never changes when a key is edited. */
  id: number;
  key: number | null;
}

export interface Tables {
  /** The outer table (customers). */
  a: readonly Row[];
  /** The inner table (orders). */
  b: readonly Row[];
}

export type Pair = readonly [aId: number, bId: number];
export type Cond = 'eq' | 'lt';
export type Side = 'a' | 'b';

export type Keyed = Row & { key: number };
export const hasKey = (r: Row): r is Keyed => r.key !== null;

/** Children per node of the toy B-tree behind "index on the inner key". */
export const INDEX_FANOUT = 4;
/** Buckets in the toy hash table. */
export const BUCKETS = 8;
/** Smallest memory limit: rows the hash table can hold. */
export const MIN_MEMORY = 2;

const mod = (n: number, m: number): number => ((n % m) + m) % m;
export const bucketOf = (key: number): number => mod(key, BUCKETS);
/** The partition (batch) a key falls in when the build side is split into `batches`. */
export const batchOf = (key: number, batches: number): number => mod(key, batches);

/** Levels of the toy index over n keys: the smallest h with FANOUT^h >= n (at least 1). */
export function treeHeight(n: number): number {
  let h = 1;
  for (let reach = INDEX_FANOUT; reach < n; reach *= INDEX_FANOUT) h++;
  return h;
}

/** The join by definition: the cross product filtered on the condition. The independent reference for everything below. */
export function bruteForce(t: Tables, cond: Cond): Pair[] {
  const out: Pair[] = [];
  for (const a of t.a) for (const b of t.b) if (a.key !== null && b.key !== null && (cond === 'eq' ? a.key === b.key : a.key < b.key)) out.push([a.id, b.id]);
  return out;
}

/** The pairs as a sorted list of "a-b" strings, so two joins compare as multisets. */
export const asMultiset = (pairs: readonly Pair[]): string[] => pairs.map(([a, b]) => `${a}-${b}`).sort();

// ── Nested loop ───────────────────────────────────────────────────────

export type NestedEvent =
  | { t: 'compare'; a: number; b: number; match: boolean; work: number }
  | { t: 'probe'; a: number; visits: number; matches: number[]; work: number }
  | { t: 'skip'; a: number };

export interface JoinRun<E> {
  pairs: Pair[];
  /** Total in the lesson's one unit. */
  work: number;
  events: E[];
}

/** For every outer row, scan the whole inner table; with an index, probe it instead (`height` node visits a probe). */
export function nestedLoop(t: Tables, cond: Cond, indexed: boolean): JoinRun<NestedEvent> & { height: number } {
  const height = treeHeight(t.b.length);
  const pairs: Pair[] = [];
  const events: NestedEvent[] = [];
  let work = 0;
  t.a.forEach((a, ai) => {
    if (indexed && cond === 'eq') {
      if (a.key === null) {
        events.push({ t: 'skip', a: ai });
        return;
      }
      work += height;
      const matches = t.b.flatMap((b, bi) => (b.key === a.key ? [bi] : []));
      for (const bi of matches) pairs.push([a.id, t.b[bi].id]);
      events.push({ t: 'probe', a: ai, visits: height, matches, work });
      return;
    }
    t.b.forEach((b, bi) => {
      work++;
      const match = a.key !== null && b.key !== null && (cond === 'eq' ? a.key === b.key : a.key < b.key);
      if (match) pairs.push([a.id, b.id]);
      events.push({ t: 'compare', a: ai, b: bi, match, work });
    });
  });
  return { pairs, work, events, height };
}

// ── Hash join ─────────────────────────────────────────────────────────

export type HashEvent =
  | { t: 'build'; side: Side; row: number; bucket: number; work: number }
  | { t: 'probe'; side: Side; row: number; bucket: number; matches: number[]; work: number }
  | { t: 'spill'; side: Side; row: number; batch: number }
  | { t: 'batch'; batch: number };

export interface HashPlan {
  buildSide: Side;
  buildRows: number;
  probeRows: number;
  batches: number;
}

/** The build side is the one with fewer non-NULL keys (customers on a tie); its rows are what must fit in memory. */
export function hashPlan(t: Tables, memory: number): HashPlan {
  const na = t.a.filter(hasKey).length;
  const nb = t.b.filter(hasKey).length;
  const buildSide: Side = na <= nb ? 'a' : 'b';
  const buildRows = Math.min(na, nb);
  const mem = Math.max(MIN_MEMORY, Math.floor(memory));
  return { buildSide, buildRows, probeRows: Math.max(na, nb), batches: buildRows > mem ? Math.ceil(buildRows / mem) : 1 };
}

/**
 * Build a hash table from the smaller side, probe with the other. When the build side is bigger than
 * `memory` rows it is split into B = ceil(build / memory) partitions by key: partition 0 is joined at once, the
 * rest of both sides are written out and read back one partition at a time (a teaching model: real engines differ).
 */
export function hashJoin(t: Tables, memory: number): JoinRun<HashEvent> & HashPlan & { rowsSpilled: number } {
  const plan = hashPlan(t, memory);
  const build = plan.buildSide === 'a' ? t.a : t.b;
  const probeSide: Side = plan.buildSide === 'a' ? 'b' : 'a';
  const probe = probeSide === 'a' ? t.a : t.b;
  const pairs: Pair[] = [];
  const events: HashEvent[] = [];
  let work = 0;
  let rowsSpilled = 0;
  const table: number[][] = Array.from({ length: BUCKETS }, () => []);

  const insert = (row: number) => {
    const bucket = bucketOf(build[row].key!);
    table[bucket].push(row);
    events.push({ t: 'build', side: plan.buildSide, row, bucket, work: ++work });
  };
  const lookup = (row: number) => {
    const key = probe[row].key!;
    const bucket = bucketOf(key);
    const matches = table[bucket].filter((br) => build[br].key === key);
    for (const br of matches) pairs.push(plan.buildSide === 'a' ? [build[br].id, probe[row].id] : [probe[row].id, build[br].id]);
    events.push({ t: 'probe', side: probeSide, row, bucket, matches, work: ++work });
  };

  const spilledBuild: number[][] = Array.from({ length: plan.batches }, () => []);
  const spilledProbe: number[][] = Array.from({ length: plan.batches }, () => []);
  build.forEach((r, row) => {
    if (!hasKey(r)) return;
    const batch = batchOf(r.key, plan.batches);
    if (batch === 0) insert(row);
    else {
      spilledBuild[batch].push(row);
      rowsSpilled++;
      events.push({ t: 'spill', side: plan.buildSide, row, batch });
    }
  });
  probe.forEach((r, row) => {
    if (!hasKey(r)) return;
    const batch = batchOf(r.key, plan.batches);
    if (batch === 0) lookup(row);
    else {
      spilledProbe[batch].push(row);
      rowsSpilled++;
      events.push({ t: 'spill', side: probeSide, row, batch });
    }
  });
  for (let batch = 1; batch < plan.batches; batch++) {
    table.forEach((bucket) => (bucket.length = 0));
    events.push({ t: 'batch', batch });
    spilledBuild[batch].forEach(insert);
    spilledProbe[batch].forEach(lookup);
  }
  return { ...plan, pairs, work, events, rowsSpilled };
}

// ── Merge join ────────────────────────────────────────────────────────

/** Top-down merge sort by key; returns the sorted rows and the number of key comparisons it made. */
export function sortByKey(rows: readonly Keyed[]): { sorted: Keyed[]; comparisons: number } {
  let comparisons = 0;
  const sort = (xs: readonly Keyed[]): Keyed[] => {
    if (xs.length <= 1) return [...xs];
    const mid = Math.floor(xs.length / 2);
    const left = sort(xs.slice(0, mid));
    const right = sort(xs.slice(mid));
    const out: Keyed[] = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      comparisons++;
      out.push(left[i].key <= right[j].key ? left[i++] : right[j++]);
    }
    return [...out, ...left.slice(i), ...right.slice(j)];
  };
  return { sorted: sort(rows), comparisons };
}

export type MergeEvent =
  | { t: 'sorted'; comparisons: number; work: number }
  | { t: 'step'; i: number; j: number; order: -1 | 0 | 1; work: number }
  | { t: 'emit'; i: number; k: number; work: number }
  | { t: 'rewind'; to: number; work: number };

/**
 * Sort both sides on the key (free when `alreadySorted` says an index supplies the order), then advance two pointers.
 * Rows with a NULL key are dropped first: they can never match. Where the outer key repeats, the inner pointer goes
 * back to the start of its run of equal keys (a rewind). `i` and `j` in the events index the sorted sides.
 */
export function mergeJoin(t: Tables, alreadySorted: boolean): JoinRun<MergeEvent> & { sortedA: Keyed[]; sortedB: Keyed[]; sortComparisons: number; advances: number; rewinds: number } {
  const sa = sortByKey(t.a.filter(hasKey));
  const sb = sortByKey(t.b.filter(hasKey));
  const sortComparisons = alreadySorted ? 0 : sa.comparisons + sb.comparisons;
  const A = sa.sorted;
  const B = sb.sorted;
  const pairs: Pair[] = [];
  const events: MergeEvent[] = [{ t: 'sorted', comparisons: sortComparisons, work: sortComparisons }];
  let work = sortComparisons;
  let advances = 0;
  let rewinds = 0;
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    work++;
    const order = A[i].key < B[j].key ? -1 : A[i].key > B[j].key ? 1 : 0;
    events.push({ t: 'step', i, j, order, work });
    if (order < 0) {
      i++;
      advances++;
    } else if (order > 0) {
      j++;
      advances++;
    } else {
      let k = j;
      while (k < B.length && B[k].key === A[i].key) {
        pairs.push([A[i].id, B[k].id]);
        k++;
        advances++;
        if (k < B.length) work++;
        events.push({ t: 'emit', i, k: k - 1, work });
      }
      i++;
      advances++;
      if (i < A.length) work++;
      if (i < A.length && A[i].key === A[i - 1].key) {
        rewinds++;
        events.push({ t: 'rewind', to: j, work });
      } else j = k;
    }
  }
  return { pairs, work, events, sortedA: A, sortedB: B, sortComparisons, advances, rewinds };
}

/** The equality join's rows, and whether every algorithm (hash both in memory and spilling) returns the same rows as the brute-force join. */
export function agreement(t: Tables): { pairs: Pair[]; agree: boolean } {
  const pairs = bruteForce(t, 'eq');
  const want = asMultiset(pairs);
  const outputs = [nestedLoop(t, 'eq', false).pairs, nestedLoop(t, 'eq', true).pairs, hashJoin(t, MIN_MEMORY).pairs, hashJoin(t, Number.MAX_SAFE_INTEGER).pairs, mergeJoin(t, false).pairs];
  return { pairs, agree: outputs.every((o) => asMultiset(o).join() === want.join()) };
}

// ── The cost table ────────────────────────────────────────────────────

export type AlgorithmId = 'nested' | 'indexNested' | 'hash' | 'merge' | 'mergeSorted';

export interface CostRow {
  id: AlgorithmId;
  label: string;
  /** Cost in the lesson's one unit, or null when the algorithm cannot run this join. */
  cost: number | null;
  /** Why it cannot run, when `cost` is null. */
  refused: string | null;
}

export const ALGORITHM_LABEL: Record<AlgorithmId, string> = {
  nested: 'Nested loop', indexNested: 'Nested loop, index on the inner key', hash: 'Hash join', merge: 'Merge join (sort both sides)', mergeSorted: 'Merge join (inputs already sorted by an index)',
};

const NEEDS_EQUALITY = 'it needs an equality: a hash or a sorted run can only find rows with the same key';

/**
 * What each algorithm costs on these tables. Memory-independent on purpose: the unit does not count the I/O of
 * spilling, so no memory control feeds this table.
 */
export function costTable(t: Tables, cond: Cond): CostRow[] {
  const row = (id: AlgorithmId, cost: number | null, refused: string | null = null): CostRow => ({ id, label: ALGORITHM_LABEL[id], cost, refused });
  const eq = cond === 'eq';
  return [
    row('nested', nestedLoop(t, cond, false).work),
    eq ? row('indexNested', nestedLoop(t, cond, true).work) : row('indexNested', null, 'the toy index probe finds exact keys only (real B-tree indexes can also serve a range)'),
    eq ? row('hash', hashJoin(t, Number.MAX_SAFE_INTEGER).work) : row('hash', null, NEEDS_EQUALITY),
    eq ? row('merge', mergeJoin(t, false).work) : row('merge', null, NEEDS_EQUALITY),
    eq ? row('mergeSorted', mergeJoin(t, true).work) : row('mergeSorted', null, NEEDS_EQUALITY),
  ];
}

/** The cheapest and dearest algorithms that can run, first on a tie. */
export function cheapestAndDearest(rows: readonly CostRow[]): { cheapest: AlgorithmId[]; dearest: AlgorithmId[] } {
  const ok = rows.filter((r): r is CostRow & { cost: number } => r.cost !== null);
  const lo = Math.min(...ok.map((r) => r.cost));
  const hi = Math.max(...ok.map((r) => r.cost));
  return { cheapest: ok.filter((r) => r.cost === lo).map((r) => r.id), dearest: ok.filter((r) => r.cost === hi).map((r) => r.id) };
}

export const SHORT_LABEL: Record<AlgorithmId, string> = {
  nested: 'Nested loop', indexNested: 'Nested loop + index', hash: 'Hash join', merge: 'Merge join', mergeSorted: 'Merge join, presorted',
};

export interface VerdictRow extends CostRow {
  /** Cost as a multiple of the cheapest, or null when the algorithm cannot run. */
  times: number | null;
  verdict: 'cheapest' | 'dearest' | 'middle' | 'refused';
}

/** Each row with its verdict, from the same numbers the table prints. */
export function withVerdicts(rows: readonly CostRow[]): VerdictRow[] {
  const { cheapest, dearest } = cheapestAndDearest(rows);
  const best = rows.find((r) => cheapest.includes(r.id))!.cost!;
  return rows.map((r) => ({
    ...r,
    times: r.cost === null ? null : r.cost / Math.max(1, best),
    verdict: r.cost === null ? 'refused' : cheapest.includes(r.id) ? 'cheapest' : dearest.includes(r.id) ? 'dearest' : 'middle',
  }));
}
