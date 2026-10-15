/**
 * The state behind a lesson's graph editor, as pure transitions (the hook `useGraphEdits` is a thin
 * `useState` over these): the loaded preset, the learner's graph, how many edges they added on top
 * of the preset, and the one-line note that says what the last edit did or why it was refused.
 * The graph can be any value (a digraph, a network, a bipartite graph); the lesson's model owns
 * the operations that edit it and the refusal messages, and hands their `Result`s in here.
 */
import type { Result } from './result';

export interface GraphEditConfig<G, Id extends string> {
  presets: readonly { id: Id; label: string }[];
  initial: Id;
  /** The graph a preset starts with. */
  graphOf: (id: Id) => G;
  /** Edges in a graph: the edges added over the preset are counted against it. */
  edgeCount: (g: G) => number;
}

/** A note belongs to the scene it was written in, so another scene never shows a stale one. */
export interface SceneNote {
  text: string;
  scene: string | undefined;
}

export interface GraphEditState<G, Id extends string> {
  presetId: Id;
  graph: G;
  /** Edges the preset itself has. */
  baseEdges: number;
  written: SceneNote;
}

export function initialEdits<G, Id extends string>(c: GraphEditConfig<G, Id>): GraphEditState<G, Id> {
  const graph = c.graphOf(c.initial);
  return { presetId: c.initial, graph, baseEdges: c.edgeCount(graph), written: { text: '', scene: undefined } };
}

/** The note to show in `scene`: what was written there, or nothing. */
export const noteFor = (s: { written: SceneNote }, scene: string | undefined): string => (s.written.scene === scene ? s.written.text : '');

export const withNote = <S extends { written: SceneNote }>(s: S, text: string, scene: string | undefined): S => ({ ...s, written: { text, scene } });

/** Load a preset: its graph, a fresh edge baseline, "Loaded <label>.". */
export function loadPreset<G, Id extends string>(c: GraphEditConfig<G, Id>, id: Id, scene: string | undefined): GraphEditState<G, Id> {
  const graph = c.graphOf(id);
  const label = c.presets.find((p) => p.id === id)?.label ?? id;
  return { presetId: id, graph, baseEdges: c.edgeCount(graph), written: { text: `Loaded ${label}.`, scene } };
}

/** Replace the graph and say why. */
export const setGraph = <G, Id extends string>(s: GraphEditState<G, Id>, graph: G, message: string, scene: string | undefined): GraphEditState<G, Id> => ({
  ...s,
  graph,
  written: { text: message, scene },
});

/** Apply a model operation's result: the new graph with `done` as the note, or the refusal as the note and the graph unchanged. */
export function applyResult<G, Id extends string>(s: GraphEditState<G, Id>, r: Result<G>, done: string | ((g: G) => string), scene: string | undefined): GraphEditState<G, Id> {
  if (!r.ok) return withNote(s, r.error, scene);
  return setGraph(s, r.value, typeof done === 'function' ? done(r.value) : done, scene);
}
