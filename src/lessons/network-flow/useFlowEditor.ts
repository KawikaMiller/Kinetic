import { useState } from 'react';
import { useGraphEdits } from '../../core/useGraphEdits';
import {
  addEdge, addNode, applyPath, arcBetween, bottleneck, edmondsKarp, flowValue, isMaximum, nudgeCap, PRESETS, presetById, reachableSet, removeEdge, shortestPath, zeroFlow, type Arc, type Augmentation,
  type Network, type PresetId,
} from './model';

const replay = (net: Network, steps: readonly Augmentation[]): number[] => steps.reduce((flow, s) => applyPath(flow, s.path, s.delta), zeroFlow(net));

/**
 * The learner's network and flow, shared by every scene except the scripted worst case: a preset, edits, the flow built
 * by pushing paths, the path being built, and the source side of the cut being dragged.
 */
export function useFlowEditor(scene: string) {
  const edits = useGraphEdits<Network, PresetId>({ presets: PRESETS, initial: 'textbook', graphOf: (id) => presetById(id).net, edgeCount: (n) => n.edges.length, scene });
  const { graph: net, note } = edits;
  const [steps, setSteps] = useState<Augmentation[]>([]);
  const [walk, setWalk] = useState<number[]>([presetById('textbook').net.source]);
  const [selected, setSelected] = useState<number | null>(null);
  const [residual, setResidual] = useState(false);
  const [sideNodes, setSideNodes] = useState<number[]>([presetById('textbook').net.source]);
  const [showMinCut, setShowMinCut] = useState(false);
  const { setNote } = edits;

  const flow = replay(net, steps);
  const pathArcs: Arc[] = [];
  for (let h = 0; h + 1 < walk.length; h++) {
    const arc = arcBetween(net, flow, walk[h], walk[h + 1]);
    if (arc) pathArcs.push(arc);
  }
  const complete = walk[walk.length - 1] === net.sink && pathArcs.length === walk.length - 1 && walk.length > 1;

  /** Everything that depends on the network's shape starts over when it changes. */
  const startOver = (n: Network) => {
    setSteps([]);
    setWalk([n.source]);
    setSideNodes([n.source]);
    setShowMinCut(false);
    setSelected(null);
  };
  const fresh = (n: Network, message: string) => {
    edits.set(n, message);
    startOver(n);
  };
  const name = (v: number) => net.names[v];

  return {
    presetId: edits.presetId, net, flow, steps, walk, selected, residual, sideNodes, showMinCut, note, pathArcs, complete,
    value: flowValue(net, flow),
    delta: pathArcs.length ? bottleneck(pathArcs) : 0,
    load: (id: PresetId) => startOver(edits.load(id)),
    select: (i: number) => {
      setSelected(i);
      const e = net.edges[i];
      setNote(`Selected ${name(e.from)}→${name(e.to)} (capacity ${e.cap}): use the buttons to change it.`);
    },
    setResidual,
    nudge: (delta: number) => {
      if (selected === null) return;
      const r = nudgeCap(net, selected, delta);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      fresh(r.value, `${name(net.edges[selected].from)}→${name(net.edges[selected].to)} now has capacity ${r.value.edges[selected].cap}: the flow starts over from zero.`);
      setSelected(selected);
    },
    remove: () => {
      if (selected === null) return;
      fresh(removeEdge(net, selected), 'Edge removed: the flow starts over from zero.');
    },
    addNode: () => {
      const r = addNode(net);
      if (edits.edit(r, 'Node added: drag from a node to another to join them.') && r.ok) startOver(r.value);
    },
    addEdge: (from: number, to: number) => {
      const r = addEdge(net, from, to);
      if (edits.edit(r, `Added ${name(from)}→${name(to)} with capacity 1: the flow starts over from zero.`) && r.ok) {
        startOver(r.value);
        setSelected(r.value.edges.length - 1);
      }
    },
    /** Extend, shorten or restart the path being built by clicking a node. */
    clickNode: (v: number) => {
      const at = walk.indexOf(v);
      if (at >= 0) {
        setWalk(walk.slice(0, at + 1));
        setNote(at === walk.length - 1 ? `Still at ${name(v)}.` : `Back to ${name(v)}.`);
        return;
      }
      const from = walk[walk.length - 1];
      if (from === net.sink) {
        setNote('The path already reaches t: push it, or click an earlier node to shorten it.');
        return;
      }
      const arc = arcBetween(net, flow, from, v);
      if (!arc) {
        setNote(`No spare room from ${name(from)} to ${name(v)}: no unfilled edge that way, and no flow on a ${name(v)}→${name(from)} edge to undo.`);
        return;
      }
      setWalk([...walk, v]);
      setNote(arc.back ? `${name(from)}⇠${name(v)} undoes ${arc.res} ${arc.res === 1 ? 'unit' : 'units'} of flow already sent ${name(v)}→${name(from)}.` : `${name(from)}→${name(v)} has ${arc.res} spare.`);
    },
    clearPath: () => {
      setWalk([net.source]);
      setNote('Path cleared.');
    },
    shortest: () => {
      const path = shortestPath(net, flow);
      if (!path) {
        setNote('There is no path from s to t in the residual network: the flow is already a maximum.');
        return;
      }
      setWalk([net.source, ...path.map((a) => a.to)]);
      setNote(`A shortest augmenting path has ${path.length} ${path.length === 1 ? 'edge' : 'edges'}.`);
    },
    push: () => {
      if (!complete) return;
      const delta = bottleneck(pathArcs);
      setSteps([...steps, { path: pathArcs, delta, valueAfter: flowValue(net, applyPath(flow, pathArcs, delta)) }]);
      setWalk([net.source]);
      setNote(`Pushed ${delta}.`);
    },
    undo: () => {
      setSteps(steps.slice(0, -1));
      setWalk([net.source]);
      setNote('Undid the last push.');
    },
    reset: () => {
      setSteps([]);
      setWalk([net.source]);
      setShowMinCut(false);
      setNote('Flow reset to zero.');
    },
    /** Keep pushing shortest paths from the current flow until none is left. */
    finish: () => {
      const run = edmondsKarp(net, flow);
      setSteps([...steps, ...run.steps]);
      setWalk([net.source]);
      setNote(run.steps.length ? `Pushed ${run.steps.length} more shortest ${run.steps.length === 1 ? 'path' : 'paths'}.` : 'Nothing left to push.');
    },
    toggleSide: (v: number) => {
      if (v === net.source || v === net.sink) {
        setNote(v === net.source ? 's is always on the S side.' : 't is always on the T side.');
        return;
      }
      // Editing while the minimum cut is shown starts from the set on screen, not from the hand-built one behind it.
      const shown = showMinCut && isMaximum(net, flow) ? [...reachableSet(net, flow)] : sideNodes;
      setShowMinCut(false);
      setSideNodes(shown.includes(v) ? shown.filter((x) => x !== v) : [...shown, v]);
    },
    resetSide: () => {
      setSideNodes([net.source]);
      setShowMinCut(false);
    },
    setShowMinCut,
  };
}

export type FlowEditor = ReturnType<typeof useFlowEditor>;
