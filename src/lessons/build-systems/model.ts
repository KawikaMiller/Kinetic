import { sha256Hex } from '../../core/crypto';

/**
 * A tiny build system over a target DAG. Two change-detection modes:
 * - `hash` (Bazel/Buck style): a target's action key is SHA-256 of its command plus the hashes
 *   of its *declared* inputs. Same key as last time: nothing to do. A rebuilt target whose
 *   output hash comes out unchanged stops the wave there (early cutoff).
 * - `time` (classic make): a target rebuilds when any declared input is newer than it.
 * The compile step itself reads the target's *actual* inputs (what the code really includes)
 * and, when the preset says so, an environment variable. When declared and actual differ,
 * the build is wrong, and `truthBuild` (a from-scratch build) is how the lesson proves it.
 */

export type Kind = 'src' | 'obj' | 'lib' | 'bin';
export interface BuildNode {
  id: string;
  kind: Kind;
  /** The command, part of the action key (empty for sources). */
  cmd: string;
}
export interface BuildGraph {
  nodes: readonly BuildNode[];
  /** Inputs the build file declares, per target. */
  declared: Readonly<Record<string, readonly string[]>>;
  /** Inputs the command really reads, per target. */
  actual: Readonly<Record<string, readonly string[]>>;
  /** Targets whose command reads an environment variable. */
  readsEnv: readonly string[];
  /** ...and whether that variable is declared, so it's part of the key. */
  envDeclared: boolean;
}

export interface FileState {
  code: string;
  comment: string;
  /** Modification time, as a logical clock tick. */
  mtime: number;
}
export type Files = Readonly<Record<string, FileState>>;

/** A source file as it sits on disk: the hashed text. */
export const fileText = (f: FileState) => `${f.code}\n// ${f.comment}`;

export type Mode = 'hash' | 'time';
export type Status = 'uptodate' | 'cutoff' | 'rebuilt' | 'hit-local' | 'hit-remote';

export interface TargetState {
  key: string;
  out: string;
  mtime: number;
}
/** What the last build left behind: each target's key, output and mtime, plus the sources it saw. */
export interface Built {
  targets: Readonly<Record<string, TargetState>>;
  srcHash: Readonly<Record<string, string>>;
  srcMtime: Readonly<Record<string, number>>;
}
export const NOTHING_BUILT: Built = { targets: {}, srcHash: {}, srcMtime: {} };
export type Cache = Readonly<Record<string, string>>;

export interface TargetResult extends TargetState {
  status: Status;
  /** In the reverse-reachable set of what changed, i.e. a candidate to rebuild. */
  candidate: boolean;
}

export interface BuildResult {
  results: Record<string, TargetResult>;
  built: Built;
  cache: Cache;
  clock: number;
  /** Sources whose hash (hash mode) or mtime (time mode) changed since the last build. */
  changed: string[];
}

export const targets = (g: BuildGraph) => g.nodes.filter((n) => n.kind !== 'src');
export const sources = (g: BuildGraph) => g.nodes.filter((n) => n.kind === 'src');

/** Kahn's algorithm over the declared edges; throws on a cycle (the presets have none). */
export function topoOrder(g: BuildGraph, deps: BuildGraph['declared'] = g.declared): string[] {
  const indeg = new Map(g.nodes.map((n) => [n.id, (deps[n.id] ?? []).length]));
  const users = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]));
  for (const n of g.nodes) for (const d of deps[n.id] ?? []) users.get(d)!.push(n.id);
  const queue = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const u of users.get(id)!) {
      indeg.set(u, indeg.get(u)! - 1);
      if (indeg.get(u) === 0) queue.push(u);
    }
  }
  if (order.length !== g.nodes.length) throw new Error('cycle in build graph');
  return order;
}

