import { useState } from 'react';
import { mulberry32 } from '../../core/random';
import { shuffle } from '../../core/random';
import { addEdge, addNode, edgeEffect, presetById, removeLastEdge, type Digraph, type EdgeEffect, type PresetId } from './model';

export const SHUFFLE_SEED = 3;

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);
const reversed = (n: number) => identity(n).reverse();
const shuffled = (n: number) => shuffle(identity(n), mulberry32(SHUFFLE_SEED));

export const ORDER_CHOICES = [
  { id: 'given', label: 'as given', build: identity },
  { id: 'reversed', label: 'reversed', build: reversed },
  { id: 'shuffled', label: `shuffled (seed ${SHUFFLE_SEED})`, build: shuffled },
] as const;

export interface LastEdge {
  from: number;
  to: number;
  effect: EdgeEffect;
}

/** The learner's graph, shared by every scene: a preset, edits, the pass-1 start order and the edge just added. */
export function useSccEditor() {
  const [presetId, setPresetId] = useState<PresetId>('tangle');
  const [graph, setGraph] = useState<Digraph>(presetById('tangle').graph);
  const [baseEdges, setBaseEdges] = useState(presetById('tangle').graph.edges.length);
  const [order, setOrderState] = useState<number[]>(identity(presetById('tangle').graph.names.length));
  const [last, setLast] = useState<LastEdge | null>(null);
  const [note, setNote] = useState('');

  const load = (id: PresetId) => {
    const g = presetById(id).graph;
    setPresetId(id);
    setGraph(g);
    setBaseEdges(g.edges.length);
    setOrderState(identity(g.names.length));
    setLast(null);
    setNote(`Loaded ${presetById(id).label}.`);
  };
  return {
    presetId,
    graph,
    order,
    last,
    note,
    /** How many edges the learner has added on top of the preset. */
    added: graph.edges.length - baseEdges,
    load,
    setOrder: setOrderState,
    addEdge: (from: number, to: number) => {
      const r = addEdge(graph, from, to);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      setLast({ from, to, effect: edgeEffect(graph, from, to) });
      setGraph(r.value);
      setNote(`Added ${graph.names[from]}→${graph.names[to]}.`);
    },
    addNode: () => {
      const r = addNode(graph);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      setGraph(r.value);
      setOrderState([...order, r.value.names.length - 1]);
      setNote(`Added node ${r.value.names[r.value.names.length - 1]}: drag from a node to another to join them.`);
    },
    undo: () => {
      setGraph(removeLastEdge(graph, baseEdges));
      setLast(null);
      setNote('Removed the last edge you added.');
    },
  };
}

export type SccEditor = ReturnType<typeof useSccEditor>;
