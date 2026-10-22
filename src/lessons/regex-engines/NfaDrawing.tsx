import { useMemo } from 'react';
import { GraphView, type GraphEdge, type GraphEdgeMark, type GraphNode, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { EPSILON, type State } from '../../core/automata';
import { edgeKey, edgeLabel, type Construction, type Placement } from '../../core/regex';

const MIN_DRAWING_WIDTH = 480;

const stateLabel = (id: State) => id.slice(1);

/**
 * A Thompson NFA drawn in fixed places, so nothing moves while the construction adds to it.
 * `visibleTo` shows the states and arrows added by nodes up to that id; `fresh` is the node just built.
 */
export function NfaDrawing({
  construction, placement, visibleTo, fresh = -1, lit, taken, ends, ariaLabel,
}: {
  construction: Construction;
  placement: Placement;
  visibleTo: number;
  fresh?: number;
  lit?: ReadonlySet<State>;
  taken?: ReadonlySet<string>;
  /** Draw the start arrow and the accepting ring (the machine is finished). */
  ends: boolean;
  ariaLabel: string;
}) {
  const { nfa, states, edges } = construction;
  const visibleStates = useMemo(() => states.filter((s) => s.addedBy <= visibleTo), [states, visibleTo]);
  // An arrow is added by the node that joins its ends, never before them, so its own step is the only test.
  const visibleEdges = useMemo(() => edges.filter((e) => e.addedBy <= visibleTo), [edges, visibleTo]);
  const addedBy = (id: State) => states.find((s) => s.id === id)!.addedBy;
  const nodes: GraphNode<State>[] = visibleStates.map((s) => ({ id: s.id, label: stateLabel(s.id), at: placement.at[s.id], accept: ends && nfa.accept.includes(s.id) }));
  const graphEdges: GraphEdge<State>[] = visibleEdges.map((e) => ({ from: e.from, to: e.to, label: edgeLabel(e) }));

  const nodeMark = (id: State): GraphNodeMark | null => {
    if (lit?.has(id)) return { tone: nfa.accept.includes(id) ? 'ok' : 'hi', fill: 'solid' };
    return fresh >= 0 && addedBy(id) === fresh ? { tone: 'violet', fill: 'tint' } : null;
  };
  const edgeMark = (_: GraphEdge<State>, i: number): GraphEdgeMark | null => {
    const e = visibleEdges[i];
    const isEpsilon = e.symbols[0] === EPSILON;
    if (fresh >= 0 && e.addedBy === fresh) return { tone: 'violet', dashed: isEpsilon, width: 3.5 };
    if (taken?.has(edgeKey(e))) return { tone: 'info', width: 4 };
    return isEpsilon ? { tone: 'dim', dashed: true, width: 2 } : { tone: 'info', width: 2 };
  };

  return (
    <WideRegion minWidth={Math.max(MIN_DRAWING_WIDTH, placement.width)} label="State diagram: scroll sideways to see all of it">
      <GraphView
        nodes={nodes}
        edges={graphEdges}
        directed
        startNode={ends ? nfa.start : undefined}
        width={placement.width}
        height={placement.height}
        className="re-graph"
        labelHalo
        ariaLabel={ariaLabel}
        nodeMark={nodeMark}
        edgeMark={edgeMark}
      />
    </WideRegion>
  );
}
