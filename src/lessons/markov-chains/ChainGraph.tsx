import { GraphView, type GraphEdge } from '../../components/GraphView';
import type { Matrix } from './model';
import { prob } from './text';

const WIDTH = 360;
const HEIGHT = 280;
const MIN_STROKE = 1.5;
const STROKE_PER_PROBABILITY = 5;
const RADIUS = 22;
/** Leaves room above the top state for its self-loop and label. */
const CIRCLE = { rx: 120, ry: 88 };

/**
 * The chain as a weighted state diagram: an arrow for every transition with a positive chance, drawn
 * as thick as that chance and labelled with it. `current` marks the state the token is on and
 * `taken` the transition it just made.
 */
export function ChainGraph({
  states, P, current, taken, ariaLabel,
}: {
  states: readonly string[];
  P: Matrix;
  current?: number;
  taken?: [number, number] | null;
  ariaLabel: string;
}) {
  const edges: GraphEdge<number>[] = P.flatMap((row, i) => row.flatMap((p, j) => (p > 0 ? [{ from: i, to: j, label: prob(p), weight: p, labelAt: i < j ? 0.3 : i > j ? 0.7 : 0.5 }] : [])));
  return (
    <GraphView
      nodes={states.map((label, id) => ({ id, label }))}
      edges={edges}
      directed
      layout="circle"
      circleRadii={CIRCLE}
      width={WIDTH}
      height={HEIGHT}
      radius={RADIUS}
      labelHalo
      className="mc-graph"
      nodeMark={(id) => (id === current ? { tone: 'hi', fill: 'tint' } : null)}
      edgeMark={(e) => ({
        tone: taken && e.from === taken[0] && e.to === taken[1] ? 'hi' : 'muted',
        width: MIN_STROKE + STROKE_PER_PROBABILITY * (e.weight ?? 0),
      })}
      edgeAriaLabel={(e) => `${states[e.from]} to ${states[e.to]}, probability ${prob(e.weight ?? 0)}`}
      nodeAriaLabel={(id) => states[id]}
      ariaLabel={ariaLabel}
    />
  );
}
