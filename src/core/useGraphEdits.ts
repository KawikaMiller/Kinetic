import { useState } from 'react';
import { applyResult, initialEdits, loadPreset, noteFor, setGraph, withNote, type GraphEditConfig, type GraphEditState } from './graphEdits';
import type { Result } from './result';

export interface GraphEditsOptions<G, Id extends string> extends GraphEditConfig<G, Id> {
  /** Notes belong to the scene they were written in. Leave it out for one note shared by every scene. */
  scene?: string;
}

/**
 * A lesson's editable graph: the loaded preset, the learner's graph, how many edges they added on
 * top of the preset, and the note saying what the last edit did or why it was refused (the refusal
 * sentences come from the lesson model's own `Result`s). Anything else a lesson tracks about the
 * graph (a flow, a matching, an order) stays in its own hook and resets in its own `load`/`edit`
 * wrappers, using the graph these return.
 *
 *   const edits = useGraphEdits({ presets: PRESETS, initial: 'tangle', graphOf: (id) => presetById(id).graph, edgeCount: (g) => g.edges.length, scene });
 *   edits.edit(addEdge(edits.graph, a, b), 'Added a to b.');   // false when refused; the note says why
 */
export function useGraphEdits<G, Id extends string>(o: GraphEditsOptions<G, Id>) {
  const { scene } = o;
  const [state, setState] = useState<GraphEditState<G, Id>>(() => initialEdits(o));
  return {
    presetId: state.presetId,
    graph: state.graph,
    /** Edges the learner has added on top of the preset. */
    added: o.edgeCount(state.graph) - state.baseEdges,
    note: noteFor(state, scene),
    setNote: (text: string) => setState((s) => withNote(s, text, scene)),
    /** Load a preset and say so. Returns its graph, for resetting whatever else depends on it. */
    load: (id: Id): G => {
      setState(loadPreset(o, id, scene));
      return o.graphOf(id);
    },
    /** Replace the graph (it has changed shape) and say why. */
    set: (graph: G, message: string) => setState((s) => setGraph(s, graph, message, scene)),
    /** Apply a model operation's result: the new graph and `done` as the note, or the refusal as the note. True when applied. */
    edit: (r: Result<G>, done: string | ((g: G) => string)): boolean => {
      setState((s) => applyResult(s, r, done, scene));
      return r.ok;
    },
    /** Take back the most recent edge the learner added (never one the preset has). */
    undoAdded: (removeLast: (g: G, keep: number) => G, message: string) =>
      setState((s) => setGraph(s, removeLast(s.graph, s.baseEdges), message, scene)),
  };
}

export type GraphEdits<G, Id extends string> = ReturnType<typeof useGraphEdits<G, Id>>;
