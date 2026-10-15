import { useState } from 'react';
import { useGraphEdits } from '../../core/useGraphEdits';
import { addEdge, addNode, nudgeEdge, PRESETS, presetById, removeEdge, type Graph, type PresetId } from './model';
import { edgeText } from './text';

/** The learner's graph, shared by every scene: a preset, edits, the source node and the edge being edited. */
export function useGraphEditor() {
  const edits = useGraphEdits<Graph, PresetId>({ presets: PRESETS, initial: 'textbook', graphOf: (id) => presetById(id).graph, edgeCount: (g) => g.edges.length });
  const { graph } = edits;
  const [source, setSource] = useState(presetById('textbook').source);
  const [selected, setSelected] = useState<number | null>(null);

  return {
    presetId: edits.presetId,
    graph,
    source,
    selected,
    note: edits.note,
    load: (id: PresetId) => {
      edits.load(id);
      setSource(presetById(id).source);
      setSelected(null);
    },
    select: (i: number) => {
      setSelected(i);
      edits.setNote(`Selected ${edgeText(graph, i)}: use the buttons to change it.`);
    },
    pickSource: (v: number) => {
      setSource(v);
      edits.setNote(`Source is now ${graph.names[v]}.`);
    },
    nudge: (direction: 1 | -1) => {
      if (selected === null) return;
      edits.edit(nudgeEdge(graph, selected, direction), (g) => `${edgeText(g, selected)}.`);
    },
    remove: () => {
      if (selected === null) return;
      edits.set(removeEdge(graph, selected), `Removed ${edgeText(graph, selected)}.`);
      setSelected(null);
    },
    addNode: () => {
      edits.edit(addNode(graph), (g) => `Added node ${g.names[g.names.length - 1]}: drag from a node to another to join them.`);
    },
    addEdge: (from: number, to: number) => {
      const r = addEdge(graph, from, to);
      const text = (g: Graph) => `Added ${edgeText(g, g.edges.length - 1)}: its weight is 1, change it with the buttons.`;
      if (edits.edit(r, text) && r.ok) setSelected(r.value.edges.length - 1);
    },
  };
}

export type GraphEditor = ReturnType<typeof useGraphEditor>;
