/**
 * Plan and apply over a small resource model. Three stores, as in a real tool:
 *  - the config (what you declared),
 *  - the state (what the tool last recorded: a resource's id, attributes and dependencies),
 *  - the cloud (what actually exists, which people can change behind the tool's back).
 */
import { isRef, type Config, type ResourceDecl } from './parse';
import { forcesNew, SCHEMA, TYPE_NAMES, type Scalar } from './schema';

export interface StateEntry {
  id: string;
  type: string;
  /** Attributes as last recorded; references hold the target's id. */
  attrs: Record<string, Scalar>;
  /** Addresses this resource depends on. */
  deps: string[];
}
export type State = Record<string, StateEntry>;

export interface CloudObject {
  type: string;
  attrs: Record<string, Scalar>;
}
export interface Cloud {
  objects: Record<string, CloudObject>;
  nextId: number;
}
export interface World {
  state: State;
  cloud: Cloud;
}

export const FIRST_ID = 1001;
export const emptyWorld = (): World => ({ state: {}, cloud: { objects: {}, nextId: FIRST_ID } });

/** A value that will only exist once the thing it points at has been created. */
export const UNKNOWN = Symbol('known after apply');
export type Planned = Scalar | typeof UNKNOWN | undefined;

export type Action = 'create' | 'update' | 'replace' | 'destroy' | 'noop';

export interface AttrChange {
  key: string;
  from: Scalar | undefined;
  to: Planned;
  forcesNew: boolean;
  /** Changed because you edited the config, or because something it points at is being re-created. */
  cause: 'config' | 'dependency';
}

export interface Change {
  address: string;
  type: string;
  action: Action;
  attrs: AttrChange[];
}

export interface Drift {
  address: string;
  key: string;
  recorded: Scalar | undefined;
  actual: Scalar | undefined;
}

export interface Plan {
  changes: Change[];
  /** Differences between the state file and the cloud that the refresh found. */
  drift: Drift[];
  /** Addresses in the state whose cloud object no longer exists. */
  gone: string[];
}

export const isNoop = (plan: Plan) => plan.changes.every((c) => c.action === 'noop');

/** Terraform-style counts: a replacement is one add and one destroy. */
export function planCounts(plan: Plan) {
  const n = (a: Action) => plan.changes.filter((c) => c.action === a).length;
  return { add: n('create') + n('replace'), change: n('update'), destroy: n('destroy') + n('replace') };
}

/** Where an address sorts among independent resources: by type (network first), then by name. */
const byTypeThenName = (a: string, b: string) => TYPE_NAMES.indexOf(a.split('.')[0]) - TYPE_NAMES.indexOf(b.split('.')[0]) || a.localeCompare(b);

/** Dependency order, dependencies first; independent resources go in a fixed order (network, vm, bucket, dns) so it is stable. */
export function topoOrder(nodes: readonly string[], depsOf: (address: string) => readonly string[]): string[] {
  const set = new Set(nodes);
  const waiting = new Map(nodes.map((n) => [n, depsOf(n).filter((d) => set.has(d)).length]));
  const out: string[] = [];
  const ready = () => nodes.filter((n) => waiting.get(n) === 0 && !out.includes(n)).sort(byTypeThenName);
  for (let batch = ready(); batch.length; batch = ready()) {
    const next = batch[0];
    out.push(next);
    for (const n of nodes) if (depsOf(n).includes(next)) waiting.set(n, (waiting.get(n) ?? 0) - 1);
  }
  return out;
}

const configDeps = (decl: ResourceDecl) => Object.values(decl.attrs).flatMap((v) => (isRef(v) ? [v.ref] : []));

/** The state with every entry re-read from the cloud, plus what the refresh found. */
export function refresh(world: World): { refreshed: State; drift: Drift[]; gone: string[] } {
  const refreshed: State = {};
  const drift: Drift[] = [];
  const gone: string[] = [];
  for (const [address, entry] of Object.entries(world.state)) {
    const real = world.cloud.objects[entry.id];
    if (!real) {
      gone.push(address);
      continue;
    }
    for (const key of new Set([...Object.keys(entry.attrs), ...Object.keys(real.attrs)])) {
      if (entry.attrs[key] !== real.attrs[key]) drift.push({ address, key, recorded: entry.attrs[key], actual: real.attrs[key] });
    }
    refreshed[address] = { ...entry, attrs: { ...real.attrs } };
  }
  return { refreshed, drift, gone };
}

/** What the config says an attribute should be, with references resolved against what will exist. */
function desiredAttrs(decl: ResourceDecl, idAfter: (address: string) => string | typeof UNKNOWN | undefined): Record<string, Planned> {
  const out: Record<string, Planned> = {};
  for (const [key, v] of Object.entries(decl.attrs)) out[key] = isRef(v) ? idAfter(v.ref) : v;
  return out;
}

