import { useState } from 'react';
import { mulberry32 } from '../../core/random';
import { shuffle } from '../../core/random';
import { useGraphEdits } from '../../core/useGraphEdits';
import { addEdge, addNode, edgeEffect, PRESETS, presetById, removeLastEdge, type Digraph, type EdgeEffect, type PresetId } from './model';

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
  const edits = useGraphEdits<Digraph, PresetId>({ presets: PRESETS, initial: 'tangle', graphOf: (id) => presetById(id).graph, edgeCount: (g) => g.edges.length });
  const { graph } = edits;
  const [order, setOrderState] = useState<number[]>(identity(graph.names.length));
  const [last, setLast] = useState<LastEdge | null>(null);

  return {
    presetId: edits.presetId,
    graph,
    order,
    last,
    note: edits.note,
    /** How many edges the learner has added on top of the preset. */
    added: edits.added,
    load: (id: PresetId) => {
      const g = edits.load(id);
      setOrderState(identity(g.names.length));
      setLast(null);
    },
    setOrder: setOrderState,
    addEdge: (from: number, to: number) => {
      const effect = edgeEffect(graph, from, to);
      if (edits.edit(addEdge(graph, from, to), `Added ${graph.names[from]}→${graph.names[to]}.`)) setLast({ from, to, effect });
    },
    addNode: () => {
      const r = addNode(graph);
      if (edits.edit(r, (g) => `Added node ${g.names[g.names.length - 1]}: drag from a node to another to join them.`) && r.ok) {
        setOrderState([...order, r.value.names.length - 1]);
      }
    },
    undo: () => {
      edits.undoAdded(removeLastEdge, 'Removed the last edge you added.');
      setLast(null);
    },
  };
}

export type SccEditor = ReturnType<typeof useSccEditor>;
