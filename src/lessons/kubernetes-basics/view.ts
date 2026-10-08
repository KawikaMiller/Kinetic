/** How the cluster is drawn: one cell per pod slot, coloured by what the pod is doing. Pure, so it is tested. */
import type { GridHighlight } from '../../components/CellGrid';
import type { GridCellSpec } from '../../components/cellGridPaint';
import { isReady, matchesService, ownedBy, SLOTS, type Cluster, type Pod } from './model';

export type PodState = 'Pending' | 'ContainerCreating' | 'Running' | 'Ready' | 'Terminating';

export function podState(p: Pod): PodState {
  if (p.phase === 'Running') return p.ready ? 'Ready' : 'Running';
  return p.phase;
}

export const podAt = (c: Cluster, node: number, slot: number) => c.pods.find((p) => p.node === node && p.slot === slot);

/** Pods that no node has taken yet. */
export const unscheduled = (c: Cluster) => c.pods.filter((p) => p.node === null);

export const nodeIsDown = (c: Cluster, node: number) => c.nodes[node].status !== 'Ready';

export function podCell(c: Cluster, node: number, slot: number): GridCellSpec {
  const p = podAt(c, node, slot);
  const down = nodeIsDown(c, node);
  if (!p) return down ? { fill: 'none' } : { tone: 'dim', fill: 'outline' };
  if (down) return { tone: 'bad', fill: 'tint', text: p.image };
  switch (podState(p)) {
    case 'Ready':
      return { tone: 'ok', fill: 'solid', text: p.image };
    case 'Terminating':
      return { tone: 'dim', fill: 'tint', text: p.image };
    case 'Running':
      return { tone: 'hi', fill: 'outline', text: p.image };
    default:
      return { tone: 'hi', fill: 'tint', text: p.image };
  }
}

/** The ReplicaSets that currently matter: they have pods or a wanted count. Oldest first. */
export const liveSets = (c: Cluster) => [...c.sets].filter((s) => s.spec > 0 || ownedBy(c, s).length > 0).sort((a, b) => a.revision - b.revision);

/**
 * Rings over the grid. A selected pod gets amber; during a rollout the old and the new
 * ReplicaSet's pods are ringed violet and sky; a pod the Service doesn't select is ringed dim.
 */
export function rings(c: Cluster, selected: number | null): GridHighlight[] {
  const sets = liveSets(c);
  const out: GridHighlight[] = [];
  for (const p of c.pods) {
    if (p.node === null || p.slot === null) continue;
    let tone: GridHighlight['tone'] | null = null;
    if (p.id === selected) tone = 'amber';
    else if (!matchesService(p)) tone = 'dim';
    else if (sets.length > 1 && p.owner !== null) tone = p.owner === sets[0].name ? 'violet' : 'sky';
    if (tone) out.push({ r: p.slot, c: p.node, tone });
  }
  return out;
}

export function nodeLabel(c: Cluster, node: number): string {
  const n = c.nodes[node];
  if (n.status === 'Unreachable') return `${n.name} silent`;
  if (n.status === 'NotReady') return `${n.name} NotReady`;
  return n.cordoned ? `${n.name} cordoned` : n.name;
}

export const readyCount = (c: Cluster) => c.pods.filter((p) => matchesService(p) && isReady(p)).length;

export const GRID_ROWS = SLOTS;