export function plan(config: Config, world: World): Plan {
  const { refreshed, drift, gone } = refresh(world);
  const byAddress = new Map(config.map((d) => [d.address, d]));
  const action: Record<string, Action> = {};
  const changes: Change[] = [];
  const idAfter = (address: string) => (action[address] === 'create' || action[address] === 'replace' ? UNKNOWN : refreshed[address]?.id);

  for (const address of topoOrder([...byAddress.keys()], (a) => configDeps(byAddress.get(a)!))) {
    const decl = byAddress.get(address)!;
    const current = refreshed[address];
    const want = desiredAttrs(decl, idAfter);
    if (!current) {
      action[address] = 'create';
      changes.push({
        address,
        type: decl.type,
        action: 'create',
        attrs: Object.keys(want).map((key) => ({ key, from: undefined, to: want[key], forcesNew: false, cause: 'config' })),
      });
      continue;
    }
    const attrs: AttrChange[] = [];
    for (const key of new Set([...Object.keys(want), ...Object.keys(current.attrs)])) {
      const to = want[key];
      if (to === current.attrs[key]) continue;
      const viaRef = isRef(decl.attrs[key]) && to === UNKNOWN;
      attrs.push({ key, from: current.attrs[key], to, forcesNew: forcesNew(decl.type, key), cause: viaRef ? 'dependency' : 'config' });
    }
    action[address] = attrs.length === 0 ? 'noop' : attrs.some((a) => a.forcesNew) ? 'replace' : 'update';
    changes.push({ address, type: decl.type, action: action[address], attrs });
  }
  for (const address of Object.keys(refreshed).sort()) {
    if (byAddress.has(address)) continue;
    changes.push({ address, type: refreshed[address].type, action: 'destroy', attrs: [] });
  }
  changes.sort((a, b) => a.address.localeCompare(b.address));
  return { changes, drift, gone };
}

export interface Step {
  address: string;
  op: 'destroy' | 'create' | 'update';
}

/**
 * Apply order: first everything being destroyed (dependents before the things they depend on),
 * then everything being created or updated (dependencies first). A replacement is a destroy in
 * the first half and a create in the second.
 */
export function applySteps(config: Config, world: World, p: Plan): Step[] {
  const { refreshed } = refresh(world);
  const act = new Map(p.changes.map((c) => [c.address, c.action]));
  const doomed = p.changes.filter((c) => c.action === 'destroy' || c.action === 'replace').map((c) => c.address);
  const destroyOrder = topoOrder(doomed, (a) => refreshed[a].deps).reverse();
  const byAddress = new Map(config.map((d) => [d.address, d]));
  const buildOrder = topoOrder([...byAddress.keys()], (a) => configDeps(byAddress.get(a)!));
  const steps: Step[] = destroyOrder.map((address) => ({ address, op: 'destroy' }));
  for (const address of buildOrder) {
    const a = act.get(address);
    if (a === 'create' || a === 'replace') steps.push({ address, op: 'create' });
    else if (a === 'update') steps.push({ address, op: 'update' });
  }
  return steps;
}

export interface StepResult {
  step: Step;
  status: 'ok' | 'failed' | 'skipped';
  message: string;
  id?: string;
}

export interface ApplyRun {
  steps: Step[];
  results: StepResult[];
  /** The world after each step. */
  snapshots: World[];
  final: World;
}

const cloneWorld = (w: World): World => structuredClone(w);

function resolvedAttrs(decl: ResourceDecl, state: State): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const [key, v] of Object.entries(decl.attrs)) out[key] = isRef(v) ? state[v.ref].id : v;
  return out;
}

/** Execute a plan against the cloud. A create whose name is taken fails, and anything depending on it is skipped. */
export function apply(config: Config, world: World, p: Plan): ApplyRun {
  const steps = applySteps(config, world, p);
  const byAddress = new Map(config.map((d) => [d.address, d]));
  const current = cloneWorld(world);
  const broken = new Set<string>();
  const results: StepResult[] = [];
  const snapshots: World[] = [];

  for (const step of steps) {
    const { address, op } = step;
    const decl = byAddress.get(address);
    if (op === 'destroy') {
      const entry = current.state[address];
      delete current.cloud.objects[entry.id];
      delete current.state[address];
      results.push({ step, status: 'ok', message: `destroyed ${entry.id}`, id: entry.id });
    } else if (decl) {
      const blocker = configDeps(decl).find((d) => broken.has(d));
      if (blocker) {
        broken.add(address);
        results.push({ step, status: 'skipped', message: `skipped: ${blocker} did not apply` });
      } else if (op === 'create') {
        const attrs = resolvedAttrs(decl, current.state);
        const clash = Object.entries(current.cloud.objects).find(([, o]) => o.type === decl.type && o.attrs.name === attrs.name);
        if (clash) {
          broken.add(address);
          results.push({ step, status: 'failed', message: `a ${decl.type} named "${String(attrs.name)}" already exists (${clash[0]}) and is not in the state` });
        } else {
          const id = `${SCHEMA[decl.type].idPrefix}-${current.cloud.nextId++}`;
          current.cloud.objects[id] = { type: decl.type, attrs };
          current.state[address] = { id, type: decl.type, attrs: { ...attrs }, deps: configDeps(decl) };
          results.push({ step, status: 'ok', message: `created ${id}`, id });
        }
      } else {
        const attrs = resolvedAttrs(decl, current.state);
        const entry = current.state[address];
        current.cloud.objects[entry.id].attrs = { ...attrs };
        current.state[address] = { ...entry, attrs: { ...attrs }, deps: configDeps(decl) };
        results.push({ step, status: 'ok', message: `updated ${entry.id} in place`, id: entry.id });
      }
    }
    snapshots.push(cloneWorld(current));
  }
  return { steps, results, snapshots, final: current };
}

/** Plan, then apply the whole plan: how the presets build their starting worlds. */
export function converge(config: Config, world: World = emptyWorld()): World {
  return apply(config, world, plan(config, world)).final;
}

/** Edit a resource in the cloud directly, as someone clicking in a console would. */
export function consoleEdit(world: World, address: string, key: string, value: Scalar): World {
  const next = cloneWorld(world);
  const entry = next.state[address];
  next.cloud.objects[entry.id].attrs[key] = value;
  return next;
}

/** Delete the state file: the cloud keeps everything, the tool remembers nothing. */
export const loseState = (world: World): World => ({ state: {}, cloud: cloneWorld(world).cloud });
