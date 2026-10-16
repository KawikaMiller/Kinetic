/**
 * warehouse-lake-lakehouse, scene 4: a table format over immutable files. A commit writes new data files, then a snapshot that
 * lists the files making up the table, then switches a current-snapshot pointer in one atomic step. Readers go through the pointer.
 * Without that layer a reader lists the directory, and what it sees depends on when it looks. Concurrency is settled by
 * enumerating every interleaving of the steps, not by sampling.
 */

export interface Snapshot {
  id: number;
  files: string[];
  note: string;
}

export interface Lake {
  /** Immutable data files: name to the row ids inside. Written once, never changed. */
  files: Record<string, number[]>;
  /** Committed snapshots in order; ids start at 1. */
  snapshots: Snapshot[];
  /** The pointer: the id of the snapshot readers use. */
  current: number;
  nextFile: number;
  nextRow: number;
}

/** Rows a new data file holds. */
export const FILE_ROWS = 2;
export const START_COMMITS = 3;

export const fileName = (n: number): string => `part-${String(n).padStart(2, '0')}`;

const commit = (lake: Lake, files: Record<string, number[]>, list: string[], note: string, nextFile: number, nextRow: number): Lake => {
  const id = lake.snapshots.length + 1;
  return { files, snapshots: [...lake.snapshots, { id, files: list, note }], current: id, nextFile, nextRow };
};

export function emptyLake(): Lake {
  return { files: {}, snapshots: [], current: 0, nextFile: 1, nextRow: 1 };
}

/** Add a file of `count` new rows and commit a snapshot that includes it. */
export function append(lake: Lake, count: number = FILE_ROWS): Lake {
  const name = fileName(lake.nextFile);
  const rows = Array.from({ length: count }, (_, i) => lake.nextRow + i);
  const list = [...(lake.snapshots.find((s) => s.id === lake.current)?.files ?? []), name];
  return commit(lake, { ...lake.files, [name]: rows }, list, `append ${count} rows`, lake.nextFile + 1, lake.nextRow + count);
}

export function initialLake(): Lake {
  let lake = emptyLake();
  for (let i = 0; i < START_COMMITS; i++) lake = append(lake);
  return lake;
}

export const currentFiles = (lake: Lake): string[] => lake.snapshots.find((s) => s.id === lake.current)?.files ?? [];

/** The rows of a snapshot: the union of its files, sorted. */
export function readSnapshot(lake: Lake, id: number): number[] {
  const snap = lake.snapshots.find((s) => s.id === id);
  return snap ? snap.files.flatMap((f) => lake.files[f]).sort((a, b) => a - b) : [];
}

export const readTable = (lake: Lake): number[] => readSnapshot(lake, lake.current);

/**
 * Delete rows by copy-on-write: every file holding one is rewritten without them as a new file (an emptied file is dropped), and a
 * new snapshot lists the rewritten set. The old files stay for time travel.
 */
export function deleteRows(lake: Lake, ids: readonly number[]): Lake {
  const gone = new Set(ids);
  const files = { ...lake.files };
  let nextFile = lake.nextFile;
  const list: string[] = [];
  for (const f of currentFiles(lake)) {
    const rows = lake.files[f];
    if (!rows.some((r) => gone.has(r))) {
      list.push(f);
      continue;
    }
    const kept = rows.filter((r) => !gone.has(r));
    if (kept.length > 0) {
      const name = fileName(nextFile++);
      files[name] = kept;
      list.push(name);
    }
  }
  return commit(lake, files, list, `delete ${ids.length} rows`, nextFile, lake.nextRow);
}

/** Files written but never committed to any snapshot: invisible through the pointer, visible in a directory listing. */
export function orphanFiles(lake: Lake): string[] {
  const used = new Set(lake.snapshots.flatMap((s) => s.files));
  return Object.keys(lake.files).filter((f) => !used.has(f));
}

/** A writer that crashed: it wrote `files` data files (1 or 2) and perhaps a snapshot list, but never switched the pointer. */
export function crashWriter(lake: Lake, files: 1 | 2): Lake {
  const out = { ...lake.files };
  let nextFile = lake.nextFile;
  let nextRow = lake.nextRow;
  for (let i = 0; i < files; i++) {
    out[fileName(nextFile++)] = Array.from({ length: FILE_ROWS }, (_, k) => nextRow + k);
    nextRow += FILE_ROWS;
  }
  return { ...lake, files: out, nextFile, nextRow };
}

