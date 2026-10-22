export const MAX_NODES = 16;
/** T0, the default tree: parent of each node (the root is its own parent, as in the jump table). */
export const T0_PARENTS: readonly number[] = [0, 0, 0, 1, 1, 2, 3, 3, 4, 6, 9, 5];
export const PATH_SIZES = [16, 64, 256, 1024] as const;
export type PathSize = (typeof PATH_SIZES)[number];

/** A tree where the one-level-short table gives a wrong LCP, with the query that exposes it. */
export const SHORT_TABLE_WITNESS = { parents: [0, 0, 0, 1, 3, 4, 5], query: [2, 6] } as const;

/** Levels of the jump table: 2^levels is at least n, so every depth up to n - 1 is a sum of jumps. */
export const levelsFor = (n: number): number => Math.max(1, Math.ceil(Math.log2(n)));

export function depthsOf(parents: readonly number[]): number[] {
  const depth: number[] = [];
  parents.forEach((p, v) => {
    depth[v] = v === 0 ? 0 : depth[p] + 1;
  });
  return depth;
}

/** Valid when the root is its own parent and every other parent is an earlier node. */
export const isTree = (parents: readonly number[]): boolean => parents.length > 0 && parents.every((p, v) => (v === 0 ? p === 0 : Number.isInteger(p) && p >= 0 && p < v));

export interface Table {
  parents: readonly number[];
  depth: readonly number[];
  levels: number;
  /** up[k][v] is the 2^k-th ancestor of v, or the root when the tree is not that tall. */
  up: readonly (readonly number[])[];
}

/** The jump table: level 0 is the parent array and up[k][v] = up[k-1][up[k-1][v]]. */
export function buildTable(parents: readonly number[], levels: number = levelsFor(parents.length)): Table {
  const up: number[][] = [parents.slice()];
  for (let k = 1; k < levels; k += 1) up.push(up[k - 1].map((mid) => up[k - 1][mid]));
  return { parents, depth: depthsOf(parents), levels, up };
}

export interface Jump {
  level: number;
  from: number;
  to: number;
}

/** Climbs `steps` ancestors by the binary digits of `steps`, largest jump first. Digits above the table's top level are lost. */
export function climb(table: Table, node: number, steps: number): { node: number; jumps: Jump[] } {
  let at = node;
  const jumps: Jump[] = [];
  for (let level = table.levels - 1; level >= 0; level -= 1) {
    if (steps & (1 << level)) {
      const to = table.up[level][at];
      jumps.push({ level, from: at, to });
      at = to;
    }
  }
  return { node: at, jumps };
}

export function kthAncestor(table: Table, node: number, k: number): { node: number; jumps: Jump[] } | null {
  return k < 0 || k > table.depth[node] ? null : climb(table, node, k);
}

export interface ClimbStep {
  level: number;
  landing: readonly [number, number];
  took: boolean;
}

export interface LcaRun {
  answer: number;
  /** The deeper node first. */
  start: readonly [number, number];
  lift: Jump[];
  climbSteps: ClimbStep[];
  /** Jumps taken in both phases. */
  jumps: number;
}

/** LCA by binary lifting. `equalise: false` is the second broken variant: it skips the depth equalisation. */
export function lca(table: Table, x: number, y: number, equalise = true): LcaRun {
  let [a, b] = table.depth[x] >= table.depth[y] ? [x, y] : [y, x];
  const start = [a, b] as const;
  const lift = equalise ? climb(table, a, table.depth[a] - table.depth[b]) : { node: a, jumps: [] };
  a = lift.node;
  const climbSteps: ClimbStep[] = [];
  if (a === b) return { answer: a, start, lift: lift.jumps, climbSteps, jumps: lift.jumps.length };
  for (let level = table.levels - 1; level >= 0; level -= 1) {
    const landing = [table.up[level][a], table.up[level][b]] as const;
    const took = landing[0] !== landing[1];
    climbSteps.push({ level, landing, took });
    if (took) [a, b] = landing;
  }
  const taken = climbSteps.filter((s) => s.took).length;
  return { answer: table.up[0][a], start, lift: lift.jumps, climbSteps, jumps: lift.jumps.length + taken };
}