/** Everything that (transitively) declares one of `from` as an input. */
export function reverseReachable(g: BuildGraph, from: readonly string[], deps: BuildGraph['declared'] = g.declared): Set<string> {
  const seen = new Set<string>();
  const stack = [...from];
  while (stack.length) {
    const id = stack.pop()!;
    for (const n of g.nodes) {
      if (!seen.has(n.id) && (deps[n.id] ?? []).includes(id)) {
        seen.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return seen;
}

/** Without crypto.subtle every key would be the same string, so refuse rather than fake it (the stage shows a message first). */
const short = (h: string | null) => {
  if (h === null) throw new Error('SHA-256 is unavailable: this lesson needs crypto.subtle');
  return h;
};
const hash = async (s: string) => short(await sha256Hex(s));

/** A source's content hash (hash mode compares these). */
export const fileHash = (f: FileState) => hash(fileText(f));

/**
 * The action key: the command, the env var if it's declared, and the declared inputs' hashes.
 * Only declared things go in, which is exactly why an undeclared input is dangerous.
 */
export async function actionKey(g: BuildGraph, id: string, inputHashes: readonly string[], env: string): Promise<string> {
  const node = g.nodes.find((n) => n.id === id)!;
  const envPart = g.envDeclared && g.readsEnv.includes(id) ? `\nenv LOG_LEVEL=${env}` : '';
  return hash(`${node.cmd}${envPart}\n${inputHashes.join('\n')}`);
}

/**
 * Run the command: what it really produces. A compile reads its actual inputs with comments
 * stripped (so a comment-only edit compiles to identical bytes); archives and links combine
 * their inputs' outputs. An env-reading command bakes the variable in.
 */
export async function runCommand(g: BuildGraph, id: string, files: Files, outs: Readonly<Record<string, string>>, env: string): Promise<string> {
  const node = g.nodes.find((n) => n.id === id)!;
  const parts = g.actual[id].map((d) => (files[d] ? `${d}:${files[d].code}` : `${d}:${outs[d]}`));
  const envPart = g.readsEnv.includes(id) ? `\nLOG_LEVEL=${env}` : '';
  return hash(`${node.kind}:${id}\n${parts.join('\n')}${envPart}`);
}

export interface BuildOptions {
  mode: Mode;
  env: string;
  /** A shared cache another machine filled (read only here). */
  remote?: Cache;
  /** The clock tick to stamp rebuilt targets with (time mode), counted up from here. */
  clock: number;
}

/** One build: decide per target in topological order, then run what must run. */
export async function build(g: BuildGraph, files: Files, prev: Built, cache: Cache, o: BuildOptions): Promise<BuildResult> {
  const order = topoOrder(g).filter((id) => !files[id]);
  const srcHash: Record<string, string> = {};
  for (const s of sources(g)) srcHash[s.id] = await fileHash(files[s.id]);
  const changed = sources(g)
    .map((s) => s.id)
    .filter((id) => (o.mode === 'hash' ? prev.srcHash[id] !== srcHash[id] : prev.srcMtime[id] !== files[id].mtime));
  const candidates = reverseReachable(g, changed);
  const outs: Record<string, string> = {};
  const results: Record<string, TargetResult> = {};
  const nextCache: Record<string, string> = { ...cache };
  const mtimeOf = (id: string) => files[id]?.mtime ?? results[id].mtime;
  let clock = o.clock;
  for (const id of order) {
    const before = prev.targets[id];
    const inputs = g.declared[id];
    const key = await actionKey(g, id, inputs.map((d) => srcHash[d] ?? outs[d]), o.env);
    const candidate = candidates.has(id);
    let r: TargetResult;
    if (o.mode === 'time') {
      const stale = !before || inputs.some((d) => mtimeOf(d) > before.mtime);
      r = stale
        ? { key, out: await runCommand(g, id, files, outs, o.env), mtime: ++clock, status: 'rebuilt', candidate }
        : { ...before, status: 'uptodate', candidate };
    } else if (before && before.key === key) {
      r = { ...before, status: candidate ? 'cutoff' : 'uptodate', candidate };
    } else if (nextCache[key] !== undefined) {
      r = { key, out: nextCache[key], mtime: ++clock, status: 'hit-local', candidate };
    } else if (o.remote?.[key] !== undefined) {
      r = { key, out: o.remote[key], mtime: ++clock, status: 'hit-remote', candidate };
    } else {
      r = { key, out: await runCommand(g, id, files, outs, o.env), mtime: ++clock, status: 'rebuilt', candidate };
    }
    if (o.mode === 'hash') nextCache[key] = r.out;
    results[id] = r;
    outs[id] = r.out;
  }
  const built: Built = {
    targets: Object.fromEntries(order.map((id) => [id, { key: results[id].key, out: results[id].out, mtime: results[id].mtime }])),
    srcHash,
    srcMtime: Object.fromEntries(sources(g).map((s) => [s.id, files[s.id].mtime])),
  };
  return { results, built, cache: o.mode === 'hash' ? nextCache : cache, clock, changed };
}

/** The correct outputs: a from-scratch build that reads every actual input, with this machine's env. */
export async function truthBuild(g: BuildGraph, files: Files, env: string): Promise<Record<string, string>> {
  const outs: Record<string, string> = {};
  for (const id of topoOrder(g, g.actual).filter((x) => !files[x])) outs[id] = await runCommand(g, id, files, outs, env);
  return outs;
}

export type Verdict = 'ok' | 'stale' | 'poisoned';
/** Poisoned: the output came out of a cache and is wrong. Stale: wrong for any other reason. */
export function verdictOf(r: TargetResult, truth: string): Verdict {
  if (r.out === truth) return 'ok';
  return r.status === 'hit-local' || r.status === 'hit-remote' ? 'poisoned' : 'stale';
}

// ── Scheduling ────────────────────────────────────────────────────────

/** Illustrative seconds per action. */
export const DURATION: Record<Exclude<Kind, 'src'>, number> = { obj: 4, lib: 1, bin: 3 };
/** Fetching an output from a cache instead of running the command. */
export const FETCH_S = { local: 0.2, remote: 0.6 } as const;

export interface Action {
  id: string;
  seconds: number;
}
export interface Slot {
  id: string;
  worker: number;
  start: number;
  end: number;
}

/** The work a build result implies: rebuilt targets run their command, cache hits fetch. */
export function actionsOf(g: BuildGraph, results: Readonly<Record<string, TargetResult>>): Action[] {
  return targets(g).flatMap((n): Action[] => {
    const s = results[n.id]?.status;
    if (s === 'rebuilt') return [{ id: n.id, seconds: DURATION[n.kind as Exclude<Kind, 'src'>] }];
    if (s === 'hit-local') return [{ id: n.id, seconds: FETCH_S.local }];
    if (s === 'hit-remote') return [{ id: n.id, seconds: FETCH_S.remote }];
    return [];
  });
}

/** Longest chain of action time ending at each action, through declared edges between actions. */
function chainLengths(g: BuildGraph, actions: readonly Action[]): { into: Map<string, number>; tail: Map<string, number> } {
  const sec = new Map(actions.map((a) => [a.id, a.seconds]));
  const order = topoOrder(g).filter((id) => sec.has(id));
  const into = new Map<string, number>();
  for (const id of order) into.set(id, sec.get(id)! + Math.max(0, ...g.declared[id].filter((d) => sec.has(d)).map((d) => into.get(d)!)));
  const tail = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const users = order.filter((u) => g.declared[u].includes(id));
    tail.set(id, sec.get(id)! + Math.max(0, ...users.map((u) => tail.get(u)!)));
  }
  return { into, tail };
}

/** The critical path: the most time any chain of dependent actions needs, whatever the worker count. */
export const criticalPath = (g: BuildGraph, actions: readonly Action[]) => Math.max(0, ...chainLengths(g, actions).into.values());

/**
 * List scheduling on `workers` parallel lanes: whenever a worker is free, start the ready
 * action with the longest chain still behind it (critical path first).
 */
export function schedule(g: BuildGraph, actions: readonly Action[], workers: number): Slot[] {
  const { tail } = chainLengths(g, actions);
  const sec = new Map(actions.map((a) => [a.id, a.seconds]));
  const done = new Map<string, number>();
  const free = Array.from({ length: workers }, () => 0);
  const slots: Slot[] = [];
  const pending = new Set(sec.keys());
  while (pending.size) {
    const w = free.indexOf(Math.min(...free));
    const readyAt = (id: string) => Math.max(0, ...g.declared[id].filter((d) => sec.has(d)).map((d) => done.get(d) ?? Infinity));
    const ready = [...pending].filter((id) => readyAt(id) <= free[w]);
    // Nothing ready yet: this worker idles until the earliest dependency finishes.
    if (!ready.length) {
      free[w] = Math.min(...[...pending].map(readyAt));
      continue;
    }
    ready.sort((a, b) => tail.get(b)! - tail.get(a)! || a.localeCompare(b));
    const id = ready[0];
    const start = free[w];
    const end = start + sec.get(id)!;
    slots.push({ id, worker: w, start, end });
    done.set(id, end);
    free[w] = end;
    pending.delete(id);
  }
  return slots;
}

export const makespan = (slots: readonly Slot[]) => Math.max(0, ...slots.map((s) => s.end));

// ── One build, packaged for the stage ───────────────────────────────

export interface BuildRun {
  graph: BuildGraph;
  mode: Mode;
  workers: number;
  result: BuildResult;
  /** The targets as the previous build left them (to tell a new output hash from an unchanged one). */
  before: Readonly<Record<string, TargetState>>;
  /** What a from-scratch build reading every actual input produces here. */
  truth: Readonly<Record<string, string>>;
  slots: readonly Slot[];
  cleanSeconds: number;
  critical: number;
  /** Clean build: nothing kept from before. */
  clean: boolean;
}

export interface RunInput {
  graph: BuildGraph;
  files: Files;
  prev: Built;
  cache: Cache;
  options: BuildOptions;
  workers: number;
  clean: boolean;
}

/** Build, check every output against a from-scratch build, and schedule the work on the workers. */
export async function makeRun(i: RunInput): Promise<BuildRun> {
  const prev = i.clean ? NOTHING_BUILT : i.prev;
  const result = await build(i.graph, i.files, prev, i.clean ? {} : i.cache, i.options);
  const truth = await truthBuild(i.graph, i.files, i.options.env);
  const actions = actionsOf(i.graph, result.results);
  const all = targets(i.graph).map((n) => ({ id: n.id, seconds: DURATION[n.kind as Exclude<Kind, 'src'>] }));
  return {
    graph: i.graph, mode: i.options.mode, workers: i.workers, result, before: prev.targets, truth,
    slots: schedule(i.graph, actions, i.workers),
    cleanSeconds: makespan(schedule(i.graph, all, i.workers)),
    critical: criticalPath(i.graph, actions),
    clean: i.clean,
  };
}