/** Remove the orphans (what a cleanup job does). */
export function cleanOrphans(lake: Lake): Lake {
  const orphans = new Set(orphanFiles(lake));
  return { ...lake, files: Object.fromEntries(Object.entries(lake.files).filter(([f]) => !orphans.has(f))) };
}

/** What a reader with no table format sees: the files of the current table plus whatever else is in the directory, uncommitted or not. */
export function directoryRows(lake: Lake): number[] {
  const live = new Set([...currentFiles(lake), ...orphanFiles(lake)]);
  return [...live].flatMap((f) => lake.files[f]).sort((a, b) => a - b);
}

/** Every way to merge two ordered step lists of length `a` and `b`: C(a + b, a) of them, each a sequence of 'A' and 'B' turns. */
export function interleavings(a: number, b: number): ('A' | 'B')[][] {
  if (a === 0) return [Array<'B'>(b).fill('B')];
  if (b === 0) return [Array<'A'>(a).fill('A')];
  return [...interleavings(a - 1, b).map((s) => ['A' as const, ...s]), ...interleavings(a, b - 1).map((s) => ['B' as const, ...s])];
}

export const WRITER_STEPS = ['write file A', 'write file B', 'write the snapshot list', 'switch the pointer'] as const;
export const READER_STEPS_ON = ['read the pointer', 'read the files it lists'] as const;
export const READER_STEPS_OFF = ['list the directory', 'read the files listed'] as const;

export type Seen = 'old' | 'new' | 'torn';
export interface ReadOutcome {
  /** The interleaving as labelled steps in the order they happened. */
  order: string[];
  rows: number[];
  kind: Seen;
}

export interface ReaderVsWriter {
  layer: boolean;
  total: number;
  outcomes: ReadOutcome[];
  old: number;
  new: number;
  torn: number;
  firstTorn: ReadOutcome | null;
  /** The table before the writer's commit and after it. */
  before: number[];
  after: number[];
}

/**
 * One writer (four steps) against one reader (two): run every interleaving. The writer adds files A and B, then lists them in a snapshot,
 * then switches the pointer. The reader either goes through the pointer (`layer` on) or lists the directory (off). Each result is
 * classified against the two committed tables: the one before the commit and the one after.
 */
export function readerVsWriter(lake: Lake, layer: boolean): ReaderVsWriter {
  const before = readTable(lake);
  const a = Array.from({ length: FILE_ROWS }, (_, i) => lake.nextRow + i);
  const b = Array.from({ length: FILE_ROWS }, (_, i) => lake.nextRow + FILE_ROWS + i);
  const after = [...before, ...a, ...b].sort((x, y) => x - y);
  const baseDir = directoryRows(lake);
  const readerSteps = layer ? READER_STEPS_ON : READER_STEPS_OFF;
  const outcomes: ReadOutcome[] = interleavings(WRITER_STEPS.length, readerSteps.length).map((turns) => {
    let w = 0;
    let r = 0;
    let listed: { a: boolean; b: boolean } | null = null;
    let pointerNew: boolean | null = null;
    let rows: number[] = [];
    const order: string[] = [];
    for (const turn of turns) {
      if (turn === 'A') {
        order.push(`writer: ${WRITER_STEPS[w]}`);
        w++;
      } else {
        order.push(`reader: ${readerSteps[r]}`);
        if (r === 0) {
          if (layer) pointerNew = w >= WRITER_STEPS.length;
          else listed = { a: w >= 1, b: w >= 2 };
        } else {
          rows = layer ? (pointerNew ? after : before) : [...baseDir, ...(listed!.a ? a : []), ...(listed!.b ? b : [])].sort((x, y) => x - y);
        }
        r++;
      }
    }
    const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    const kind: Seen = same(rows, before) ? 'old' : same(rows, after) ? 'new' : 'torn';
    return { order, rows, kind };
  });
  return {
    layer,
    total: outcomes.length,
    outcomes,
    old: outcomes.filter((o) => o.kind === 'old').length,
    new: outcomes.filter((o) => o.kind === 'new').length,
    torn: outcomes.filter((o) => o.kind === 'torn').length,
    firstTorn: outcomes.find((o) => o.kind === 'torn') ?? null,
    before,
    after,
  };
}

/** A reader that arrives after a writer crashed with `files` files written: through the pointer or by listing the directory. */
export function readAfterCrash(lake: Lake, layer: boolean): { rows: number[]; kind: 'committed' | 'uncommitted rows visible' } {
  const committed = readTable(lake);
  const rows = layer ? committed : directoryRows(lake);
  return { rows, kind: rows.length === committed.length && rows.every((v, i) => v === committed[i]) ? 'committed' : 'uncommitted rows visible' };
}