/** The naive walk: lift the deeper node one parent at a time, then both together. Also the oracle. */
export function naiveLca(parents: readonly number[], x: number, y: number): { answer: number; steps: number } {
  const depth = depthsOf(parents);
  let [a, b] = depth[x] >= depth[y] ? [x, y] : [y, x];
  let steps = 0;
  while (depth[a] > depth[b]) {
    a = parents[a];
    steps += 1;
  }
  while (a !== b) {
    a = parents[a];
    b = parents[b];
    steps += 2;
  }
  return { answer: a, steps };
}

export function naiveKth(parents: readonly number[], node: number, k: number): number {
  let at = node;
  for (let i = 0; i < k; i += 1) at = parents[at];
  return at;
}

export type TableMode = 'full' | 'short' | 'noEqualise';

/** The table and the equalise flag each mode runs with: `short` has one level too few. */
export function lcaWithMode(parents: readonly number[], x: number, y: number, mode: TableMode): LcaRun {
  const full = levelsFor(parents.length);
  const levels = mode === 'short' ? Math.max(1, full - 1) : full;
  return lca(buildTable(parents, levels), x, y, mode !== 'noEqualise');
}

/** Every parent array of n nodes where each parent is an earlier node: (n - 1)! trees. */
export function allTrees(n: number): number[][] {
  let trees: number[][] = [[0]];
  for (let v = 1; v < n; v += 1) trees = trees.flatMap((t) => Array.from({ length: v }, (_, p) => [...t, p]));
  return trees;
}

export interface BrokenReport {
  trees: number;
  shortFails: number;
  noEqualiseFails: number;
}

/** How many of the n-node trees each broken mode gets wrong for at least one pair of nodes. */
export function brokenReport(n = 7): BrokenReport {
  const trees = allTrees(n);
  let shortFails = 0;
  let noEqualiseFails = 0;
  for (const parents of trees) {
    let shortBad = false;
    let noEqBad = false;
    for (let x = 0; x < n; x += 1) {
      for (let y = 0; y < n; y += 1) {
        const truth = naiveLca(parents, x, y).answer;
        if (lcaWithMode(parents, x, y, 'short').answer !== truth) shortBad = true;
        if (lcaWithMode(parents, x, y, 'noEqualise').answer !== truth) noEqBad = true;
      }
    }
    if (shortBad) shortFails += 1;
    if (noEqBad) noEqualiseFails += 1;
  }
  return { trees: trees.length, shortFails, noEqualiseFails };
}

// ── Editing the tree ────────────────────────────────────────────────────

export type AddLeaf = { ok: true; parents: number[] } | { ok: false; error: string };

/** Adds a leaf under the typed parent, or says why not. */
export function addLeaf(parents: readonly number[], text: string): AddLeaf {
  const n = parents.length;
  if (n >= MAX_NODES) return { ok: false, error: `The lesson draws at most ${MAX_NODES} nodes: reset the tree to start again.` };
  const typed = text.trim();
  const parent = /^\d+$/.test(typed) ? Number(typed) : NaN;
  if (!Number.isInteger(parent) || parent >= n) return { ok: false, error: `A node needs an existing parent: type a number from 0 to ${n - 1}.` };
  return { ok: true, parents: [...parents, parent] };
}

export function childrenOf(parents: readonly number[]): number[][] {
  const kids: number[][] = parents.map(() => []);
  parents.forEach((p, v) => {
    if (v !== 0) kids[p].push(v);
  });
  return kids;
}

// ── The by-hand games ───────────────────────────────────────────────────

