// A model of JavaScript scope: environment records (one per call or block) that
// link outward to their parent, function objects that remember the environment
// they were created in, and name lookup that walks outward until it finds a binding.
// Pure and immutable, so a preset is a list of worlds the player steps through.

export type Value = { kind: 'prim'; text: string } | { kind: 'fn'; id: string } | { kind: 'unset' };

/** Where a box is drawn: a column and a row, fixed by the preset so nothing jumps. */
export interface Place {
  col: 0 | 1 | 2;
  row: number;
}

export interface Env {
  id: string;
  label: string;
  parent: string | null;
  vars: { name: string; value: Value }[];
  place: Place;
}

export interface Fn {
  id: string;
  label: string;
  /** The environment it was created in: its closure. */
  env: string;
  place: Place;
}

export interface World {
  envs: Env[];
  fns: Fn[];
  /** Environments of the calls running right now, innermost last. */
  running: string[];
  /** Callbacks waiting in the timer queue (setTimeout). They keep their closures alive. */
  timers: string[];
  out: string[];
}

export const prim = (text: string | number): Value => ({ kind: 'prim', text: String(text) });
export const fnRef = (id: string): Value => ({ kind: 'fn', id });
export const UNSET: Value = { kind: 'unset' };
export const GLOBAL = 'global';

export function emptyWorld(): World {
  return { envs: [{ id: GLOBAL, label: 'global', parent: null, vars: [], place: { col: 0, row: 0 } }], fns: [], running: [GLOBAL], timers: [], out: [] };
}

export const envById = (w: World, id: string) => w.envs.find((e) => e.id === id);
export const fnById = (w: World, id: string) => w.fns.find((f) => f.id === id);

function mustEnv(w: World, id: string): Env {
  const e = envById(w, id);
  if (!e) throw new Error(`model: no environment ${id}`);
  return e;
}

// ── Operations ───────────────────────────────────────────────────────

/** A new environment record: a function call's or a block's (a `let` loop iteration). */
export function newEnv(w: World, env: Omit<Env, 'vars'> & { vars?: [string, Value][] }): World {
  const record: Env = { ...env, vars: (env.vars ?? []).map(([name, value]) => ({ name, value })) };
  return { ...w, envs: [...w.envs, record] };
}

/** Declare or update a binding in a specific environment. */
export function setVar(w: World, envId: string, name: string, value: Value): World {
  const env = mustEnv(w, envId);
  const vars = env.vars.some((v) => v.name === name) ? env.vars.map((v) => (v.name === name ? { name, value } : v)) : [...env.vars, { name, value }];
  return { ...w, envs: w.envs.map((e) => (e.id === envId ? { ...e, vars } : e)) };
}

/** Assign to whatever binding `name` resolves to from `fromEnv` (JS assignment walks outward too). */
export function assign(w: World, fromEnv: string, name: string, value: Value): World {
  const found = lookup(w, fromEnv, name).found;
  if (!found) throw new Error(`model: ${name} is not defined`);
  return setVar(w, found, name, value);
}

/** Create a function object whose closure is `env`. */
export function newFn(w: World, fn: Fn): World {
  return { ...w, fns: [...w.fns, fn] };
}

/** Start running code in `envId` (a call), or finish the innermost call. */
export const enter = (w: World, envId: string): World => ({ ...w, running: [...w.running, envId] });
export const leave = (w: World): World => ({ ...w, running: w.running.slice(0, -1) });

export const schedule = (w: World, fnId: string): World => ({ ...w, timers: [...w.timers, fnId] });
export const dequeue = (w: World): World => ({ ...w, timers: w.timers.slice(1) });

export const print = (w: World, line: string): World => ({ ...w, out: [...w.out, line] });

/** The garbage collector runs: environments and functions nothing can reach are removed. */
export function collect(w: World): World {
  const live = reachable(w);
  return { ...w, envs: w.envs.filter((e) => live.envs.has(e.id)), fns: w.fns.filter((f) => live.fns.has(f.id)) };
}

// ── Lookup ───────────────────────────────────────────────────────────

export interface LookupResult {
  /** Environments checked, innermost first, ending where the name was found (or at global). */
  path: string[];
  found: string | null;
  value: Value | null;
}

/** Resolve `name` from `fromEnv` the way JavaScript does: this environment, then its parent, outward. */
export function lookup(w: World, fromEnv: string, name: string): LookupResult {
  const path: string[] = [];
  for (let id: string | null = fromEnv; id; id = mustEnv(w, id).parent) {
    path.push(id);
    const hit = mustEnv(w, id).vars.find((v) => v.name === name);
    if (hit) return { path, found: id, value: hit.value };
  }
  return { path, found: null, value: null };
}

/** The primitive text `name` resolves to, for console output. */
export function read(w: World, fromEnv: string, name: string): string {
  const r = lookup(w, fromEnv, name);
  if (!r.value || r.value.kind !== 'prim') throw new Error(`model: ${name} doesn't resolve to a primitive`);
  return r.value.text;
}

// ── Reachability ─────────────────────────────────────────────────────

/**
 * What the program can still reach: running environments and their parents, pending
 * timer callbacks, anything a reachable binding holds, and every closure of a reachable function.
 */
export function reachable(w: World): { envs: Set<string>; fns: Set<string> } {
  const envs = new Set<string>();
  const fns = new Set<string>();
  const visitEnv = (id: string | null) => {
    if (!id || envs.has(id)) return;
    envs.add(id);
    const env = mustEnv(w, id);
    visitEnv(env.parent);
    for (const v of env.vars) if (v.value.kind === 'fn') visitFn(v.value.id);
  };
  const visitFn = (id: string) => {
    if (fns.has(id)) return;
    fns.add(id);
    const fn = fnById(w, id);
    if (fn) visitEnv(fn.env);
  };
  w.running.forEach(visitEnv);
  w.timers.forEach(visitFn);
  return { envs, fns };
}

/** Environments a function still holds on to: drawn as captured. */
export function capturedEnvs(w: World): Set<string> {
  const live = reachable(w);
  return new Set(w.fns.filter((f) => live.fns.has(f.id)).map((f) => f.env));
}
