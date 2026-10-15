import { useState } from 'react';
import { addEdge, addNode, nudgeEdge, presetById, removeEdge, type Graph, type PresetId, type Result } from './model';
import { edgeText } from './text';

/** The learner's graph, shared by every scene: a preset, edits, the source node and the edge being edited. */
export function useGraphEditor() {
  const [presetId, setPresetId] = useState<PresetId>('textbook');
  const [graph, setGraph] = useState<Graph>(presetById('textbook').graph);
  const [source, setSource] = useState(presetById('textbook').source);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const load = (id: PresetId) => {
    const p = presetById(id);
    setPresetId(id);
    setGraph(p.graph);
    setSource(p.source);
    setSelected(null);
    setNote(`Loaded ${p.label}.`);
  };
  const apply = (r: Result<Graph>, done: (g: Graph) => string) => {
    if (r.ok) {
      setGraph(r.value);
      setNote(done(r.value));
    } else setNote(r.error);
  };
  return {
    presetId,
    graph,
    source,
    selected,
    note,
    load,
    select: (i: number) => {
      setSelected(i);
      setNote(`Selected ${edgeText(graph, i)}: use the buttons to change it.`);
    },
    pickSource: (v: number) => {
      setSource(v);
      setNote(`Source is now ${graph.names[v]}.`);
    },
    nudge: (direction: 1 | -1) => {
      if (selected === null) return;
      apply(nudgeEdge(graph, selected, direction), (g) => `${edgeText(g, selected)}.`);
    },
    remove: () => {
      if (selected === null) return;
      setNote(`Removed ${edgeText(graph, selected)}.`);
      setGraph(removeEdge(graph, selected));
      setSelected(null);
    },
    addNode: () => apply(addNode(graph), (g) => `Added node ${g.names[g.names.length - 1]}: drag from a node to another to join them.`),
    addEdge: (from: number, to: number) => {
      const r = addEdge(graph, from, to);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      setGraph(r.value);
      setSelected(r.value.edges.length - 1);
      setNote(`Added ${edgeText(r.value, r.value.edges.length - 1)}: its weight is 1, change it with the buttons.`);
    },
  };
}

export type GraphEditor = ReturnType<typeof useGraphEditor>;