const steps = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`;
const tooBig = (level: number, remaining: number) => `2^${level} = ${2 ** level} is more than the ${steps(remaining)} still to climb.`;

/** Fill level 1 of the table: the learner names up[1][v]; the refusal says how the grandparent is found. */
export function judgeGrandparent(parents: readonly number[], v: number, chosen: number): { ok: true } | { ok: false; error: string } {
  const p = parents[v];
  const g = parents[p];
  if (chosen === g) return { ok: true };
  const root = v === 0 || p === 0 ? ' (the root is its own parent)' : '';
  return { ok: false, error: `up[1][${v}] is the grandparent of ${v}: parent(${v}) = ${p} and parent(${p}) = ${g}${root}, so it is ${g}, not ${chosen}.` };
}

export interface KthGame {
  table: Table;
  start: number;
  k: number;
  at: number;
  remaining: number;
  jumps: Jump[];
}

export const startKth = (table: Table, start: number, k: number): KthGame => ({ table, start, k, at: start, remaining: k, jumps: [] });

export function kthJump(game: KthGame, level: number): { game: KthGame; refusal: string | null } {
  if (2 ** level > game.remaining) return { game, refusal: tooBig(level, game.remaining) };
  const to = game.table.up[level][game.at];
  return { game: { ...game, at: to, remaining: game.remaining - 2 ** level, jumps: [...game.jumps, { level, from: game.at, to }] }, refusal: null };
}

export const popcount = (n: number): number => n.toString(2).replace(/0/g, '').length;

export interface LcaGame {
  table: Table;
  /** The deeper node first, as lifted so far. */
  a: number;
  b: number;
  start: readonly [number, number];
  phase: 'lift' | 'climb' | 'done';
  remaining: number;
  /** The level the climb phase decides next. */
  level: number;
  jumps: number;
  answer: number | null;
}

export function startLca(table: Table, x: number, y: number): LcaGame {
  const [a, b] = table.depth[x] >= table.depth[y] ? [x, y] : [y, x];
  const remaining = table.depth[a] - table.depth[b];
  const base = { table, a, b, start: [a, b] as const, remaining, level: table.levels - 1, jumps: 0 };
  if (remaining > 0) return { ...base, phase: 'lift', answer: null };
  return a === b ? { ...base, phase: 'done', answer: a } : { ...base, phase: 'climb', answer: null };
}

export function liftJump(game: LcaGame, level: number): { game: LcaGame; refusal: string | null } {
  if (game.phase !== 'lift') return { game, refusal: null };
  if (2 ** level > game.remaining) return { game, refusal: tooBig(level, game.remaining) };
  const a = game.table.up[level][game.a];
  const remaining = game.remaining - 2 ** level;
  const next = { ...game, a, remaining, jumps: game.jumps + 1 };
  if (remaining > 0) return { game: next, refusal: null };
  return { game: a === game.b ? { ...next, phase: 'done', answer: a } : { ...next, phase: 'climb' }, refusal: null };
}

export function landing(game: LcaGame): readonly [number, number] {
  return [game.table.up[game.level][game.a], game.table.up[game.level][game.b]];
}

export function decide(game: LcaGame, choice: 'jump' | 'skip'): { game: LcaGame; refusal: string | null } {
  if (game.phase !== 'climb') return { game, refusal: null };
  const [ua, ub] = landing(game);
  const equal = ua === ub;
  if (choice === 'jump' && equal) return { game, refusal: `The landing nodes are equal (${ua} and ${ub}): this jump reaches or passes the LCA, so skip it.` };
  if (choice === 'skip' && !equal) return { game, refusal: `The landing nodes differ (${ua} and ${ub}), so this jump keeps both below the LCA: take it.` };
  const moved = choice === 'jump' ? { a: ua, b: ub, jumps: game.jumps + 1 } : { a: game.a, b: game.b, jumps: game.jumps };
  const level = game.level - 1;
  if (level < 0) return { game: { ...game, ...moved, level, phase: 'done', answer: game.table.up[0][moved.a] }, refusal: null };
  return { game: { ...game, ...moved, level }, refusal: null };
}

// ── Scene 4: the path ───────────────────────────────────────────────────

export const pathParents = (n: number): number[] => Array.from({ length: n }, (_, v) => Math.max(0, v - 1));

export interface PathStats {
  n: number;
  levels: number;
  jumps: number;
  steps: number;
  entries: number;
}

/** A real run of lca(deepest, root) on a path of n nodes against the n - 1 parent steps of the walk. */
export function pathStats(n: number): PathStats {
  const parents = pathParents(n);
  const table = buildTable(parents);
  return { n, levels: table.levels, jumps: lca(table, n - 1, 0).jumps, steps: naiveLca(parents, n - 1, 0).steps, entries: n * table.levels };
}
