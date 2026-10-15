import { useState } from 'react';
import { ORDERS, addEdge, addNode, identityOrder, isPermutation, presetById, removeLastEdge, type Graph, type OrderId, type PresetId } from './model';

/**
 * The learner's graph, shared by the scenes that colour it: a preset, edits, the order greedy colours in (always a
 * permutation) and the position being moved by hand.
 */
export function useColorEditor(scene: string) {
  const [presetId, setPresetId] = useState<PresetId>('crown');
  const [graph, setGraph] = useState<Graph>(presetById('crown').graph);
  const [baseEdges, setBaseEdges] = useState(presetById('crown').graph.edges.length);
  const [rawOrder, setRawOrder] = useState<number[]>(identityOrder(presetById('crown').graph.names.length));
  const [picked, setPicked] = useState<number | null>(null);
  const [written, setWritten] = useState({ text: '', scene });
  const n = graph.names.length;
  /** A node added after the order was set joins its end, so the order is always a permutation of the nodes. */
  const order = isPermutation(rawOrder, n) ? rawOrder : [...rawOrder.filter((v) => v < n), ...identityOrder(n).filter((v) => !rawOrder.includes(v))];
  const note = written.scene === scene ? written.text : '';
  const setNote = (text: string) => setWritten({ text, scene });

  const setOrder = (next: number[]) => {
    if (!isPermutation(next, n)) {
      setNote('An order has to list each node exactly once.');
      return;
    }
    setRawOrder(next);
  };

  return {
    presetId, graph, order, picked, note,
    added: graph.edges.length - baseEdges,
    load: (id: PresetId) => {
      const g = presetById(id).graph;
      setPresetId(id);
      setGraph(g);
      setBaseEdges(g.edges.length);
      setRawOrder(identityOrder(g.names.length));
      setPicked(null);
      setNote(`Loaded ${presetById(id).label}.`);
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
      const r = addEdge(graph, a, b);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      setGraph(r.value);
      setNote(`Added ${graph.names[a]}–${graph.names[b]}.`);
    },
    addNode: () => {
      const r = addNode(graph);
      if (!r.ok) {
        setNote(r.error);
        return;
      }
      setGraph(r.value);
      setNote(`Added node ${r.value.names[r.value.names.length - 1]}: drag from a node to another to join them.`);
    },
    undo: () => {
      setGraph(removeLastEdge(graph, baseEdges));
      setNote('Removed the last edge you added.');
    },
  };
}

export type ColorEditor = ReturnType<typeof useColorEditor>;