// ---- two writers ----

/** A writer's steps: read the current version, write its file, write a snapshot list from what it read, then compare-and-swap the pointer. */
export const RACE_STEPS = ['read the current snapshot', 'write its file', 'write a snapshot list', 'swap the pointer (compare-and-swap)'] as const;

export interface RaceOutcome {
  order: string[];
  /** Compare-and-swaps that failed, which are the retries. */
  conflicts: number;
  /** Which writer's swap succeeded first. */
  winner: 'A' | 'B';
  /** Final table (rows of the last snapshot) and the number of commits made. */
  rows: number[];
  commits: number;
}

export interface Race {
  total: number;
  outcomes: RaceOutcome[];
  withConflict: number;
  withoutConflict: number;
  lostUpdates: number;
  /** The interleaving where both writers read first, then write, as the canonical example. */
  bothReadFirst: RaceOutcome;
  expected: number[];
}

/**
 * Two writers each append a file to the same table. Optimistic concurrency: a writer swaps the pointer only if it still holds the
 * version it read; a failed swap means someone else committed first, so it re-reads, rebuilds its snapshot list on top of that and tries again.
 * All C(8, 4) = 70 interleavings of the two four-step lists are run. With `compareAndSwap` off the swap is a blind overwrite, which is the
 * variant the tests use to show what the compare buys.
 */
export function race(lake: Lake, compareAndSwap = true): Race {
  const baseVersion = lake.current;
  const baseFiles = currentFiles(lake);
  const expected = [...readTable(lake), ...[0, 1].flatMap((w) => Array.from({ length: FILE_ROWS }, (_, i) => lake.nextRow + w * FILE_ROWS + i))].sort((x, y) => x - y);
  const outcomes: RaceOutcome[] = interleavings(RACE_STEPS.length, RACE_STEPS.length).map((turns) => {
    const names = [fileName(lake.nextFile), fileName(lake.nextFile + 1)];
    const rowsOf = (w: number) => Array.from({ length: FILE_ROWS }, (_, i) => lake.nextRow + w * FILE_ROWS + i);
    const files: Record<string, number[]> = { ...lake.files };
    const versions = new Map<number, string[]>([[baseVersion, baseFiles]]);
    let pointer = baseVersion;
    const step = [0, 0];
    const read = [baseVersion, baseVersion];
    const list: string[][] = [[], []];
    let conflicts = 0;
    let winner: 'A' | 'B' | null = null;
    const order: string[] = [];
    const done = [false, false];
    const turnOf = (t: 'A' | 'B') => (t === 'A' ? 0 : 1);
    const run = (w: number) => {
      const s = step[w];
      order.push(`${'AB'[w]}: ${RACE_STEPS[s]}`);
      if (s === 0) read[w] = pointer;
      if (s === 1) files[names[w]] = rowsOf(w);
      if (s === 2) list[w] = [...(versions.get(read[w]) ?? []), names[w]];
      if (s === 3) {
        if (!compareAndSwap || pointer === read[w]) {
          pointer += 1;
          versions.set(pointer, list[w]);
          winner ??= w === 0 ? 'A' : 'B';
          done[w] = true;
        } else {
          conflicts++;
          order.push(`${'AB'[w]}: the swap fails (the pointer moved), so it re-reads and tries again`);
          read[w] = pointer;
          list[w] = [...(versions.get(read[w]) ?? []), names[w]];
          pointer += 1;
          versions.set(pointer, list[w]);
          order.push(`${'AB'[w]}: swaps again, and this time it holds`);
          done[w] = true;
        }
      }
      step[w] = s + 1;
    };
    for (const t of turns) run(turnOf(t));
    const finalRows = (versions.get(pointer) ?? []).flatMap((f) => files[f]).sort((x, y) => x - y);
    return { order, conflicts, winner: winner ?? 'A', rows: finalRows, commits: pointer - baseVersion };
  });
  const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const bothReadFirst = outcomes.find((o) => o.order[0].endsWith(RACE_STEPS[0]) && o.order[1].endsWith(RACE_STEPS[0]))!;
  return {
    total: outcomes.length,
    outcomes,
    withConflict: outcomes.filter((o) => o.conflicts > 0).length,
    withoutConflict: outcomes.filter((o) => o.conflicts === 0).length,
    lostUpdates: outcomes.filter((o) => !same(o.rows, expected)).length,
    bothReadFirst,
    expected,
  };
}
