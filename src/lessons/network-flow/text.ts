import { crossingEdges, cutCapacity, edmondsKarp, isMaximum, presetById, reachableSet, type Arc, type Network } from './model';

/** What the matching preset's flow means, computed from the run. */
export function matchingLine(): string {
  const net = presetById('matching').net;
  const run = edmondsKarp(net);
  const pairs = run.flow.flatMap((f, i) => {
    const e = net.edges[i];
    return f > 0 && e.from >= 1 && e.from <= 3 && e.to >= 4 && e.to <= 6 ? [`${net.names[e.from]}-${net.names[e.to]}`] : [];
  });
  return `Max flow ${run.value}: the pairs ${pairs.join(', ')}. Each unit of flow is one worker given one job.`;
}

/** What the pipeline preset's cut means, computed from the run. */
export function pipelineLine(): string {
  const net = presetById('pipeline').net;
  const run = edmondsKarp(net);
  const cut = crossingEdges(net, reachableSet(net, run.flow)).map((i) => `${net.names[net.edges[i].from]}→${net.names[net.edges[i].to]} (${net.edges[i].cap})`);
  return `Max flow ${run.value}: the minimum cut is ${cut.join(', ')}, the narrow pipe, so widening any other pipe changes nothing.`;
}

/** "s → v2 ⇠ v1 → t": forward arrows for spare room, a dotted backward arrow for flow being undone. */
export function pathText(net: Network, walk: readonly number[], arcs: readonly Arc[]): string {
  return walk.map((v, i) => (i === 0 ? net.names[v] : `${arcs[i - 1]?.back ? '⇠' : '→'} ${net.names[v]}`)).join(' ');
}

export interface AugmentState {
  net: Network;
  flow: readonly number[];
  value: number;
  pushes: number;
  walk: readonly number[];
  arcs: readonly Arc[];
  complete: boolean;
  delta: number;
}

export interface CutState {
  net: Network;
  side: ReadonlySet<number>;
  flowValue: number;
  maximum: boolean;
  /** The side shown is the minimum cut from the residual network. */
  showing: boolean;
}

/** What the cut scene says right now, from the cut and flow on screen. */
export function cutCaption(s: CutState): string {
  const { net, side } = s;
  const cap = cutCapacity(net, side);
  const names = net.names.filter((_, v) => side.has(v)).join(', ');
  const edges = net.edges.flatMap((e) => (side.has(e.from) && !side.has(e.to) ? [`${net.names[e.from]}→${net.names[e.to]} ${e.cap}`] : []));
  const sum = edges.length ? `${edges.join(' + ')} = ${cap}` : 'no edge crosses, so the capacity is 0';
  if (s.showing) {
    return `The minimum cut: S = {${names}}, the nodes still reachable from s in the final residual network. Its edges are all full: ${sum}, equal to the flow ${s.flowValue}.`;
  }
  const verdict = cap === s.flowValue ? 'equal to the flow, so this cut is a minimum cut and the flow a maximum' : `${cap - s.flowValue} above the flow ${s.flowValue}: a cut is never below the flow`;
  return `S = {${names}}: ${sum}, ${verdict}.`;
}

const units = (n: number) => `${n} ${n === 1 ? 'unit' : 'units'}`;

/** What the augment scene says right now, computed from the state on screen. */
export function augmentCaption(s: AugmentState): string {
  const { net } = s;
  if (s.walk.length === 1) {
    if (isMaximum(net, s.flow)) {
      const side = reachableSet(net, s.flow);
      const names = net.names.filter((_, v) => side.has(v)).join(', ');
      return `No path from s to t is left in the residual network, so flow ${s.value} is a maximum flow after ${s.pushes} ${s.pushes === 1 ? 'push' : 'pushes'}. The nodes s can still reach (${names}) are cut off from t by edges that add up to ${cutCapacity(net, side)}: that cut is the proof.`;
    }
    return `Flow ${s.value} so far. Build a path from s to t: click the node it can go to next, or press Shortest path. Turn on Residual view to see the backward arrows a path may also use.`;
  }
  const text = pathText(net, s.walk, s.arcs);
  if (s.complete) {
    const back = s.arcs.filter((a) => a.back).length;
    return `Path ${text} reaches t. Its bottleneck is ${units(s.delta)}, so Push ${s.delta} raises the flow from ${s.value} to ${s.value + s.delta}.${back ? ` It uses ${back} backward ${back === 1 ? 'arrow' : 'arrows'}: that part takes flow back off an edge.` : ''}`;
  }
  return `Path so far: ${text}. Click a node it can go to next, or click an earlier node to shorten it.`;
}
