/**
 * The reconciliation loop, pure: a toy controller, not Kubernetes. A state is a set of named resources; the controller compares the full
 * desired state with the live one and returns the actions that would make them match. There is no API server and there are no real manifests.
 */

export type Kind = 'deployment' | 'service';

export interface Spec {
  kind: Kind;
  image?: string;
  replicas?: number;
  port?: number;
}

export type State = Readonly<Record<string, Spec>>;

export const IMAGE_TAGS = ['v1', 'v2', 'v3'] as const;
export const REPLICAS_MAX = 20;
/** Requests per second one replica of the web deployment serves, and the two traffic levels of scene 3. */
export const REPLICA_CAPACITY = 100;
export const LOAD_NORMAL = 200;
export const LOAD_SPIKE = 900;

export const DESIRED_START: State = {
  web: { kind: 'deployment', image: 'web:v1', replicas: 3 },
  api: { kind: 'deployment', image: 'api:v1', replicas: 2 },
  worker: { kind: 'deployment', image: 'worker:v1', replicas: 1 },
  'web-svc': { kind: 'service', port: 80 },
};

export type Action =
  | { type: 'create'; key: string; spec: Spec }
  | { type: 'update'; key: string; spec: Spec }
  | { type: 'delete'; key: string };

export const sameSpec = (a: Spec | undefined, b: Spec | undefined): boolean =>
  a !== undefined && b !== undefined && a.kind === b.kind && a.image === b.image && a.replicas === b.replicas && a.port === b.port;

/** The text of a spec, as it appears in a diff. */
export const specText = (s: Spec): string => (s.kind === 'service' ? `service, port ${s.port}` : `${s.image}, ${s.replicas} ${s.replicas === 1 ? 'replica' : 'replicas'}`);

const sortedKeys = (s: State) => Object.keys(s).sort();

export interface Plan {
  actions: Action[];
  /** Keys that exist live but not in the desired state, and are left alone because pruning is off. */
  orphans: string[];
}

/**
 * Compare the whole desired state with the whole live state and list what would make live match: create what is missing, update what
 * differs, and delete what is no longer desired only when `prune` is on (otherwise it is reported as an orphan).
 */
export function reconcile(desired: State, live: State, { prune }: { prune: boolean }): Plan {
  const actions: Action[] = [];
  for (const key of sortedKeys(desired)) {
    if (!(key in live)) actions.push({ type: 'create', key, spec: desired[key] });
    else if (!sameSpec(desired[key], live[key])) actions.push({ type: 'update', key, spec: desired[key] });
  }
  const extra = sortedKeys(live).filter((key) => !(key in desired));
  if (prune) for (const key of extra) actions.push({ type: 'delete', key });
  return { actions, orphans: prune ? [] : extra };
}

export function apply(live: State, action: Action): State {
  const next: Record<string, Spec> = { ...live };
  if (action.type === 'delete') delete next[action.key];
  else next[action.key] = action.spec;
  return next;
}

/** Is there drift: anything the controller would change, or leave behind as an orphan? */
export const hasDrift = (desired: State, live: State, prune: boolean): boolean => {
  const plan = reconcile(desired, live, { prune });
  return plan.actions.length > 0 || plan.orphans.length > 0;
};

/** The diff the next sync would make, as text lines for a CodePanel: `-` for what is live now, `+` for what it will become. */
export function diffLines(desired: State, live: State, prune: boolean): { text: string; mark: 'add' | 'del' | 'idle' }[] {
  const out: { text: string; mark: 'add' | 'del' | 'idle' }[] = [];
  const { actions, orphans } = reconcile(desired, live, { prune });
  for (const a of actions) {
    if (a.type !== 'create') out.push({ text: `- ${a.key}: ${specText(live[a.key])}`, mark: 'del' });
    if (a.type !== 'delete') out.push({ text: `+ ${a.key}: ${specText(a.spec)}`, mark: 'add' });
  }
  for (const key of orphans) out.push({ text: `  ${key}: ${specText(live[key])}  (orphan: not in git, not pruned)`, mark: 'idle' });
  return out.length ? out : [{ text: '  (live matches git)', mark: 'idle' }];
}
