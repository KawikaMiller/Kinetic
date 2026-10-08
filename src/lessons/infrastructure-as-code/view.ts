/** How plans, worlds and the resource graph are shown. Pure, so the text and the graph edges are tested. */
import type { GraphEdge, GraphNode } from '../../components/GraphView';
import type { Tone } from '../../core/tone';
import { isRef, type Config } from './parse';
import { planCounts, UNKNOWN, type Action, type Change, type Plan, type Planned, type World } from './model';
import type { Scalar } from './schema';

export const ACTION_TONE: Record<Action, Tone> = { create: 'ok', update: 'hi', replace: 'orange', destroy: 'bad', noop: 'dim' };
export const ACTION_SYMBOL: Record<Action, string> = { create: '+', update: '~', replace: '-/+', destroy: '-', noop: ' ' };
const ACTION_PHRASE: Record<Action, string> = {
  create: 'will be created',
  update: 'will be updated in place',
  replace: 'must be replaced',
  destroy: 'will be destroyed',
  noop: 'is unchanged',
};

export const KNOWN_AFTER_APPLY = '(known after apply)';

export function fmtValue(v: Planned): string {
  if (v === undefined) return '(unset)';
  if (v === UNKNOWN) return KNOWN_AFTER_APPLY;
  return typeof v === 'string' ? `"${v}"` : String(v);
}

export interface PlanLine {
  text: string;
  tone: Tone | 'plain';
}

function attrLines(change: Change): PlanLine[] {
  return change.attrs.map((a) => {
    const why = a.cause === 'dependency' ? '  # points at something being re-created' : a.forcesNew ? '  # forces replacement' : '';
    if (change.action === 'create') return { text: `      + ${a.key} = ${fmtValue(a.to)}`, tone: 'ok' as const };
    return { text: `      ~ ${a.key}: ${fmtValue(a.from)} -> ${fmtValue(a.to)}${why}`, tone: a.forcesNew ? ('orange' as const) : ('hi' as const) };
  });
}

/** The plan as text lines: drift first, then each change with the attributes that caused it, then the totals. */
export function planLines(plan: Plan): PlanLine[] {
  const lines: PlanLine[] = [];
  for (const d of plan.drift) lines.push({ text: `# ${d.address}: ${d.key} was ${fmtValue(d.recorded)} in the state, but is ${fmtValue(d.actual)} in the cloud`, tone: 'orange' });
  for (const address of plan.gone) lines.push({ text: `# ${address} is in the state, but no longer exists in the cloud`, tone: 'orange' });
  const changed = plan.changes.filter((c) => c.action !== 'noop');
  for (const c of changed) {
    lines.push({ text: `${ACTION_SYMBOL[c.action]} ${c.address} ${ACTION_PHRASE[c.action]}`, tone: ACTION_TONE[c.action] });
    lines.push(...attrLines(c));
  }
  const unchanged = plan.changes.length - changed.length;
  if (changed.length === 0) {
    lines.push({ text: 'No changes. The config, the state and the cloud already agree.', tone: 'ok' });
  } else {
    const n = planCounts(plan);
    lines.push({ text: `Plan: ${n.add} to add, ${n.change} to change, ${n.destroy} to destroy.${unchanged ? ` ${unchanged} unchanged.` : ''}`, tone: 'plain' });
  }
  return lines;
}

/** Resources the plan destroys, replacements included (they are destroyed first). */
export const destroyed = (plan: Plan): string[] => plan.changes.filter((c) => c.action === 'destroy' || c.action === 'replace').map((c) => c.address);

/** The resource graph: every resource in the config or the state, an edge from each dependency to what depends on it. */
export function resourceGraph(config: Config, world: World): { nodes: GraphNode<string>[]; edges: GraphEdge<string>[] } {
  const addresses = new Set([...config.map((d) => d.address), ...Object.keys(world.state)]);
  const edges = new Map<string, GraphEdge<string>>();
  const add = (from: string, to: string) => edges.set(`${from}>${to}`, { from, to });
  for (const d of config) for (const v of Object.values(d.attrs)) if (isRef(v)) add(v.ref, d.address);
  for (const [address, entry] of Object.entries(world.state)) {
    if (config.some((d) => d.address === address)) continue;
    for (const dep of entry.deps) add(dep, address);
  }
  return { nodes: [...addresses].sort().map((id) => ({ id, label: id, shape: 'box' as const })), edges: [...edges.values()] };
}

/** `key: value` pairs of an attribute set, in a stable order. */
export const attrPairs = (attrs: Record<string, Scalar>): [string, string][] => Object.entries(attrs).map(([k, v]) => [k, String(v)]);
