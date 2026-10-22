import { useMemo, useState } from 'react';
import { useGraphEdits } from '../../core/useGraphEdits';
import { ORDERS, addEdge, addNode, identityOrder, isPermutation, PRESETS, presetById, removeLastEdge, type Graph, type OrderId, type PresetId } from './model';

/**
 * The learner's graph, shared by the scenes that colour it: a preset, edits, the order greedy colours in (always a
 * permutation) and the position being moved by hand.
 */
export function useColorEditor(scene: string) {
  const edits = useGraphEdits<Graph, PresetId>({ presets: PRESETS, initial: 'crown', graphOf: (id) => presetById(id).graph, edgeCount: (g) => g.edges.length, scene });
  const { graph, note, setNote } = edits;
  const [rawOrder, setRawOrder] = useState<number[]>(identityOrder(graph.names.length));
  const [picked, setPicked] = useState<number | null>(null);
  const n = graph.names.length;
  /** A node added after the order was set joins its end, so the order is always a permutation of the nodes. */
  const order = useMemo(
    () => (isPermutation(rawOrder, n) ? rawOrder : [...rawOrder.filter((v) => v < n), ...identityOrder(n).filter((v) => !rawOrder.includes(v))]),
    [rawOrder, n],
  );

  const setOrder = (next: number[]) => {
    if (!isPermutation(next, n)) {
      setNote('An order has to list each node exactly once.');
      return;
    }
    setRawOrder(next);
  };

  return {
    presetId: edits.presetId, graph, order, picked, note,
    added: edits.added,
    load: (id: PresetId) => {
      const g = edits.load(id);
      setRawOrder(identityOrder(g.names.length));
      setPicked(null);
    },
    chooseOrder: (id: OrderId) => {
      setOrder(ORDERS.find((o) => o.id === id)!.build(graph));
      setPicked(null);
    },
    /** True when the current order is exactly what this named order builds. */
    isOrder: (id: OrderId) => ORDERS.find((o) => o.id === id)!.build(graph).join() === order.join(),
    pick: (position: number) => setPicked(position),
    /** Move the picked node one place earlier (-1) or later (+1) in the order. */
    move: (delta: -1 | 1) => {
      if (picked === null) return;
      const to = picked + delta;
      if (to < 0 || to >= n) return;
      const next = [...order];
      [next[picked], next[to]] = [next[to], next[picked]];
      setOrder(next);
      setPicked(to);
    },
    addEdge: (a: number, b: number) => {
      edits.edit(addEdge(graph, a, b), `Added ${graph.names[a]}–${graph.names[b]}.`);
    },
    addNode: () => {
      edits.edit(addNode(graph), (g) => `Added node ${g.names[g.names.length - 1]}: drag from a node to another to join them.`);
    },
    undo: () => edits.undoAdded(removeLastEdge, 'Removed the last edge you added.'),
  };
}

export type ColorEditor = ReturnType<typeof useColorEditor>;
